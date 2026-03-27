'use client'
import { useState, useEffect, FormEvent } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { User, Mail, Shield, Save, Loader2, Camera } from 'lucide-react'
import { toast } from 'react-hot-toast'

export default function ProfilePage() {
  const { user, isAdmin, refreshProfile, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [profile, setProfile] = useState({
    username: '',
    display_name: '',
    avatar_url: '',
    username_last_changed: null as string | null,
    base_currency: 'IDR',
  })

  useEffect(() => {
    if (user) {
      loadProfile()
    }
  }, [user])

  async function loadProfile() {
    try {
      setLoading(true)
      
      // Attempt with all columns
      let { data, error } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, username_last_changed, base_currency')
        .eq('id', user?.id)
        .single()

      // Fallback
      if (error && error.code !== 'PGRST116') {
         const { data: fallback, error: fallbackError } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url, username_last_changed')
            .eq('id', user?.id)
            .single()
         
         if (!fallbackError) {
            data = fallback as any
         } else {
            throw error
         }
      }

      if (data) {
        setProfile({
          username: data.username || '',
          display_name: data.display_name || '',
          avatar_url: data.avatar_url || '',
          username_last_changed: data.username_last_changed,
          base_currency: data.base_currency || 'IDR',
        })
      }
    } catch (error) {
      console.error('Error loading profile:', error)
      toast.error('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const canChangeUsername = () => {
    if (isAdmin) return true // Admins can change anytime
    if (!profile.username_last_changed) return true
    const last = new Date(profile.username_last_changed)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays >= 30
  }

  const daysUntilNextChange = () => {
    if (isAdmin) return 0
    if (!profile.username_last_changed) return 0
    const last = new Date(profile.username_last_changed)
    const nextPossible = new Date(last.getTime() + 30 * 24 * 60 * 60 * 1000)
    const now = new Date()
    const diff = Math.ceil((nextPossible.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diff > 0 ? diff : 0
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      if (!e.target.files || e.target.files.length === 0 || !user) return
      setUploadingAvatar(true)

      const file = e.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random()}.${fileExt}`
      const filePath = `${user.id}/${fileName}` // Menggunakan folder user ID

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file)

      if (uploadError) {
        console.error('Storage Upload Error Detail:', uploadError)
        throw new Error(`Storage upload failed: ${uploadError.message}`)
      }

      // Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Update profiles table immediately
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, avatar_url: publicUrl, updated_at: new Date().toISOString() })

      if (updateError) throw updateError

      setProfile({ ...profile, avatar_url: publicUrl })
      toast.success('Profile photo updated!')
    } catch (error: any) {
      console.error('Error uploading avatar:', error)
      toast.error(error.message || 'Failed to upload photo')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleUpdate(e: FormEvent) {
    e.preventDefault()
    if (!user) return

    try {
      setUpdating(true)

      const updateData: any = {
        id: user.id,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        base_currency: profile.base_currency,
        updated_at: new Date().toISOString(),
      }

      const { data: current } = await supabase.from('profiles').select('username').eq('id', user.id).single()

      if (profile.username !== current?.username) {
        if (/\s/.test(profile.username)) {
          throw new Error('Username cannot contain spaces.')
        }
        if (!canChangeUsername()) {
          throw new Error(`Username can only be changed once every 30 days. You must wait ${daysUntilNextChange()} more days.`)
        }
        updateData.username = profile.username
        updateData.username_last_changed = new Date().toISOString()
      }

      const { error } = await supabase.from('profiles').upsert(updateData)

      if (error) {
        if (error.code === '23505') throw new Error('Username already taken.')
        throw error
      }

      toast.success('Profile updated successfully!')
      await refreshProfile()
      loadProfile()
    } catch (error: any) {
      console.error('Error updating profile:', error)
      toast.error(error.message || 'Failed to update profile')
    } finally {
      setUpdating(false)
    }
  }

  if (authLoading || loading) return <div className="spinner" />

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 40 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">Manage your personal information and account settings</p>
        </div>
      </div>

      <div className="grid-2">
        {/* Info Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <div style={{
              width: 110,
              height: 110,
              borderRadius: '50%',
              background: 'var(--bg-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '3px solid var(--border)',
              overflow: 'hidden',
              boxShadow: '0 8px 16px rgba(0,0,0,0.2)'
            }}>
              {uploadingAvatar ? (
                <Loader2 size={32} className="spinner" style={{ margin: 0 }} />
              ) : profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-muted)' }}>
                  {profile.username?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
            </div>

            <label className="btn-sm btn-ghost" style={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              borderRadius: '50%',
              width: 36,
              height: 36,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 12px var(--accent-glow)'
            }}>
              <Camera size={18} />
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarUpload}
                disabled={uploadingAvatar}
              />
            </label>
          </div>

          <h2 style={{ fontSize: 20, marginBottom: 4 }}>{profile.display_name || profile.username || 'No Name'}</h2>
          <p style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>@{profile.username}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>{user?.email}</p>

          {isAdmin && (
            <div className="badge" style={{ background: 'rgba(108, 99, 255, 0.1)', color: 'var(--accent)', border: '1px solid var(--accent-glow)', marginBottom: 10 }}>
              <Shield size={12} style={{ marginRight: 6 }} /> Administrator
            </div>
          )}

          <div className="divider" style={{ width: '100%' }} />

          <div style={{ width: '100%', textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Account Status</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
              <span style={{ fontSize: 13 }}>Email Verified</span>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div className="card">
          <h3 className="section-title">Edit Profile</h3>
          <form onSubmit={handleUpdate}>

            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Your name that appears publicly"
                value={profile.display_name}
                onChange={e => setProfile({ ...profile, display_name: e.target.value })}
              />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Optional. Can be changed anytime.</p>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Username (@)
                {isAdmin ? (
                  <span style={{ color: 'var(--accent)', fontSize: 10 }}>Admin Privilege</span>
                ) : !canChangeUsername() ? (
                  <span style={{ color: 'var(--red)', fontSize: 10 }}>Locked for {daysUntilNextChange()} more days</span>
                ) : null}
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700 }}>@</span>
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: 30 }}
                  placeholder="your_username"
                  value={profile.username}
                  onChange={e => setProfile({ ...profile, username: e.target.value })}
                  disabled={!isAdmin && !canChangeUsername()}
                />
              </div>
              {/\s/.test(profile.username || '') && (
                <div style={{ color: 'var(--red)', fontSize: '12px', marginTop: '8px', fontWeight: 600 }}>
                  ⚠️ Username cannot contain spaces
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                Important: Username can only be changed once every 30 days.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Email (Read-only)</label>
              <input
                type="email"
                className="form-input"
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
                value={user?.email || ''}
                readOnly
              />
            </div>

            <div className="form-group">
              <label className="form-label">Base Currency</label>
              <select 
                className="form-select"
                value={profile.base_currency}
                onChange={e => setProfile({ ...profile, base_currency: e.target.value })}
              >
                <option value="IDR">IDR (Rp)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="JPY">JPY (¥)</option>
                <option value="SGD">SGD (S$)</option>
              </select>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>All dashboard balances will be converted to this currency.</p>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 20, justifyContent: 'center' }} disabled={updating}>
              {updating ? (
                <>
                  <Loader2 size={18} className="spinner" style={{ margin: 0, width: 18, height: 18 }} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Save Changes
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24, border: '1px solid var(--red)', background: 'rgba(239, 68, 68, 0.05)' }}>
        <h3 className="section-title" style={{ color: 'var(--red)' }}>Danger Zone</h3>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Deleting your account will permanently remove all your transaction data.
        </p>
        <button className="btn btn-danger">Delete Account & Data</button>
      </div>
    </div>
  )
}
