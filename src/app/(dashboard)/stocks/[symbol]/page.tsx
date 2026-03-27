'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, TrendingUp, TrendingDown, Clock, Wallet, Landmark } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import TradingViewWidget from '@/components/TradingViewWidget'

import { formatCurrency, getFiatRates } from '@/lib/currency'

// Replaced local formatIDR with global formatCurrency

export default function StockDetailPage() {
  const { symbol } = useParams()
  const router = useRouter()
  const { user, profile } = useAuth()
  const [exchangeRate, setExchangeRate] = useState(1)
  const baseCurrency = profile?.base_currency || 'IDR'
  const [loading, setLoading] = useState(true)
  const [assetData, setAssetData] = useState<any>(null)
  const [totalLots, setTotalLots] = useState(0)
  const [livePrice, setLivePrice] = useState<any>(null)

  useEffect(() => {
    async function fetchDetails() {
      if (!user || !symbol) return
      
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
      
      const ticker = Array.isArray(symbol) ? symbol[0] : symbol
      const { data: portfolios } = await supabase
        .from('stock_portfolios')
        .select('*, accounts(name)')
        .eq('user_id', user.id)
        .eq('ticker', decodeURIComponent(ticker))

      if (portfolios) {
        const total = portfolios.reduce((acc, curr) => acc + Number(curr.lots), 0)
        setTotalLots(total)
        setAssetData(portfolios)
      }

      // Fetch Live Price
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/stocks?ticker=${ticker}`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        })
        const data = await res.json()
        setLivePrice(data)
      } catch (e) {}

      setLoading(false)
    }

    fetchDetails()
  }, [user, symbol, baseCurrency])

  if (loading || !symbol) return <div className="spinner" />

  const tickerSymbol = Array.isArray(symbol) ? symbol[0] : symbol
  // TradingView typically uses IDX for Indonesian stocks if it ends with .JK
  const tvSymbol = tickerSymbol.includes('.') ? `IDX:${tickerSymbol.split('.')[0]}` : tickerSymbol

  return (
    <div className="animate-in">
      <div className="flex-between mb-6">
        <button onClick={() => router.back()} className="btn btn-ghost btn-sm" style={{ padding: '8px 12px', gap: 8 }}>
          <ArrowLeft size={18} /> Kembali
        </button>
        <div className="flex gap-2">
            <div className="badge" style={{ background: 'rgba(236,72,153,0.1)', color: '#ec4899', border: '1px solid rgba(236,72,153,0.2)' }}>
                Stock Asset
            </div>
        </div>
      </div>

      <div className="grid-3 mb-6" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ 
                width: 64, height: 64, borderRadius: 16, 
                background: 'linear-gradient(135deg, #ec4899, #be185d)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 16px rgba(236, 72, 153, 0.2)'
            }}>
                <TrendingUp size={32} color="white" />
            </div>
            <div>
                <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>{tickerSymbol.split('.')[0]}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {livePrice?.price ? formatCurrency(Number(livePrice.price) * exchangeRate, baseCurrency) : '---'}
                    </div>
                    {livePrice && (
                        <div style={{ 
                            fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                            color: livePrice.changePct >= 0 ? 'var(--green)' : 'var(--red)'
                        }}>
                            {livePrice.changePct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {livePrice.changePct > 0 ? '+' : ''}{livePrice.changePct?.toFixed(2)}%
                        </div>
                    )}
                </div>
            </div>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.05) 100%)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Kepemilikan Saham</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#ec4899' }}>{totalLots} Lot</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>≈ {formatCurrency(totalLots * 100 * (livePrice?.price || 0) * exchangeRate, baseCurrency)}</div>
        </div>
      </div>

      <div className="card" style={{ height: 600, padding: 0, overflow: 'hidden', marginBottom: 24, border: '1px solid var(--border)' }}>
        <TradingViewWidget symbol={tvSymbol} />
      </div>

      <div className="grid-2">
        <div className="card">
            <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Landmark size={18} /> Porto & Broker
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {assetData?.map((p: any) => (
                    <div key={p.id} className="flex-between" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{p.accounts?.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Avg: {formatCurrency(p.average_price * exchangeRate, baseCurrency)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{p.lots} Lot</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatCurrency(p.lots * 100 * (livePrice?.price || 0) * exchangeRate, baseCurrency)}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        <div className="card">
            <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock size={18} /> Ringkasan Performa
            </h3>
            <div className="grid-2" style={{ gap: 20 }}>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Day Low</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{livePrice?.low ? formatCurrency(livePrice.low * exchangeRate, baseCurrency) : '---'}</div>
                </div>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Day High</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{livePrice?.high ? formatCurrency(livePrice.high * exchangeRate, baseCurrency) : '---'}</div>
                </div>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Volume</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{livePrice?.volume ? (livePrice.volume > 1000000 ? `${(livePrice.volume/1000000).toFixed(1)}M` : livePrice.volume.toLocaleString()) : '---'}</div>
                </div>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Currency</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{livePrice?.currency || 'IDR'}</div>
                </div>
            </div>
        </div>
      </div>
    </div>
  )
}
