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
    base_currency: string | null
  } | null
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({ 
  session: null, 
  user: null, 
  loading: true, 
  isAdmin: false,
  profile: null,
  refreshProfile: async () => {}
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
    
    // First attempt with all columns
    let { data, error } = await supabase
      .from('profiles')
      .select('is_admin, display_name, avatar_url, username, base_currency')
      .eq('id', u.id)
      .single()
    
    // Fallback in case base_currency hasn't been added to SQL yet
    if (error) {
      console.warn('Profile fetch failed, trying fallback...', error.message)
      const { data: fallback, error: fallbackError } = await supabase
        .from('profiles')
        .select('is_admin, display_name, avatar_url, username')
        .eq('id', u.id)
        .single()
      
      if (!fallbackError) {
        data = fallback as any
      }
    }

    if (data) {
      setIsAdmin(!!data.is_admin)
      setProfile({
        display_name: data.display_name || null,
        avatar_url: data.avatar_url || null,
        username: data.username || null,
        base_currency: data.base_currency || 'IDR'
      })
    }
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

  const refreshProfile = async () => {
    if (user) await fetchUserProfile(user)
  }

  return (
    <AuthContext.Provider value={{ session, user, loading, isAdmin, profile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
