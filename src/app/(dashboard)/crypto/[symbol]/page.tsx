'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Bitcoin, TrendingUp, TrendingDown, Clock, Wallet } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import TradingViewWidget from '@/components/TradingViewWidget'

import { formatCurrency, getFiatRates } from '@/lib/currency'

// Replaced local formatIDR with global formatCurrency

export default function CryptoDetailPage() {
    const { symbol } = useParams()
    const router = useRouter()
    const { user, profile } = useAuth()
    const [exchangeRate, setExchangeRate] = useState(1)
    const baseCurrency = profile?.base_currency || 'IDR'
    const [loading, setLoading] = useState(true)
    const [assetData, setAssetData] = useState<any>(null)
    const [totalBalance, setTotalBalance] = useState(0)
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

            const { data: wallets } = await supabase
                .from('crypto_wallets')
                .select('*, accounts(name)')
                .eq('user_id', user.id)
                .eq('coin_symbol', symbol)

            if (wallets) {
                const total = wallets.reduce((acc, curr) => acc + Number(curr.balance), 0)
                setTotalBalance(total)
                setAssetData(wallets)
            }

            // Fetch Live Price
            try {
                const { data: { session } } = await supabase.auth.getSession()
                const res = await fetch(`/api/crypto?coin=${symbol}`, {
                    headers: { 'Authorization': `Bearer ${session?.access_token}` }
                })
                const data = await res.json()
                setLivePrice(data)
            } catch (e) { }

            setLoading(false)
        }

        fetchDetails()
    }, [user, symbol, baseCurrency])

    if (loading || !symbol) return <div className="spinner" />

    const coinSymbol = Array.isArray(symbol) ? symbol[0] : symbol
    const tvSymbol = `BINANCE:${coinSymbol}USDT`

    return (
        <div className="animate-in">
            <div className="flex-between mb-6">
                <button onClick={() => router.back()} className="btn btn-ghost btn-sm" style={{ padding: '8px 12px', gap: 8 }}>
                    <ArrowLeft size={18} /> Kembali
                </button>
                <div className="flex gap-2">
                    <div className="badge" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                        Crypto Asset
                    </div>
                </div>
            </div>

            <div className="grid-3 mb-6" style={{ gridTemplateColumns: '2fr 1fr' }}>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: 16,
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 8px 16px rgba(245, 158, 11, 0.2)'
                    }}>
                        <Bitcoin size={32} color="white" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>{coinSymbol} <span style={{ color: 'var(--text-muted)', fontSize: 18, fontWeight: 500 }}>USDT</span></h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
                                {livePrice?.price_idr ? formatCurrency(livePrice.price_idr * exchangeRate, baseCurrency) : '---'}
                            </div>
                            {livePrice && (
                                <div style={{
                                    fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                    color: livePrice.change_24h_pct >= 0 ? 'var(--green)' : 'var(--red)'
                                }}>
                                    {livePrice.change_24h_pct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    {livePrice.change_24h_pct > 0 ? '+' : ''}{livePrice.change_24h_pct.toFixed(2)}%
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="card" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.05) 100%)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Total Saldo Anda</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{totalBalance.toLocaleString(undefined, { maximumFractionDigits: 8 })} {coinSymbol}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>≈ {formatCurrency(totalBalance * (livePrice?.price_idr || 0) * exchangeRate, baseCurrency)}</div>
                </div>
            </div>

            <div className="card" style={{ height: 600, padding: 0, overflow: 'hidden', marginBottom: 24, border: '1px solid var(--border)' }}>
                <TradingViewWidget symbol={tvSymbol} />
            </div>

            <div className="grid-2">
                <div className="card">
                    <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Wallet size={18} /> Penempatan Aset
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {assetData?.map((w: any) => (
                            <div key={w.id} className="flex-between" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>{w.accounts?.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>ID: {w.id}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 14, fontWeight: 700 }}>{Number(w.balance).toLocaleString(undefined, { maximumFractionDigits: 8 })} {coinSymbol}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatCurrency(Number(w.balance) * (livePrice?.price_idr || 0) * exchangeRate, baseCurrency)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card">
                    <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Clock size={18} /> Statisik Pasar
                    </h3>
                    <div className="grid-2" style={{ gap: 20 }}>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Low (24j)</div>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>${livePrice?.low_24h_usd?.toLocaleString() || '---'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>High (24j)</div>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>${livePrice?.high_24h_usd?.toLocaleString() || '---'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Volume (24j)</div>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>${(livePrice?.volume_24h_usd / 1000000)?.toFixed(1)}M</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Market Cap</div>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>${(livePrice?.market_cap_usd / 1000000000)?.toFixed(1)}B</div>
                        </div>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 24 }}>Data real-time disediakan oleh API Integrasi TradingView & Financial Feeds.</p>
                </div>
            </div>
        </div>
    )
}
