export type AccountType = 'bank' | 'ewallet' | 'cash' | 'crypto' | 'forex' | 'stock'

export interface Account {
  id: number
  user_id: string
  name: string
  type: AccountType
  currency: string
  balance: number
  created_at: string
  crypto_wallets?: CryptoWallet[]
}

export interface Transaction {
  id: number
  account_id: number
  type: 'income' | 'expense' | 'transfer'
  amount: number
  category: string
  note?: string
  date: string
  created_at: string
  accounts?: { name: string; currency: string }
}

export interface CryptoWallet {
  id: number
  user_id: string
  account_id: number
  wallet_address?: string
  coin_symbol: string
  network?: string
  balance: number
  accounts?: { name: string }
}

export interface StockPortfolio {
  id: number
  user_id: string
  account_id: number
  ticker: string
  lots: number
  average_price: number
  accounts?: { name: string }
}

export interface ForexAccount {
  id: number
  user_id: string
  account_id: number
  currency_pair: string
  balance: number
  equity: number
  accounts?: { name: string }
}
