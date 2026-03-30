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
    
    // Enrich with Crypto (Approximate for free tier API fallback)
    // Bitcoin & Ethereum
    try {
      if (cachedRates) {
        const cRes = await fetch('https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD')
        const cData = await cRes.json()
        if (cData && cData.USD) cachedRates.BTC = 1 / cData.USD
        
        const eRes = await fetch('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD')
        const eData = await eRes.json()
        if (eData && eData.USD) cachedRates.ETH = 1 / eData.USD
      }
    } catch (e) {}

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

/**
 * Converts an amount from one currency to another base currency.
 * If toCurrency is not provided, it defaults to IDR (for backward compatibility during migration)
 */
export async function convertToBase(amount: number, fromCurrency: string, toCurrency: string = 'IDR') {
  if (fromCurrency === toCurrency) return amount
  const rates = await getFiatRates()
  if (!rates) return amount // Fallback

  // Convert fromCurrency to intermediate USD
  const usdAmount = fromCurrency === 'USD' ? amount : (amount / (rates[fromCurrency] || 1))
  
  // Convert intermediate USD to toCurrency
  return usdAmount * (rates[toCurrency] || (toCurrency === 'IDR' ? 15500 : 1))
}

export function formatNumberInput(value: string | number, currency = 'IDR') {
  if (value === undefined || value === null || value === '') return ''
  
  const isIDR = currency === 'IDR'
  const decimalSep = isIDR ? ',' : '.'
  const thousandSep = isIDR ? '.' : ','

  let str = value.toString()
  
  if (typeof value === 'number') {
    str = str.replace('.', decimalSep)
  }

  // 1. Strip thousand separator
  const stripRegex = new RegExp(`\\${thousandSep}`, 'g')
  str = str.replace(/\s/g, '').replace(stripRegex, '')
  
  // 2. Identify decimal part
  const hasDecimal = str.includes(decimalSep)
  let parts = str.split(decimalSep)
  let integerPart = parts[0].replace(/\D/g, '')
  let decimalPart = parts.length > 1 ? parts[1].replace(/\D/g, '') : ''
  
  if (integerPart === '' && hasDecimal) integerPart = '0'

  // Format integer part
  const locale = isIDR ? 'id-ID' : 'en-US'
  let formattedInt = integerPart ? new Intl.NumberFormat(locale).format(BigInt(integerPart)) : ''
  
  if (hasDecimal) {
    return (formattedInt || '0') + decimalSep + decimalPart.substring(0, 8)
  }
  
  return formattedInt
}

export function parseNumberInput(value: string, currency = 'IDR') {
  const isIDR = currency === 'IDR'
  if (isIDR) {
    return value.replace(/\./g, '').replace(',', '.')
  } else {
    return value.replace(/,/g, '')
  }
}

export function formatCurrency(n: number, currency = 'IDR') {
  const locale = currency === 'IDR' ? 'id-ID' : (currency === 'USD' ? 'en-US' : 'en-GB')
  return new Intl.NumberFormat(locale, { 
    style: 'currency', 
    currency, 
    maximumFractionDigits: currency === 'IDR' ? 0 : 2 
  }).format(n)
}

// Keep formatIDR for backward compatibility during refactor
export function formatIDR(n: number) {
  return formatCurrency(n, 'IDR')
}

// Keep convertToIDR for backward compatibility during refactor
export async function convertToIDR(amount: number, fromCurrency: string) {
  return convertToBase(amount, fromCurrency, 'IDR')
}
