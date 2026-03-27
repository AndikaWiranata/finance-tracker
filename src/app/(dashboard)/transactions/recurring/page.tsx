'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatNumberInput, parseNumberInput, getFiatRates, convertToBase } from '@/lib/currency'
import CurrencyInput from '@/components/CurrencyInput'
import { Account } from '@/types'
import { Plus, X, Calendar, RefreshCw, Trash2, ArrowLeft, AlertCircle, Clock } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { getLocalDateISO } from '@/lib/date'

// Replaced local formatIDR with global formatCurrency

const LIQUID_TYPES = ['bank', 'cash', 'ewallet']
const CATEGORIES = {
  income:  ['Salary', 'Freelance', 'Investment', 'Gift', 'Bonus', 'Other Income'],
  expense: ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Bills', 'Education', 'Other'],
}

export default function RecurringPage() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const [exchangeRate, setExchangeRate] = useState(1)
  const baseCurrency = profile?.base_currency || 'IDR'
  const [loading, setLoading] = useState(true)
  const [recurring, setRecurring] = useState<any[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [form, setForm] = useState({
    account_id: '',
    type: 'expense' as 'income' | 'expense',
    amount: '',
    category: 'Bills',
    frequency: 'monthly',
    next_date: '',
    note: ''
  })

  useEffect(() => {
    setForm(f => ({ ...f, next_date: getLocalDateISO() }))
  }, [])

  async function load() {
    if (!user) return
    
    if (baseCurrency !== 'IDR') {
      const rates = await getFiatRates()
      if (rates) {
        const idrToUsd = 1 / (rates['IDR'] || 15500)
        const usdToBase = rates[baseCurrency] || 1
        setExchangeRate(idrToUsd * usdToBase)
      }
    } else {
      setExchangeRate(1)
    }

    const [{ data: rec }, { data: accs }] = await Promise.all([
      supabase.from('recurring_transactions')
        .select('*, accounts(name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('accounts').select('*').eq('user_id', user.id),
    ])
    setRecurring(rec ?? [])
    const loadedAccs = accs ?? []
    setAccounts(loadedAccs)
    
    const liquid = loadedAccs.filter(a => LIQUID_TYPES.includes(a.type))
    if (liquid.length > 0) setForm(f => ({ ...f, account_id: String(liquid[0].id) }))
    
    setLoading(false)
  }

  useEffect(() => { load() }, [user, baseCurrency])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    
    const amountInBase = parseFloat(parseNumberInput(form.amount, baseCurrency)) || 0
    if (amountInBase <= 0) return toast.error('Amount must be greater than 0')
    const amountIDR = await convertToBase(amountInBase, baseCurrency, 'IDR')
    if (!form.account_id) return toast.error('Please select an account first')

    setSaving(true)
    const { error } = await supabase.from('recurring_transactions').insert({
      user_id: user.id,
      account_id: parseInt(form.account_id),
      type: form.type,
      amount: amountIDR,
      category: form.category,
      frequency: form.frequency,
      next_date: form.next_date,
      note: form.note || null,
      active: true
    })

    if (error) {
      toast.error('Failed to save: ' + error.message)
    } else {
      toast.success('Recurring transaction scheduled!')
      setShowModal(false)
      load()
    }
    setSaving(false)
  }

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from('recurring_transactions')
      .update({ active: !active })
      .eq('id', id)
    if (!error) load()
  }

  async function remove() {
    if (!deleteId) return
    const { error } = await supabase.from('recurring_transactions').delete().eq('id', deleteId)
    if (!error) {
      toast.success('Deleted')
      setDeleteId(null)
      load()
    }
  }

  if (loading) return <div className="spinner" />

  return (
    <div className="animate-in">
      <div className="flex-between mb-8">
        <div>
          <button onClick={() => router.back()} className="btn btn-ghost btn-sm mb-2" style={{ padding: '8px 12px', gap: 8 }}>
            <ArrowLeft size={18} /> Back
          </button>
          <h1 style={{ fontSize: 32, fontWeight: 800 }}>Recurring Transactions</h1>
          <p style={{ color: 'var(--text-muted)' }}>Set up your automatic income & expenses</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={20} /> Add Schedule
        </button>
      </div>

      <div className="grid-3">
        {recurring.length === 0 ? (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px' }}>
            <RefreshCw size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <h3 style={{ fontSize: 18, color: 'var(--text-muted)' }}>No recurring transactions yet</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Add a schedule to process automatic bills</p>
          </div>
        ) : (
          recurring.map(item => (
            <div key={item.id} className="card" style={{ 
              opacity: item.active ? 1 : 0.6,
              background: item.active ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
              border: item.active ? '1px solid var(--border)' : '1px solid rgba(255,255,255,0.05)'
            }}>
              <div className="flex-between mb-4">
                <div className="badge" style={{ 
                  background: item.type === 'income' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: item.type === 'income' ? 'var(--green)' : 'var(--red)',
                  textTransform: 'uppercase',
                  fontSize: 10,
                  fontWeight: 800
                }}>
                  {item.type}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                   <button className="btn-icon" onClick={() => toggleActive(item.id, item.active)} title={item.active ? 'Nonaktifkan' : 'Aktifkan'}>
                     <RefreshCw size={16} />
                   </button>
                   <button className="btn-icon" style={{ color: 'var(--red)' }} onClick={() => setDeleteId(item.id)}>
                     <Trash2 size={16} />
                   </button>
                </div>
              </div>

              <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
                {formatCurrency(item.amount * exchangeRate, baseCurrency)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                {item.category}
              </div>

              <div className="divider" style={{ margin: '16px 0' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  <Calendar size={14} /> Frequency: <span style={{ color: 'var(--text-primary)', fontWeight: 600, textTransform: 'capitalize' }}>{item.frequency}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  <Clock size={14} /> Next Payment: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{item.next_date}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, fontStyle: 'italic' }}>
                   Via: {item.accounts?.name}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Add */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-in" style={{ maxWidth: 500 }}>
            <div className="flex-between mb-6">
              <h2 style={{ fontSize: 24, fontWeight: 800 }}>Schedule Transaction</h2>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X /></button>
            </div>

            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label">Transaction Type</label>
                <div className="flex gap-4">
                   <button 
                    type="button"
                    className={`btn flex-1 ${form.type === 'expense' ? 'btn-danger' : 'btn-ghost'}`}
                    onClick={() => setForm({...form, type: 'expense', category: 'Bills'})}
                   >Expense</button>
                   <button 
                    type="button"
                    className={`btn flex-1 ${form.type === 'income' ? 'btn-success' : 'btn-ghost'}`}
                    onClick={() => setForm({...form, type: 'income', category: 'Salary'})}
                   >Income</button>
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Amount</label>
                  <CurrencyInput 
                    className="form-input" required
                    currency={baseCurrency}
                    value={form.amount}
                    onValueChange={val => setForm({...form, amount: val})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select 
                    className="form-input" value={form.category}
                    onChange={e => setForm({...form, category: e.target.value})}
                  >
                    {CATEGORIES[form.type].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Source Account</label>
                <select 
                  className="form-input" value={form.account_id}
                  onChange={e => setForm({...form, account_id: e.target.value})}
                >
                  {accounts.filter(a => LIQUID_TYPES.includes(a.type)).map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({formatCurrency(Number(a.balance) * exchangeRate, baseCurrency)})</option>
                  ))}
                </select>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Frequency</label>
                  <select 
                    className="form-input" value={form.frequency}
                    onChange={e => setForm({...form, frequency: e.target.value})}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input 
                    type="date" className="form-input" required
                    value={form.next_date}
                    onChange={e => setForm({...form, next_date: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Note (Optional)</label>
                <input 
                  type="text" className="form-input" placeholder="e.g. Netflix, Electricity, etc."
                  value={form.note}
                  onChange={e => setForm({...form, note: e.target.value})}
                />
              </div>

              <button type="submit" className="btn btn-primary w-full" disabled={saving}>
                {saving ? <RefreshCw className="spinner" /> : 'Start Scheduling'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="modal-overlay">
          <div className="modal-content animate-in" style={{ maxWidth: 400, textAlign: 'center' }}>
            <AlertCircle size={48} color="var(--red)" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 20, marginBottom: 12 }}>Delete Schedule?</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>This recurring transaction will be stopped forever.</p>
            <div className="flex gap-4">
              <button className="btn btn-ghost flex-1" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger flex-1" onClick={remove}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
