import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      next: { revalidate: 3600 }
    })
    if (!res.ok) throw new Error(`Exchange rate API error: ${res.status}`)
    const data = await res.json()

    const rates: Record<string, number> = { ...data.rates }

    // Enrich with BTC & ETH prices
    try {
      const [btcRes, ethRes] = await Promise.all([
        fetch('https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD', { next: { revalidate: 60 } }),
        fetch('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD', { next: { revalidate: 60 } }),
      ])
      const [btcData, ethData] = await Promise.all([btcRes.json(), ethRes.json()])
      if (btcData?.USD) rates['BTC'] = 1 / btcData.USD
      if (ethData?.USD) rates['ETH'] = 1 / ethData.USD
    } catch {
      // Crypto enrichment is optional, ignore errors
    }

    return NextResponse.json(rates)
  } catch (err) {
    console.error('Failed to fetch fiat rates:', err)
    // Return static fallback rates
    return NextResponse.json({
      IDR: 15500,
      EUR: 0.92,
      GBP: 0.79,
      JPY: 150.0,
      USD: 1,
      SGD: 1.35,
      MYR: 4.7,
      AUD: 1.55,
    })
  }
}
