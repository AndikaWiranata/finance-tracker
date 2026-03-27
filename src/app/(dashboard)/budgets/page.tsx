'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { formatNumberInput, parseNumberInput } from '@/lib/currency'
import CurrencyInput from '@/components/CurrencyInput'
import { Plus, X, PieChart, AlertTriangle, CheckCircle, TrendingDown, Wallet, ArrowRight } from 'lucide-react'
import { toast } from 'react-hot-toast'

function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

const CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 
  'Health', 'Education'
]

export default function BudgetsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [budgets, setBudgets] = useState<any[]>([])
  const [spending, setSpending] = useState<Record<string, number>>({})
  const [userCategories, setUserCategories] = useState<{name: string}[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [customCategory, setCustomCategory] = useState('')

  const [form, setForm] = useState({
    category: CATEGORIES[0],
    amount: '',
  })

  async function loadData() {
    if (!user) return
    setLoading(true)

    // 1. Get current month range
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

    // 2. Fetch Budgets, Transactions & Custom Categories concurrently
    const [{ data: budgetData }, { data: txnData }, { data: userCats }] = await Promise.all([
      supabase.from('budgets').select('*').eq('user_id', user.id),
      supabase.from('transactions')
        .select('amount, category')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .gte('date', startOfMonth.split('T')[0])
        .lte('date', endOfMonth.split('T')[0]),
      supabase.from('user_categories').select('name').eq('user_id', user.id).eq('type', 'expense')
    ])
    
    // 3. Aggregate spending by category
    const spendingMap: Record<string, number> = {}
    txnData?.forEach(t => {
      spendingMap[t.category] = (spendingMap[t.category] || 0) + Number(t.amount)
    })

    setBudgets(budgetData ?? [])
    setSpending(spendingMap)
    setUserCategories(userCats ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [user])

  async function handleSetBudget(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    const amount = parseFloat(parseNumberInput(form.amount)) || 0
    if (amount <= 0) return toast.error('Budget harus lebih dari 0')

    setSaving(true)

    let finalCategory = form.category
    if (form.category === 'Other') {
       if (!customCategory.trim()) {
          setSaving(false)
          return toast.error('Kategori harus diisi')
       }
       finalCategory = customCategory.trim()
       // Auto-save to user_categories (expense by default for budgets)
       await supabase.from('user_categories').upsert({
          user_id: user.id,
          name: finalCategory,
          type: 'expense'
       }, { onConflict: 'user_id, name, type' })
    }

    const { error } = await supabase.from('budgets').upsert({
      user_id: user.id,
      category: finalCategory,
      amount,
      period: 'monthly'
    }, { onConflict: 'user_id, category, period' })

    if (!error) {
      toast.success(`Anggaran ${finalCategory} berhasil diatur!`)
      setShowAddModal(false)
      loadData()
      setForm({ ...form, amount: '' })
      setCustomCategory('')
    } else {
      toast.error(error.message)
    }
    setSaving(false)
  }

  async function deleteBudget(id: string) {
    const { error } = await supabase.from('budgets').delete().eq('id', id)
    if (!error) {
       toast.success('Anggaran dihapus')
       loadData()
    }
  }

  if (loading) return <div className="spinner" />

  const totalBudget = budgets.reduce((a, b) => a + Number(b.amount), 0)
  const totalSpentInBudgeted = budgets.reduce((a, b) => a + (spending[b.category] || 0), 0)

  return (
    <div className="animate-in flex flex-col" style={{ gap: '32px' }}>
      <div className="flex-between">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 800 }}>Anggaran Bulanan</h1>
          <p style={{ color: 'var(--text-muted)' }}>Kendalikan pengeluaranmu agar tidak jebol</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={20} /> Atur Anggaran Baru
        </button>
      </div>

      <div className="grid-3">
         <div className="card shadow-sm" style={{ borderLeft: '4px solid var(--accent)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Total Anggaran</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{formatIDR(totalBudget)}</div>
         </div>
         <div className="card shadow-sm" style={{ borderLeft: '4px solid var(--orange)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Terpakai</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{formatIDR(totalSpentInBudgeted)}</div>
         </div>
         <div className="card shadow-sm" style={{ borderLeft: '4px solid var(--green)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Sisa Anggaran</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: totalBudget - totalSpentInBudgeted < 0 ? 'var(--red)' : 'var(--green)' }}>
                {formatIDR(Math.max(0, totalBudget - totalSpentInBudgeted))}
            </div>
         </div>
      </div>

      <div className="flex flex-col" style={{ gap: '16px' }}>
         <h2 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingDown size={20} color="var(--accent)" /> Detail Anggaran per Kategori
         </h2>

         {budgets.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '60px 0', background: 'rgba(255,255,255,0.02)' }}>
               <PieChart size={48} color="var(--text-muted)" style={{ opacity: 0.2, margin: '0 auto 16px' }} />
               <p style={{ color: 'var(--text-muted)' }}>Belum ada anggaran yang diatur.</p>
            </div>
         ) : (
            <div className="grid-2">
               {budgets.map(b => {
                  const spent = spending[b.category] || 0
                  const percent = Math.min(110, Math.floor((spent / Number(b.amount)) * 100))
                  const isOver = spent > Number(b.amount)
                  const isWarning = percent > 80 && !isOver

                  return (
                     <div key={b.id} className="card" style={{ 
                        border: isOver ? '1px solid var(--red)' : isWarning ? '1px solid var(--yellow)' : '1px solid var(--border)'
                     }}>
                        <div className="flex-between mb-4">
                           <div style={{ fontWeight: 700, fontSize: 16 }}>{b.category}</div>
                           <button className="btn-icon" style={{ opacity: 0.5 }} onClick={() => deleteBudget(b.id)}><X size={16} /></button>
                        </div>

                        <div className="flex-between mb-2">
                           <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Terpakai: <b>{formatIDR(spent)}</b></span>
                           <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Limit: <b>{formatIDR(b.amount)}</b></span>
                        </div>

                        <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 12 }}>
                           <div style={{ 
                              width: `${Math.min(100, percent)}%`, height: '100%', 
                              background: isOver ? 'var(--red)' : isWarning ? 'var(--yellow)' : 'var(--green)',
                              borderRadius: 4, transition: 'width 0.5s ease-out'
                           }} />
                        </div>

                        <div className="flex-between">
                           <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: isOver ? 'var(--red)' : isWarning ? 'var(--yellow)' : 'var(--text-muted)' }}>
                              {isOver ? <AlertTriangle size={14} /> : isWarning ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                              {isOver ? `Over Budget ${formatIDR(spent - b.amount)}` : `${100 - percent}% Tersisa`}
                           </div>
                           <div style={{ fontSize: 14, fontWeight: 800 }}>{percent}%</div>
                        </div>
                     </div>
                  )
               })}
            </div>
         )}
      </div>

      {/* Modal Add Budget */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-in" style={{ maxWidth: 450 }}>
            <div className="flex-between mb-6">
              <h2 style={{ fontSize: 24, fontWeight: 800 }}>Atur Anggaran 📊</h2>
              <button className="btn-icon" onClick={() => setShowAddModal(false)}><X /></button>
            </div>
            <form onSubmit={handleSetBudget}>
              <div className="form-group">
                <label className="form-label">Kategori Pengeluaran</label>
                <select className="form-input" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  {userCategories.filter(uc => !CATEGORIES.includes(uc.name)).map(uc => (
                    <option key={uc.name} value={uc.name}>{uc.name}</option>
                  ))}
                  <option value="Other">Other (Tambah Baru)</option>
                </select>
              </div>

              {form.category === 'Other' && (
                <div className="form-group animate-in">
                  <label className="form-label">Nama Kategori Baru</label>
                  <input type="text" className="form-input" placeholder="Misal: Hobi Mancing, Skin Game..." value={customCategory} onChange={e => setCustomCategory(e.target.value)} required autoFocus />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Limit Anggaran Bulanan (Rp)</label>
                <CurrencyInput className="form-input" required autoFocus value={form.amount} onValueChange={val => setForm({...form, amount: val})} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 20, fontStyle: 'italic' }}>
                *Anggaran akan dihitung otomatis berdasarkan transaksi pengeluaran kamu di bulan ini.
              </p>
              <button type="submit" className="btn btn-primary w-full" disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan Anggaran'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
