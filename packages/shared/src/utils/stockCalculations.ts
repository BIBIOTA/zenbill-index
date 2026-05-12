import type { Account } from '../types/index.ts'

/** Strip market suffix from stock symbol (e.g. "2330.TW" → "2330", "AAPL" → "AAPL") */
export function getBareStockSymbol(symbol: string): string {
  return symbol.replace(/\.(TW|TWO|US)$/i, '')
}

/** Format stock display label: "2330 台積電", "AAPL Apple Inc." */
export function formatStockLabel(account: Pick<Account, 'stock_symbol' | 'name'>): string {
  const bare = getBareStockSymbol(account.stock_symbol)
  // Avoid "0050 0050" when name was incorrectly set to the symbol
  if (!bare || bare === account.name) return account.name
  return `${bare} ${account.name}`
}

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

export interface StockDailyPerformance {
  pnl: number
  pnlPercent: number
  previousMarketValue: number
}

export interface StockDailySummary extends StockDailyPerformance {
  includedCount: number
}

type DailyStockFields = Pick<
  Account,
  'shares_held' | 'previous_close_price' | 'day_change' | 'day_change_percent'
>

export function calculateStockDailyPerformance(account: DailyStockFields): StockDailyPerformance | null {
  if (
    account.previous_close_price == null ||
    account.day_change == null ||
    account.previous_close_price <= 0 ||
    account.shares_held <= 0
  ) {
    return null
  }

  const previousMarketValue = account.previous_close_price * account.shares_held
  const pnl = account.day_change * account.shares_held
  const pnlPercent = account.day_change_percent ?? (pnl / previousMarketValue) * 100

  return { pnl, pnlPercent, previousMarketValue }
}

export function calculateStockDailySummary(accounts: DailyStockFields[]): StockDailySummary | null {
  let pnl = 0
  let previousMarketValue = 0
  let includedCount = 0

  for (const account of accounts) {
    const daily = calculateStockDailyPerformance(account)
    if (!daily) continue
    pnl += daily.pnl
    previousMarketValue += daily.previousMarketValue
    includedCount += 1
  }

  if (includedCount === 0 || previousMarketValue <= 0) return null

  return {
    pnl,
    pnlPercent: (pnl * 100) / previousMarketValue,
    previousMarketValue,
    includedCount,
  }
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
