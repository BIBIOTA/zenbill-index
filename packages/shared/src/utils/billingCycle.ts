export interface BillingCycle {
  startDate: string
  endDate: string
  label: string
}

export function getBillingCycle(closingDay: number, offset: number = 0): BillingCycle {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let endYear = today.getFullYear()
  let endMonth = today.getMonth()

  if (today.getDate() > closingDay) {
    endMonth += 1
    if (endMonth > 11) {
      endMonth = 0
      endYear += 1
    }
  }

  endMonth += offset
  while (endMonth > 11) {
    endMonth -= 12
    endYear += 1
  }
  while (endMonth < 0) {
    endMonth += 12
    endYear -= 1
  }

  const endDate = new Date(endYear, endMonth, closingDay)

  let startMonth = endMonth - 1
  let startYear = endYear
  if (startMonth < 0) {
    startMonth = 11
    startYear -= 1
  }
  const startDate = new Date(startYear, startMonth, closingDay + 1)

  // Format from local date parts: toISOString() converts to UTC, which shifts
  // local midnight back one day in UTC+ timezones (e.g. Asia/Taipei).
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const shortFmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`

  return {
    startDate: fmt(startDate),
    endDate: fmt(endDate),
    label: `${shortFmt(startDate)} ~ ${shortFmt(endDate)}`,
  }
}

/**
 * Returns the previous billing cycle relative to the given cycle offset.
 */
export function getPreviousBillingCycle(closingDay: number, offset: number = 0): BillingCycle {
  return getBillingCycle(closingDay, offset - 1)
}

/**
 * 回傳某個帳單週期對應的銀行繳款日（YYYY-MM-DD）。
 *
 * 繳款日若在結帳日之後（含同日）視為同月繳款，否則順延到次月；
 * 例如結帳日 26 / 繳款日 10 → 下個月 10 日。
 * 該月沒有這一天時（例如繳款日 31 遇到 2 月）會自動取當月最後一天。
 */
export function getPaymentDueDate(
  closingDay: number,
  paymentDueDay: number,
  offset: number = 0,
): string {
  const cycle = getBillingCycle(closingDay, offset)
  const [closingYear, closingMonth, closingDate] = cycle.endDate.split('-').map(Number)

  let dueYear = closingYear
  let dueMonth = closingMonth - 1 // 0-based
  if (paymentDueDay < closingDate) {
    dueMonth += 1
    if (dueMonth > 11) {
      dueMonth = 0
      dueYear += 1
    }
  }

  const lastDayOfMonth = new Date(dueYear, dueMonth + 1, 0).getDate()
  const day = Math.min(paymentDueDay, lastDayOfMonth)

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dueYear}-${pad(dueMonth + 1)}-${pad(day)}`
}

/**
 * 沒有結帳日、只知道繳款日時的備援：取「下一次」繳款日。
 * 今天尚未過繳款日就用本月，否則用次月。
 */
export function getNextPaymentDueDate(paymentDueDay: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let year = today.getFullYear()
  let month = today.getMonth()
  if (today.getDate() > paymentDueDay) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }

  const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
  const day = Math.min(paymentDueDay, lastDayOfMonth)

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month + 1)}-${pad(day)}`
}
