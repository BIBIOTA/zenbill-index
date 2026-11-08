import { describe, expect, it } from 'vitest'
import { formatCreditCardCycle, sumBalancesByCurrency } from '../accountDisplay'
import { formatStockPriceUpdatedTime } from '../stockCalculations'

describe('sumBalancesByCurrency', () => {
  it('sums per currency with TWD first', () => {
    expect(
      sumBalancesByCurrency([
        { currency: 'JPY', balance: 18200 },
        { currency: 'TWD', balance: 3250 },
        { currency: 'USD', balance: 10 },
        { currency: 'TWD', balance: 750 },
        { currency: '', balance: 1 },
      ]),
    ).toEqual([
      { currency: 'TWD', amount: 4001 },
      { currency: 'JPY', amount: 18200 },
      { currency: 'USD', amount: 10 },
    ])
  })

  it('keeps negative credit balances', () => {
    expect(sumBalancesByCurrency([{ currency: 'TWD', balance: -28280 }, { currency: 'TWD', balance: -6215 }]))
      .toEqual([{ currency: 'TWD', amount: -34495 }])
  })

  it('returns empty for no accounts', () => {
    expect(sumBalancesByCurrency([])).toEqual([])
  })
})

describe('formatCreditCardCycle', () => {
  it('uses 次月 when the due day is not after the closing day', () => {
    expect(formatCreditCardCycle(26, 10)).toBe('每月 26 日結帳 · 次月 10 日繳費')
    expect(formatCreditCardCycle(15, 15)).toBe('每月 15 日結帳 · 次月 15 日繳費')
  })
  it('uses 當月 when the due day is after the closing day', () => {
    expect(formatCreditCardCycle(5, 20)).toBe('每月 5 日結帳 · 當月 20 日繳費')
  })
  it('shows only what is set', () => {
    expect(formatCreditCardCycle(16, null)).toBe('每月 16 日結帳')
    expect(formatCreditCardCycle(null, 3)).toBe('每月 3 日繳費')
    expect(formatCreditCardCycle(null, undefined)).toBeNull()
  })
})

describe('formatStockPriceUpdatedTime', () => {
  const now = new Date(2026, 10, 8, 15, 0)
  it('shows only the time for today', () => {
    expect(formatStockPriceUpdatedTime(new Date(2026, 10, 8, 9, 5).toISOString(), now)).toBe('09:05')
  })
  it('adds the date for other days', () => {
    expect(formatStockPriceUpdatedTime(new Date(2026, 10, 7, 13, 30).toISOString(), now)).toBe('11/7 13:30')
  })
  it('returns null for missing or invalid values', () => {
    expect(formatStockPriceUpdatedTime(null, now)).toBeNull()
    expect(formatStockPriceUpdatedTime('not a date', now)).toBeNull()
  })
})
