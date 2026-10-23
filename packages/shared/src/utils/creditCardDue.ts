import type { CreditCardDue, CreditCardStatementView } from '../types/index.ts'

export interface CreditCardDueStatus {
  /** 距繳款日的日曆天數（本地日期）；繳款日當天為 0，已過繳款日為負數。 */
  daysLeft: number
  /** 已繳 ≥ 應繳；應繳 ≤ 0 時視為已繳清。 */
  isPaid: boolean
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD`（可帶時間）→ 本地午夜。 */
function parseLocalDate(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 從 `today` 的本地日期到 `date` 的日曆天數；`date` 在今天之前為負。 */
function daysBetweenLocal(today: Date, date: string): number {
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  // round 吸收日光節約時間造成的 ±1 小時差。
  return Math.round((parseLocalDate(date).getTime() - todayDay.getTime()) / MS_PER_DAY)
}

/**
 * 總覽「信用卡待繳」每列的狀態（App 與 Web 共用）。
 *
 * 一律用**本地日期**比較：`due_date` 以 `new Date(y, m - 1, d)` 解析成本地午夜，
 * `today` 也截到本地午夜。不要用 `toISOString()` 或 `new Date('YYYY-MM-DD')`
 * （後者會被當成 UTC 午夜），在 UTC+8 凌晨會差一天。
 */
export function creditCardDueStatus(
  due: Pick<CreditCardDue, 'due_date' | 'amount_due' | 'amount_paid'>,
  today: Date,
): CreditCardDueStatus {
  const daysLeft = daysBetweenLocal(today, due.due_date)
  const isPaid = due.amount_due <= 0 || due.amount_paid >= due.amount_due
  return { daysLeft, isPaid }
}

type PayWindowFields = Pick<CreditCardStatementView, 'cycle_end' | 'due_date'>

/**
 * 今天是否在「結帳日次日 ~ 繳款日（含）」之間（本地日期）。
 * 帳戶頁「待繳」區塊在這段期間展開，其餘時間收合成一行。
 */
export function isInCreditCardPaymentWindow(view: PayWindowFields, today: Date): boolean {
  return daysBetweenLocal(today, view.cycle_end) < 0 && daysBetweenLocal(today, view.due_date) >= 0
}

export type CreditCardPayBlockKind = 'due' | 'overdue' | 'settled' | 'nothing-due'

export interface CreditCardPayBlockState {
  kind: CreditCardPayBlockKind
  collapsed: boolean
  daysLeft: number
}

/**
 * 帳戶頁「待繳」區塊的顯示狀態（App 與 Web 共用），輸入是 latest-closed 的 view：
 * - `due`：在繳款期間內 → 展開（不論是否已繳清）。
 * - `overdue`：已過繳款日但 `remaining > 0` → 仍展開，避免把沒繳的錢藏起來。
 * - `settled`：已過繳款日且 `amount_due > 0`、`remaining ≤ 0` → 收合「上期 $amount_due 已繳清」。
 * - `nothing-due`：已過繳款日且 `amount_due ≤ 0` → 收合「下次結帳 M/D」
 *   （日期用 `getBillingCycle(closing_day).endDate`）。
 *
 * `daysLeft` 是距 `due_date` 的日曆天數，同 `creditCardDueStatus`。
 */
export function creditCardPayBlockState(
  view: Pick<CreditCardStatementView, 'cycle_end' | 'due_date' | 'amount_due' | 'remaining'>,
  today: Date,
): CreditCardPayBlockState {
  const daysLeft = daysBetweenLocal(today, view.due_date)
  if (isInCreditCardPaymentWindow(view, today)) {
    return { kind: 'due', collapsed: false, daysLeft }
  }
  if (view.remaining > 0) return { kind: 'overdue', collapsed: false, daysLeft }
  if (view.amount_due > 0) return { kind: 'settled', collapsed: true, daysLeft }
  return { kind: 'nothing-due', collapsed: true, daysLeft }
}

/**
 * 「繳卡費」的預設值：金額＝剩餘未繳（> 0 才帶，否則 null 讓使用者自填），日期＝繳款日。
 * 來源帳戶仍沿用各端既有的 `auto_pay_from_id` 邏輯。
 */
export function creditCardPaymentDefaults(
  view: Pick<CreditCardStatementView, 'due_date' | 'remaining'>,
): { amount: number | null; date: string } {
  return {
    amount: view.remaining > 0 ? view.remaining : null,
    date: view.due_date.slice(0, 10),
  }
}
