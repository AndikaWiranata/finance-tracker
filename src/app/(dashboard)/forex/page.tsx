'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { convertToIDR, formatCurrency, formatNumberInput, getFiatRates, parseNumberInput } from '@/lib/currency'
import CurrencyInput from '@/components/CurrencyInput'
import { Account, ForexAccount } from '@/types'
import { Plus, X, Edit2, Check, ArrowDownUp, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { getLocalDateISO } from '@/lib/date'

type ForexWithAccount = ForexAccount & { accountName: string }

// Replaced local formatters with global formatCurrency

export default function ForexPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [forexList, setForexList] = useState<ForexWithAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ account_id: '', currency_pair: 'USD/IDR', balance: '' })
  const [updatingFx, setUpdatingFx] = useState<ForexWithAccount | null>(null)
  const [deleteFxId, setDeleteFxId] = useState<number | null>(null)
  const [updateForm, setUpdateForm] = useState({ balance: '', isProfitLoss: true })
  const [saving, setSaving] = useState(false)

  const { user, profile } = useAuth()
  const [exchangeRate, setExchangeRate] = useState(1)
  const baseCurrency = profile?.base_currency || 'IDR'
  const [idrValues, setIdrValues] = useState<Record<number, number>>({})
  const [liveRates, setLiveRates] = useState<Record<number, number>>({})

  async function load() {
    if (!user) return
    
    if (baseCurrency !== 'IDR') {
      const frates = await getFiatRates()
      if (frates) {
        const idrToUsd = 1 / (frates['IDR'] || 15500)
        const usdToBase = frates[baseCurrency] || 1
        setExchangeRate(idrToUsd * usdToBase)
      }
    } else {
      setExchangeRate(1)
    }

    const [{ data: accs }, { data: fx }] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('type', 'forex'),
      supabase.from('forex_accounts').select('*, accounts(name)').eq('user_id', user.id),
    ])

    const forexAccs = accs ?? []
    setAccounts(forexAccs)
    if (forexAccs.length > 0 && !form.account_id) setForm(f => ({ ...f, account_id: String(forexAccs[0].id) }))

    const mapped: ForexWithAccount[] = (fx ?? []).map((f: any) => ({
      ...f,
      accountName: f.accounts?.name ?? '-',
    }))
    setForexList(mapped)

    // Compute IDR values for the Equity
    const idr: Record<number, number> = {}
    const rates: Record<number, number> = {}
    const frates = await getFiatRates()
    
    for (const m of mapped) {
      const base = m.currency_pair.split('/')[0] || 'USD'
      const quote = m.currency_pair.split('/')[1] || 'IDR'
      
      idr[m.id] = await convertToIDR(Number(m.balance), base.includes('IDR') ? 'USD' : base)
      
      // Calculate current rate base -> quote
      if (frates) {
         const fromRate = frates[base] || 1
         const toRate = frates[quote] || 15500
         rates[m.id] = (1 / fromRate) * toRate
      }
    }
    setIdrValues(idr)
    setLiveRates(rates)
    setLoading(false)
  }

  useEffect(() => { load() }, [user, baseCurrency])

  async function submit(e: React.FormEvent) {
    if (!user) return
    e.preventDefault()
    setSaving(true)
    await supabase.from('forex_accounts').insert({
      account_id: parseInt(form.account_id),
      user_id: user.id,
      currency_pair: form.currency_pair,
      balance: parseFloat(parseNumberInput(form.balance, form.currency_pair.split('/')[0])) || 0,
      equity: parseFloat(parseNumberInput(form.balance, form.currency_pair.split('/')[0])) || 0, // Fallback equity to balance
    })
    setForm(f => ({ ...f, balance: '' }))
    setShowModal(false)
    setSaving(false)
    await load()
  }

  async function saveUpdate() {
    if (!user || !updatingFx) return
    setSaving(true)
    const base = updatingFx.currency_pair.split('/')[0] || 'USD'
    const newVal = parseFloat(parseNumberInput(updateForm.balance, base)) || 0
    const oldVal = Number(updatingFx.balance)
    const delta = newVal - oldVal

    if (updateForm.isProfitLoss && Math.abs(delta) > 0.00000001) {
      const base = updatingFx.currency_pair.split('/')[0] || 'USD'
      const idrDelta = await convertToIDR(Math.abs(delta), base.includes('IDR') ? 'USD' : base)

      await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: updatingFx.account_id,
        type: delta > 0 ? 'income' : 'expense',
        amount: idrDelta,
        category: delta > 0 ? 'Investment' : 'Other',
        note: `Forex Adjust: ${updatingFx.currency_pair} (${delta > 0 ? '+' : '-'}${Math.abs(delta).toFixed(2)} ${base})`,
        date: getLocalDateISO()
      })

      // Also update the main account balance if we record it as a transaction
      // We update the main account balance with the IDR equivalent
      const { data: acc } = await supabase.from('accounts').select('balance').eq('id', updatingFx.account_id).single()
      if (acc) {
        await supabase.from('accounts').update({ balance: Number(acc.balance) + (delta > 0 ? idrDelta : -idrDelta) }).eq('id', updatingFx.account_id)
      }
    }

    await supabase.from('forex_accounts').update({
      balance: newVal,
      equity: newVal
    }).eq('id', updatingFx.id)

    setUpdatingFx(null)
    setSaving(false)
    await load()
  }

  async function deleteFx() {
    if (!deleteFxId) return
    setSaving(true)
    await supabase.from('forex_accounts').delete().eq('id', deleteFxId)
    setDeleteFxId(null)
    setSaving(false)
    await load()
  }

  const PAIRS = ['USD/IDR', 'EUR/IDR', 'GBP/IDR', 'USD/JPY', 'EUR/USD', 'SGD/IDR', 'JPY/IDR', 'AUD/IDR']

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Forex Accounts</h1>
          <p className="page-subtitle">Track your Forex Broker Balance & Equity</p>
        </div>
        <button className="btn btn-cyan" onClick={() => setShowModal(true)} disabled={accounts.length === 0}
          style={{ background: '#06b6d4', color: 'white' }}>
          <Plus size={16} /> Add Broker Info
        </button>
      </div>

      {accounts.length === 0 && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 18px', borderColor: 'rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.05)' }}>
          <p style={{ fontSize: 14, color: '#0891b2' }}>
            ⚠️ You need a <strong>Forex</strong> account bracket first. <a href="/accounts" style={{ color: 'var(--accent)' }}>Add one in Accounts</a>.
          </p>
        </div>
      )}

      {forexList.length === 0 ? (
        <div className="card empty-state">
          <ArrowDownUp size={48} color="#06b6d4" />
          <p style={{ marginTop: 12 }}>No forex balances tracked yet</p>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Add your broker account balance and floating equity manually.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {forexList.map(fx => (
            <div key={fx.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(6,182,212,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                📉
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{fx.accountName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-glow)', padding: '2px 8px', borderRadius: 6 }}>{fx.currency_pair}</div>
                  {liveRates[fx.id] && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Rate: 1 {fx.currency_pair.split('/')[0]} = {formatCurrency(liveRates[fx.id], fx.currency_pair.split('/')[1])}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right', display: 'flex', gap: 24, alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Broker Balance</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#06b6d4' }}>
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: fx.currency_pair.split('/')[0], maximumFractionDigits: 2 }).format(Number(fx.balance))}
                  </div>
                  {idrValues[fx.id] && (
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 700, marginTop: 2 }}>
                       {formatCurrency(idrValues[fx.id] * exchangeRate, baseCurrency)}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-sm" onClick={() => {
                    setUpdatingFx(fx)
                    setUpdateForm({
                      balance: formatNumberInput(fx.balance || 0, fx.currency_pair.split('/')[0]),
                      isProfitLoss: true
                    })
                  }}>
                    <Edit2 size={13} />
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => setDeleteFxId(fx.id)}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Track Broker Balance</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)} style={{ padding: '4px 8px' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label">Forex Account Bracket</label>
                <select className="form-select" value={form.account_id}
                  onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Base Currency / Pair</label>
                <select className="form-select" value={form.currency_pair}
                  onChange={e => setForm(f => ({ ...f, currency_pair: e.target.value }))}>
                  {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Broker Balance</label>
                <CurrencyInput className="form-input" placeholder="1.000" required
                  currency={form.currency_pair.split('/')[0]}
                  value={form.balance} onValueChange={val => setForm(f => ({ ...f, balance: val }))} />
              </div>
              <div className="flex gap-3 mt-4" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Add Broker Info'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Smart Update Modal */}
      {updatingFx && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setUpdatingFx(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Update Balance</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setUpdatingFx(null)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Broker</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{updatingFx.accountName}</div>
              <div style={{ fontSize: 13, color: 'var(--accent)' }}>{updatingFx.currency_pair}</div>
            </div>

            <div className="form-group">
              <label className="form-label">New Balance ({updatingFx.currency_pair.split('/')[0]})</label>
              <CurrencyInput className="form-input" autoFocus
                currency={updatingFx.currency_pair.split('/')[0]}
                value={updateForm.balance} onValueChange={val => setUpdateForm(f => ({ ...f, balance: val }))} />

              {/* Delta Preview */}
              {(() => {
                const newVal = parseFloat(parseNumberInput(updateForm.balance, updatingFx.currency_pair.split('/')[0])) || 0
                const delta = newVal - Number(updatingFx.balance)
                if (Math.abs(delta) < 0.00000001) return null
                return (
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: delta > 0 ? 'var(--green)' : 'var(--red)' }}>
                    {delta > 0 ? '📈 Profit:' : '📉 Loss:'} {delta > 0 ? '+' : ''}{delta.toLocaleString()} {updatingFx.currency_pair.split('/')[0]}
                  </div>
                )
              })()}
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={updateForm.isProfitLoss}
                  onChange={e => setUpdateForm(f => ({ ...f, isProfitLoss: e.target.checked }))}
                  style={{ width: 18, height: 18 }} />
                <span>Record as Profit/Loss transaction?</span>
              </label>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, marginLeft: 28 }}>
                If checked, this change will be counted in your daily Income/Expense totals. Uncheck for typo corrections.
              </p>
            </div>

            <div className="flex gap-3" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setUpdatingFx(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveUpdate} disabled={saving}>
                {saving ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteFxId && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteFxId(null)}>
          <div className="modal" style={{ maxWidth: 400, textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--red)' }}>
              <Trash2 size={32} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Delete Forex Pair?</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
              Are you sure you want to stop tracking this forex portfolio? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'center' }}>
              <button 
                className="btn btn-ghost" 
                onClick={() => setDeleteFxId(null)} 
                disabled={saving} 
                style={{ flex: 1, height: 44, justifyContent: 'center', margin: 0 }}
              >
                Cancel
              </button>
              <button 
                className="btn" 
                onClick={deleteFx} 
                disabled={saving}
                style={{ flex: 1, height: 44, background: 'var(--red)', color: 'white', justifyContent: 'center', fontWeight: 700, margin: 0, border: 'none' }}
              >
                {saving ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
