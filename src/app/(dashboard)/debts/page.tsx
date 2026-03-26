'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { formatNumberInput, parseNumberInput } from '@/lib/currency'
import { Account } from '@/types'
import { Plus, X, Landmark, ArrowRight, Trash2, Calendar, User, DollarSign, AlertCircle, CheckCircle2, History } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { getLocalDateISO } from '@/lib/date'

function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

function formatDate(d: string) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DebtsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [debts, setDebts] = useState<any[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedDebt, setSelectedDebt] = useState<any>(null)
  
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'open' | 'completed'>('open')

  const [form, setForm] = useState({
    person_name: '',
    type: 'debt' as 'debt' | 'receivable',
    category: 'Personal',
    amount: '',
    note: '',
    due_date: '',
  })

  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    account_id: '',
    note: '',
    date: '',
    sync_to_ledger: true
  })

  useEffect(() => {
    setPaymentForm(f => ({ ...f, date: getLocalDateISO() }))
  }, [])

  async function loadData() {
    if (!user) return
    setLoading(true)
    const [{ data: debtsData }, { data: accs }] = await Promise.all([
      supabase.from('debts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('accounts').select('*').eq('user_id', user.id),
    ])
    setDebts(debtsData ?? [])
    setAccounts(accs ?? [])
    if (accs && accs.length > 0) {
       setPaymentForm(f => ({ ...f, account_id: String(accs[0].id) }))
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [user])

  async function handleAddDebt(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    const amount = parseFloat(parseNumberInput(form.amount)) || 0
    if (amount <= 0) return toast.error('Jumlah harus lebih dari 0')

    setSaving(true)
    const { error } = await supabase.from('debts').insert({
      user_id: user.id,
      person_name: form.person_name,
      type: form.type,
      category: form.category,
      amount,
      remaining_amount: amount,
      note: form.note || null,
      due_date: form.due_date || null,
      status: 'open'
    })

    if (!error) {
      toast.success('Hutang/Piutang berhasil ditambahkan')
      setShowAddModal(false)
      loadData()
      setForm({ person_name: '', type: 'debt', category: 'Personal', amount: '', note: '', due_date: '' })
    } else {
      toast.error(error.message)
    }
    setSaving(false)
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !selectedDebt) return
    const amount = parseFloat(parseNumberInput(paymentForm.amount)) || 0
    if (amount <= 0) return toast.error('Jumlah harus lebih dari 0')
    if (amount > selectedDebt.remaining_amount) return toast.error('Jumlah melebihi sisa hutang/piutang')

    setSaving(true)
    
    // 1. Log Payment
    const { error: pError } = await supabase.from('debt_payments').insert({
      debt_id: selectedDebt.id,
      amount,
      payment_date: paymentForm.date,
      account_id: paymentForm.account_id ? parseInt(paymentForm.account_id) : null,
      note: paymentForm.note || null
    })

    if (pError) {
      toast.error(pError.message)
      setSaving(false)
      return
    }

    // 2. Update Debt Remaining
    const newRemaining = Number(selectedDebt.remaining_amount) - amount
    const { error: dError } = await supabase.from('debts').update({
      remaining_amount: newRemaining,
      status: newRemaining <= 0 ? 'completed' : 'open'
    }).eq('id', selectedDebt.id)

    // 3. Optional Sync to Transactions Ledger
    if (paymentForm.sync_to_ledger && paymentForm.account_id) {
       const acc = accounts.find(a => a.id === parseInt(paymentForm.account_id))
       if (acc) {
          // If paying DEBT: it's an Expense
          // If receiving PIUTANG: it's an Income
          const type = selectedDebt.type === 'debt' ? 'expense' : 'income'
          
          await supabase.from('transactions').insert({
            user_id: user.id,
            account_id: acc.id,
            type,
            amount,
            category: 'Debt Repayment',
            note: `${selectedDebt.type === 'debt' ? 'Bayar Hutang' : 'Terima Cicilan'} - ${selectedDebt.person_name}`,
            date: paymentForm.date
          })

          // Update Balance
          const delta = type === 'income' ? amount : -amount
          await supabase.from('accounts').update({ balance: Number(acc.balance) + delta }).eq('id', acc.id)
       }
    }

    toast.success('Pembayaran berhasil dicatat')
    setShowPaymentModal(false)
    loadData()
    setSaving(false)
  }

  const totals = debts.reduce((acc, curr) => {
    if (curr.status === 'open') {
      if (curr.type === 'debt') acc.totalDebt += Number(curr.remaining_amount)
      else acc.totalReceivable += Number(curr.remaining_amount)
    }
    return acc
  }, { totalDebt: 0, totalReceivable: 0 })

  const filteredDebts = debts.filter(d => d.status === activeTab)

  if (loading) return <div className="spinner" />

  return (
    <div className="animate-in">
      <div className="flex-between mb-8">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 800 }}>Hutang & Piutang</h1>
          <p style={{ color: 'var(--text-muted)' }}>Pantau kewajiban dan tagihan kamu</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={20} /> Tambah Baru
        </button>
      </div>

      <div className="grid-2 mb-8">
        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(239,68,68,0.05) 100%)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="flex-between mb-2">
            <span style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Total Hutang (Hutang ke Orang)</span>
            <AlertCircle size={18} color="var(--red)" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--red)' }}>{formatIDR(totals.totalDebt)}</div>
        </div>
        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(34,197,94,0.05) 100%)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <div className="flex-between mb-2">
            <span style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Total Piutang (Orang Hutang ke Kita)</span>
            <CheckCircle2 size={18} color="var(--green)" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green)' }}>{formatIDR(totals.totalReceivable)}</div>
        </div>
      </div>

      <div className="tabs mb-6" style={{ display: 'flex', gap: 20, borderBottom: '1px solid var(--border)' }}>
        <button 
          className={`tab-item ${activeTab === 'open' ? 'active' : ''}`} 
          onClick={() => setActiveTab('open')}
          style={{ padding: '12px 4px', background: 'none', border: 'none', color: activeTab === 'open' ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', borderBottom: activeTab === 'open' ? '2px solid var(--accent)' : 'none' }}
        >
          Masih Berjalan ({debts.filter(d => d.status === 'open').length})
        </button>
        <button 
          className={`tab-item ${activeTab === 'completed' ? 'active' : ''}`} 
          onClick={() => setActiveTab('completed')}
          style={{ padding: '12px 4px', background: 'none', border: 'none', color: activeTab === 'completed' ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', borderBottom: activeTab === 'completed' ? '2px solid var(--accent)' : 'none' }}
        >
          Sudah Lunas ({debts.filter(d => d.status === 'completed').length})
        </button>
      </div>

      <div className="grid-2">
        {filteredDebts.length === 0 ? (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0' }}>
            <Landmark size={48} color="var(--text-muted)" style={{ opacity: 0.2, margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-muted)' }}>Tidak ada data {activeTab === 'open' ? 'hutang aktif' : 'riwayat lunas'}</p>
          </div>
        ) : (
          filteredDebts.map(d => {
            const progress = ((Number(d.amount) - Number(d.remaining_amount)) / Number(d.amount)) * 100
            return (
              <div key={d.id} className="card" style={{ position: 'relative', overflow: 'hidden' }}>
                <div className="flex-between mb-4">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ 
                      width: 40, height: 40, borderRadius: 10, 
                      background: d.type === 'debt' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: d.type === 'debt' ? 'var(--red)' : 'var(--green)'
                    }}>
                      <User size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{d.person_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{d.category} • {d.type === 'debt' ? 'Hutang Kita' : 'Piutang Orang'}</div>
                    </div>
                  </div>
                  {d.status === 'open' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedDebt(d); setShowPaymentModal(true); }}>
                      Bayar
                    </button>
                  )}
                </div>

                <div className="flex-between mb-1" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  <span>Sisa: {formatIDR(Number(d.remaining_amount))}</span>
                  <span>Total: {formatIDR(Number(d.amount))}</span>
                </div>
                
                <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, marginBottom: 16 }}>
                  <div style={{ 
                    width: `${progress}%`, height: '100%', 
                    background: d.type === 'debt' ? 'var(--red)' : 'var(--green)',
                    borderRadius: 3, transition: 'width 0.3s'
                  }} />
                </div>

                <div className="grid-2" style={{ gap: 12 }}>
                   <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      <Calendar size={12} style={{ marginRight: 4 }} /> Jatuh Tempo: <span style={{ color: 'var(--text-primary)' }}>{formatDate(d.due_date)}</span>
                   </div>
                   {d.note && (
                     <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'right' }}>
                        "{d.note}"
                     </div>
                   )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal Add Debt */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-in" style={{ maxWidth: 500 }}>
            <div className="flex-between mb-6">
              <h2 style={{ fontSize: 22, fontWeight: 800 }}>Tambah Baru</h2>
              <button className="btn-icon" onClick={() => setShowAddModal(false)}><X /></button>
            </div>
            <form onSubmit={handleAddDebt}>
              <div className="form-group">
                <label className="form-label">Tipe Obligasi</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className={`btn flex-1 ${form.type === 'debt' ? 'btn-danger' : 'btn-ghost'}`} onClick={() => setForm({...form, type: 'debt'})}>Hutang (Pinjam Orang)</button>
                  <button type="button" className={`btn flex-1 ${form.type === 'receivable' ? 'btn-success' : 'btn-ghost'}`} onClick={() => setForm({...form, type: 'receivable'})}>Piutang (Pijami Orang)</button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Nama Orang / Lembaga</label>
                <input type="text" className="form-input" required placeholder="Budi, BCA, Pinjol, dll" value={form.person_name} onChange={e => setForm({...form, person_name: e.target.value})} />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Total Amount (Rp)</label>
                  <input type="text" className="form-input" required value={form.amount} onChange={e => setForm({...form, amount: formatNumberInput(e.target.value)})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Kategori</label>
                  <select className="form-input" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                    <option value="Personal">Personal</option>
                    <option value="Business">Business</option>
                    <option value="Family">Family</option>
                    <option value="Educational">Educational</option>
                    <option value="Loan">Loan</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Tanggal Jatuh Tempo (Opsional)</label>
                <input type="date" className="form-input" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="form-label">Catatan</label>
                <input type="text" className="form-input" placeholder="Keterangan tambahan..." value={form.note} onChange={e => setForm({...form, note: e.target.value})} />
              </div>

              <button type="submit" className="btn btn-primary w-full" disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan Obligasi'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Payment */}
      {showPaymentModal && selectedDebt && (
        <div className="modal-overlay">
          <div className="modal-content animate-in" style={{ maxWidth: 450 }}>
             <div className="flex-between mb-4">
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>Mencatat Cicilan</h2>
                <button className="btn-icon" onClick={() => setShowPaymentModal(false)}><X /></button>
             </div>
             <div className="card-sm mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sisa {selectedDebt.type === 'debt' ? 'Hutang' : 'Tagihan'} ke {selectedDebt.person_name}:</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{formatIDR(Number(selectedDebt.remaining_amount))}</div>
             </div>

             <form onSubmit={handleAddPayment}>
                <div className="form-group">
                  <label className="form-label">Jumlah Pembayaran (Rp)</label>
                  <input type="text" className="form-input" required autoFocus value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: formatNumberInput(e.target.value)})} />
                </div>

                <div className="form-group">
                  <label className="form-label">Sumber Akun (Untuk Potong/Tambah Saldo)</label>
                  <select className="form-input" value={paymentForm.account_id} onChange={e => setPaymentForm({...paymentForm, account_id: e.target.value})}>
                     {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({formatIDR(Number(a.balance))})</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                   <input type="checkbox" checked={paymentForm.sync_to_ledger} onChange={e => setPaymentForm({...paymentForm, sync_to_ledger: e.target.checked})} />
                   <label style={{ fontSize: 13, userSelect: 'none' }}>Catat otomatis di riwayat Transaksi</label>
                </div>

                <div className="form-group">
                  <label className="form-label">Keterangan</label>
                  <input type="text" className="form-input" value={paymentForm.note} onChange={e => setPaymentForm({...paymentForm, note: e.target.value})} />
                </div>

                <button type="submit" className="btn btn-primary w-full" disabled={saving}>
                  {saving ? 'Memproses...' : 'Konfirmasi Pembayaran'}
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  )
}
