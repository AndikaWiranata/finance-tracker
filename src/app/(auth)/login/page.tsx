'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Mail, Lock, Smartphone, LogIn, ChevronRight, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import styles from './login.module.css'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
        toast.error(error.message)
      }
      else toast.success('Check your email for the confirmation link!', { duration: 5000 })
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        toast.error(error.message)
      }
      else {
        toast.success('Logged in successfully!')
        router.push('/')
      }
    }
    setLoading(false)
  }

  return (
    <div className={styles.container}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <div className={styles.panel}>
        <div className={styles.logoBox}>
          <LogIn size={28} strokeWidth={2.5} />
        </div>
        
        <h2 className={styles.title}>FinTrack Pro</h2>
        <div className={styles.subtitle}>
          {mode === 'login' ? 'Securely access your wealth dashboard' : 'Create an account to track your assets'}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleEmailAuth}>
          <div className={styles.formGroup}>
            <div className={styles.inputIcon}><Mail size={18} /></div>
            <input
              type="email"
              required
              className={styles.input}
              placeholder="Email Address"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          
          <div className={styles.formGroup}>
            <div className={styles.inputIcon}><Lock size={18} /></div>
            <input
              type="password"
              required
              className={styles.input}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" disabled={loading} className={styles.btnPrimary}>
            {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            {!loading && <ChevronRight size={18} />}
          </button>
        </form>




      </div>

      <div className={styles.footer}>
        {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
        <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Sign up' : 'Sign in'}
        </button>
      </div>
    </div>
  )
}
