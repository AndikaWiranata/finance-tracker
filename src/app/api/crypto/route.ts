import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const coin = (searchParams.get('coin') ?? 'ETH').toUpperCase()

  try {
    // Special handling for stablecoins to ensure they don't show as $0 if API fails specifically for them
    if (coin === 'USDT' || coin === 'USDC' || coin === 'BUSD') {
      try {
        const res = await fetch(`https://min-api.cryptocompare.com/data/price?fsym=${coin}&tsyms=USD,IDR`)
        const data = await res.json()
        if (data.USD && data.USD > 0) {
          return NextResponse.json({ price_usd: data.USD, price_idr: data.IDR, coin })
        }
      } catch (e) {
        // Fallback to exactly 1 USD if API fails for stablecoins
        return NextResponse.json({ price_usd: 1, price_idr: 15600, coin, note: 'fallback' })
      }
    }

    const res = await fetch(`https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${coin}&tsyms=USD,IDR`, {
      next: { revalidate: 60 }
    })

    if (!res.ok) throw new Error(`Crypto API error: ${res.status}`)
    const fullData = await res.json()
    
    if (fullData.Response === 'Error' || !fullData.RAW || !fullData.RAW[coin]) {
       if (coin === 'USDT') return NextResponse.json({ price_usd: 1, price_idr: 15600, change_24h_idr: 0, change_24h_pct: 0, coin })
       return NextResponse.json({ price_usd: 0, price_idr: 0, change_24h_idr: 0, change_24h_pct: 0, coin, error: fullData.Message })
    }

    const raw = fullData.RAW[coin].IDR
    const rawUSD = fullData.RAW[coin].USD

    return NextResponse.json({
      price_usd: rawUSD.PRICE || 0,
      price_idr: raw.PRICE || 0,
      change_24h_idr: raw.CHANGE24HOUR || 0,
      change_24h_pct: raw.CHANGEPCT24HOUR || 0,
      coin,
    })
  } catch (err) {
    console.error('Failed to fetch crypto price:', err)
    return NextResponse.json({ error: 'Failed to fetch data', price_usd: 0, price_idr: 0, change_24h_idr: 0, change_24h_pct: 0 }, { status: 500 })
  }
}
