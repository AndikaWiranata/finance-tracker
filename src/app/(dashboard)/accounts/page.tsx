'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { convertToIDR, formatNumberInput, parseNumberInput } from '@/lib/currency'
import { Account, AccountType } from '@/types'
import { Plus, X, Wallet, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'

const TYPE_CONFIG: Record<AccountType, { color: string; icon: string; bg: string }> = {
  bank:    { color: '#3b82f6', icon: '🏦', bg: 'rgba(59,130,246,0.15)' },
  ewallet: { color: '#a855f7', icon: '📱', bg: 'rgba(168,85,247,0.15)' },
  cash:    { color: '#22c55e', icon: '💵', bg: 'rgba(34,197,94,0.15)'  },
  crypto:  { color: '#f59e0b', icon: '₿',   bg: 'rgba(245,158,11,0.15)' },
  forex:   { color: '#06b6d4', icon: '💱', bg: 'rgba(6,182,212,0.15)'  },
  stock:   { color: '#ec4899', icon: '📈', bg: 'rgba(236,72,153,0.15)' },
}

function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

const CURRENCIES = ['IDR', 'USD', 'EUR', 'GBP', 'ETH', 'BTC', 'USDT']

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'bank' as AccountType, currency: 'IDR', balance: '' })
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  const { user } = useAuth()
  const [rates, setRates] = useState<Record<number, number>>({})

  async function load() {
    if (!user) return
    const [{ data: accs }, { data: cryptoW }, { data: forexA }, { data: stockP }] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('crypto_wallets').select('*').eq('user_id', user.id),
      supabase.from('forex_accounts').select('*').eq('user_id', user.id),
      supabase.from('stock_portfolios').select('*').eq('user_id', user.id),
    ])
    
    const loadedAccs = (accs ?? []).map((a: any) => ({ ...a, liveBalanceIDR: 0 }))
    
    // 1. Initial IDR Conversion for Bank/Cash
    for (const a of loadedAccs) {
      if (a.type !== 'crypto' && a.type !== 'forex' && a.type !== 'stock') {
        const val = await convertToIDR(Number(a.balance), a.currency || 'IDR')
        a.liveBalanceIDR = val
      }
    }

    // 2. Add Crypto Assets
    for (const w of (cryptoW ?? [])) {
      try {
        const res = await fetch(`/api/crypto?coin=${w.coin_symbol}`)
        const data = await res.json()
        const val = (w.balance || 0) * Number(data.price_idr || 0)
        const target = loadedAccs.find(a => a.id === w.account_id)
        if (target) target.liveBalanceIDR += val
      } catch (e) {}
    }

    // 3. Add Forex Assets
    for (const f of (forexA ?? [])) {
      try {
        const base = f.currency_pair.split('/')[0] || 'USD'
        const val = await convertToIDR(Number(f.equity), base.includes('IDR') ? 'USD' : base)
        const target = loadedAccs.find(a => a.id === f.account_id)
        if (target) target.liveBalanceIDR += val
      } catch (e) {}
    }

    // 4. Add Stock Assets
    for (const s of (stockP ?? [])) {
      try {
        const res = await fetch(`/api/stocks?ticker=${s.ticker}`)
        const data = await res.json()
        const val = (s.lots || 0) * 100 * Number(data.price || s.average_price || 0)
        const target = loadedAccs.find(a => a.id === s.account_id)
        if (target) target.liveBalanceIDR += val
      } catch (e) {}
    }

    setAccounts(loadedAccs)
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  async function submit(e: React.FormEvent) {
    if (!user) return
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Account name is required')
      return
    }
    const balance = parseFloat(parseNumberInput(form.balance)) || 0
    if (!editId && balance < 0) {
      toast.error('Initial balance cannot be negative')
      return
    }

    setSaving(true)
    
    const payload = {
      user_id: user.id,
      name: form.name,
      type: form.type,
      currency: form.currency,
      balance: parseFloat(parseNumberInput(form.balance)) || 0,
    }

    if (editId) {
      await supabase.from('accounts').update(payload).eq('id', editId)
      toast.success('Account updated!')
    } else {
      await supabase.from('accounts').insert(payload)
      toast.success('Account created!')
    }

    setForm({ name: '', type: 'bank', currency: 'IDR', balance: '' })
    setEditId(null)
    setShowModal(false)
    setSaving(false)
    await load()
  }

  function startEdit(acc: Account) {
    setEditId(acc.id)
    setForm({
      name: acc.name,
      type: acc.type,
      currency: acc.currency,
      balance: formatNumberInput(acc.balance)
    })
    setShowModal(true)
  }

  async function deleteAccount(id: number) {
    toast((t) => (
      <div>
        <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '15px' }}>Delete Account?</p>
        <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--text-muted)' }}>Are you sure you want to delete this account and all its transactions?</p>
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
              const loadingToast = toast.loading('Deleting account...')
              await supabase.from('accounts').delete().eq('id', id)
              await load()
              toast.success('Account deleted successfully', { id: loadingToast })
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

  const grouped = Object.entries(TYPE_CONFIG).map(([type]) => {
    const items = accounts.filter(a => a.type === type)
    return {
      type: type as AccountType,
      items,
      total: items.reduce((s, a) => s + Number((a as any).liveBalanceIDR || 0), 0),
    }
  }).filter(g => g.items.length > 0)

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-subtitle">{accounts.length} accounts · Total {formatIDR(accounts.reduce((s, a) => s + Number((a as any).liveBalanceIDR || 0), 0))}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditId(null); setForm({ name: '', type: 'bank', currency: 'IDR', balance: '' }); setShowModal(true); }}>
          <Plus size={16} /> Add Account
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="card empty-state">
          <Wallet size={48} />
          <p style={{ marginTop: 12, fontSize: 16 }}>No accounts yet</p>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Add your first account to get started</p>
          <button className="btn btn-primary mt-4" onClick={() => { setEditId(null); setForm({ name: '', type: 'bank', currency: 'IDR', balance: '' }); setShowModal(true); }}>
            <Plus size={16} /> Add Account
          </button>
        </div>
      ) : (
        grouped.map(({ type, items, total }) => {
          const cfg = TYPE_CONFIG[type]
          return (
            <div key={type} style={{ marginBottom: 28 }}>
              <div className="section-title">
                <span>{cfg.icon}</span>
                <span style={{ textTransform: 'capitalize' }}>{type}</span>
                <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({items.length}) · {formatIDR(total)}
                </span>
              </div>
              <div className="grid-3">
                {items.map(acc => (
                  <div key={acc.id} className="account-card">
                    <div className="flex-between">
                      <span className="account-type-badge" style={{ background: cfg.bg, color: cfg.color }}>
                        {cfg.icon} {acc.type}
                      </span>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => startEdit(acc)}
                          style={{ padding: '4px 8px' }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => deleteAccount(acc.id)}
                          style={{ padding: '4px 8px' }}
                        >
                          <Trash2 size={13} color="var(--red)" />
                        </button>
                      </div>
                    </div>
                    <div className="account-name">{acc.name}</div>
                    <div className="account-balance">
                      {formatIDR((acc as any).liveBalanceIDR)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{acc.currency}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}

      {/* Add Account Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editId ? 'Edit Account' : 'New Account'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowModal(false); setEditId(null); }} style={{ padding: '4px 8px' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label">Account Name</label>
                <input className="form-input" placeholder="e.g. BCA Personal / Cash" required autoFocus
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-select" value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as AccountType }))}>
                    <option value="bank">🏦 Bank</option>
                    <option value="ewallet">📱 E-Wallet</option>
                    <option value="cash">💵 Cash</option>
                    <option value="crypto">₿ Crypto</option>
                    <option value="forex">💱 Forex</option>
                    <option value="stock">📈 Stock</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <select className="form-select" value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Initial Balance</label>
                <input className="form-input" type="text" placeholder="0"
                  value={form.balance} onChange={e => setForm(f => ({ ...f, balance: formatNumberInput(e.target.value) }))} />
              </div>
              <div className="flex gap-3 mt-4" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowModal(false); setEditId(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : (editId ? 'Update Account' : 'Add Account')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
