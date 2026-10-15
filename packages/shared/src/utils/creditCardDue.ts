import type { CreditCardDue } from '../types/index.ts'

export interface CreditCardDueStatus {
  /** 距繳款日的日曆天數（本地日期）；繳款日當天為 0，已過繳款日為負數。 */
  daysLeft: number
  /** 已繳 ≥ 應繳；應繳 ≤ 0 時視為已繳清。 */
  isPaid: boolean
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

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
  const [y, m, d] = due.due_date.slice(0, 10).split('-').map(Number)
  const dueDay = new Date(y, m - 1, d)
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  // round 吸收日光節約時間造成的 ±1 小時差。
  const daysLeft = Math.round((dueDay.getTime() - todayDay.getTime()) / MS_PER_DAY)
  const isPaid = due.amount_due <= 0 || due.amount_paid >= due.amount_due
  return { daysLeft, isPaid }
}
