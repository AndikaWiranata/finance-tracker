let cachedRates: Record<string, number> | null = null
let lastFetch = 0

export async function getFiatRates() {
  const now = Date.now()
  // Cache for 1 hour
  if (cachedRates && (now - lastFetch < 3600000)) {
    return cachedRates
  }

  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
    if (!res.ok) throw new Error('Failed to fetch fiat rates')
    const data = await res.json()
    cachedRates = data.rates
    lastFetch = now
    return cachedRates
  } catch (error) {
    console.error('Fiat rate error:', error)
    // Fallback static rates for MVP if offline or rate limited
    return {
      IDR: 15500,
      EUR: 0.92,
      GBP: 0.79,
      JPY: 150.0,
      USD: 1
    }
  }
}

export async function convertToIDR(amount: number, fromCurrency: string) {
  if (fromCurrency === 'IDR') return amount
  const rates = await getFiatRates()
  if (!rates) return amount // Fallback

  const usdAmount = fromCurrency === 'USD' ? amount : (amount / (rates[fromCurrency] || 1))
  return usdAmount * (rates['IDR'] || 15500)
}

export function formatNumberInput(value: string | number) {
  if (value === undefined || value === null || value === '') return ''
  
  let str = value.toString()
  
  // If it's a number, it's a JS float where '.' is the decimal separator.
  // We need to convert it to a comma to match our IDR-style input logic.
  if (typeof value === 'number') {
    str = str.replace('.', ',')
  }

  // 1. Strip thousand separator dots
  str = str.replace(/\s/g, '').replace(/\./g, '')
  
  // 2. Identify decimal part (using comma for IDR style)
  const hasDecimal = str.includes(',')
  let parts = str.split(',')
  let integerPart = parts[0].replace(/\D/g, '')
  let decimalPart = parts.length > 1 ? parts[1].replace(/\D/g, '') : ''
  
  // Maintain leading zeros for values like "0,001"
  if (integerPart === '' && hasDecimal) integerPart = '0'

  // Format integer part with dots
  let formattedInt = integerPart ? new Intl.NumberFormat('id-ID').format(BigInt(integerPart)) : ''
  
  // If user just typed the separator, show it
  if (hasDecimal) {
    return (formattedInt || '0') + ',' + decimalPart.substring(0, 8)
  }
  
  return formattedInt
}

export function parseNumberInput(value: string) {
  return value.replace(/\./g, '').replace(',', '.')
}
export function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}
