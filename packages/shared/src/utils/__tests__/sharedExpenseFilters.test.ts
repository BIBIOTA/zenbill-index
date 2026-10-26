import { describe, expect, it } from 'vitest'
import {
  SHARED_EXPENSE_CATEGORIES,
  SHARED_EXPENSE_CATEGORY_LABELS,
  SHARED_EXPENSE_CATEGORY_OPTIONS,
  hasActiveSharedExpenseFilters,
  parseSharedExpenseFilters,
  sharedExpenseFiltersToQuery,
} from '../sharedExpenseFilters'
import type { SharedExpenseFilters } from '../../types/index'

describe('SHARED_EXPENSE_CATEGORY_LABELS', () => {
  it('covers exactly the 7 backend ExpenseCategory keys', () => {
    expect(Object.keys(SHARED_EXPENSE_CATEGORY_LABELS).sort()).toEqual(
      ['accommodation', 'food', 'other', 'settlement', 'supplies', 'ticket', 'transport'],
    )
  })

  it('keeps the App labels with emoji', () => {
    expect(SHARED_EXPENSE_CATEGORY_LABELS).toEqual({
      food: '🍽️ 餐飲',
      transport: '🚗 交通',
      accommodation: '🏠 住宿',
      ticket: '🎞️ 票券',
      supplies: '🛒 用品',
      settlement: '💰 結算',
      other: '📦 其他',
    })
  })

  it('exposes options in a fixed order with every category once', () => {
    expect(SHARED_EXPENSE_CATEGORY_OPTIONS.map((o) => o.value)).toEqual([...SHARED_EXPENSE_CATEGORIES])
    expect(SHARED_EXPENSE_CATEGORIES).toEqual([
      'food', 'transport', 'accommodation', 'ticket', 'supplies', 'settlement', 'other',
    ])
    for (const o of SHARED_EXPENSE_CATEGORY_OPTIONS) {
      expect(o.label).toBe(SHARED_EXPENSE_CATEGORY_LABELS[o.value])
    }
  })
})

describe('hasActiveSharedExpenseFilters', () => {
  it('is false for no filters', () => {
    expect(hasActiveSharedExpenseFilters({})).toBe(false)
    expect(hasActiveSharedExpenseFilters(undefined)).toBe(false)
  })

  it('is false for empty or whitespace-only q', () => {
    expect(hasActiveSharedExpenseFilters({ q: '' })).toBe(false)
    expect(hasActiveSharedExpenseFilters({ q: '   ' })).toBe(false)
  })

  it('is false for empty-string partner_payment_method', () => {
    expect(hasActiveSharedExpenseFilters({ partner_payment_method: '' })).toBe(false)
  })

  it('is true when any condition is set', () => {
    expect(hasActiveSharedExpenseFilters({ q: ' 拉麵 ' })).toBe(true)
    expect(hasActiveSharedExpenseFilters({ category: 'food' })).toBe(true)
    expect(hasActiveSharedExpenseFilters({ payer: 'partner' })).toBe(true)
    expect(hasActiveSharedExpenseFilters({ partner_payment_method: '玉山卡' })).toBe(true)
  })
})

describe('sharedExpenseFiltersToQuery', () => {
  it('returns an empty record for no filters', () => {
    expect(sharedExpenseFiltersToQuery({})).toEqual({})
    expect(sharedExpenseFiltersToQuery(undefined)).toEqual({})
  })

  it('drops empty and whitespace-only values', () => {
    expect(sharedExpenseFiltersToQuery({ q: '  ', partner_payment_method: '' })).toEqual({})
  })

  it('emits all four params', () => {
    expect(
      sharedExpenseFiltersToQuery({
        q: '拉麵',
        category: 'food',
        payer: 'owner',
        partner_payment_method: '玉山 卡',
      }),
    ).toEqual({ q: '拉麵', category: 'food', payer: 'owner', partner_payment_method: '玉山 卡' })
  })

  it('keeps q as typed (backend trims), so a trailing space mid-typing survives', () => {
    expect(sharedExpenseFiltersToQuery({ q: '拉 ' })).toEqual({ q: '拉 ' })
  })

  it('drops invalid category / payer that slipped in at runtime', () => {
    const bad = { category: 'nope', payer: 'someone' } as unknown as SharedExpenseFilters
    expect(sharedExpenseFiltersToQuery(bad)).toEqual({})
  })

  it('can be fed straight into URLSearchParams', () => {
    const qs = new URLSearchParams(sharedExpenseFiltersToQuery({ q: 'a&b', category: 'ticket' })).toString()
    expect(qs).toBe('q=a%26b&category=ticket')
  })
})

describe('parseSharedExpenseFilters', () => {
  it('parses all four params from a record', () => {
    expect(
      parseSharedExpenseFilters({
        q: '拉麵',
        category: 'food',
        payer: 'partner',
        partner_payment_method: '現金',
      }),
    ).toEqual({ q: '拉麵', category: 'food', payer: 'partner', partner_payment_method: '現金' })
  })

  it('parses from URLSearchParams', () => {
    expect(
      parseSharedExpenseFilters(new URLSearchParams('q=a%26b&payer=owner&page=3')),
    ).toEqual({ q: 'a&b', payer: 'owner' })
  })

  it('takes the first value of an array param (expo-router)', () => {
    expect(parseSharedExpenseFilters({ category: ['transport', 'food'] })).toEqual({
      category: 'transport',
    })
  })

  it('treats empty strings and whitespace-only q as absent', () => {
    expect(
      parseSharedExpenseFilters({ q: '   ', category: '', payer: '', partner_payment_method: '' }),
    ).toEqual({})
  })

  it('drops invalid category and payer without throwing', () => {
    expect(
      parseSharedExpenseFilters({ category: 'FOOD', payer: 'Owner', q: 'x' }),
    ).toEqual({ q: 'x' })
    expect(parseSharedExpenseFilters({ category: 'unknown', payer: 'both' })).toEqual({})
  })

  it('returns an empty object for nothing set', () => {
    expect(parseSharedExpenseFilters({})).toEqual({})
    expect(parseSharedExpenseFilters(new URLSearchParams())).toEqual({})
  })
})

describe('round-trip', () => {
  const cases: SharedExpenseFilters[] = [
    {},
    { q: '拉麵' },
    { category: 'settlement' },
    { payer: 'partner', partner_payment_method: '玉山 Pi 卡' },
    { q: 'a&b=c', category: 'other', payer: 'owner', partner_payment_method: '現金' },
  ]

  it.each(cases)('parse(toQuery(f)) === f for %o', (f) => {
    expect(parseSharedExpenseFilters(sharedExpenseFiltersToQuery(f))).toEqual(f)
  })

  it.each(cases)('survives a URLSearchParams string round-trip for %o', (f) => {
    const qs = new URLSearchParams(sharedExpenseFiltersToQuery(f)).toString()
    expect(parseSharedExpenseFilters(new URLSearchParams(qs))).toEqual(f)
  })

  it('normalizes away empty values', () => {
    expect(
      parseSharedExpenseFilters(sharedExpenseFiltersToQuery({ q: ' ', partner_payment_method: '' })),
    ).toEqual({})
  })
})
