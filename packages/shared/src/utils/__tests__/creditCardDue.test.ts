import { describe, expect, it } from 'vitest'
import { creditCardDueStatus } from '../creditCardDue'

const due = (due_date: string, amount_due: number, amount_paid: number) => ({
  due_date,
  amount_due,
  amount_paid,
})

describe('creditCardDueStatus', () => {
  it('returns 0 days left on the due date itself', () => {
    expect(creditCardDueStatus(due('2026-10-15', 1000, 0), new Date(2026, 9, 15, 12)).daysLeft).toBe(0)
  })

  it('counts calendar days across a month boundary', () => {
    expect(creditCardDueStatus(due('2026-11-03', 1000, 0), new Date(2026, 9, 28, 9)).daysLeft).toBe(6)
  })

  it('counts calendar days across a year boundary', () => {
    expect(creditCardDueStatus(due('2027-01-05', 1000, 0), new Date(2026, 11, 30, 18)).daysLeft).toBe(6)
  })

  it('uses the local date in the early morning, not the UTC date', () => {
    // 00:30 local on 10/15 — in UTC+8 this is still 10/14 in UTC.
    expect(creditCardDueStatus(due('2026-10-20', 1000, 0), new Date(2026, 9, 15, 0, 30)).daysLeft).toBe(5)
    // 23:59 local
    expect(creditCardDueStatus(due('2026-10-20', 1000, 0), new Date(2026, 9, 15, 23, 59)).daysLeft).toBe(5)
  })

  it('returns a negative value once the due date has passed', () => {
    expect(creditCardDueStatus(due('2026-10-14', 1000, 0), new Date(2026, 9, 15)).daysLeft).toBe(-1)
  })

  it('is paid when amount_paid equals amount_due', () => {
    expect(creditCardDueStatus(due('2026-10-20', 1000, 1000), new Date(2026, 9, 15)).isPaid).toBe(true)
  })

  it('is paid when amount_paid exceeds amount_due', () => {
    expect(creditCardDueStatus(due('2026-10-20', 1000, 1500), new Date(2026, 9, 15)).isPaid).toBe(true)
  })

  it('is not paid when only partially paid', () => {
    expect(creditCardDueStatus(due('2026-10-20', 1000, 400), new Date(2026, 9, 15)).isPaid).toBe(false)
  })

  it('treats a zero amount_due as paid', () => {
    expect(creditCardDueStatus(due('2026-10-20', 0, 0), new Date(2026, 9, 15)).isPaid).toBe(true)
  })

  it('treats a negative amount_due (net refund) as paid', () => {
    expect(creditCardDueStatus(due('2026-10-20', -200, 0), new Date(2026, 9, 15)).isPaid).toBe(true)
  })
})
