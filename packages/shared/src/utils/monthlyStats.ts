/**
 * 總覽本月統計卡的共用計算（App 與 Web 共用）。只回傳數字，金額格式化由各端處理。
 */
import type { CategorySummary, TransactionStats } from '../types/index.ts'
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

export interface CategorySlice {
  /** 分類 id；未分類為 `null`。合併列也是 `null`，以 `isOther` 區分。 */
  id: string | null
  name: string
  value: number
  /** 佔總額的百分比（0–100），總額為 0 時為 0。 */
  percent: number
  /** 第 `limit` 名之後合併成的「其他」列。 */
  isOther: boolean
  /** 合併列包含的分類數；一般列為 1。 */
  count: number
}

/**
 * 總覽分類圖：依金額由大到小取前 `limit` 個分類，其餘合併成一列「其他」。
 * 只剩一個分類時不合併（直接顯示該分類比「其他 1 類」清楚）。金額 ≤ 0 的分類略過。
 */
export function groupTopCategories(
  categories: CategorySummary[],
  limit = 5,
): CategorySlice[] {
  const sorted = categories.filter((c) => c.total > 0).sort((a, b) => b.total - a.total)
  const sum = sorted.reduce((acc, c) => acc + c.total, 0)
  const pct = (v: number) => (sum > 0 ? (v / sum) * 100 : 0)
  const toSlice = (c: CategorySummary): CategorySlice => ({
    id: c.category_id,
    name: c.category_name,
    value: c.total,
    percent: pct(c.total),
    isOther: false,
    count: 1,
  })

  if (sorted.length <= limit + 1) return sorted.map(toSlice)

  const rest = sorted.slice(limit)
  const restTotal = rest.reduce((acc, c) => acc + c.total, 0)
  return [
    ...sorted.slice(0, limit).map(toSlice),
    { id: null, name: `其他 ${rest.length} 類`, value: restTotal, percent: pct(restTotal), isOther: true, count: rest.length },
  ]
}
