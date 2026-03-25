'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Wallet, ArrowLeftRight, TrendingUp, Bitcoin, Menu, LogOut, CandlestickChart, Sparkles, ShieldCheck, User, Landmark, Target, PieChart } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/stocks', label: 'Saham', icon: TrendingUp },
  { href: '/crypto', label: 'Crypto', icon: Bitcoin },
  { href: '/forex', label: 'Forex', icon: CandlestickChart },
  { href: '/debts', label: 'Hutang & Piutang', icon: Landmark },
  { href: '/goals', label: 'Target Masa Depan', icon: Target },
  { href: '/budgets', label: 'Anggaran Bulanan', icon: PieChart },
  { href: '/ai', label: 'AI Advisor', icon: Sparkles },
  { href: '/admin', label: 'Admin Panel', icon: ShieldCheck, adminOnly: true },
]

export default function Sidebar() {
  const router = useRouter()
  const { user, isAdmin, profile } = useAuth()
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Auto-close when route changes
  useEffect(() => setIsOpen(false), [pathname])

  return (
    <>
      <button
        className="mobile-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Menu"
      >
        <Menu size={20} />
      </button>

      {isOpen && (
        <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-icon">💰</div>
          <div>
            <span>FinTrack</span>
            <small>Asset Tracker</small>
          </div>
        </div>

        <div className="nav-section">Menu</div>
        <nav className="sidebar-nav">
          {navItems
            .filter(item => !item.adminOnly || isAdmin)
            .map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`nav-item ${pathname === href ? 'active' : ''}`}
              >
                <Icon size={17} />
                {label}
              </Link>
            ))}
        </nav>

        <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid var(--border)' }}>
          <Link
            href="/profile"
            className={`nav-item ${pathname === '/profile' ? 'active' : ''}`}
            style={{
              marginBottom: 12,
              padding: '12px',
              height: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: pathname === '/profile' ? 'var(--accent-glow)' : 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: pathname === '/profile' ? '1px solid var(--accent)' : '1px solid var(--border)'
            }}
          >
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.1)'
            }}>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                profile?.display_name?.[0]?.toUpperCase() || profile?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'
              )}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', lineHeight: 1.2 }}>
                {profile?.display_name || profile?.username || user?.email?.split('@')[0]}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', opacity: 0.7 }}>
                {profile?.username ? `@${profile.username}` : user?.email}
              </div>
            </div>
          </Link>

          <button
            onClick={handleLogout}
            className="nav-item"
            style={{ width: '100%', border: 'none', background: 'rgba(239,68,68,0.1)', color: 'var(--red)', cursor: 'pointer', justifyContent: 'center', fontWeight: 600 }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>
    </>
  )
}
