'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { formatNumberInput, parseNumberInput } from '@/lib/currency'
import { Account, StockPortfolio } from '@/types'
import { TrendingUp, Plus, X, Edit2, Check } from 'lucide-react'
import { toast } from 'react-hot-toast'

type StockWithAccount = StockPortfolio & { accountName: string }

function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

function formatPercent(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 2 }).format(n)
}

export default function StocksPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [stocks, setStocks] = useState<StockWithAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ lots: '', avgPrice: '' })
  const [form, setForm] = useState({ account_id: '', ticker: '', lots: '', avgPrice: '', currency: 'IDR' })
  const [saving, setSaving] = useState(false)

  const { user } = useAuth()
  const [liveData, setLiveData] = useState<Record<number, { price: number, change: number, changePct: number, rate: number }>>({})

  async function load() {
    if (!user) return
    const [{ data: accs }, { data: pfolio }] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('type', 'stock'),
      supabase.from('stock_portfolios').select('*, accounts(name)').eq('user_id', user.id),
    ])
    
    const stockAccs = accs ?? []
    setAccounts(stockAccs)
    if (stockAccs.length > 0) setForm(f => ({ ...f, account_id: String(stockAccs[0].id) }))
    
    const mapped: StockWithAccount[] = (pfolio ?? []).map((p: any) => ({
      ...p,
      accountName: p.accounts?.name ?? '-',
    }))
    setStocks(mapped)

    // Fetch Live Prices (e.g., from Yahoo Finance public API fallback)
    const dataMap: Record<number, { price: number, change: number, changePct: number, rate: number }> = {}
    for (const s of mapped) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/stocks?ticker=${s.ticker}`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        })
        const data = await res.json()
        if (data.price !== undefined) {
          let price = Number(data.price)
          let change = Number(data.change || 0)
          let rate = 1
          
          // Automatic conversion IF the API reports currency as USD
          if (data.currency === 'USD') {
            const { data: { session } } = await supabase.auth.getSession()
            const resIDR = await fetch(`https://min-api.cryptocompare.com/data/price?fsym=USD&tsyms=IDR`, {
              headers: { 'Authorization': `Bearer ${session?.access_token}` }
            })
            const rateData = await resIDR.json()
            rate = rateData.IDR || 15600
            price = price * rate
            change = change * rate
          }

          dataMap[s.id] = {
            price,
            change,
            changePct: Number(data.changePct || 0),
            rate
          }
        }
      } catch (e) {}
    }
    setLiveData(dataMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  async function submit(e: React.FormEvent) {
    if (!user) return
    e.preventDefault()
    setSaving(true)
    await supabase.from('stock_portfolios').insert({
      account_id: parseInt(form.account_id),
      user_id: user.id,
      ticker: (form.currency === 'IDR' && !form.ticker.includes('.')) ? `${form.ticker.toUpperCase()}.JK` : form.ticker.toUpperCase(),
      lots: parseInt(form.lots),
      average_price: parseFloat(parseNumberInput(form.avgPrice)),
    })
    setForm(f => ({ ...f, ticker: '', lots: '', avgPrice: '' }))
    setShowModal(false)
    setSaving(false)
    await load()
  }

  async function saveEdit(id: number) {
    await supabase.from('stock_portfolios').update({ 
      lots: parseInt(editForm.lots) || 0,
      average_price: parseFloat(parseNumberInput(editForm.avgPrice)) || 0
    }).eq('id', id)
    setEditing(null)
    await load()
  }

  async function deleteStock(id: number) {
    toast((t) => (
      <div>
        <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '15px' }}>Remove Stock?</p>
        <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--text-muted)' }}>Are you sure you want to stop tracking this stock?</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={() => toast.dismiss(t.id)} className="btn btn-ghost btn-sm">Cancel</button>
          <button onClick={async () => {
            toast.dismiss(t.id)
            const loadingToast = toast.loading('Removing stock...')
            await supabase.from('stock_portfolios').delete().eq('id', id)
            await load()
            toast.success('Stock removed', { id: loadingToast })
          }} style={{ background: 'var(--red)', color: 'white' }} className="btn btn-sm">Delete</button>
        </div>
      </div>
    ), { duration: Infinity, position: 'top-center' })
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Saham (Stocks)</h1>
          <p className="page-subtitle">Track your stock portfolio with live Yahoo Finance integration.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} disabled={accounts.length === 0}>
          <Plus size={16} /> Add Stock
        </button>
      </div>

      {accounts.length === 0 && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 18px', borderColor: 'rgba(236,72,153,0.3)', background: 'rgba(236,72,153,0.05)' }}>
          <p style={{ fontSize: 14, color: '#ec4899' }}>
            ⚠️ You need a <strong>Stock</strong> account first. <a href="/accounts" style={{ color: 'var(--accent)' }}>Add one in Accounts</a>.
          </p>
        </div>
      )}

      {stocks.length === 0 ? (
        <div className="card empty-state">
          <TrendingUp size={48} />
          <p style={{ marginTop: 12 }}>No stocks tracked yet</p>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Add a stock ticker (e.g., BBCA, GOTO) and number of lots.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {stocks.map(st => {
            const live = liveData[st.id]
            const currentPrice = live?.price || st.average_price
            const totalValue = st.lots * 100 * currentPrice
            const investedVal = st.lots * 100 * (st.average_price * (live?.rate || 1))
            const profitLoss = totalValue - investedVal
            const plPercent = profitLoss / investedVal
            const dailyPNL = st.lots * 100 * (live?.change || 0)
            
            return (
              <div key={st.id} className="card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(236,72,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#ec4899' }}>
                  📈
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{st.ticker}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{st.accountName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {st.lots} Lot ({st.lots * 100} Lbr) &middot; Avg {st.ticker.includes('.JK') ? formatIDR(st.average_price) : `$${st.average_price.toLocaleString()}`}
                  </div>
                </div>
                
                <div style={{ flex: 1, minWidth: 120, textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Price & Performa</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: live ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {live ? formatIDR(live.price) : 'Loading...'}
                  </div>
                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: profitLoss >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      Total: {profitLoss > 0 ? '+' : ''}{formatIDR(profitLoss)} ({plPercent > 0 ? '+' : ''}{formatPercent(plPercent)})
                    </div>
                    {live && (
                      <div style={{ fontSize: 11, fontWeight: 500, color: live.change >= 0 ? '#10b981' : '#f43f5e' }}>
                        Hari Ini: {live.change > 0 ? '+' : ''}{formatIDR(dailyPNL)} ({live.changePct > 0 ? '+' : ''}{live.changePct.toFixed(2)}%)
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', gap: 16, alignItems: 'center' }}>
                  {editing === st.id ? (
                    <div className="flex gap-2" style={{ alignItems: 'center' }}>
                      <input className="form-input" type="number" placeholder="Lots" style={{ width: 70, padding: '6px 10px' }}
                        value={editForm.lots} onChange={e => setEditForm(f => ({ ...f, lots: e.target.value }))} />
                      <input className="form-input" type="text" placeholder="Avg Price" style={{ width: 100, padding: '6px 10px' }}
                        value={editForm.avgPrice} onChange={e => setEditForm(f => ({ ...f, avgPrice: formatNumberInput(e.target.value) }))} />
                      <button className="btn btn-primary btn-sm" onClick={() => saveEdit(st.id)}>
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ textAlign: 'right', minWidth: 100 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Market Value</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#ec4899' }}>{formatIDR(totalValue)}</div>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          setEditing(st.id)
                          setEditForm({ lots: String(st.lots), avgPrice: String(st.average_price) })
                        }}>
                          <Edit2 size={13} />
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteStock(st.id)}>
                          <X size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Stock Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Track Stock Symbol</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)} style={{ padding: '4px 8px' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label">Stock Account (Broker)</label>
                <select className="form-select" value={form.account_id}
                  onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Stock Ticker (e.g. BBCA)</label>
                <input className="form-input" placeholder="BBCA" required
                  value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Total Lots</label>
                  <input className="form-input" type="number" min="1" placeholder="10" required
                    value={form.lots} onChange={e => setForm(f => ({ ...f, lots: e.target.value }))} />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>1 Lot = 100 Shares</p>
                </div>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Average Price</label>
                    <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 20, padding: 2 }}>
                      {['IDR', 'USD'].map(c => (
                        <button key={c} type="button" 
                          onClick={() => setForm(f => ({ ...f, currency: c }))}
                          style={{ 
                            padding: '2px 10px', fontSize: 10, fontWeight: 700, borderRadius: 18, border: 'none', cursor: 'pointer',
                            background: form.currency === c ? 'var(--accent)' : 'transparent',
                            color: form.currency === c ? 'white' : 'var(--text-muted)'
                           }}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13, pointerEvents: 'none' }}>
                      {form.currency === 'USD' ? '$' : 'Rp'}
                    </span>
                    <input className="form-input" type="text" placeholder="0" required style={{ paddingLeft: form.currency === 'USD' ? 24 : 34 }}
                      value={form.avgPrice} onChange={e => setForm(f => ({ ...f, avgPrice: formatNumberInput(e.target.value) }))} />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-4" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Add Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
