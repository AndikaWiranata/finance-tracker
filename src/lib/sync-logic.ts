import { SupabaseClient } from '@supabase/supabase-js'
import { getLocalDateISO } from './date'
import { processRecurringTransactions } from './recurring'
import { syncUserEmails } from './email-sync'

// Shared logic for fetching data that normally lives in API routes
export async function fetchServerRates() {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
    if (!res.ok) throw new Error(`Exchange rate API error: ${res.status}`)
    const data = await res.json()
    const rates: Record<string, number> = { ...data.rates }

    try {
      const [btcRes, ethRes] = await Promise.all([
        fetch('https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD'),
        fetch('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD'),
      ])
      const [btcData, ethData] = await Promise.all([btcRes.json(), ethRes.json()])
      if (btcData?.USD) rates['BTC'] = 1 / btcData.USD
      if (ethData?.USD) rates['ETH'] = 1 / ethData.USD
    } catch (e) {
      console.warn('Crypto enrichment failed in sync-logic', e)
    }
    return rates
  } catch (err) {
    console.error('Failed to fetch rates in sync-logic:', err)
    return { IDR: 15500, EUR: 0.92, GBP: 0.79, JPY: 150.0, USD: 1 }
  }
}

export async function fetchServerCrypto(symbols: string) {
  try {
    const res = await fetch(`https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${symbols}&tsyms=USD,IDR`)
    if (!res.ok) return {}
    const data = await res.json()
    return data.RAW || {}
  } catch { return {} }
}

export async function fetchServerStock(ticker: string) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d`)
    const data = await res.json()
    return data.chart?.result?.[0]?.meta || {}
  } catch { return {} }
}

export async function performUserSync(supabase: SupabaseClient, userId: string) {
  const todayStr = getLocalDateISO()
  
  // 1. Process recurring transactions first
  await processRecurringTransactions(supabase, userId)

  // 1.5 Sync emails
  try {
    await syncUserEmails(supabase, userId)
  } catch (e) {
    console.error('Email sync failed for user', userId, e)
  }

  // 2. Fetch all user data
  const [
    { data: profile },
    { data: accounts },
    { data: cryptoWallets },
    { data: forexAccounts },
    { data: stockPortfolios },
    rates
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('accounts').select('*').eq('user_id', userId),
    supabase.from('crypto_wallets').select('*').eq('user_id', userId),
    supabase.from('forex_accounts').select('*').eq('user_id', userId),
    supabase.from('stock_portfolios').select('*').eq('user_id', userId),
    fetchServerRates()
  ])

  if (!accounts) return { error: 'No accounts found' }

  let totalIdr = 0
  const breakdown: any[] = []

  // Helper convert
  const convertToIDR = (amount: number, from: string) => {
    if (from === 'IDR') return amount
    const usdAmount = from === 'USD' ? amount : (amount / (rates[from] || 1))
    return usdAmount * (rates['IDR'] || 15500)
  }

  // 3. Calculate Balances
  // Fiat
  for (const acc of accounts) {
    if (['crypto', 'forex', 'stock'].includes(acc.type)) continue
    const val = convertToIDR(Number(acc.balance), acc.currency || 'IDR')
    totalIdr += val
    breakdown.push({ type: acc.type, id: acc.id, val })
  }

  // Crypto
  if (cryptoWallets && cryptoWallets.length > 0) {
    const symbols = Array.from(new Set(cryptoWallets.map(w => w.coin_symbol))).join(',')
    const cryptoData = await fetchServerCrypto(symbols)
    
    for (const w of cryptoWallets) {
      let priceIdr = 0
      const raw = cryptoData[w.coin_symbol]?.IDR
      if (raw) {
        priceIdr = raw.PRICE || 0
      } else if (['USDT', 'USDC', 'BUSD'].includes(w.coin_symbol)) {
        priceIdr = rates['IDR'] || 15500
      }
      
      const val = Number(w.balance) * priceIdr
      totalIdr += val
      
      // Add or update breakdown
      const b = breakdown.find(x => x.type === 'crypto')
      if (b) b.val += val
      else breakdown.push({ type: 'crypto', val })
    }
  }

  // Forex
  for (const f of (forexAccounts || [])) {
    const base = f.currency_pair.split('/')[0] || 'USD'
    const val = convertToIDR(Number(f.equity), base.includes('IDR') ? 'USD' : base)
    totalIdr += val
    
    const b = breakdown.find(x => x.type === 'forex')
    if (b) b.val += val
    else breakdown.push({ type: 'forex', val })
  }

  // Stocks
  for (const s of (stockPortfolios || [])) {
    const meta = await fetchServerStock(s.ticker)
    let price = Number(meta.regularMarketPrice || s.average_price || 0)
    const currency = meta.currency || 'IDR'
    
    // Convert stock price to IDR if not already
    const priceIdr = convertToIDR(price, currency)
    
    // Indonesia stocks are in lots (1 lot = 100 shares), US/Others usually units
    const isIndo = s.ticker.toUpperCase().endsWith('.JK')
    const multiplier = isIndo ? 100 : 1
    
    const val = (s.lots || 0) * multiplier * priceIdr
    totalIdr += val

    const b = breakdown.find(x => x.type === 'stock')
    if (b) b.val += val
    else breakdown.push({ type: 'stock', val })
  }

  // 4. Upsert Snapshot
  if (totalIdr > 0) {
    const { error } = await supabase.from('net_worth_snapshots').upsert({
      user_id: userId,
      date: todayStr,
      net_worth: totalIdr,
      metadata: { 
        breakdown: breakdown.map(b => ({ type: b.type, val: b.val })),
        synced_at: new Date().toISOString(),
        automated: true
      }
    }, { onConflict: 'user_id,date' })
    
    if (error) console.error(`Sync error for ${userId}:`, error)
  }

  return { success: true, totalIdr }
}
