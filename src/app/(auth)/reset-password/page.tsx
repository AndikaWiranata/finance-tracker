'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Lock, Eye, EyeOff, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import styles from '../login/login.module.css'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // Ensure user is actually in a reset session
  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'PASSWORD_RECOVERY') {
         // Optionally redirect to login if not in recovery mode
         // but we'll let them try if they have the session
      }
    })
  }, [])

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Password successfully updated!')
      setIsSuccess(true)
      setTimeout(() => {
        router.push('/login')
      }, 3000)
    }
    setLoading(false)
  }

  if (isSuccess) {
    return (
      <div className={styles.container}>
        <div className={styles.bgOrb1} />
        <div className={styles.panel} style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ color: 'var(--green)', marginBottom: 20 }}>
            <CheckCircle2 size={64} />
          </div>
          <h2 className={styles.title}>Password Updated!</h2>
          <p className={styles.subtitle}>
            Your password has been changed successfully. You will be redirected to the login page in a few seconds...
          </p>
          <button onClick={() => router.push('/login')} className={styles.btnPrimary} style={{ marginTop: 24 }}>
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <div className={styles.panel}>
        <div className={styles.logoBox}>
          <Lock size={28} strokeWidth={2.5} />
        </div>
        
        <h2 className={styles.title}>New Password</h2>
        <div className={styles.subtitle}>
          Create a new strong password for your account
        </div>

        <form onSubmit={handleReset}>
          <div className={styles.formGroup}>
            <div className={styles.inputIcon}><Lock size={18} /></div>
            <input
              type={showPassword ? "text" : "password"}
              required
              className={styles.input}
              placeholder="New Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
             <button 
              type="button" 
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div className={styles.formGroup}>
            <div className={styles.inputIcon}><Lock size={18} /></div>
            <input
              type={showPassword ? "text" : "password"}
              required
              className={styles.input}
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </div>

          <button type="submit" disabled={loading} className={styles.btnPrimary}>
            {loading ? <Loader2 className="animate-spin" size={18} /> : 'Update Password'}
          </button>
        </form>
      </div>

      <div className={styles.footer}>
        Remembered your password? 
        <button onClick={() => router.push('/login')}>Sign in</button>
      </div>
    </div>
  )
}
