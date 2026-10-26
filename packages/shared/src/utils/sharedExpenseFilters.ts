/**
 * 共同支出列表的分類名稱與篩選條件 ↔ API query / 網址參數轉換（App 與 Web 共用）。
 *
 * 參數：`q`、`category`、`payer`、`partner_payment_method`。
 * 不合法的 `category` / `payer` 解析時直接丟掉，不丟錯；空字串（以及只有空白的 `q`）
 * 視為沒有條件。`q` 本身不 trim（後端會 trim），讓輸入中的尾端空白不會被吃掉。
 */
import type { SharedExpenseCategory, SharedExpenseFilters } from '../types/index.ts'
import type { RawSearchParams } from './transactionListFilters.ts'

/** 分類固定順序（選單用）。 */
export const SHARED_EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'accommodation',
  'ticket',
  'supplies',
  'settlement',
  'other',
] as const satisfies readonly SharedExpenseCategory[]

export const SHARED_EXPENSE_CATEGORY_LABELS: Record<SharedExpenseCategory, string> = {
  food: '🍽️ 餐飲',
  transport: '🚗 交通',
  accommodation: '🏠 住宿',
  ticket: '🎞️ 票券',
  supplies: '🛒 用品',
  settlement: '💰 結算',
  other: '📦 其他',
}

export const SHARED_EXPENSE_CATEGORY_OPTIONS: ReadonlyArray<{
  value: SharedExpenseCategory
  label: string
}> = SHARED_EXPENSE_CATEGORIES.map((value) => ({
  value,
  label: SHARED_EXPENSE_CATEGORY_LABELS[value],
}))

export const SHARED_EXPENSE_PAYERS = ['owner', 'partner'] as const

/** 網址參數 / API query 形式，值皆為非空字串，可直接給 `URLSearchParams`。 */
export type SharedExpenseFilterParams = Record<string, string>

export function isSharedExpenseCategory(v: unknown): v is SharedExpenseCategory {
  return typeof v === 'string' && (SHARED_EXPENSE_CATEGORIES as readonly string[]).includes(v)
}

function isPayer(v: unknown): v is 'owner' | 'partner' {
  return typeof v === 'string' && (SHARED_EXPENSE_PAYERS as readonly string[]).includes(v)
}

function hasText(v: string | undefined): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

function nonEmpty(v: string | undefined): v is string {
  return typeof v === 'string' && v !== ''
}

/** `q` 去掉前後空白後非空，或任一條件有值。 */
export function hasActiveSharedExpenseFilters(filters: SharedExpenseFilters | undefined): boolean {
  if (!filters) return false
  return (
    hasText(filters.q) ||
    isSharedExpenseCategory(filters.category) ||
    isPayer(filters.payer) ||
    nonEmpty(filters.partner_payment_method)
  )
}

export function sharedExpenseFiltersToQuery(
  filters: SharedExpenseFilters | undefined,
): SharedExpenseFilterParams {
  const out: SharedExpenseFilterParams = {}
  if (!filters) return out
  if (hasText(filters.q)) out.q = filters.q
  if (isSharedExpenseCategory(filters.category)) out.category = filters.category
  if (isPayer(filters.payer)) out.payer = filters.payer
  if (nonEmpty(filters.partner_payment_method)) {
    out.partner_payment_method = filters.partner_payment_method
  }
  return out
}

function readParam(params: RawSearchParams, key: string): string | undefined {
  const raw =
    typeof (params as { get?: unknown }).get === 'function'
      ? (params as { get(name: string): string | null }).get(key)
      : (params as Record<string, string | string[] | null | undefined>)[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * 從網址參數解析篩選條件。Web 傳 `useSearchParams()`，App 傳 `useLocalSearchParams()`。
 * 其他參數（例如 `page`）忽略。
 */
export function parseSharedExpenseFilters(params: RawSearchParams): SharedExpenseFilters {
  const out: SharedExpenseFilters = {}
  const q = readParam(params, 'q')
  if (hasText(q)) out.q = q
  const category = readParam(params, 'category')
  if (isSharedExpenseCategory(category)) out.category = category
  const payer = readParam(params, 'payer')
  if (isPayer(payer)) out.payer = payer
  const method = readParam(params, 'partner_payment_method')
  if (method) out.partner_payment_method = method
  return out
}
