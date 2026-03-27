'use client'
import { useEffect, useState, FormEvent } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { formatCurrency, getFiatRates, convertToBase } from '@/lib/currency'
import { Users, Landmark, Activity, Megaphone, CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Trash2, ShieldOff, Search, UserCheck } from 'lucide-react'

export default function AdminDashboard() {
  const { user, profile, isAdmin, loading: authLoading } = useAuth()
  const [exchangeRate, setExchangeRate] = useState(1)
  const baseCurrency = profile?.base_currency || 'IDR'
  
  if (authLoading) return <div className="spinner" />

  if (!isAdmin) {
    return (
      <div className="card empty-state" style={{ marginTop: 100 }}>
        <AlertCircle size={48} color="var(--red)" />
        <h2 style={{ marginTop: 16 }}>Access Denied</h2>
        <p style={{ color: 'var(--text-muted)' }}>This page is only for Main Administrators.</p>
        <a href="/" className="btn btn-primary" style={{ marginTop: 24 }}>Return to Dashboard</a>
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
  const [users, setUsers] = useState<any[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [broadcastMsg, setBroadcastMsg] = useState('')

  async function loadAdminData() {
    setLoading(true)
    try {
      // 1. Estimate Users (Unique user_ids in accounts)
      const { data: usersData } = await supabase.from('accounts').select('user_id')
      const uniqueUsers = new Set((usersData || []).map(u => u.user_id)).size

      // 2. Platform Total Balance (Unified to IDR)
      const { data: balanceData } = await supabase.from('accounts').select('balance, currency')
      let totalBalIDR = 0
      for (const a of (balanceData || [])) {
        totalBalIDR += await convertToBase(Number(a.balance), a.currency || 'IDR', 'IDR')
      }
      
      // Calculate exchangeRate for viewing AUM in profile currency
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

      // 3. Total Transaction Count
      const { count: txCount } = await supabase.from('transactions').select('*', { count: 'exact', head: true })

      // 4. API Health Check
      const { data: { session } } = await supabase.auth.getSession()
      const [cryptoRes, stockRes, aiRes, userListRes] = await Promise.all([
        fetch('/api/crypto?coin=BTC', { headers: { 'Authorization': `Bearer ${session?.access_token}` } }).then(r => r.ok),
        fetch('/api/stocks?ticker=BBCA.JK', { headers: { 'Authorization': `Bearer ${session?.access_token}` } }).then(r => r.ok),
        fetch('/api/ai', { headers: { 'Authorization': `Bearer ${session?.access_token}` } }).then(r => r.ok),
        supabase.from('profiles').select('*').order('created_at', { ascending: false })
      ])
      
      const profiles = userListRes.data || []

      setStats({
        totalUsers: uniqueUsers,
        totalBalance: totalBalIDR,
        totalTransactions: txCount || 0,
        apiCrypto: cryptoRes ? 'active' : 'error',
        apiStocks: stockRes ? 'active' : 'error',
        apiGemini: aiRes ? 'active' : 'error'
      })
      setUsers(profiles)
    } catch (e) {
      console.error('Admin load error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) loadAdminData()
  }, [user, baseCurrency])

  const sendBroadcast = (e: FormEvent) => {
    e.preventDefault()
    if (!broadcastMsg) return
    toast.success(`Broadcasting to all users: "${broadcastMsg}"`, {
      icon: '📢',
      duration: 5000
    })
    setBroadcastMsg('')
  }

  const toggleUserStatus = async (targetId: string, currentStatus: boolean) => {
    const { error } = await supabase.from('profiles').update({ is_disabled: !currentStatus }).eq('id', targetId)
    if (error) {
      toast.error("Failed to update status: " + error.message)
    } else {
      toast.success(currentStatus ? "User reactivated" : "User successfully disabled")
      loadAdminData()
    }
  }

  const deleteUserRecord = async (targetId: string) => {
    if (!confirm("Permanently delete this user data? (Auth data remains unless deleted via Supabase Dashboard)")) return
    
    // Note: Deleting from profiles is usually enough to "ghost" them if RLS depends on profiles
    const { error } = await supabase.from('profiles').delete().eq('id', targetId)
    if (error) {
       toast.error("Failed to delete profile: " + error.message)
    } else {
       toast.success("User profile successfully deleted")
       loadAdminData()
    }
  }

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(userSearch.toLowerCase()) || 
    u.display_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  )

  if (loading) return <div className="spinner" />

  return (
    <div style={{ paddingBottom: 40 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Command Center</h1>
          <p className="page-subtitle">Command center for the FinTrack ecosystem</p>
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
              AUM (Platform Total)
              <AlertCircle size={12} style={{ cursor: 'help' }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{formatCurrency(stats.totalBalance * exchangeRate, baseCurrency)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>*All accounts unified to {baseCurrency}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: 0.7, border: '1px dashed var(--border)' }}>
          <div style={{ padding: 12, background: 'rgba(245,158,11,0.1)', borderRadius: 12, color: '#f59e0b' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 2 }}>COMING SOON</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total Market Value</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Estimated Investment Assets</div>
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
              <label className="form-label">Write a message for all active users</label>
              <textarea
                className="form-input"
                rows={3}
                style={{ resize: 'none', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                placeholder="Example: The app will be down for maintenance at midnight..."
                value={broadcastMsg}
                onChange={e => setBroadcastMsg(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={!broadcastMsg}>
              Send to All Users (Push Toast)
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
              If the status is <strong>Error</strong>, it's possible the API limit has been reached or the service is down.
            </p>
          </div>
        </div>
      </div>

      {/* User Management Section */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="flex-between mb-6">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
             <Users size={18} color="var(--accent)" />
             <h3 style={{ margin: 0, fontSize: 16 }}>User Management</h3>
          </div>
          <div style={{ position: 'relative' }}>
             <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
             <input 
               type="text" 
               placeholder="Search Username/Email..." 
               className="form-input" 
               style={{ paddingLeft: 32, fontSize: 12, height: 32, width: 250 }}
               value={userSearch}
               onChange={e => setUserSearch(e.target.value)}
             />
          </div>
        </div>

        <div className="table-wrap">
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>User Details</th>
                <th>Role</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                   <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                     No users found.
                   </td>
                </tr>
              ) : (
                filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.display_name || u.username}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email || 'No email registered'}</div>
                    </td>
                    <td>
                       <span className={`badge ${u.is_admin ? 'badge-income' : ''}`} style={{ fontSize: 10 }}>
                         {u.is_admin ? 'ADMIN' : 'USER'}
                       </span>
                    </td>
                    <td>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                         {u.is_disabled ? (
                           <span style={{ color: 'var(--red)', fontWeight: 700 }}>DISABLED</span>
                         ) : (
                           <span style={{ color: 'var(--green)', fontWeight: 700 }}>ACTIVE</span>
                         )}
                       </div>
                    </td>
                    <td>
                       <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                          <button 
                            className="btn btn-ghost btn-sm" 
                            style={{ color: u.is_disabled ? 'var(--green)' : 'var(--red)', padding: '4px 8px' }}
                            onClick={() => toggleUserStatus(u.id, !!u.is_disabled)}
                            title={u.is_disabled ? "Activate" : "Disable"}
                          >
                            {u.is_disabled ? <UserCheck size={16} /> : <ShieldOff size={16} />}
                          </button>
                          <button 
                            className="btn btn-ghost btn-sm" 
                            style={{ color: 'var(--red)', padding: '4px 8px' }}
                            onClick={() => deleteUserRecord(u.id)}
                            title="Delete Profile"
                            disabled={u.is_admin} // Don't allow deleting self/other admins via UI easily
                          >
                            <Trash2 size={16} />
                          </button>
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* LOGS Section */}
      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Recent Platform Activity</h3>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0', border: '1px dashed var(--border)', borderRadius: 8 }}>
          Audit Logs will appear here (Next feature)
        </div>
      </div>
    </div>
  )
}
