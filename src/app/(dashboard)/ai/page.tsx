'use client'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { convertToIDR } from '@/lib/currency'
import { Sparkles, Send, Bot, User, Loader2, AlertCircle, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

const CHAT_CACHE_KEY = 'fintrack_ai_chat_history'
const INITIAL_MESSAGE = {
  role: 'assistant',
  content: 'Halo! Saya FinTrack AI Advisor. Berdasarkan data keuanganmu, ada yang bisa saya bantu analisis hari ini?'
}

export default function AIPage() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [finContext, setFinContext] = useState<any>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Load cached messages from localStorage on mount
  useEffect(() => {
    const cached = localStorage.getItem(CHAT_CACHE_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
          return
        }
      } catch {}
    }
    setMessages([INITIAL_MESSAGE])
  }, [])

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(messages))
    }
  }, [messages])

  // Load finance summary for AI context
  async function loadSummary() {
    if (!user) return
    const [{ data: accs }, { data: crypto }, { data: forex }, { data: stocks }, { data: txns }] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase.from('crypto_wallets').select('*').eq('user_id', user.id),
      supabase.from('forex_accounts').select('*').eq('user_id', user.id),
      supabase.from('stock_portfolios').select('*').eq('user_id', user.id),
      supabase.from('transactions').select('*').eq('user_id', user.id).limit(10).order('date', { ascending: false })
    ])

    let bankTotal = 0
    for(const a of (accs||[])) {
      try {
        if(a.type !== 'crypto' && a.type !== 'forex' && a.type !== 'stock') {
          bankTotal += await convertToIDR(Number(a.balance), a.currency || 'IDR')
        }
      } catch (e) {}
    }

    let cryptoTotal = 0
    for(const c of (crypto||[])) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/crypto?coin=${c.coin_symbol}`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        })
        if (!res.ok) throw new Error()
        const d = await res.json()
        cryptoTotal += (c.balance || 0) * Number(d.price_idr || 15500)
      } catch (e) {}
    }

    let forexTotal = 0
    for(const f of (forex || [])) {
      try {
        const base = f.currency_pair?.split('/')[0] || 'USD'
        forexTotal += await convertToIDR(Number(f.balance), base)
      } catch (e) {}
    }

    let stocksTotal = 0
    for(const s of (stocks || [])) {
      try {
        stocksTotal += (s.lots || 0) * 100 * Number(s.average_price || 0) 
      } catch (e) {}
    }

    setFinContext({
      netWorth: bankTotal + cryptoTotal + forexTotal + stocksTotal,
      bankTotal,
      cryptoTotal,
      forexTotal,
      stocksTotal,
      recentTx: (txns || []).map(t => ({ amount: t.amount, category: t.category, date: t.date, type: t.type }))
    })
  }

  useEffect(() => { loadSummary() }, [user])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function resetChat() {
    localStorage.removeItem(CHAT_CACHE_KEY)
    setMessages([INITIAL_MESSAGE])
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ message: input, context: finContext })
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Maaf, server sedang bermasalah. Coba lagi sebentar.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-container" style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Sparkles className="text-purple" /> AI Financial Advisor
          </h1>
          <p className="page-subtitle">Konsultasi strategi keuangan pribadimu</p>
        </div>
        <button
          onClick={resetChat}
          className="btn btn-secondary"
          title="Hapus riwayat percakapan"
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
        >
          <Trash2 size={15} />
          Reset Chat
        </button>
      </div>

      {/* Chat History */}
      <div className="card" style={{ flex: 1, overflowY: 'auto', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 20, padding: 24 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ 
            display: 'flex', 
            gap: 12, 
            flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
            alignItems: 'flex-start'
          }}>
            <div style={{ 
              width: 36, height: 36, borderRadius: '50%', background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-surface)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              border: '1px solid var(--border)'
            }}>
              {m.role === 'user' ? <User size={18} /> : <Bot size={18} className="text-purple" />}
            </div>
            <div style={{ 
              maxWidth: '80%', 
              padding: '12px 16px', 
              borderRadius: 16, 
              background: m.role === 'user' ? 'var(--accent-glow)' : 'var(--bg-surface)',
              border: '1px solid var(--border)',
              fontSize: 14,
              lineHeight: 1.6
            }}>
              <ReactMarkdown 
                components={{
                  p: ({node, ...props}) => <p style={{marginBottom: 8}} {...props}/>,
                  ul: ({node, ...props}) => <ul style={{marginBottom: 8, paddingLeft: 20}} {...props}/>,
                  li: ({node, ...props}) => <li style={{marginBottom: 4}} {...props}/>,
                  table: ({node, ...props}) => <table style={{borderCollapse: 'collapse', width: '100%', marginBottom: 8}} {...props}/>,
                  th: ({node, ...props}) => <th style={{border: '1px solid var(--border)', padding: '4px 8px', textAlign: 'left'}} {...props}/>,
                  td: ({node, ...props}) => <td style={{border: '1px solid var(--border)', padding: '4px 8px'}} {...props}/>,
                }}
              >
                {m.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3 items-center" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            <Loader2 className="animate-spin" size={16} /> FinTrack sedang berpikir...
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={sendMessage} className="flex gap-3">
        <input 
          className="form-input"
          placeholder="Tanya apapun tentang keuanganmu... (misal: 'Berapa persen alokasi kripto saya?')"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
          style={{ height: 48, borderRadius: 12 }}
        />
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ borderRadius: 12, width: 48, padding: 0, justifyContent: 'center' }}>
          <Send size={18} />
        </button>
      </form>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        <AlertCircle size={14} />
        AI Advisor memberikan saran berdasarkan aturan umum. Selalu gunakan pertimbangan pribadimu.
      </div>
    </div>
  )
}
