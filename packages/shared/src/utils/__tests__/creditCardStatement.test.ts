import { describe, expect, it } from 'vitest'
import {
  creditCardPayBlockState,
  creditCardPaymentDefaults,
  isInCreditCardPaymentWindow,
} from '../creditCardDue'

const view = (
  over: Partial<{ cycle_end: string; due_date: string; amount_due: number; remaining: number }> = {},
) => ({
  cycle_end: '2026-10-16',
  due_date: '2026-11-01',
  amount_due: 12000,
  remaining: 12000,
  ...over,
})

describe('isInCreditCardPaymentWindow', () => {
  it('is false on the closing day itself', () => {
    expect(isInCreditCardPaymentWindow(view(), new Date(2026, 9, 16, 23, 59))).toBe(false)
  })

  it('is true from the day after closing', () => {
    expect(isInCreditCardPaymentWindow(view(), new Date(2026, 9, 17, 0, 0))).toBe(true)
  })

  it('is true on the due date itself', () => {
    expect(isInCreditCardPaymentWindow(view(), new Date(2026, 10, 1, 23, 59))).toBe(true)
  })

  it('is false the day after the due date', () => {
    expect(isInCreditCardPaymentWindow(view(), new Date(2026, 10, 2))).toBe(false)
  })

  it('uses the local date in the early morning, not the UTC date', () => {
    // 00:30 local on 10/17 — in UTC+8 this is still 10/16 in UTC.
    expect(isInCreditCardPaymentWindow(view(), new Date(2026, 9, 17, 0, 30))).toBe(true)
  })

  it('accepts timestamps after the date part', () => {
    expect(
      isInCreditCardPaymentWindow(
        view({ cycle_end: '2026-10-16T00:00:00Z', due_date: '2026-11-01T00:00:00Z' }),
        new Date(2026, 9, 20),
      ),
    ).toBe(true)
  })
})

describe('creditCardPayBlockState', () => {
  it('is expanded "due" inside the payment window while unpaid', () => {
    expect(creditCardPayBlockState(view(), new Date(2026, 9, 30))).toEqual({
      kind: 'due',
      collapsed: false,
      daysLeft: 2,
    })
  })

  it('stays expanded inside the payment window even once paid', () => {
    expect(creditCardPayBlockState(view({ remaining: 0 }), new Date(2026, 9, 30))).toEqual({
      kind: 'due',
      collapsed: false,
      daysLeft: 2,
    })
  })

  it('collapses to "settled" after the due date when fully paid', () => {
    expect(creditCardPayBlockState(view({ remaining: 0 }), new Date(2026, 10, 5))).toEqual({
      kind: 'settled',
      collapsed: true,
      daysLeft: -4,
    })
  })

  it('treats overpayment (negative remaining) as settled', () => {
    expect(creditCardPayBlockState(view({ remaining: -300 }), new Date(2026, 10, 5)).kind).toBe('settled')
  })

  it('collapses to "nothing-due" outside the window when amount_due <= 0', () => {
    expect(
      creditCardPayBlockState(view({ amount_due: 0, remaining: 0 }), new Date(2026, 10, 5)),
    ).toEqual({ kind: 'nothing-due', collapsed: true, daysLeft: -4 })
    expect(
      creditCardPayBlockState(view({ amount_due: -50, remaining: -50 }), new Date(2026, 10, 5)).kind,
    ).toBe('nothing-due')
  })

  it('stays expanded as "overdue" after the due date while still unpaid', () => {
    expect(creditCardPayBlockState(view({ remaining: 500 }), new Date(2026, 10, 3))).toEqual({
      kind: 'overdue',
      collapsed: false,
      daysLeft: -2,
    })
  })
})

describe('creditCardPaymentDefaults', () => {
  it('pre-fills remaining and the due date', () => {
    expect(creditCardPaymentDefaults(view({ remaining: 4321 }))).toEqual({
      amount: 4321,
      date: '2026-11-01',
    })
  })

  it('leaves the amount empty when nothing remains', () => {
    expect(creditCardPaymentDefaults(view({ remaining: 0 })).amount).toBeNull()
    expect(creditCardPaymentDefaults(view({ remaining: -10 })).amount).toBeNull()
  })

  it('strips any time part from due_date', () => {
    expect(creditCardPaymentDefaults(view({ due_date: '2026-11-01T00:00:00Z' })).date).toBe('2026-11-01')
  })
})
