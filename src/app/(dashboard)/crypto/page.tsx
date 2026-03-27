'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { formatNumberInput, parseNumberInput } from '@/lib/currency'
import CurrencyInput from '@/components/CurrencyInput'
import { Account, CryptoWallet } from '@/types'
import { Bitcoin, Plus, X, Edit2, Check } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { getLocalDateISO } from '@/lib/date'

type WalletWithAccount = CryptoWallet & {
  accountName: string
}

interface RateData {
  usd: number
  idr: number
  priceUSD: number
  priceIDR: number
  change24hIDR: number
  change24hPct: number
}

function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

function formatCrypto(n: number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 8 }).format(n)
}

export default function CryptoPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [wallets, setWallets] = useState<WalletWithAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ account_id: '', coin_symbol: 'BTC', balance: '', isCustom: false })
  const [updatingWl, setUpdatingWl] = useState<WalletWithAccount | null>(null)
  const [updateForm, setUpdateForm] = useState({ balance: '', isProfitLoss: true })
  const [saving, setSaving] = useState(false)

  const { user } = useAuth()
  const [rates, setRates] = useState<Record<number, RateData>>({})

  async function load() {
    if (!user) return
    const [{ data: accs }, { data: w }] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('type', 'crypto'),
      supabase.from('crypto_wallets').select('*, accounts(name)').eq('user_id', user.id),
    ])

    const cryptoAccs = accs ?? []
    setAccounts(cryptoAccs)
    if (cryptoAccs.length > 0) setForm(f => ({ ...f, account_id: String(cryptoAccs[0].id) }))

    const mapped: WalletWithAccount[] = (w ?? []).map((wl: any) => ({
      ...wl,
      accountName: wl.accounts?.name ?? '-',
    }))
    setWallets(mapped)

    // Fetch live prices for the balances
    const rts: Record<number, RateData> = {}
    for (const wl of mapped) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/crypto?coin=${wl.coin_symbol}`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        })
        const data = await res.json()
        rts[wl.id] = {
          usd: (wl.balance || 0) * (data.price_usd || 0),
          idr: (wl.balance || 0) * (data.price_idr || 0),
          priceUSD: data.price_usd || 0,
          priceIDR: data.price_idr || 0,
          change24hIDR: (wl.balance || 0) * (data.change_24h_idr || 0),
          change24hPct: data.change_24h_pct || 0
        }
      } catch (e) {
        console.error('Error loading crypto rate:', e)
      }
    }
    setRates(rts)
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  async function submit(e: React.FormEvent) {
    if (!user) return
    e.preventDefault()
    setSaving(true)
    await supabase.from('crypto_wallets').insert({
      account_id: parseInt(form.account_id),
      user_id: user.id,
      coin_symbol: form.coin_symbol.toUpperCase(),
      balance: parseFloat(parseNumberInput(form.balance)) || 0,
    })
    setForm(f => ({ ...f, balance: '' }))
    setShowModal(false)
    setSaving(false)
    await load()
  }

  async function saveUpdate() {
    if (!user || !updatingWl) return
    setSaving(true)
    const newVal = parseFloat(parseNumberInput(updateForm.balance)) || 0
    const oldVal = Number(updatingWl.balance)
    const delta = newVal - oldVal

    if (updateForm.isProfitLoss && Math.abs(delta) > 0.00000001) {
      const priceIDR = rates[updatingWl.id]?.priceIDR || 0
      const idrDelta = delta * priceIDR

      await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: updatingWl.account_id,
        type: delta > 0 ? 'income' : 'expense',
        amount: Math.abs(idrDelta),
        category: delta > 0 ? 'Investment' : 'Other',
        note: `Crypto Adjust: ${updatingWl.coin_symbol} (${delta > 0 ? '+' : '-'}${Math.abs(delta).toFixed(8)} ${updatingWl.coin_symbol})`,
        date: getLocalDateISO()
      })

      // Update main account fiat balance
      const { data: acc } = await supabase.from('accounts').select('balance').eq('id', updatingWl.account_id).single()
      if (acc) {
        await supabase.from('accounts').update({ balance: Number(acc.balance) + idrDelta }).eq('id', updatingWl.account_id)
      }
    }

    await supabase.from('crypto_wallets').update({ balance: newVal }).eq('id', updatingWl.id)
    setUpdatingWl(null)
    setSaving(false)
    await load()
  }

  async function deleteWallet(id: number) {
    toast((t) => (
      <div>
        <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '15px' }}>Delete Coin Tracker?</p>
        <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--text-muted)' }}>Are you sure you want to delete this coin from tracking?</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="btn btn-ghost btn-sm"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              toast.dismiss(t.id)
              const loadingToast = toast.loading('Deleting coin...', { position: 'top-center' })
              await supabase.from('crypto_wallets').delete().eq('id', id)
              await load()
              toast.success('Coin tracking removed', { id: loadingToast, position: 'top-center' })
            }}
            style={{ background: 'var(--red)', color: 'white' }}
            className="btn btn-sm"
          >
            Delete
          </button>
        </div>
      </div>
    ), { duration: Infinity, position: 'top-center' })
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Crypto Balances</h1>
          <p className="page-subtitle">Manual CEX/DEX coin tracking with Live API Prices</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} disabled={accounts.length === 0}>
          <Plus size={16} /> Add Coin
        </button>
      </div>

      {accounts.length === 0 && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 18px', borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.05)' }}>
          <p style={{ fontSize: 14, color: 'var(--yellow)' }}>
            ⚠️ You need a <strong>Crypto</strong> account first. <a href="/accounts" style={{ color: 'var(--accent)' }}>Add one in Accounts</a>.
          </p>
        </div>
      )}

      {wallets.length === 0 ? (
        <div className="card empty-state">
          <Bitcoin size={48} />
          <p style={{ marginTop: 12 }}>No coins tracked yet</p>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Add a coin and manual balance to fetch its real-time equivalent value.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {wallets.map(wl => (
            <div 
              key={wl.id} 
              className="card asset-row" 
              style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return
                router.push(`/crypto/${wl.coin_symbol}`)
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                ₿
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{wl.coin_symbol}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{wl.accountName}</div>
                {rates[wl.id] && (
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>
                    Live Price: ${rates[wl.id].priceUSD.toLocaleString()}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{formatCrypto(Number(wl.balance))} {wl.coin_symbol}</div>
                   {rates[wl.id] && rates[wl.id].priceIDR > 0 ? (
                    <>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>≈ ${rates[wl.id].usd.toLocaleString()}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatIDR(rates[wl.id].idr)}</div>
                      {rates[wl.id].change24hPct !== 0 && (
                        <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: (rates[wl.id].change24hIDR ?? 0) >= 0 ? '#10b981' : '#f43f5e' }}>
                          {rates[wl.id].change24hIDR > 0 ? '+' : ''}{formatIDR(rates[wl.id].change24hIDR)} ({(rates[wl.id].change24hPct ?? 0).toFixed(2)}%)
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {rates[wl.id] ? 'Price Unavailable' : 'Loading...'}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-sm" onClick={(e) => {
                    e.stopPropagation()
                    setUpdatingWl(wl)
                    setUpdateForm({ balance: formatNumberInput(wl.balance || 0), isProfitLoss: true })
                  }}>
                    <Edit2 size={13} />
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={(e) => {
                    e.stopPropagation()
                    deleteWallet(wl.id)
                  }}>
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
              <span className="modal-title">Track Coin Balance</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)} style={{ padding: '4px 8px' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label">Crypto Account Bracket</label>
                <select className="form-select" value={form.account_id}
                  onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Coin Symbol</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!form.isCustom ? (
                      <select className="form-select" value={form.coin_symbol}
                        onChange={e => setForm(f => ({ ...f, coin_symbol: e.target.value === 'CUSTOM' ? '' : e.target.value, isCustom: e.target.value === 'CUSTOM' }))}>
                        <option value="BTC">BTC</option>
                        <option value="ETH">ETH</option>
                        <option value="BNB">BNB</option>
                        <option value="MATIC">MATIC</option>
                        <option value="SOL">SOL</option>
                        <option value="PAXG">PAXG</option>
                        <option value="USDT">USDT</option>
                        <option value="CUSTOM">Other (Type manually)...</option>
                      </select>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                        <input className="form-input" placeholder="e.g. DOGE"
                          value={form.coin_symbol} onChange={e => setForm(f => ({ ...f, coin_symbol: e.target.value }))} autoFocus />
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(f => ({ ...f, isCustom: false, coin_symbol: 'BTC' }))}>
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Total Balance</label>
                  <CurrencyInput className="form-input" placeholder="0" required
                    value={form.balance} onValueChange={val => setForm(f => ({ ...f, balance: val }))} />
                </div>
              </div>
              <div className="flex gap-3 mt-4" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Add Coin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Smart Update Modal */}
      {updatingWl && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setUpdatingWl(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Update Coin Balance</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setUpdatingWl(null)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Account</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{updatingWl.accountName}</div>
              <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>{updatingWl.coin_symbol}</div>
            </div>

            <div className="form-group">
              <label className="form-label">New Total Balance ({updatingWl.coin_symbol})</label>
              <CurrencyInput className="form-input" autoFocus
                value={updateForm.balance} onValueChange={val => setUpdateForm(f => ({ ...f, balance: val }))} />

              {/* Delta Preview */}
              {(() => {
                const newVal = parseFloat(parseNumberInput(updateForm.balance)) || 0
                const delta = newVal - Number(updatingWl.balance)
                if (Math.abs(delta) < 0.00000001) return null
                const priceIDR = rates[updatingWl.id]?.priceIDR || 0
                const idrDeltaValue = delta * priceIDR
                return (
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>
                    <div style={{ color: delta > 0 ? 'var(--green)' : 'var(--red)' }}>
                      {delta > 0 ? '📈 Gain:' : '📉 Loss:'} {delta > 0 ? '+' : ''}{(delta || 0).toFixed(8)} {updatingWl.coin_symbol}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Estimasi: {delta > 0 ? '+' : ''}{formatIDR(idrDeltaValue)}
                    </div>
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
                Jika dicentang, selisih nilai Rupiah akan dicatat sebagai Pemasukan/Pengeluaran.
              </p>
            </div>

            <div className="flex gap-3" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setUpdatingWl(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveUpdate} disabled={saving}>
                {saving ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
