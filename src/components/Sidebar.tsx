'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Wallet, ArrowLeftRight, TrendingUp, Bitcoin, Menu, LogOut, CandlestickChart, Sparkles, ShieldCheck } from 'lucide-react'
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
  { href: '/ai', label: 'AI Advisor', icon: Sparkles },
  { href: '/admin', label: 'Admin Panel', icon: ShieldCheck, adminOnly: true },
]

export default function Sidebar() {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
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
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {user?.email?.split('@')[0]}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            {user?.email}
          </div>
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
