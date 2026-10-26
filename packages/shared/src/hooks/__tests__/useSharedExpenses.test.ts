import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { sharedExpenseKeys, sharedExpensesPath } from '../useSharedLedgers'
import * as shared from '../../index'

describe('sharedExpenseKeys', () => {
  it('nests list and infinite keys under ["shared-ledgers", id, "expenses"]', () => {
    expect(sharedExpenseKeys.list('L1', 1, 20).slice(0, 3)).toEqual(['shared-ledgers', 'L1', 'expenses'])
    expect(sharedExpenseKeys.infinite('L1', { q: 'x' }, 20).slice(0, 3)).toEqual([
      'shared-ledgers', 'L1', 'expenses',
    ])
    expect(sharedExpenseKeys.filterOptions('L1')).toEqual(['shared-ledgers', 'L1', 'expense-filters'])
  })

  it('differs by filters, and normalizes empty filters to the unfiltered key', () => {
    const base = sharedExpenseKeys.list('L1', 1, 20)
    expect(sharedExpenseKeys.list('L1', 1, 20, {})).toEqual(base)
    expect(sharedExpenseKeys.list('L1', 1, 20, { q: '  ' })).toEqual(base)
    expect(sharedExpenseKeys.list('L1', 1, 20, { category: 'food' })).not.toEqual(base)
    expect(sharedExpenseKeys.infinite('L1', { payer: 'owner' }, 20)).not.toEqual(
      sharedExpenseKeys.infinite('L1', { payer: 'partner' }, 20),
    )
  })

  it('is refreshed by the existing ["shared-ledgers", id, "expenses"] invalidation', async () => {
    const qc = new QueryClient()
    const keys = [
      sharedExpenseKeys.list('L1', 1, 10),
      sharedExpenseKeys.list('L1', 2, 20, { category: 'food' }),
      sharedExpenseKeys.infinite('L1', { q: '拉麵' }, 20),
    ]
    const other = sharedExpenseKeys.list('L2', 1, 10)
    for (const k of [...keys, other]) qc.setQueryData(k, { data: [] })
    await qc.invalidateQueries({ queryKey: ['shared-ledgers', 'L1', 'expenses'] })
    for (const k of keys) expect(qc.getQueryState(k)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(other)?.isInvalidated).toBe(false)
  })
})

describe('sharedExpensesPath', () => {
  it('keeps the unfiltered URL unchanged', () => {
    expect(sharedExpensesPath('L1', 1, 20)).toBe('/shared-ledgers/L1/expenses?page=1&page_size=20')
  })

  it('appends encoded filter params and drops empty ones', () => {
    expect(
      sharedExpensesPath('L1', 2, 20, { q: 'a&b', category: 'food', payer: 'partner', partner_payment_method: '' }),
    ).toBe('/shared-ledgers/L1/expenses?page=2&page_size=20&q=a%26b&category=food&payer=partner')
  })
})

describe('package index', () => {
  it('exports the new hooks and helpers', () => {
    for (const name of [
      'useSharedExpenses',
      'useInfiniteSharedExpenses',
      'useSharedExpenseFilterOptions',
      'sharedExpenseKeys',
      'SHARED_EXPENSE_CATEGORY_LABELS',
      'SHARED_EXPENSE_CATEGORY_OPTIONS',
      'hasActiveSharedExpenseFilters',
      'sharedExpenseFiltersToQuery',
      'parseSharedExpenseFilters',
    ]) {
      expect(shared).toHaveProperty(name)
    }
  })
})
