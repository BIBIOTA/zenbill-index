import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBillingCycle, getPreviousBillingCycle } from '../billingCycle'

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
