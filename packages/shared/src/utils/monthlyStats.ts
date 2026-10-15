/**
 * 總覽本月統計卡的共用計算（App 與 Web 共用）。只回傳數字，金額格式化由各端處理。
 */
import type { TransactionStats } from '../types/index.ts'
import { sortCurrencies } from './stockCalculations.ts'

/**
 * 本月至今支出相對上月同期的變化百分比，例如 12 代表 +12%。
 * `previous` ≤ 0 時無法比較，回傳 `null`（不顯示百分比）。
 */
export function mtdChangePercent(current: number, previous: number): number | null {
  if (!(previous > 0)) return null
  return ((current - previous) / previous) * 100
}

export interface CurrencyAmount {
  currency: string
  amount: number
}

/**
 * 從 `current_month_other_currencies` 取出指定方向（支出或收入）的外幣金額，
 * 排除金額為 0 的幣別，依 `sortCurrencies` 排序。
 * stats 或欄位缺少（舊版後端）時回傳空陣列。
 */
export function otherCurrencyAmounts(
  stats: TransactionStats | undefined,
  kind: 'expense' | 'income',
): CurrencyAmount[] {
  const byCurrency = new Map<string, number>()
  for (const row of stats?.current_month_other_currencies ?? []) {
    if (row[kind] === 0) continue
    byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row[kind])
  }
  return sortCurrencies([...byCurrency.keys()]).map((currency) => ({
    currency,
    amount: byCurrency.get(currency)!,
  }))
}
