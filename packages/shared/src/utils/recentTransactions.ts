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

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export interface TransactionDayGroup<T> {
  /** `YYYY-MM-DD`（取自 `occurred_at` 前 10 碼）。 */
  date: string
  items: T[]
  /** 當日收入減支出，逐幣別（轉帳不計）；依首次出現順序。 */
  totals: { currency: string; amount: number }[]
}

/**
 * 依日期把交易分組（保留原順序，同一天的交易需相鄰，列表 API 已依日期排序）。
 * 小計為收入 − 支出，轉帳不影響；幣別取 `account.currency`，缺少時視為 TWD。
 */
export function groupTransactionsByDay<
  T extends { occurred_at: string; type: string; amount: number; account?: { currency: string } },
>(transactions: T[]): TransactionDayGroup<T>[] {
  const groups: TransactionDayGroup<T>[] = []
  for (const tx of transactions) {
    const date = tx.occurred_at.slice(0, 10)
    let group = groups[groups.length - 1]
    if (!group || group.date !== date) {
      group = { date, items: [], totals: [] }
      groups.push(group)
    }
    group.items.push(tx)
    const sign = tx.type === 'INCOME' ? 1 : tx.type === 'EXPENSE' ? -1 : 0
    if (sign === 0) continue
    const currency = tx.account?.currency ?? 'TWD'
    const total = group.totals.find((t) => t.currency === currency)
    if (total) total.amount += sign * tx.amount
    else group.totals.push({ currency, amount: sign * tx.amount })
  }
  return groups
}

/** `2026-11-07` → `11/07（六）`；是今天時加上「今天 」前綴。 */
export function formatDayLabel(date: string, now: Date): string {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()]
  const label = `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}（${weekday}）`
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return date === today ? `今天 ${label}` : label
}

/** 總覽頁首日期：`11 月 7 日（六）`。 */
export function formatLongDate(now: Date): string {
  return `${now.getMonth() + 1} 月 ${now.getDate()} 日（${WEEKDAYS[now.getDay()]}）`
}
