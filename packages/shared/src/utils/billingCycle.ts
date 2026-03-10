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

  const fmt = (d: Date) => d.toISOString().split('T')[0]
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
