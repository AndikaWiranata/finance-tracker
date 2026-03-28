import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const coinParam = (searchParams.get('coin') ?? 'BTC').toUpperCase()
  const coins = coinParam.split(',')
  const isBatch = coins.length > 1

  try {
    // If it's a batch request, use pricemultifull directly
    // For single coin, we can use the same but extract just one
    const res = await fetch(`https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${coinParam}&tsyms=USD,IDR`, {
      next: { revalidate: 60 }
    })

    if (!res.ok) throw new Error(`Crypto API error: ${res.status}`)
    const fullData = await res.json()
    
    if (fullData.Response === 'Error' || !fullData.RAW) {
       return NextResponse.json({ error: fullData.Message || 'Failed to fetch data' }, { status: 400 })
    }

    const results: Record<string, any> = {}
    
    for (const c of coins) {
      if (!fullData.RAW[c]) {
        // Special fallback for stablecoins if missing
        if (['USDT', 'USDC', 'BUSD'].includes(c)) {
          results[c] = { price_usd: 1, price_idr: 15600, change_24h_idr: 0, change_24h_pct: 0, coin: c }
        } else {
          results[c] = { price_usd: 0, price_idr: 0, change_24h_idr: 0, change_24h_pct: 0, coin: c }
        }
        continue
      }

      const raw = fullData.RAW[c].IDR
      const rawUSD = fullData.RAW[c].USD

      results[c] = {
        price_usd: rawUSD.PRICE || 0,
        price_idr: raw.PRICE || 0,
        change_24h_idr: raw.CHANGE24HOUR || 0,
        change_24h_pct: raw.CHANGEPCT24HOUR || 0,
        low_24h_usd: rawUSD.LOW24HOUR || 0,
        high_24h_usd: rawUSD.HIGH24HOUR || 0,
        volume_24h_usd: rawUSD.VOLUME24HOUR || 0,
        market_cap_usd: rawUSD.MKTCAP || 0,
        coin: c,
      }
    }

    return NextResponse.json(isBatch ? results : results[coins[0]])
  } catch (err) {
    console.error('Failed to fetch crypto price:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
