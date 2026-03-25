import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ticker = searchParams.get('ticker')

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 })
  }

  try {
    // Try ticker exactly as provided first
    const symbol = ticker; 

    let res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d`)
    let data = await res.json()
    let meta = data.chart?.result?.[0]?.meta || {}
    let price = meta.regularMarketPrice || 0

    // Fallback for IDR stocks if first attempt failed and no dot exists
    if (price === 0 && !symbol.includes('.')) {
      const fallbackSymbol = `${symbol}.JK`
      const fbRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${fallbackSymbol}?interval=1d`)
      const fbData = await fbRes.json()
      const fbMeta = fbData.chart?.result?.[0]?.meta || {}
      if (fbMeta.regularMarketPrice > 0) {
        meta = fbMeta
        price = fbMeta.regularMarketPrice
      }
    }

    const change = meta.regularMarketChange || 0
    const changePct = meta.regularMarketChangePercent || 0

    return NextResponse.json({ 
      price, 
      change, 
      changePct, 
      low: meta.regularMarketDayLow || 0,
      high: meta.regularMarketDayHigh || 0,
      volume: meta.regularMarketVolume || 0,
      symbol: meta.symbol || symbol, 
      currency: meta.currency || 'IDR' 
    })
  } catch (err) {
    console.error('Failed to fetch stock price:', err)
    return NextResponse.json({ error: 'Failed to fetch data', price: 0 }, { status: 500 })
  }
}
