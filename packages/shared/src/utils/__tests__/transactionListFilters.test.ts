import { describe, expect, it } from 'vitest'
import {
  UNCATEGORIZED_CATEGORY_ID,
  currentMonthKey,
  parseTransactionListFilters,
  transactionListFiltersToParams,
  transactionListFiltersToQuery,
  type TransactionListFilters,
} from '../transactionListFilters'

const UUID = '3f2a1b4c-5d6e-4f70-8192-a3b4c5d6e7f8'

describe('parseTransactionListFilters', () => {
  it('parses all three params', () => {
    expect(
      parseTransactionListFilters({ category_id: UUID, type: 'EXPENSE', month: '2026-10' }),
    ).toEqual({ categoryId: UUID, type: 'EXPENSE', month: '2026-10' })
  })

  it('returns an empty object when nothing is set', () => {
    expect(parseTransactionListFilters({})).toEqual({})
    expect(parseTransactionListFilters({ category_id: '', type: '', month: '' })).toEqual({})
  })

  it('keeps "none" as-is for uncategorized', () => {
    expect(parseTransactionListFilters({ category_id: 'none' })).toEqual({
      categoryId: UNCATEGORIZED_CATEGORY_ID,
    })
    expect(UNCATEGORIZED_CATEGORY_ID).toBe('none')
  })

  it('takes the first element of array params', () => {
    expect(
      parseTransactionListFilters({
        category_id: [UUID, 'other'],
        type: ['INCOME', 'EXPENSE'],
        month: ['2026-02', '2026-03'],
      }),
    ).toEqual({ categoryId: UUID, type: 'INCOME', month: '2026-02' })
  })

  it('ignores invalid type values', () => {
    expect(parseTransactionListFilters({ type: 'expense' })).toEqual({})
    expect(parseTransactionListFilters({ type: 'SETTLEMENT' })).toEqual({})
    expect(parseTransactionListFilters({ type: 'FOO' })).toEqual({})
  })

  it.each(['2026-13', '2026-00', '2026-1', '26-10', '2026-10-01', 'abc', '2026/10'])(
    'ignores invalid month %s',
    (month) => {
      expect(parseTransactionListFilters({ month, type: 'TRANSFER' })).toEqual({ type: 'TRANSFER' })
    },
  )

  it('ignores unrelated params and undefined values', () => {
    expect(
      parseTransactionListFilters({ foo: 'bar', category_id: undefined, type: 'INCOME' }),
    ).toEqual({ type: 'INCOME' })
  })

  it('accepts URLSearchParams', () => {
    const sp = new URLSearchParams('category_id=none&type=EXPENSE&month=2026-10')
    expect(parseTransactionListFilters(sp)).toEqual({
      categoryId: 'none',
      type: 'EXPENSE',
      month: '2026-10',
    })
  })
})

describe('transactionListFiltersToParams', () => {
  it('omits empty values', () => {
    expect(transactionListFiltersToParams({})).toEqual({})
    expect(transactionListFiltersToParams({ categoryId: '', month: undefined })).toEqual({})
  })

  it('maps to URL param names', () => {
    expect(
      transactionListFiltersToParams({ categoryId: 'none', type: 'INCOME', month: '2026-12' }),
    ).toEqual({ category_id: 'none', type: 'INCOME', month: '2026-12' })
  })

  it.each<TransactionListFilters>([
    {},
    { categoryId: UUID },
    { categoryId: 'none', month: '2024-02' },
    { type: 'EXPENSE', month: '2026-10' },
    { categoryId: UUID, type: 'TRANSFER', month: '2025-12' },
  ])('round-trips %o', (filters) => {
    expect(parseTransactionListFilters(transactionListFiltersToParams(filters))).toEqual(filters)
  })

  it('round-trips through URLSearchParams', () => {
    const filters: TransactionListFilters = { categoryId: 'none', type: 'EXPENSE', month: '2026-10' }
    const sp = new URLSearchParams(transactionListFiltersToParams(filters))
    expect(parseTransactionListFilters(sp)).toEqual(filters)
  })
})

describe('transactionListFiltersToQuery', () => {
  it('returns an empty query when no filters', () => {
    expect(transactionListFiltersToQuery({})).toEqual({})
  })

  it('maps category, type and month', () => {
    expect(
      transactionListFiltersToQuery({ categoryId: UUID, type: 'EXPENSE', month: '2026-10' }),
    ).toEqual({
      category_id: UUID,
      type: 'EXPENSE',
      start_date: '2026-10-01',
      end_date: '2026-10-31',
    })
  })

  it('passes "none" through as category_id', () => {
    expect(transactionListFiltersToQuery({ categoryId: 'none' })).toEqual({ category_id: 'none' })
  })

  it.each([
    ['2026-02', '2026-02-01', '2026-02-28'],
    ['2024-02', '2024-02-01', '2024-02-29'],
    ['2000-02', '2000-02-01', '2000-02-29'],
    ['1900-02', '1900-02-01', '1900-02-28'],
    ['2026-12', '2026-12-01', '2026-12-31'],
    ['2026-04', '2026-04-01', '2026-04-30'],
    ['2026-01', '2026-01-01', '2026-01-31'],
  ])('month %s → %s ~ %s', (month, start_date, end_date) => {
    expect(transactionListFiltersToQuery({ month })).toEqual({ start_date, end_date })
  })

  it('ignores an invalid month', () => {
    expect(transactionListFiltersToQuery({ month: '2026-13', type: 'INCOME' })).toEqual({
      type: 'INCOME',
    })
  })
})

describe('currentMonthKey', () => {
  it('formats local year-month', () => {
    expect(currentMonthKey(new Date(2026, 9, 15, 10, 0))).toBe('2026-10')
    expect(currentMonthKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01')
  })

  it('uses local time at month boundaries (not UTC)', () => {
    expect(currentMonthKey(new Date(2026, 10, 1, 0, 30))).toBe('2026-11')
    expect(currentMonthKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12')
  })
})
