import type { Account } from '../types/index.ts'

export interface StockPnL {
  pnl: number
  pnlPercent: number
}

export function calculateStockPnL(account: Pick<Account, 'last_price' | 'avg_cost_price' | 'shares_held'>): StockPnL {
  const pnl = (account.last_price - account.avg_cost_price) * account.shares_held
  const pnlPercent = account.avg_cost_price > 0
    ? ((account.last_price - account.avg_cost_price) / account.avg_cost_price) * 100
    : 0
  return { pnl, pnlPercent }
}

export interface AssetSummaryEntry {
  assets: number
  liabilities: number
}

export function calculateAssetSummary(accounts: Account[]): Record<string, AssetSummaryEntry> {
  return accounts
    .filter(a => a.type !== 'STOCK')
    .reduce<Record<string, AssetSummaryEntry>>((acc, a) => {
      const cur = a.currency || 'TWD'
      acc[cur] ??= { assets: 0, liabilities: 0 }
      if (a.type === 'CREDIT') {
        if (a.balance < 0) {
          acc[cur].liabilities += -a.balance
        } else {
          acc[cur].assets += a.balance
        }
      } else {
        acc[cur].assets += a.balance
      }
      return acc
    }, {})
}

export function sortCurrencies(currencies: string[]): string[] {
  return currencies.sort((a, b) => {
    if (a === 'TWD') return -1
    if (b === 'TWD') return 1
    return a.localeCompare(b)
  })
}
