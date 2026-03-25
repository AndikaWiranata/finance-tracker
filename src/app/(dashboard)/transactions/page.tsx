'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { formatNumberInput, parseNumberInput } from '@/lib/currency'
import { Account, Transaction } from '@/types'
import { Plus, X, ArrowLeftRight, Filter, Pencil, Trash2, AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from 'react-hot-toast'
import Link from 'next/link'

function formatIDR(n: number) {
  // If no decimals needed, keep it 0. If it has decimals, show up to 2 for IDR conversion.
  return new Intl.NumberFormat('id-ID', { 
    style: 'currency', 
    currency: 'IDR', 
    maximumFractionDigits: n % 1 === 0 ? 0 : 2 
  }).format(n)
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

const LIQUID_TYPES = ['bank', 'cash', 'ewallet']

const CATEGORIES = {
  income:  ['Salary', 'Freelance', 'Investment', 'Gift', 'Bonus'],
  expense: ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Bills', 'Education'],
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterAccount, setFilterAccount] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterPeriod, setFilterPeriod] = useState<string>('all')
  const [form, setForm] = useState({
    account_id: '',
    type: 'expense' as 'income' | 'expense',
    amount: '',
    category: 'Food',
    note: '',
    date: new Date().toISOString().slice(0, 10),
  })
  const [userCategories, setUserCategories] = useState<{name: string, type: string}[]>([])
  const [saving, setSaving] = useState(false)
  const [customCategory, setCustomCategory] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferForm, setTransferForm] = useState({
    from_id: '',
    to_id: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    note: ''
  })

  async function load() {
    if (!user) return
    const [{ data: txns }, { data: accs }, { data: userCats }] = await Promise.all([
      supabase.from('transactions')
        .select('*, accounts(name, currency)')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase.from('user_categories').select('name, type').eq('user_id', user.id)
    ])
    setTransactions(txns ?? [])
    const loadedAccs = accs ?? []
    setAccounts(loadedAccs)
    setUserCategories(userCats ?? [])
    
    // Set default account to the first liquid one
    const liquid = loadedAccs.filter(a => LIQUID_TYPES.includes(a.type))
    if (liquid.length > 0) {
        setForm(f => ({ ...f, account_id: String(liquid[0].id) }))
    } else if (loadedAccs.length > 0) {
        setForm(f => ({ ...f, account_id: String(loadedAccs[0].id) }))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  const filtered = transactions.filter(t => {
    const matchAccount = filterAccount === 'all' || String(t.account_id) === filterAccount
    const matchType = filterType === 'all' || t.type === filterType
    const matchCategory = filterCategory === 'all' || t.category === filterCategory
    
    // Period Filtering
    let [start, end] = ['', '']
    const today = new Date()
    const nowStr = today.toISOString().slice(0, 10)

    if (filterPeriod === 'today') {
      [start, end] = [nowStr, nowStr]
    } else if (filterPeriod === 'this_week') {
      const weekStart = new Date(today.setDate(today.getDate() - today.getDay()))
      start = weekStart.toISOString().slice(0, 10)
    } else if (filterPeriod === 'this_month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
    } else if (filterPeriod === 'last_month') {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      start = lastMonth.toISOString().slice(0, 10)
      end = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0, 10)
    } else if (filterPeriod === 'this_year') {
      start = new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10)
    }

    const matchStart = !start || t.date >= start
    const matchEnd = !end || t.date <= end
    
    return matchAccount && matchType && matchCategory && matchStart && matchEnd
  })

  async function submit(e: React.FormEvent) {
    if (!user) return
    e.preventDefault()
    const amount = parseFloat(parseNumberInput(form.amount)) || 0
    if (amount <= 0) {
      toast.error('Amount must be greater than 0')
      return
    }
    if (!form.account_id) {
      toast.error('Please select an account')
      return
    }

    setSaving(true)
    const acc = accounts.find(a => a.id === parseInt(form.account_id))

    let finalCategory = form.category
    if (form.category === 'Other') {
      if (!customCategory.trim()) {
        setSaving(false)
        return toast.error('Kategori harus diisi')
      }
      finalCategory = customCategory.trim()
      // Auto-save to user_categories
      await supabase.from('user_categories').upsert({
        user_id: user.id,
        name: finalCategory,
        type: form.type
      }, { onConflict: 'user_id, name, type' })
    }
    
    if (editId) {
      // Find old transaction to revert balance
      const oldTx = transactions.find(t => t.id === editId)
      if (oldTx) {
        const revertDelta = oldTx.type === 'income' ? -Number(oldTx.amount) : Number(oldTx.amount)
        const oldAcc = accounts.find(a => a.id === oldTx.account_id)
        if (oldAcc) await supabase.from('accounts').update({ balance: Number(oldAcc.balance) + revertDelta }).eq('id', oldAcc.id)
      }

      await supabase.from('transactions').update({
        account_id: parseInt(form.account_id),
        type: form.type,
        amount: amount,
        category: finalCategory,
        note: form.note || null,
        date: form.date,
      }).eq('id', editId)

      // Apply new balance
      const newDelta = form.type === 'income' ? amount : -amount
      if (acc) await supabase.from('accounts').update({ balance: Number(acc.balance) + newDelta }).eq('id', acc.id)
      toast.success('Transaction updated')
    } else {
      const { error } = await supabase.from('transactions').insert({
        account_id: parseInt(form.account_id),
        user_id: user.id,
        type: form.type,
        amount: amount,
        category: finalCategory,
        note: form.note || null,
        date: form.date,
      })
      
      if (!error && acc) {
        const delta = form.type === 'income' ? amount : -amount
        await supabase.from('accounts').update({ balance: Number(acc.balance) + delta }).eq('id', acc.id)
        toast.success('Transaction added')
      }
    }
    
    setForm({
      account_id: accounts[0]?.id.toString() || '',
      type: 'expense',
      amount: '',
      category: 'Food',
      note: '',
      date: new Date().toISOString().slice(0, 10),
    })
    setEditId(null)
    setShowModal(false)
    setSaving(false)
    await load()
  }

  function startEdit(t: Transaction) {
    const isCustom = !CATEGORIES[t.type].includes(t.category)
    setEditId(t.id)
    setForm({
      account_id: String(t.account_id),
      type: t.type,
      amount: formatNumberInput(t.amount),
      category: isCustom ? 'Other' : t.category,
      note: t.note || '',
      date: t.date
    })
    setCustomCategory(isCustom ? t.category : '')
    setShowModal(true)
  }

  async function deleteTransaction() {
    if (!deleteId) return
    const t = transactions.find(tx => tx.id === deleteId)
    if (!t) return
    
    setSaving(true)
    const acc = accounts.find(a => a.id === t.account_id)
    if (acc) {
      const revertDelta = t.type === 'income' ? -Number(t.amount) : Number(t.amount)
      await supabase.from('accounts').update({ balance: Number(acc.balance) + revertDelta }).eq('id', acc.id)
    }

    await supabase.from('transactions').delete().eq('id', t.id)
    toast.success('Transaction deleted')
    setDeleteId(null)
    setSaving(false)
    await load()
  }

  async function submitTransfer(e: React.FormEvent) {
    if (!user) return
    e.preventDefault()
    const amount = parseFloat(parseNumberInput(transferForm.amount)) || 0
    if (amount <= 0) {
      toast.error('Transfer amount must be greater than 0')
      return
    }
    if (transferForm.from_id === transferForm.to_id) {
      toast.error("Source and destination accounts must be different")
      return
    }

    setSaving(true)
    const fromAcc = accounts.find(a => a.id === parseInt(transferForm.from_id))
    const toAcc = accounts.find(a => a.id === parseInt(transferForm.to_id))

    if (!fromAcc || !toAcc) return

    // Use Atomic RPC to handle transfers
    const { error } = await supabase.rpc('transfer_funds', {
      from_acc_id: parseInt(transferForm.from_id),
      to_acc_id: parseInt(transferForm.to_id),
      user_id_val: user.id,
      amount_val: amount,
      note_val: transferForm.note ? ': ' + transferForm.note : '',
      date_val: transferForm.date
    })

    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }

    toast.success('Transfer successful!')
    setShowTransferModal(false)
    setTransferForm(f => ({ ...f, amount: '', note: '' }))
    setSaving(false)
    await load()
  }

  const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

  const liquidAccounts = accounts.filter(a => LIQUID_TYPES.includes(a.type))

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">{filtered.length} records</p>
        </div>
        <div className="flex gap-2">
          <Link href="/transactions/recurring" className="btn btn-ghost" style={{ gap: 8 }}>
            <RefreshCw size={16} /> Jadwal Rutin
          </Link>
          <button className="btn btn-ghost" onClick={() => {
            if (liquidAccounts.length < 2) {
              toast.error("You need at least 2 liquid accounts to make a transfer")
              return
            }
            setTransferForm(f => ({ ...f, from_id: String(liquidAccounts[0].id), to_id: String(liquidAccounts[1]?.id || liquidAccounts[0].id) }))
            setShowTransferModal(true)
          }}>
            <ArrowLeftRight size={16} /> Transfer
          </button>
          <button className="btn btn-primary" onClick={() => {
            setEditId(null)
            setForm({
              account_id: liquidAccounts[0]?.id.toString() || accounts[0]?.id.toString() || '',
              type: 'expense',
              amount: '',
              category: 'Food',
              note: '',
              date: new Date().toISOString().slice(0, 10),
            })
            setShowModal(true)
          }}>
            <Plus size={16} /> Add Transaction
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid-3 mb-4">
        <div className="card-sm">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Total Income</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>+{formatIDR(totalIncome)}</div>
        </div>
        <div className="card-sm">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Total Expense</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--red)' }}>-{formatIDR(totalExpense)}</div>
        </div>
        <div className="card-sm">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Net</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: totalIncome - totalExpense >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {formatIDR(totalIncome - totalExpense)}
          </div>
        </div>
      </div>

      {/* Filter Section */}
      <div className="card mb-4" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontWeight: 600 }}>
          <Filter size={18} />
          <span>Filters</span>
          {(filterAccount !== 'all' || filterType !== 'all' || filterCategory !== 'all' || filterPeriod !== 'all') && (
            <button 
              onClick={() => {
                setFilterAccount('all'); setFilterType('all'); setFilterCategory('all');
                setFilterPeriod('all');
              }}
              style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Reset Filters
            </button>
          )}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>Account</label>
            <select className="form-select" style={{ padding: '6px 12px' }}
              value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
              <option value="all">All accounts</option>
              {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>Type</label>
            <select className="form-select" style={{ padding: '6px 12px' }}
              value={filterType} onChange={e => { setFilterType(e.target.value); setFilterCategory('all'); }}>
              <option value="all">All Types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>Category</label>
            <select className="form-select" style={{ padding: '6px 12px' }}
              value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="all">All Categories</option>
              {filterType === 'all' ? (
                <>
                  <optgroup label="Income">
                    {CATEGORIES.income.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                  <optgroup label="Expense">
                    {CATEGORIES.expense.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                </>
              ) : (
                CATEGORIES[filterType as keyof typeof CATEGORIES].map(c => <option key={c} value={c}>{c}</option>)
              )}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>Periode Waktu</label>
            <select className="form-select" style={{ padding: '6px 12px' }}
              value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}>
              <option value="all">Semua Riwayat</option>
              <option value="today">Hari Ini</option>
              <option value="this_week">Minggu Ini</option>
              <option value="this_month">Bulan Ini</option>
              <option value="last_month">Bulan Lalu</option>
              <option value="this_year">Tahun Ini</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <ArrowLeftRight size={40} />
            <p style={{ marginTop: 12 }}>No transactions yet</p>
          </div>
        ) : (
          <>
            <div className="mobile-only">
              {filtered.map(t => (
                <div key={t.id} className="txn-mobile-card" style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                  <div className="flex-between" style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{formatDate(t.date)}</span>
                    <span className={`badge badge-${t.type}`}>{t.type}</span>
                  </div>
                  <div className="flex-between">
                    <div>
                      <div style={{ fontWeight: 600 }}>{t.category}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.accounts?.name}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className={t.type === 'income' ? 'amount-income' : 'amount-expense'} style={{ fontWeight: 700 }}>
                        {t.type === 'income' ? '+' : '-'}{formatIDR(Number(t.amount))}
                      </div>
                      <div className="flex gap-2 mt-2" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)} style={{ padding: 4 }}><Pencil size={13} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(t.id)} style={{ padding: 4 }}><Trash2 size={13} color="var(--red)" /></button>
                      </div>
                    </div>
                  </div>
                  {t.note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>"{t.note}"</div>}
                </div>
              ))}
            </div>
            <div className="table-wrap desktop-only">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Account</th>
                    <th>Note</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id}>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(t.date)}</td>
                      <td><span className="cat-badge">{t.category}</span></td>
                      <td style={{ color: 'var(--text-primary)' }}>{t.accounts?.name ?? '-'}</td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.note ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td><span className={`badge badge-${t.type}`}>{t.type}</span></td>
                      <td style={{ textAlign: 'right' }} className={t.type === 'income' ? 'amount-income' : 'amount-expense'}>
                        {t.type === 'income' ? '+' : '-'}{formatIDR(Number(t.amount))}
                      </td>
                      <td>
                        <div className="flex gap-1" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)}><Pencil size={13} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(t.id)}><Trash2 size={13} color="var(--red)" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add Transaction Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editId ? 'Edit Transaction' : 'New Transaction'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowModal(false); setEditId(null); }} style={{ padding: '4px 8px' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submit}>
              {/* Type toggle */}
              <div className="form-group">
                <label className="form-label">Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['income', 'expense'] as const).map(t => (
                    <button key={t} type="button" onClick={() => {
                      setForm(f => ({ ...f, type: t, category: t === 'income' ? 'Salary' : 'Food' }))
                    }}
                      style={{
                        flex: 1, padding: '8px', borderRadius: 8, border: '1px solid',
                        borderColor: form.type === t ? (t === 'income' ? 'var(--green)' : 'var(--red)') : 'var(--border)',
                        background: form.type === t ? (t === 'income' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)') : 'transparent',
                        color: form.type === t ? (t === 'income' ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)',
                        fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      }}>{t === 'income' ? '↑ Income' : '↓ Expense'}</button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Account</label>
                <select className="form-select" required value={form.account_id}
                  onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
                  {liquidAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount</label>
                  <input className="form-input" type="text" placeholder="0" required autoFocus
                    value={form.amount} onChange={e => setForm(f => ({ ...f, amount: formatNumberInput(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-select" value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES[form.type].map(c => <option key={c} value={c}>{c}</option>)}
                    {userCategories.filter(uc => uc.type === form.type && !CATEGORIES[form.type].includes(uc.name)).map(uc => (
                      <option key={uc.name} value={uc.name}>{uc.name}</option>
                    ))}
                    <option value="Other">Other (Custom)</option>
                  </select>
                </div>
              </div>

              {form.category === 'Other' && (
                <div className="form-group animate-in">
                  <label className="form-label">Custom Category Name</label>
                  <input type="text" className="form-input" placeholder="Type category name..." value={customCategory} onChange={e => setCustomCategory(e.target.value)} required autoFocus />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" required
                  value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Note (optional)</label>
                <input className="form-input" placeholder="e.g. Lunch at Wartel Pak Budi"
                  value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>

              <div className="flex gap-3 mt-4" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowModal(false); setEditId(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !form.account_id}>
                  {saving ? 'Saving…' : (editId ? 'Update Transaction' : 'Add Transaction')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowTransferModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Transfer Between Accounts</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTransferModal(false)} style={{ padding: '4px 8px' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submitTransfer}>
              <div className="form-group">
                <label className="form-label">From Account</label>
                <select className="form-select" required value={transferForm.from_id}
                  onChange={e => setTransferForm(f => ({ ...f, from_id: e.target.value }))}>
                  {liquidAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({formatIDR(Number(a.balance))})</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">To Account</label>
                <select className="form-select" required value={transferForm.to_id}
                  onChange={e => setTransferForm(f => ({ ...f, to_id: e.target.value }))}>
                  {liquidAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({formatIDR(Number(a.balance))})</option>)}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount</label>
                  <input className="form-input" type="text" placeholder="0" required autoFocus
                    value={transferForm.amount} onChange={e => setTransferForm(f => ({ ...f, amount: formatNumberInput(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input className="form-input" type="date" required
                    value={transferForm.date} onChange={e => setTransferForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Note (optional)</label>
                <input className="form-input" placeholder="e.g. Topup Dana from Cash"
                  value={transferForm.note} onChange={e => setTransferForm(f => ({ ...f, note: e.target.value }))} />
              </div>

              <div className="flex gap-3 mt-4" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowTransferModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Transferring…' : 'Execute Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteId(null)}>
          <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, background: 'rgba(239,68,68,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <AlertTriangle size={32} color="var(--red)" style={{ margin: 'auto' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Delete Transaction?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
              Are you sure you want to delete this transaction? 
              <br/>This will also revert your account balance.
            </p>
            <div className="flex gap-3" style={{ justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteId(null)} style={{ flex: 1 }}>Cancel</button>
              <button className="btn btn-danger" onClick={deleteTransaction} disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
