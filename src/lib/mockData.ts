import { Account, Transaction, CryptoWallet, ForexAccount, StockPortfolio } from '@/types'

export const mockAccounts: Account[] = [
  { id: 1, user_id: 1, name: 'BCA Utama', type: 'bank', currency: 'IDR', balance: 15500000, created_at: new Date().toISOString() },
  { id: 2, user_id: 1, name: 'GoPay', type: 'ewallet', currency: 'IDR', balance: 450000, created_at: new Date().toISOString() },
  { id: 3, user_id: 1, name: 'Dompet', type: 'cash', currency: 'IDR', balance: 200000, created_at: new Date().toISOString() },
  { id: 4, user_id: 1, name: 'MetaMask (Main)', type: 'crypto', currency: 'USD', balance: 0, created_at: new Date().toISOString() },
  { id: 6, user_id: 1, name: 'Ajaib', type: 'stock', currency: 'IDR', balance: 5000000, created_at: new Date().toISOString() },
]

export const mockTransactions: Transaction[] = [
  { id: 1, account_id: 1, type: 'income', amount: 10000000, category: 'Salary', note: 'Gaji Bulanan', date: new Date().toISOString(), created_at: new Date().toISOString(), accounts: { name: 'BCA Utama', currency: 'IDR' } },
  { id: 2, account_id: 1, type: 'expense', amount: 350000, category: 'Food', note: 'Makan Malam All You Can Eat', date: new Date().toISOString(), created_at: new Date().toISOString(), accounts: { name: 'BCA Utama', currency: 'IDR' } },
  { id: 3, account_id: 2, type: 'expense', amount: 50000, category: 'Transport', note: 'Gojek ke Kantor', date: new Date().toISOString(), created_at: new Date().toISOString(), accounts: { name: 'GoPay', currency: 'IDR' } },
]

export const mockCryptoWallets: CryptoWallet[] = [
  { id: 1, user_id: 1, account_id: 4, coin_symbol: 'ETH', balance: 1.5, accounts: { name: 'MetaMask (Main)' } as any }
]

export const mockForexAccounts: ForexAccount[] = [
  { id: 1, user_id: 1, account_id: 5, currency_pair: 'USD/IDR', balance: 1000, equity: 1050, accounts: { name: 'Exness' } as any }
]

export const mockStockPortfolios: StockPortfolio[] = [
  { id: 1, user_id: 1, account_id: 6, ticker: 'BBCA', lots: 10, average_price: 9000, accounts: { name: 'Ajaib' } as any }
]
