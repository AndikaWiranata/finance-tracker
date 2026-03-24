'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthContextType = {
  session: Session | null
  user: User | null
  loading: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType>({ session: null, user: null, loading: true, isAdmin: false })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  async function checkAdminStatus(u: User | null) {
    if (!u) {
      setIsAdmin(false)
      return
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', u.id)
      .single()
    
    setIsAdmin(!!profile?.is_admin)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      const u = session?.user ?? null
      setUser(u)
      checkAdminStatus(u).then(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      const u = session?.user ?? null
      setUser(u)
      checkAdminStatus(u).then(() => setLoading(false))
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, user, loading, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
