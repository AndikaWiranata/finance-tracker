'use client'
import { useState, FormEvent, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Mail, Lock, Smartphone, LogIn, ChevronRight, Zap, User, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/components/AuthProvider'
import styles from './login.module.css'

export default function LoginPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [emailOrUsername, setEmailOrUsername] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')

  // Redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      router.push('/')
    }
  }, [user, authLoading, router])

  async function handleEmailAuth(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      if (mode === 'signup') {
        if (/\s/.test(username)) {
          throw new Error('Username tidak boleh mengandung spasi.')
        }

        const { data, error: signUpError } = await supabase.auth.signUp({ 
          email: emailOrUsername, 
          password,
          options: {
            data: { username }
          }
        })
        if (signUpError) throw signUpError

        // Create profile entry
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            username: username,
            display_name: username,
          })
        }
        
        toast.success('Check your email for the confirmation link!', { duration: 5000 })
      } else if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailOrUsername, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (resetError) throw resetError
        toast.success('Link reset password sudah dikirim ke email kamu!')
        setMode('login')
      } else {
        let finalEmail = emailOrUsername

        // Jika bukan email (tidak ada @), lookup email via RPC by username
        if (!emailOrUsername.includes('@')) {
          const { data: email, error: rpcError } = await supabase
            .rpc('get_email_by_username', { p_username: emailOrUsername })
          
          if (rpcError || !email) {
            throw new Error('Username tidak ditemukan')
          }
          finalEmail = email
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({ 
          email: finalEmail, 
          password 
        })
        if (signInError) throw signInError
        
        toast.success('Logged in successfully!')
        router.push('/')
      }
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
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
          {mode === 'signup' && (
            <div className={styles.formGroup}>
              <div className={styles.inputIcon}><User size={18} /></div>
              <input
                type="text"
                required
                className={styles.input}
                placeholder="Username"
                value={username}
                onChange={e => {
                  const val = e.target.value
                  setUsername(val)
                }}
                autoComplete="username"
              />
              {/\s/.test(username) && (
                <div style={{ 
                  color: '#f87171', 
                  fontSize: '12px', 
                  marginTop: '6px', 
                  marginLeft: '44px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <AlertCircle size={12} /> Username tidak boleh ada spasi
                </div>
              )}
            </div>
          )}

          <div className={styles.formGroup}>
            <div className={styles.inputIcon}><Mail size={18} /></div>
            <input
              type="text"
              required
              className={styles.input}
              placeholder={mode === 'login' ? "Email or Username" : "Email Address"}
              value={emailOrUsername}
              onChange={e => setEmailOrUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          
          {mode !== 'forgot' && (
            <div className={styles.formGroup}>
              <div className={styles.inputIcon}><Lock size={18} /></div>
              <input
                type="password"
                required
                className={styles.input}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? "new-password" : "current-password"}
              />
            </div>
          )}

          <button type="submit" disabled={loading} className={styles.btnPrimary}>
            {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset My Password'}
            {!loading && <ChevronRight size={18} />}
          </button>
        </form>
      </div>

      <div className={styles.footer} style={{ gap: 12, flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
        
        {mode === 'login' && (
          <button className="text-secondary" style={{ fontSize: 13, textDecoration: 'underline' }} onClick={() => setMode('forgot')}>
            Lupa Password?
          </button>
        )}
        
        {mode === 'forgot' && (
           <button className="text-secondary" style={{ fontSize: 13, textDecoration: 'underline' }} onClick={() => setMode('login')}>
            Kembali ke login
          </button>
        )}
      </div>
    </div>
  )
}
