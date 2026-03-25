'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthContextType = {
  session: Session | null
  user: User | null
  loading: boolean
  isAdmin: boolean
  profile: {
    display_name: string | null
    avatar_url: string | null
    username: string | null
  } | null
}

const AuthContext = createContext<AuthContextType>({ 
  session: null, 
  user: null, 
  loading: true, 
  isAdmin: false,
  profile: null
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profile, setProfile] = useState<AuthContextType['profile']>(null)
  const [loading, setLoading] = useState(true)

  async function fetchUserProfile(u: User | null) {
    if (!u) {
      setIsAdmin(false)
      setProfile(null)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('is_admin, display_name, avatar_url, username')
      .eq('id', u.id)
      .single()
    
    setIsAdmin(!!data?.is_admin)
    setProfile({
      display_name: data?.display_name || null,
      avatar_url: data?.avatar_url || null,
      username: data?.username || null
    })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      const u = session?.user ?? null
      setUser(u)
      fetchUserProfile(u).then(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      const u = session?.user ?? null
      setUser(u)
      fetchUserProfile(u).then(() => setLoading(false))
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, user, loading, isAdmin, profile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
