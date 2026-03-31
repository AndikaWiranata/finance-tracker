'use client'
import React, { useMemo, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { formatCurrency, getFiatRates } from '@/lib/currency'

interface Transaction {
  amount: number
  type: 'income' | 'expense' | 'pnl'
  date: string
}

interface SpendingHeatmapProps {
  transactions: Transaction[]
}

export default function SpendingHeatmap({ transactions }: SpendingHeatmapProps) {
  const today = new Date()
  const [displayMonth, setDisplayMonth] = useState(today.getMonth())
  const [displayYear, setDisplayYear] = useState(today.getFullYear())
  const [exchangeRate, setExchangeRate] = useState(1)
  const router = useRouter()
  const { profile } = useAuth()
  const baseCurrency = profile?.base_currency || 'IDR'

  useEffect(() => {
    async function fetchRate() {
        if (baseCurrency !== 'IDR') {
            const rates = await getFiatRates()
            if (rates) {
                const idrToUsd = 1 / (rates['IDR'] || 15500)
                const usdToBase = rates[baseCurrency] || 1
                setExchangeRate(idrToUsd * usdToBase)
            }
        } else {
            setExchangeRate(1)
        }
    }
    fetchRate()
  }, [baseCurrency])

  const formatValue = (n: number) => {
    const abs = Math.abs(n) * exchangeRate
    return new Intl.NumberFormat(baseCurrency === 'IDR' ? 'id-ID' : 'en-US', {
        maximumFractionDigits: baseCurrency === 'IDR' ? 0 : 2
    }).format(abs)
}

  const dailyStats = useMemo(() => {
    const stats: Record<string, { income: number, expense: number, net: number, pnl: number }> = {}
    transactions.forEach(t => {
      const d = typeof t.date === 'string' ? t.date.substring(0, 10) : t.date
      if (!stats[d]) stats[d] = { income: 0, expense: 0, net: 0, pnl: 0 }
      const amt = Number(t.amount)
      if (t.type === 'expense') {
        stats[d].expense += amt
        stats[d].net -= amt
      } else if (t.type === 'income') {
        stats[d].income += amt
        stats[d].net += amt
      } else if (t.type === 'pnl') {
        stats[d].pnl += amt
        stats[d].net += amt
      }
    })
    return stats
  }, [transactions])

  const intensities = useMemo(() => {
    const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate()
    let maxGain = 100000
    let maxLoss = 100000
    for (let i = 1; i <= daysInMonth; i++) {
        const d = `${displayYear}-${String(displayMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
        if (dailyStats[d]) {
            if (dailyStats[d].net > 0) maxGain = Math.max(maxGain, dailyStats[d].net)
            if (dailyStats[d].net < 0) maxLoss = Math.max(maxLoss, Math.abs(dailyStats[d].net))
        }
    }
    return { maxGain, maxLoss }
  }, [dailyStats, displayMonth, displayYear])

  const monthSummary = useMemo(() => {
    const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate()
    let income = 0
    let expense = 0
    for (let i = 1; i <= daysInMonth; i++) {
        const d = `${displayYear}-${String(displayMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
        if (dailyStats[d]) {
            income += dailyStats[d].income
            expense += dailyStats[d].expense
        }
    }
    return { income, expense, net: income - expense }
  }, [dailyStats, displayMonth, displayYear])

  const getHeatStyle = (net: number) => {
    if (net === 0) return { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }
    
    if (net > 0) {
        const intensity = Math.min(net / intensities.maxGain, 1)
        return {
            background: `rgba(34, 197, 94, ${0.08 + intensity * 0.22})`,
            borderColor: `rgba(34, 197, 94, ${0.1 + intensity * 0.3})`,
        }
    } else {
        const intensity = Math.min(Math.abs(net) / intensities.maxLoss, 1)
        return {
            background: `rgba(239, 68, 68, ${0.08 + intensity * 0.22})`,
            borderColor: `rgba(239, 68, 68, ${0.1 + intensity * 0.3})`,
        }
    }
  }

  const daysLabel = new Date(displayYear, displayMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  const changeMonth = (delta: number) => {
    let newM = displayMonth + delta
    let newY = displayYear
    if (newM < 0) { newM = 11; newY-- }
    else if (newM > 11) { newM = 0; newY++ }
    setDisplayMonth(newM)
    setDisplayYear(newY)
  }

  const daysArr = Array.from({ length: new Date(displayYear, displayMonth + 1, 0).getDate() }, (_, i) => i + 1)
  const padding = Array.from({ length: (new Date(displayYear, displayMonth, 1).getDay() + 6) % 7 }, (_, i) => i)

  return (
    <div className="heatmap-container card">
      <div className="heatmap-header">
        <div className="header-top">
            <h2 className="title">Financial Heatmap</h2>
            <div className="month-nav">
                <button onClick={() => changeMonth(-1)}><ChevronLeft size={16}/></button>
                <span>{daysLabel}</span>
                <button onClick={() => changeMonth(1)} disabled={displayYear >= today.getFullYear() && displayMonth >= today.getMonth()}><ChevronRight size={16}/></button>
            </div>
        </div>

        <div className="header-bottom">
            <div className="legend">
                <div className="legend-item"><span className="dot deficit"></span> Deficit</div>
                <div className="legend-item"><span className="dot surplus"></span> Surplus</div>
            </div>
            
            <div className="summary-row">
                <div className="badge income">
                    <ArrowUpCircle size={14} />
                    <span>{formatValue(monthSummary.income)}</span>
                </div>
                <div className="badge expense">
                    <ArrowDownCircle size={14} />
                    <span>{formatValue(monthSummary.expense)}</span>
                </div>
                <div className={`badge net ${monthSummary.net >= 0 ? 'pos' : 'neg'}`}>
                    <span className="net-label">Net</span>
                    <span className="net-val">{formatValue(monthSummary.net)}</span>
                </div>
            </div>
        </div>
      </div>

      <div className="calendar-grid">
        {daysOfWeek.map((d, i) => <div key={i} className="day-label">{d}</div>)}
        {padding.map(p => <div key={`p-${p}`} />)}
        {daysArr.map(day => {
          const dateStr = `${displayYear}-${String(displayMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const stats = dailyStats[dateStr] || { income: 0, expense: 0, net: 0, pnl: 0 }
          const style = getHeatStyle(stats.net)
          
          return (
            <div 
              key={day}
              className="day-cell"
              onClick={() => router.push(`/transactions?date=${dateStr}`)}
              style={{ ...style }}
            >
              <div className="d-num">{day}</div>
              <div className="d-data">
                  {stats.income > 0 && <span className="s-in">+{formatValue(stats.income)}</span>}
                  {stats.expense > 0 && <span className="s-out">-{formatValue(stats.expense)}</span>}
              </div>

              <div className="tooltip">
                <div className="tt-date">{day} {daysLabel}</div>
                <div className="tt-row in">↑ Income: {formatCurrency(stats.income * exchangeRate, baseCurrency)}</div>
                <div className="tt-row out">↓ Expense: {formatCurrency(stats.expense * exchangeRate, baseCurrency)}</div>
                {stats.pnl !== 0 && (
                   <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '6px', color: stats.pnl >= 0 ? 'var(--green)' : '#ef4444' }}>
                      {stats.pnl >= 0 ? '📈' : '📉'} Market: {formatCurrency(stats.pnl * exchangeRate, baseCurrency)}
                   </div>
                )}
                <div className="tt-divider"></div>
                <div className={`tt-row net ${stats.net >= 0 ? 'green' : 'red'}`}>Net Change: {formatCurrency(stats.net * exchangeRate, baseCurrency)}</div>
                <p style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>*Includes market price movements</p>
              </div>
            </div>
          )
        })}
      </div>

      <style jsx>{`
        .heatmap-container {
            padding: 24px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 20px;
            overflow: hidden; /* Prevent internal overflow from breaking layout */
        }
        .heatmap-header {
            margin-bottom: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }
        .title {
            font-size: 18px;
            font-weight: 800;
            color: var(--text-primary);
            margin: 0;
        }
        .month-nav {
            display: flex;
            align-items: center;
            gap: 8px;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            padding: 4px 12px;
            border-radius: 12px;
        }
        .month-nav button {
            background: transparent;
            border: none;
            color: var(--text-primary);
            cursor: pointer;
            padding: 4px;
            display: flex;
            border-radius: 4px;
        }
        .month-nav button:hover:not(:disabled) { background: var(--bg-hover); }
        .month-nav button:disabled { opacity: 0.2; }
        .month-nav span { font-size: 13px; font-weight: 700; min-width: 100px; text-align: center; }

        .header-bottom {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }
        .legend { display: flex; gap: 12px; }
        .legend-item { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; font-weight: 600; }
        .dot { width: 6px; height: 6px; border-radius: 50%; }
        .dot.deficit { background: #ef4444; }
        .dot.surplus { background: #22c55e; }

        .summary-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .badge {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 12px;
            border-radius: 8px;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            font-size: 12px;
            font-weight: 800;
        }
        .badge.income { color: var(--green); }
        .badge.expense { color: #ef4444; }
        .badge.net { border: 1px solid rgba(255,255,255,0.05); }
        .badge.net.pos { color: var(--green); background: rgba(34, 197, 94, 0.05); }
        .badge.net.neg { color: #ef4444; background: rgba(239, 68, 68, 0.05); }
        .net-label { font-size: 10px; opacity: 0.6; margin-right: 4px; }

        .calendar-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 8px;
        }
        .day-label {
            text-align: center;
            font-size: 10px;
            font-weight: 800;
            color: var(--text-muted);
            padding-bottom: 8px;
        }
        .day-cell {
            aspect-ratio: 1/1.1;
            border-radius: 8px;
            border: 1px solid transparent;
            padding: 6px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
        }
        .day-cell:hover {
            transform: scale(1.05);
            z-index: 10;
            border-color: var(--accent) !important;
            box-shadow: 0 8px 16px rgba(0,0,0,0.3);
        }
        .d-num { font-size: 10px; font-weight: 800; color: var(--text-secondary); }
        .d-data { display: flex; flex-direction: column; gap: 1px; width: 100%; overflow: hidden; }
        .s-in, .s-out { font-size: 8px; font-weight: 900; white-space: nowrap; }
        .s-in { color: var(--green); }
        .s-out { color: #ef4444; }

        .tooltip {
            position: absolute;
            bottom: 110%;
            left: 50%;
            transform: translateX(-50%);
            background: #1a1d27;
            border: 1px solid var(--border);
            padding: 12px;
            border-radius: 12px;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s;
            z-index: 100;
            width: 160px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }
        .day-cell:hover .tooltip { opacity: 1; }
        .tt-date { font-weight: 800; font-size: 11px; margin-bottom: 6px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
        .tt-row { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
        .tt-row.in { color: var(--green); }
        .tt-row.out { color: #ef4444; }
        .tt-divider { height: 1px; background: var(--border); margin: 6px 0; }
        .tt-row.net.green { color: var(--green); }
        .tt-row.net.red { color: #ef4444; }

        @media (max-width: 600px) {
            .heatmap-container { padding: 16px; border-radius: 12px; }
            .calendar-grid { gap: 4px; }
            .day-cell { padding: 4px; }
            .d-num { font-size: 9px; }
            .s-in, .s-out { font-size: 7px; }
            .badge { padding: 4px 8px; }
            .badge span { font-size: 10px; }
            .header-top { flex-direction: column; align-items: stretch; }
            .title { text-align: center; }
            .month-nav { justify-content: center; width: 100%; }
            .header-bottom { flex-direction: column; align-items: center; gap: 12px; }
            .legend { width: 100%; justify-content: center; }
            .summary-row { width: 100%; justify-content: center; }
            .d-data { display: none; } /* On very small mobile, hide specific amounts to prevent overflow, rely on color and tooltip */
        }
        
        @media (max-width: 400px) {
            .summary-row { display: grid; grid-template-columns: 1fr 1fr; }
            .badge.net { grid-column: span 2; justify-content: center; }
        }

      `}</style>
    </div>
  )
}
