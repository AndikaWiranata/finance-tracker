'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { formatIDR } from '@/lib/currency'
import { Users, Landmark, Activity, Megaphone, CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react'
import { toast } from 'react-hot-toast'

export default function AdminDashboard() {
  const { user, isAdmin, loading: authLoading } = useAuth()
  
  if (authLoading) return <div className="spinner" />

  if (!isAdmin) {
    return (
      <div className="card empty-state" style={{ marginTop: 100 }}>
        <AlertCircle size={48} color="var(--red)" />
        <h2 style={{ marginTop: 16 }}>Akses Ditolak</h2>
        <p style={{ color: 'var(--text-muted)' }}>Halaman ini hanya untuk Administrator Utama.</p>
        <a href="/" className="btn btn-primary" style={{ marginTop: 24 }}>Kembali ke Dashboard</a>
      </div>
    )
  }

  const [stats, setStats] = useState({
    totalUsers: 0,
    totalBalance: 0,
    totalTransactions: 0,
    apiCrypto: 'checking',
    apiStocks: 'checking',
    apiGemini: 'checking'
  })
  const [loading, setLoading] = useState(true)
  const [broadcastMsg, setBroadcastMsg] = useState('')

  async function loadAdminData() {
    setLoading(true)
    try {
      // 1. Estimate Users (Unique user_ids in accounts)
      const { data: usersData } = await supabase.from('accounts').select('user_id')
      const uniqueUsers = new Set((usersData || []).map(u => u.user_id)).size

      // 2. Platform Total Balance
      const { data: balanceData } = await supabase.from('accounts').select('balance')
      const totalBal = (balanceData || []).reduce((s, a) => s + Number(a.balance), 0)

      // 3. Total Transaction Count
      const { count: txCount } = await supabase.from('transactions').select('*', { count: 'exact', head: true })

      // 4. API Health Check
      const { data: { session } } = await supabase.auth.getSession()
      const [cryptoRes, stockRes, aiRes] = await Promise.all([
        fetch('/api/crypto?coin=BTC', { headers: { 'Authorization': `Bearer ${session?.access_token}` } }).then(r => r.ok),
        fetch('/api/stocks?ticker=BBCA.JK', { headers: { 'Authorization': `Bearer ${session?.access_token}` } }).then(r => r.ok),
        fetch('/api/ai', { headers: { 'Authorization': `Bearer ${session?.access_token}` } }).then(r => r.ok)
      ])

      setStats({
        totalUsers: uniqueUsers,
        totalBalance: totalBal,
        totalTransactions: txCount || 0,
        apiCrypto: cryptoRes ? 'active' : 'error',
        apiStocks: stockRes ? 'active' : 'error',
        apiGemini: aiRes ? 'active' : 'error'
      })
    } catch (e) {
      console.error('Admin load error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) loadAdminData()
  }, [user])

  const sendBroadcast = (e: React.FormEvent) => {
    e.preventDefault()
    if (!broadcastMsg) return
    toast.success(`Broadcasting to all users: "${broadcastMsg}"`, {
      icon: '📢',
      duration: 5000
    })
    setBroadcastMsg('')
  }

  if (loading) return <div className="spinner" />

  return (
    <div style={{ paddingBottom: 40 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Command Center</h1>
          <p className="page-subtitle">Pusat kendali ekosistem aplikasi FinTrack</p>
        </div>
        <button className="btn btn-ghost" onClick={loadAdminData}>Refresh Stats</button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 30 }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ padding: 12, background: 'rgba(59,130,246,0.1)', borderRadius: 12, color: 'var(--accent)' }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total Users</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.totalUsers}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ padding: 12, background: 'rgba(16,185,129,0.1)', borderRadius: 12, color: 'var(--green)' }}>
            <Landmark size={24} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              AUM (Total Balance)
              <AlertCircle size={12} style={{ cursor: 'help' }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{formatIDR(stats.totalBalance)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>*Bank, E-Wallet, & Cash (IDR)</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: 0.7, border: '1px dashed var(--border)' }}>
          <div style={{ padding: 12, background: 'rgba(245,158,11,0.1)', borderRadius: 12, color: '#f59e0b' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 2 }}>COMING SOON</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total Market Value</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Estimasi Aset Investasi</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ padding: 12, background: 'rgba(139,92,246,0.1)', borderRadius: 12, color: '#8b5cf6' }}>
            <Activity size={24} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Platform Transactions</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.totalTransactions.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
        
        {/* Broadcast Component */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <Megaphone size={18} color="var(--accent)" />
            <h3 style={{ margin: 0, fontSize: 16 }}>Broadcast Message</h3>
          </div>
          <form onSubmit={sendBroadcast}>
            <div className="form-group">
              <label className="form-label">Tulis pesan untuk semua user aktif</label>
              <textarea
                className="form-input"
                rows={3}
                style={{ resize: 'none', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                placeholder="Contoh: Aplikasi akan maintenance jam 12 malam nanti..."
                value={broadcastMsg}
                onChange={e => setBroadcastMsg(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={!broadcastMsg}>
              Kirim Ke Seluruh User (Push Toast)
            </button>
          </form>
        </div>

        {/* API MONITOR */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <Activity size={18} color="var(--accent)" />
            <h3 style={{ margin: 0, fontSize: 16 }}>External API Health</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>CryptoCompare (Crypto)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: stats.apiCrypto === 'active' ? 'var(--green)' : 'var(--red)' }}>
                {stats.apiCrypto === 'active' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{stats.apiCrypto}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Yahoo Finance (Stocks)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: stats.apiStocks === 'active' ? 'var(--green)' : 'var(--red)' }}>
                {stats.apiStocks === 'active' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{stats.apiStocks}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Google Gemini (AI Advisor)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: stats.apiGemini === 'active' ? 'var(--green)' : 'var(--red)' }}>
                {stats.apiGemini === 'active' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{stats.apiGemini}</span>
              </div>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
              Jika status <strong>Error</strong>, kemungkinan API limit tercapai atau service sedang down.
            </p>
          </div>
        </div>
      </div>

      {/* LOGS Section */}
      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Recent Platform Activity</h3>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0', border: '1px dashed var(--border)', borderRadius: 8 }}>
          Audit Logs akan muncul di sini (Fitur selanjutnya)
        </div>
      </div>
    </div>
  )
}
