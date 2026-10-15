import { describe, expect, it } from 'vitest'
import type { TransactionStats } from '../../types'
import { mtdChangePercent, otherCurrencyAmounts } from '../monthlyStats'

describe('mtdChangePercent', () => {
  it('returns null when previous is 0', () => {
    expect(mtdChangePercent(1200, 0)).toBeNull()
    expect(mtdChangePercent(0, 0)).toBeNull()
  })

  it('returns null when previous is negative', () => {
    expect(mtdChangePercent(100, -50)).toBeNull()
  })

  it('returns positive growth', () => {
    expect(mtdChangePercent(1120, 1000)).toBeCloseTo(12)
  })

  it('returns negative growth', () => {
    expect(mtdChangePercent(750, 1000)).toBeCloseTo(-25)
    expect(mtdChangePercent(0, 1000)).toBe(-100)
  })

  it('returns 0 when unchanged', () => {
    expect(mtdChangePercent(500, 500)).toBe(0)
  })
})

const stats = (others?: TransactionStats['current_month_other_currencies']): TransactionStats => ({
  monthly: [],
  current_month_categories: [],
  ...(others === undefined ? {} : { current_month_other_currencies: others }),
})

describe('otherCurrencyAmounts', () => {
  it('returns empty list for missing stats or missing field (old backend)', () => {
    expect(otherCurrencyAmounts(undefined, 'expense')).toEqual([])
    expect(otherCurrencyAmounts(stats(), 'income')).toEqual([])
  })

  it('returns empty list for empty array', () => {
    expect(otherCurrencyAmounts(stats([]), 'expense')).toEqual([])
  })

  it('picks the requested side and excludes zero amounts', () => {
    const s = stats([
      { currency: 'USD', expense: 0, income: 50 },
      { currency: 'JPY', expense: 12300, income: 0 },
    ])
    expect(otherCurrencyAmounts(s, 'expense')).toEqual([{ currency: 'JPY', amount: 12300 }])
    expect(otherCurrencyAmounts(s, 'income')).toEqual([{ currency: 'USD', amount: 50 }])
  })

  it('sorts currencies alphabetically (sortCurrencies order)', () => {
    const s = stats([
      { currency: 'USD', expense: 10, income: 0 },
      { currency: 'EUR', expense: 20, income: 0 },
      { currency: 'JPY', expense: 30, income: 0 },
    ])
    expect(otherCurrencyAmounts(s, 'expense').map((x) => x.currency)).toEqual(['EUR', 'JPY', 'USD'])
  })

  it('does not mutate the input array', () => {
    const others = [
      { currency: 'USD', expense: 10, income: 0 },
      { currency: 'EUR', expense: 20, income: 0 },
    ]
    otherCurrencyAmounts(stats(others), 'expense')
    expect(others.map((x) => x.currency)).toEqual(['USD', 'EUR'])
  })
})
