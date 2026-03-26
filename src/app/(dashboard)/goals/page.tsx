'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { formatNumberInput, parseNumberInput } from '@/lib/currency'
import { Account } from '@/types'
import { Plus, X, Target, TrendingUp, Calendar, Trash2, DollarSign, CheckCircle, AlertCircle, Rocket, PartyPopper } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { getLocalDateISO } from '@/lib/date'

function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

function calculateDaysRemaining(date: string) {
  if (!date) return null
  const target = new Date(date)
  const today = new Date()
  const diffTime = target.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
}

const LIQUID_TYPES = ['bank', 'cash', 'ewallet']

export default function GoalsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [goals, setGoals] = useState<any[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSavingModal, setShowSavingModal] = useState(false)
  const [selectedGoal, setSelectedGoal] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    target_amount: '',
    category: 'Savings',
    target_date: '',
  })

  const [saveForm, setSaveForm] = useState({
    amount: '',
    account_id: '',
    target_account_id: '', // New field for Double Sync
    note: '',
    sync_to_ledger: false
  })

  async function loadData() {
    if (!user) return
    setLoading(true)
    const [{ data: goalsData }, { data: accs }] = await Promise.all([
      supabase.from('financial_goals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('accounts').select('*').eq('user_id', user.id)
    ])
    setGoals(goalsData ?? [])
    setAccounts(accs ?? [])
    if (accs && accs.length > 0) setSaveForm(f => ({ ...f, account_id: String(accs[0].id) }))
    setLoading(false)
  }

  useEffect(() => { loadData() }, [user])

  async function handleAddGoal(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    const amount = parseFloat(parseNumberInput(form.target_amount)) || 0
    if (amount <= 0) return toast.error('Target harus lebih dari 0')

    setSaving(true)
    const { error } = await supabase.from('financial_goals').insert({
      user_id: user.id,
      name: form.name,
      target_amount: amount,
      current_amount: 0,
      category: form.category,
      target_date: form.target_date || null,
      status: 'active'
    })

    if (!error) {
      toast.success('Target berhasil dibuat! Semangat menabung! 🚀')
      setShowAddModal(false)
      loadData()
      setForm({ name: '', target_amount: '', category: 'Savings', target_date: '' })
    }
    setSaving(false)
  }

  async function handleContribute(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !selectedGoal) return
    const amount = parseFloat(parseNumberInput(saveForm.amount)) || 0
    if (amount <= 0) return toast.error('Jumlah menabung harus lebih dari 0')

    setSaving(true)

    // 1. Log Contribution
    const { error: cError } = await supabase.from('goal_contributions').insert({
      goal_id: selectedGoal.id,
      amount,
      account_id: saveForm.account_id ? parseInt(saveForm.account_id) : null,
      note: saveForm.note || null
    })

    if (cError) {
      toast.error(cError.message)
      setSaving(false)
      return
    }

    // 2. Update Goal Current Amount
    const newCurrent = Number(selectedGoal.current_amount) + amount
    const isAchieved = newCurrent >= selectedGoal.target_amount

    await supabase.from('financial_goals').update({
      current_amount: newCurrent,
      status: isAchieved ? 'achieved' : 'active'
    }).eq('id', selectedGoal.id)

    // 3. Sync to Ledger (Optional - Double Sync)
    if (saveForm.sync_to_ledger && saveForm.account_id && saveForm.target_account_id) {
      const today = getLocalDateISO()
      const { error: tError } = await supabase.rpc('transfer_funds', {
        from_acc_id: parseInt(saveForm.account_id),
        to_acc_id: parseInt(saveForm.target_account_id),
        user_id_val: user.id,
        amount_val: amount,
        note_val: `: Menabung [${selectedGoal.name}]`,
        date_val: today
      })
      if (tError) {
        toast.error("Gagal melakukan transfer saldo: " + tError.message)
      } else {
        toast.success("Saldo berhasil dipindahkan ke tabungan! 🏦")
      }
    }

    if (isAchieved) {
      toast.success(`HOREEE! Target "${selectedGoal.name}" telah tercapai! 🥳✨`, { duration: 5000 })
    } else {
      toast.success(`Berhasil! Sisa ${formatIDR(selectedGoal.target_amount - newCurrent)} lagi.`)
    }

    setShowSavingModal(false)
    loadData()
    setSaving(false)
  }

  async function deleteGoal(id: string) {
    const { error } = await supabase.from('financial_goals').delete().eq('id', id)
    if (!error) {
      toast.success('Target dihapus')
      loadData()
    }
  }

  if (loading) return <div className="spinner" />

  const totalTarget = goals.reduce((a, b) => a + Number(b.target_amount), 0)
  const totalSaved = goals.reduce((a, b) => a + Number(b.current_amount), 0)

  return (
    <div className="animate-in flex flex-col" style={{ gap: '40px', paddingTop: '10px' }}>
      <div className="flex-between">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 800 }}>Target Masa Depan</h1>
          <p style={{ color: 'var(--text-muted)' }}>Wujudkan impianmu dengan menabung rutin</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={20} /> Buat Target Baru
        </button>
      </div>

      <div className="grid-3">
        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Total Impian</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{formatIDR(totalTarget)}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Total Terkumpul</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>{formatIDR(totalSaved)}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Sisa Kekurangan</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)' }}>{formatIDR(Math.max(0, totalTarget - totalSaved))}</div>
        </div>
      </div>

      <div className="grid-2">
        {goals.length === 0 ? (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '80px 0' }}>
            <Rocket size={48} color="var(--text-muted)" style={{ opacity: 0.2, margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-muted)' }}>Belum ada target impian. Yuk buat sekarang!</p>
          </div>
        ) : (
          goals.map(goal => {
            const percent = Math.min(100, Math.floor((Number(goal.current_amount) / Number(goal.target_amount)) * 100))
            const daysLeft = calculateDaysRemaining(goal.target_date)
            const isAchieved = goal.status === 'achieved'

            return (
              <div key={goal.id} className="card" style={{
                border: isAchieved ? '1px solid var(--green)' : '1px solid var(--border)',
                background: isAchieved ? 'rgba(34,197,94,0.03)' : 'var(--card-bg)'
              }}>
                <div className="flex-between mb-4">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: isAchieved ? 'var(--green)' : 'var(--accent)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {isAchieved ? <PartyPopper size={24} /> : <Target size={24} />}
                    </div>
                    <div>
                      <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{goal.name}</h3>
                      <span className="badge" style={{ fontSize: 10 }}>{goal.category}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!isAchieved && (
                      <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedGoal(goal); setShowSavingModal(true); }}>Menabung</button>
                    )}
                    <button className="btn-icon" onClick={() => deleteGoal(goal.id)} style={{ color: 'var(--red)', opacity: 0.5 }}><Trash2 size={16} /></button>
                  </div>
                </div>

                <div className="flex-between mb-2">
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{percent}% Tercapai</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {formatIDR(goal.current_amount)} / {formatIDR(goal.target_amount)}
                  </span>
                </div>

                <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 5, marginBottom: 16 }}>
                  <div style={{
                    width: `${percent}%`, height: '100%',
                    background: isAchieved ? 'var(--green)' : 'linear-gradient(90deg, var(--accent) 0%, #a855f7 100%)',
                    borderRadius: 5, transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                  }} />
                </div>

                <div className="flex-between">
                  {goal.target_date ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={14} />
                      {isAchieved ? 'Tercapai pada waktunya!' : `${daysLeft} hari lagi (${goal.target_date})`}
                    </div>
                  ) : <div></div>}
                  {isAchieved && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: 12, fontWeight: 700 }}>
                      <CheckCircle size={14} /> ACHIEVED
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal Add Goal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-in" style={{ maxWidth: 500 }}>
            <div className="flex-between mb-6">
              <h2 style={{ fontSize: 24, fontWeight: 800 }}>Target Baru 🎯</h2>
              <button className="btn-icon" onClick={() => setShowAddModal(false)}><X /></button>
            </div>
            <form onSubmit={handleAddGoal}>
              <div className="form-group">
                <label className="form-label">Nama Impian</label>
                <input type="text" className="form-input" required placeholder="Misal: iPhone 16 Pro, Nikah, Haji..." value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Target Dana (Rp)</label>
                  <input type="text" className="form-input" required value={form.target_amount} onChange={e => setForm({ ...form, target_amount: formatNumberInput(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Kategori</label>
                  <select className="form-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    <option value="Savings">Savings</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Travel">Travel</option>
                    <option value="Investment">Investment</option>
                    <option value="Emergency Fund">Emergency Fund</option>
                    <option value="Hobby">Hobby</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Target Tanggal Tercapai (Opsional)</label>
                <input type="date" className="form-input" value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} />
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={saving}>
                {saving ? 'Sedang Memproses...' : 'Mulai Menabung'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Contribution */}
      {showSavingModal && selectedGoal && (
        <div className="modal-overlay">
          <div className="modal-content animate-in" style={{ maxWidth: 450 }}>
            <div className="flex-between mb-4">
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Isi Tabungan Impian 💰</h2>
              <button className="btn-icon" onClick={() => setShowSavingModal(false)}><X /></button>
            </div>
            <div className="card-sm mb-6" style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Menabung untuk:</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedGoal.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Kurang {formatIDR(Number(selectedGoal.target_amount) - Number(selectedGoal.current_amount))} lagi!
              </div>
            </div>

            <form onSubmit={handleContribute}>
              <div className="form-group">
                <label className="form-label">Jumlah Tabungan (Rp)</label>
                <input type="text" className="form-input" required autoFocus value={saveForm.amount} onChange={e => setSaveForm({ ...saveForm, amount: formatNumberInput(e.target.value) })} />
              </div>

              <div className="form-group">
                <label className="form-label">Sumber Dana (Dari Mana?)</label>
                <select className="form-input" value={saveForm.account_id} onChange={e => setSaveForm({ ...saveForm, account_id: e.target.value })}>
                  <option value="">Pilih Akun Sumber</option>
                  {accounts.filter(a => LIQUID_TYPES.includes(a.type)).map(a => <option key={a.id} value={a.id}>{a.name} ({formatIDR(Number(a.balance))})</option>)}
                </select>
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="sync" checked={saveForm.sync_to_ledger} onChange={e => setSaveForm({ ...saveForm, sync_to_ledger: e.target.checked })} />
                <label htmlFor="sync" style={{ fontSize: 13, userSelect: 'none', fontWeight: 700, color: 'var(--accent)' }}>Aktifkan Double Sync? 🔄</label>
              </div>

              {saveForm.sync_to_ledger && (
                <div className="animate-in" style={{ padding: '12px', background: 'rgba(168,85,247,0.05)', borderRadius: 12, border: '1px solid rgba(168,85,247,0.2)', marginBottom: 16 }}>
                  <label className="form-label" style={{ color: 'var(--accent)' }}>Pindahkan ke Akun Tabungan:</label>
                  <select className="form-input" value={saveForm.target_account_id} onChange={e => setSaveForm({ ...saveForm, target_account_id: e.target.value })} required={saveForm.sync_to_ledger}>
                    <option value="">Pilih Akun Tujuan (Tabungan)</option>
                    {accounts.filter(a => LIQUID_TYPES.includes(a.type)).map(a => <option key={a.id} value={a.id}>{a.name} ({formatIDR(Number(a.balance))})</option>)}
                  </select>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
                    *Saldo akan otomatis dipindahkan antar akun dan dicatat di riwayat transaksi.
                  </p>
                </div>
              )}

              {!saveForm.sync_to_ledger && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, fontStyle: 'italic' }}>
                  *Hanya mencatat progress di aplikasi (tidak memotong saldo asli).
                </p>
              )}

              <button type="submit" className="btn btn-primary w-full" disabled={saving}>
                {saving ? 'Memproses...' : 'Konfirmasi Menabung'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
