import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getBillingCycle,
  getNextPaymentDueDate,
  getPaymentDueDate,
  getPreviousBillingCycle,
} from '../billingCycle'

describe('getBillingCycle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ends on the closing day itself, not the day before', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 10))

    const cycle = getBillingCycle(16)

    expect(cycle.startDate).toBe('2026-08-17')
    expect(cycle.endDate).toBe('2026-09-16')
    expect(cycle.label).toBe('8/17 ~ 9/16')
  })

  it('rolls to the next cycle after the closing day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 22))

    expect(getBillingCycle(16)).toMatchObject({ startDate: '2026-09-17', endDate: '2026-10-16' })
    expect(getPreviousBillingCycle(16)).toMatchObject({ startDate: '2026-08-17', endDate: '2026-09-16' })
  })
})

describe('getPaymentDueDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays in the closing month when the due day comes after the closing day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 10))

    // 結帳 9/16 → 同月 9/25 繳款
    expect(getPaymentDueDate(16, 25)).toBe('2026-09-25')
  })

  it('rolls to the next month when the due day comes before the closing day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 10))

    // 結帳 9/26 → 次月 10/10 繳款
    expect(getPaymentDueDate(26, 10)).toBe('2026-10-10')
  })

  it('follows the viewed cycle offset', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 10))

    expect(getPaymentDueDate(16, 25, -1)).toBe('2026-08-25')
    expect(getPaymentDueDate(16, 25, 1)).toBe('2026-10-25')
  })

  it('clamps to the last day of a short month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 10))

    expect(getPaymentDueDate(20, 3)).toBe('2026-02-03')
    // 結帳 2/1，繳款日 31 在 2 月不存在 → 取 2/28
    expect(getPaymentDueDate(1, 31)).toBe('2026-02-28')
  })
})

describe('getNextPaymentDueDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses this month when the due day has not passed yet', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 10))

    expect(getNextPaymentDueDate(25)).toBe('2026-09-25')
  })

  it('rolls to next month once the due day has passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 26))

    expect(getNextPaymentDueDate(25)).toBe('2026-10-25')
  })
})
