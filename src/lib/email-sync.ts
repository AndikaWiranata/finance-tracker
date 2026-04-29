import { google } from 'googleapis'
import { oauth2Client } from './google-auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { SupabaseClient } from '@supabase/supabase-js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function syncUserEmails(supabase: SupabaseClient, userId: string) {
  // 1. Get tokens from DB
  const { data: integration, error: intError } = await supabase
    .from('email_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'gmail')
    .single()

  if (intError || !integration || !integration.refresh_token) {
    return { error: 'Gmail not connected or refresh token missing' }
  }

  // 2. Setup Google Auth
  oauth2Client.setCredentials({
    access_token: integration.access_token,
    refresh_token: integration.refresh_token,
    expiry_date: Number(integration.expiry_date)
  })

  // Refresh token if needed
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await supabase.from('email_integrations').update({
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date,
        updated_at: new Date().toISOString()
      }).eq('id', integration.id)
    }
  })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  // 3. Fetch recent emails
  // We look for emails from common bank senders or keywords
  const q = `after:${integration.last_sync_at ? Math.floor(new Date(integration.last_sync_at).getTime() / 1000) : Math.floor(Date.now() / 1000 - 86400)} (BCA OR Mandiri OR BNI OR "Dana" OR "Gopay" OR "OVO" OR "Indodax" OR "Stockbit" OR "Bibit")`
  
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: q,
    maxResults: 10
  })

  const messages = res.data.messages || []
  const results = []

  for (const msg of messages) {
    const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id! })
    const body = extractEmailBody(detail.data)
    const snippet = detail.data.snippet || ''

    // 4. Parse with Gemini
    const parsedData = await parseEmailWithAI(body || snippet)

    if (parsedData && parsedData.amount > 0) {
      // 5. Update Database
      const syncRes = await applyTransactionToDB(supabase, userId, parsedData)
      results.push({ id: msg.id, ...parsedData, status: syncRes.success ? 'synced' : 'skipped' })
    }
  }

  // Update last sync time
  await supabase.from('email_integrations').update({
    last_sync_at: new Date().toISOString()
  }).eq('id', integration.id)

  return { success: true, processed: results.length, results }
}

function extractEmailBody(message: any) {
  let body = ''
  if (message.payload.parts) {
    for (const part of message.payload.parts) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        body += Buffer.from(part.body.data, 'base64').toString()
      }
    }
  } else if (message.payload.body.data) {
    body = Buffer.from(message.payload.body.data, 'base64').toString()
  }
  return body
}

async function parseEmailWithAI(text: string) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' })
    const prompt = `
      As a financial data extractor, extract transaction details from this text:
      "${text}"

      Return ONLY a JSON object. No other text.
      JSON structure:
      {
        "amount": number,
        "type": "income" | "expense" | "transfer",
        "category": "Food" | "Transport" | "Shopping" | "Investment" | "Transfer" | "Income" | "Other",
        "account_name_hint": "Bank Name or E-Wallet Name",
        "date": "YYYY-MM-DD",
        "note": "brief description"
      }
      Important: 
      - If text says "M-Transfer Berhasil" or "Debit" it is usually an "expense" or "transfer".
      - If text says "Transfer Masuk" or "Credit" it is an "income".
      - Extract only the numeric amount (e.g., 150000).
      - If no clear transaction is found, return {"amount": 0}.
    `
    const result = await model.generateContent(prompt)
    const response = await result.response
    let jsonStr = response.text().trim()
    
    // Cleaner JSON extraction
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1)
    }

    const parsedData = JSON.parse(jsonStr)
    return parsedData
  } catch (err) {
    console.error('AI Parsing Error:', err)
    return null
  }
}

async function applyTransactionToDB(supabase: SupabaseClient, userId: string, data: any) {
  // Try to find the matching account
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, balance')
    .eq('user_id', userId)

  const account = accounts?.find(a => 
    a.name.toLowerCase().includes(data.account_name_hint?.toLowerCase()) || 
    data.account_name_hint?.toLowerCase().includes(a.name.toLowerCase())
  ) || accounts?.[0] // Fallback to first account if none match

  if (!account) return { success: false, error: 'No account found' }

  // Check if same transaction already exists today (deduplication)
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('amount', data.amount)
    .eq('date', data.date)
    .eq('type', data.type)
    .limit(1)

  if (existing && existing.length > 0) return { success: false, error: 'Duplicate' }

  // 1. Insert Transaction
  const { error: txError } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      account_id: account.id,
      type: data.type,
      amount: data.amount,
      category: data.category,
      note: `(AI Sync) ${data.note}`,
      date: data.date
    })

  if (txError) return { success: false, error: txError }

  // 2. Update Account Balance
  const newBalance = data.type === 'income' 
    ? Number(account.balance) + data.amount 
    : Number(account.balance) - data.amount
  
  await supabase.from('accounts').update({ balance: newBalance }).eq('id', account.id)

  return { success: true }
}
