/**
 * 帳戶列表的顯示計算（App 與 Web 共用）。只回傳數字與文字，金額格式化由各端處理。
 */
import { sortCurrencies } from './stockCalculations.ts'

export interface CurrencyBalance {
  currency: string
  amount: number
}

/**
 * 帳戶組小計：餘額依幣別分開加總（不換算），TWD 在前、其餘依代碼排序。
 * 缺幣別的帳戶視為 TWD。
 */
export function sumBalancesByCurrency(
  accounts: { currency: string; balance: number }[],
): CurrencyBalance[] {
  const totals = new Map<string, number>()
  for (const a of accounts) {
    const cur = a.currency || 'TWD'
    totals.set(cur, (totals.get(cur) ?? 0) + a.balance)
  }
  return sortCurrencies([...totals.keys()]).map((currency) => ({ currency, amount: totals.get(currency)! }))
}

/**
 * 信用卡的結帳 / 繳費日說明，例如「每月 26 日結帳 · 次月 10 日繳費」。
 * 繳費日晚於結帳日時是同一個月（當月），否則是下個月（次月）。
 * 只設了其中一個時只顯示那一半；都沒設回傳 `null`。
 */
export function formatCreditCardCycle(
  closingDay: number | null | undefined,
  paymentDueDay: number | null | undefined,
): string | null {
  const parts: string[] = []
  if (closingDay) parts.push(`每月 ${closingDay} 日結帳`)
  if (paymentDueDay) {
    const month = !closingDay ? '每月' : paymentDueDay > closingDay ? '當月' : '次月'
    parts.push(`${month} ${paymentDueDay} 日繳費`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}
