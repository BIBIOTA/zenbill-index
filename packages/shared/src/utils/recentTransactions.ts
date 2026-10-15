/**
 * 總覽「近 N 天」交易篩選（App 與 Web 共用）。
 *
 * 一律以**本地時區**的日界線切，並用 getFullYear/getMonth/getDate 手動組出
 * `YYYY-MM-DD`。不要用 `toISOString()` —— 它會轉成 UTC，在 UTC+8 的凌晨時段
 * 會讓整個區間少一天。
 */

export interface DateRange {
  /** 起始日（含），格式 YYYY-MM-DD */
  start_date: string
  /** 結束日（含），格式 YYYY-MM-DD */
  end_date: string
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 以本地時區把 Date 格式化成 YYYY-MM-DD。 */
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * 含今天在內的 N 個日曆天區間（days < 1 視為 1）。
 * 例：days = 3 → 前天、昨天、今天。
 */
export function recentDaysRange(now: Date, days: number): DateRange {
  const span = Math.max(1, Math.floor(days))
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Date 建構子會自動處理跨月／跨年／閏年的進位。
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (span - 1))
  return { start_date: formatLocalDate(start), end_date: formatLocalDate(end) }
}

/**
 * 回傳 `occurred_at` 落在「近 days 天（含今天）」的交易，保留原順序。
 * 日期以 `occurred_at.slice(0, 10)` 比對；晚於今天的交易（例如預排的卡費繳款）不算在內。
 */
export function filterRecentTransactions<T extends { occurred_at: string }>(
  transactions: T[],
  now: Date,
  days: number,
): T[] {
  const { start_date, end_date } = recentDaysRange(now, days)
  return transactions.filter((tx) => {
    const day = tx.occurred_at.slice(0, 10)
    return day >= start_date && day <= end_date
  })
}
