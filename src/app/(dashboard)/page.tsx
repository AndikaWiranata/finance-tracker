'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { convertToIDR } from '@/lib/currency'
import { Account, Transaction } from '@/types'
import {
  TrendingUp, TrendingDown, Wallet, DollarSign,
  Bitcoin, ArrowLeftRight, Plus
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import Link from 'next/link'
import { processRecurringTransactions } from '@/lib/recurring'
import { toast } from 'react-hot-toast'
import { getLocalDateISO, getPreviousDateISO } from '@/lib/date'

const TYPE_CONFIG: Record<string, { color: string; icon: string; bg: string }> = {
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

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [todayTotals, setTodayTotals] = useState({ income: 0, expense: 0 })
  const [categoryStats, setCategoryStats] = useState<Record<string, { income: number, expense: number, pnl: number }>>({})
  const [floatingPNL, setFloatingPNL] = useState(0)
  const [historyData, setHistoryData] = useState<any[]>([])
  const [chartPeriod, setChartPeriod] = useState<string>('all')
  const [totalNetWorth, setTotalNetWorth] = useState(0)
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!user) return
      
      // Auto-process recurring transactions
      try {
        const processed = await processRecurringTransactions(supabase, user.id)
        if (processed.length > 0) {
          toast.success(`Berhasil memproses ${processed.length} transaksi rutin otomatis!`)
        }
      } catch (err) {
        console.error('Error processing recurring:', err)
      }

      const todayStr = getLocalDateISO()
      const [{ data: accs }, { data: txns }, { data: todayTx }, { data: cryptoW }, { data: forexA }, { data: stockP }, { data: historyTx }, { data: snapshots }] = await Promise.all([
        supabase.from('accounts').select('*').eq('user_id', user.id),
        supabase.from('transactions')
          .select('*, accounts(name, currency)')
          .order('date', { ascending: false })
          .limit(8),
        supabase.from('transactions')
          .select('amount, type, accounts(type)')
          .eq('user_id', user.id)
          .eq('date', todayStr),
        supabase.from('crypto_wallets').select('*').eq('user_id', user.id),
        supabase.from('forex_accounts').select('*').eq('user_id', user.id),
        supabase.from('stock_portfolios').select('*').eq('user_id', user.id),
        supabase.from('transactions')
          .select('amount, type, date')
          .eq('user_id', user.id)
          .order('date', { ascending: false }),
        supabase.from('net_worth_snapshots')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: true })
      ])
      
      const loadedAccs = accs ?? []
      setAccounts(loadedAccs)
      setTransactions(txns ?? [])

      const inTot = (todayTx ?? []).filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
      const exTot = (todayTx ?? []).filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
      setTodayTotals({ income: inTot, expense: exTot })

      const catStats: Record<string, { income: number, expense: number, pnl: number }> = {}
      ;(todayTx ?? []).forEach((t: any) => {
        const type = t.accounts?.type || 'other'
        if (!catStats[type]) catStats[type] = { income: 0, expense: 0, pnl: 0 }
        if (t.type === 'income') catStats[type].income += Number(t.amount)
        else catStats[type].expense += Number(t.amount)
      })

      const accsWithIdr = loadedAccs.map((a: any) => ({ ...a, idrValue: 0 }))

      let total = 0
      let totalFloating = 0
      for (const a of accsWithIdr) {
        if (a.type !== 'crypto' && a.type !== 'forex' && a.type !== 'stock') {
          a.idrValue = await convertToIDR(Number(a.balance), a.currency || 'IDR')
          total += a.idrValue
        }
      }

      for (const w of (cryptoW ?? [])) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const res = await fetch(`/api/crypto?coin=${w.coin_symbol}`, {
            headers: { 'Authorization': `Bearer ${session?.access_token}` }
          })
          const data = await res.json()
          const val = (w.balance || 0) * Number(data.price_idr || 0)
          const pnl24h = (w.balance || 0) * Number(data.change_24h_idr || 0)
          total += val
          totalFloating += pnl24h
          if (!catStats['crypto']) catStats['crypto'] = { income: 0, expense: 0, pnl: 0 }
          catStats['crypto'].pnl += pnl24h
          const target = accsWithIdr.find((a: any) => a.id === w.account_id)
          if (target) target.idrValue += val
        } catch (e) {}
      }

      for (const f of (forexA ?? [])) {
        try {
          const base = f.currency_pair.split('/')[0] || 'USD'
          const val = await convertToIDR(Number(f.equity), base.includes('IDR') ? 'USD' : base)
          total += val
          const target = accsWithIdr.find((a: any) => a.id === f.account_id)
          if (target) target.idrValue += val
        } catch (e) {}
      }

      for (const s of (stockP ?? [])) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const res = await fetch(`/api/stocks?ticker=${s.ticker}`, {
            headers: { 'Authorization': `Bearer ${session?.access_token}` }
          })
          const data = await res.json()
          const val = (s.lots || 0) * 100 * Number(data.price || s.average_price || 0)
          const pnl24h = (s.lots || 0) * 100 * Number(data.change || 0)
          total += val
          totalFloating += pnl24h
          if (!catStats['stock']) catStats['stock'] = { income: 0, expense: 0, pnl: 0 }
          catStats['stock'].pnl += pnl24h
          const target = accsWithIdr.find((a: any) => a.id === s.account_id)
          if (target) target.idrValue += val
        } catch (e) {}
      }

      setCategoryStats(catStats)
      setAccounts(accsWithIdr)
      setTotalNetWorth(total)
      setFloatingPNL(totalFloating)

      // Save/Update Snapshot for today
      if (total > 0) {
        await supabase.from('net_worth_snapshots').upsert({
          user_id: user.id,
          date: todayStr,
          net_worth: total,
          metadata: { breakdown: accsWithIdr.map(a => ({ type: a.type, val: a.idrValue })) }
        }, { onConflict: 'user_id,date' })
      }

      // Calculate Chart Data
      let finalHistory: any[] = []
      const hasTodaySnapshot = snapshots?.some(s => s.date === todayStr)

      // 1. Start with historical snapshots
      if (snapshots && snapshots.length > 0) {
        finalHistory = snapshots.map(s => ({
          date: new Date(s.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
          value: Number(s.net_worth),
          rawDate: s.date
        }))
      }

      // 2. Ensure "Sekarang" (Live Value) is present and synced
      if (total > 0) {
        if (!hasTodaySnapshot) {
          finalHistory.push({
            date: 'Sekarang',
            value: total,
            rawDate: todayStr
          })
        } else {
          // Sync existing today's snapshot with live total
          const todayIdx = finalHistory.findIndex(p => p.rawDate === todayStr)
          if (todayIdx !== -1) {
            finalHistory[todayIdx].value = total
            finalHistory[todayIdx].date = 'Sekarang'
          }
        }
      }

      // 3. Fallback: Prepend transaction-based history if we lack data points
      if (finalHistory.length < 2 && historyTx && historyTx.length > 0) {
        let runningTotal = total
        const groupedHistory = historyTx.reduce((acc: any, t: any) => {
          if (!acc[t.date]) acc[t.date] = 0
          acc[t.date] += t.type === 'income' ? Number(t.amount) : -Number(t.amount)
          return acc
        }, {})
        
        const dates = Object.keys(groupedHistory).sort((a, b) => b.localeCompare(a))
        const txPoints: any[] = []
        
        for (const d of dates) {
          runningTotal -= groupedHistory[d]
          // Avoid duplicates with snapshots
          if (!finalHistory.some(p => p.rawDate === d)) {
            txPoints.push({
              date: new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
              value: runningTotal,
              rawDate: d
            })
          }
        }
        finalHistory = [...txPoints.reverse(), ...finalHistory]
      }

      // 4. Force Render: If still only 1 point (no history), add a dummy 'Yesterday' point
      if (finalHistory.length === 1 && total > 0) {
          const yesterday = getPreviousDateISO(1)
          finalHistory.unshift({
              date: new Date(yesterday).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
              value: finalHistory[0].value,
              rawDate: yesterday
          })
      }

      setHistoryData(finalHistory)

      setLoading(false)
    }
    load()
  }, [user])

  const breakdown = Object.entries(
    accounts.reduce<Record<string, number>>((acc, a: any) => {
      acc[a.type] = (acc[a.type] ?? 0) + (a.idrValue || 0)
      return acc
    }, {})
  ).map(([type, value]) => ({ 
    type, 
    value, 
    ...TYPE_CONFIG[type], 
    ...categoryStats[type] 
  }))

  // We use todayTotals instead of calculating from the limited transactions list
  const totalIncome = todayTotals.income
  const totalExpense = todayTotals.expense

  // Filter displayed history data based on selected period
  const displayHistory = (() => {
    if (historyData.length < 2) return []
    if (chartPeriod === 'all') return historyData
    
    const cutoff = new Date()
    if (chartPeriod === '7d') cutoff.setDate(cutoff.getDate() - 7)
    if (chartPeriod === '30d') cutoff.setDate(cutoff.getDate() - 30)
    
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return historyData.filter(d => d.rawDate >= cutoffStr || d.date === 'Sekarang')
  })()

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your financial assets</p>
        </div>
        <Link href="/transactions" className="btn btn-primary">
          <Plus size={16} /> Add Transaction
        </Link>
      </div>

      {/* Net Worth */}
      <div className="networth-card mb-4">
        <div className="networth-label">Total Net Worth</div>
        <div className="networth-amount">{formatIDR(totalNetWorth)}</div>
        <div className="networth-sub">{accounts.length} accounts tracked</div>
        <div className="flex gap-3 mt-4" style={{ flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <TrendingUp size={15} color="var(--green)" />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pemasukan Hari Ini</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>+{formatIDR(totalIncome)}</div>
            </div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <TrendingDown size={15} color="var(--red)" />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pengeluaran Hari Ini</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>-{formatIDR(totalExpense)}</div>
            </div>
          </div>
          <div style={{ background: 'rgba(110,231,183,0.05)', border: '1px solid rgba(110,231,183,0.1)', borderRadius: 8, padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <DollarSign size={15} color="#10b981" />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Floating P/L (24j)</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: floatingPNL >= 0 ? '#10b981' : 'var(--red)' }}>
                {floatingPNL >= 0 ? '+' : ''}{formatIDR(floatingPNL)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Growth Chart */}
      <div className="card mb-4" style={{ padding: '24px' }}>
        <div className="flex-between mb-6" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="section-title mb-0" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TrendingUp size={20} color="var(--accent)" />
            <span>Pertumbuhan Aset</span>
          </div>
          <div className="flex gap-1" style={{ background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '10px' }}>
            {['7d', '30d', 'all'].map((p) => (
              <button 
                key={p} 
                onClick={() => setChartPeriod(p)}
                style={{
                  padding: '4px 12px', borderRadius: '7px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: chartPeriod === p ? 'var(--accent)' : 'transparent',
                  color: chartPeriod === p ? 'white' : 'var(--text-muted)',
                  transition: 'all 0.2s'
                }}
              >
                {p === '7d' ? '7 Hari' : p === '30d' ? '30 Hari' : 'Semua'}
              </button>
            ))}
          </div>
        </div>
        
        {displayHistory.length < 2 ? (
          <div className="empty-state" style={{ height: 200 }}>
            <p>Belum ada data history yang cukup untuk periode ini</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={displayHistory}>
              <defs>
                <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                style={{ fontSize: 11, fill: 'var(--text-muted)' }} 
                dy={10}
              />
              <YAxis 
                hide 
                domain={['auto', 'auto']} 
              />
              <Tooltip 
                contentStyle={{ 
                  background: 'rgba(15, 23, 42, 0.9)', 
                  border: '1px solid var(--border)', 
                  borderRadius: '12px',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                }}
                labelStyle={{ color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}
                itemStyle={{ color: 'var(--accent)', fontWeight: 'bold' }}
                formatter={(v: any) => formatIDR(Number(v))}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="var(--accent)" 
                strokeWidth={3} 
                fillOpacity={1} 
                fill="url(#colorNet)"
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Breakdown grid */}
      <div className="grid-5 mb-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(180px, 1fr))` }}>
        {breakdown.map((b) => (
          <div className="card-sm stat-card" key={b.type}>
            <div className="stat-icon" style={{ background: b.bg }}>
              <span>{b.icon}</span>
            </div>
            <div className="stat-label" style={{ textTransform: 'capitalize' }}>{b.type}</div>
            <div className="stat-value" style={{ fontSize: 15 }}>{formatIDR(b.value)}</div>
            
            {(b.income || b.expense || b.pnl) ? (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 8px', fontSize: 10, fontWeight: 600 }}>
                {b.income > 0 && <span style={{ color: 'var(--green)' }}>+{formatIDR(b.income)}</span>}
                {b.expense > 0 && <span style={{ color: 'var(--red)' }}>-{formatIDR(b.expense)}</span>}
                {b.pnl !== 0 && (
                  <span style={{ color: b.pnl > 0 ? '#10b981' : '#f43f5e', opacity: 0.8 }}>
                    {b.pnl > 0 ? '📈' : '📉'} {b.pnl > 0 ? '+' : ''}{formatIDR(b.pnl)}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>No today's flow</div>
            )}
          </div>
        ))}
      </div>

      <div className="grid-2 mb-4" style={{ alignItems: 'start' }}>
        {/* Pie chart */}
        <div className="card">
          <div className="section-title"><DollarSign size={16} /> Asset Breakdown</div>
          {breakdown.length === 0 ? (
            <div className="empty-state"><p>No accounts yet</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={breakdown} dataKey="value" nameKey="type" cx="50%" cy="50%" outerRadius={85} innerRadius={45}>
                  {breakdown.map((entry) => (
                    <Cell key={entry.type} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => formatIDR(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {breakdown.map(b => (
              <div key={b.type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color, display: 'inline-block' }} />
                {b.type}
              </div>
            ))}
          </div>
        </div>

        {/* Recent transactions */}
        <div className="card">
          <div className="flex-between mb-4">
            <div className="section-title mb-0"><ArrowLeftRight size={16} /> Recent Transactions</div>
            <Link href="/transactions" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>View all</Link>
          </div>
          {transactions.length === 0 ? (
            <div className="empty-state"><p>No transactions yet</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {transactions.map(t => (
                <div key={t.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: '1px solid var(--border)'
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{t.category}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.accounts?.name} · {formatDate(t.date)}</div>
                  </div>
                  <div className={t.type === 'income' ? 'amount-income' : 'amount-expense'}>
                    {t.type === 'income' ? '+' : '-'}{formatIDR(Number(t.amount))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick accounts */}
      <div className="section-title"><Wallet size={16} /> Accounts</div>
      {accounts.length === 0 ? (
        <div className="card empty-state">
          <Wallet size={40} />
          <p style={{ marginTop: 12 }}>No accounts yet. <Link href="/accounts" style={{ color: 'var(--accent)' }}>Add one</Link></p>
        </div>
      ) : (
        <div className="grid-3">
          {accounts.map(acc => {
            const cfg = TYPE_CONFIG[acc.type]
            return (
              <div key={acc.id} className="account-card">
                <div className="flex-between">
                  <span className="account-type-badge" style={{ background: cfg.bg, color: cfg.color }}>
                    {cfg.icon} {acc.type}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{acc.type === 'crypto' || acc.type === 'forex' || acc.type === 'stock' ? 'IDR (eq)' : acc.currency}</span>
                </div>
                <div className="account-name">{acc.name}</div>
                <div className="account-balance">{formatIDR(Number((acc as any).idrValue))}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
