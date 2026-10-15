/**
 * 交易頁篩選 ↔ 網址參數 ↔ API query 的轉換（App 與 Web 共用）。
 *
 * 網址參數：`category_id`（UUID 或 `none` 代表未分類）、`type`
 * （EXPENSE/INCOME/TRANSFER）、`month`（`YYYY-MM`）。
 * Web 來源是 `useSearchParams()`（URLSearchParams），App 來源是 expo-router 的
 * `useLocalSearchParams()`（值可能是 `string | string[] | undefined`），兩者都可直接傳入。
 *
 * 月份邊界一律用本地日期組字串，不用 `toISOString()`（會轉 UTC，在 UTC+8 凌晨會偏一天）。
 */
import type { TransactionType } from '../types/index.ts'
import type { TransactionFilters } from '../hooks/useTransactions.ts'
import { formatLocalDate } from './recentTransactions.ts'

/** `category_id=none` 代表「未分類」（category_id IS NULL）。 */
export const UNCATEGORIZED_CATEGORY_ID = 'none'

/** 交易頁可篩選的類型（不含 SETTLEMENT）。 */
export const TRANSACTION_LIST_FILTER_TYPES = ['EXPENSE', 'INCOME', 'TRANSFER'] as const
export type TransactionListFilterType = (typeof TRANSACTION_LIST_FILTER_TYPES)[number] &
  TransactionType

export interface TransactionListFilters {
  /** 分類 UUID，或 `UNCATEGORIZED_CATEGORY_ID`（'none'） */
  categoryId?: string
  type?: TransactionListFilterType
  /** `YYYY-MM` */
  month?: string
}

/**
 * 網址參數形式（key 為 `category_id`/`type`/`month`，值皆為非空字串）。
 * 用 Record 而非 optional 欄位，才能直接給 `new URLSearchParams()`、
 * `setSearchParams()`、`router.push({ params })`。
 */
export type TransactionListUrlParams = Record<string, string>

export type RawSearchParams =
  | Record<string, string | string[] | null | undefined>
  | { get(name: string): string | null }

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

function readParam(params: RawSearchParams, key: string): string | undefined {
  const raw =
    typeof (params as { get?: unknown }).get === 'function'
      ? (params as { get(name: string): string | null }).get(key)
      : (params as Record<string, string | string[] | null | undefined>)[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value !== '' ? value : undefined
}

function isFilterType(v: string): v is TransactionListFilterType {
  return (TRANSACTION_LIST_FILTER_TYPES as readonly string[]).includes(v)
}

export function isValidMonthKey(v: string): boolean {
  return MONTH_RE.test(v)
}

/** 解析網址參數；不合法的 `type`、`month` 會被忽略，陣列取第一個值。 */
export function parseTransactionListFilters(params: RawSearchParams): TransactionListFilters {
  const result: TransactionListFilters = {}
  const categoryId = readParam(params, 'category_id')
  if (categoryId) result.categoryId = categoryId
  const type = readParam(params, 'type')
  if (type && isFilterType(type)) result.type = type
  const month = readParam(params, 'month')
  if (month && isValidMonthKey(month)) result.month = month
  return result
}

/** 篩選 → 網址參數物件（省略空值）。可直接給 `setSearchParams` / `router.push({ params })`。 */
export function transactionListFiltersToParams(
  filters: TransactionListFilters,
): TransactionListUrlParams {
  const params: TransactionListUrlParams = {}
  if (filters.categoryId) params.category_id = filters.categoryId
  if (filters.type) params.type = filters.type
  if (filters.month) params.month = filters.month
  return params
}

/** `YYYY-MM` → 該月 1 日到最後一天（本地日期）；格式不合法回 null。 */
export function monthKeyToDateRange(
  month: string,
): { start_date: string; end_date: string } | null {
  const m = MONTH_RE.exec(month)
  if (!m) return null
  const month2 = m[2]
  const year = Number(m[1])
  const monthNum = Number(month2)
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const lastDay = monthNum === 2 ? (isLeap ? 29 : 28) : [4, 6, 9, 11].includes(monthNum) ? 30 : 31
  return {
    start_date: `${m[1]}-${month2}-01`,
    end_date: `${m[1]}-${month2}-${lastDay}`,
  }
}

/** 篩選 → `useTransactions` / `useInfiniteTransactions` 的 query 參數。 */
export function transactionListFiltersToQuery(filters: TransactionListFilters): TransactionFilters {
  const query: TransactionFilters = {}
  if (filters.categoryId) query.category_id = filters.categoryId
  if (filters.type) query.type = filters.type
  if (filters.month) {
    const range = monthKeyToDateRange(filters.month)
    if (range) {
      query.start_date = range.start_date
      query.end_date = range.end_date
    }
  }
  return query
}

/** 本地時間的 `YYYY-MM`。 */
export function currentMonthKey(now: Date): string {
  return formatLocalDate(now).slice(0, 7)
}
