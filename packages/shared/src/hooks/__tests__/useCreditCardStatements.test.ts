import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  creditCardStatementInvalidators,
  creditCardStatementKeys,
} from '../useCreditCardStatements'
import { creditCardDuesQueryKey } from '../useCreditCardDues'
import * as shared from '../../index'

describe('creditCardStatementKeys', () => {
  it('nests every key under ["accounts", accountId, "statements"]', () => {
    expect(creditCardStatementKeys.all('a1')).toEqual(['accounts', 'a1', 'statements'])
    expect(creditCardStatementKeys.cycle('a1', '2026-10-16')).toEqual([
      'accounts', 'a1', 'statements', '2026-10-16',
    ])
    expect(creditCardStatementKeys.latestClosed('a1')).toEqual([
      'accounts', 'a1', 'statements', 'latest-closed',
    ])
  })

  it('is refreshed by the existing ["accounts"] invalidation (transaction mutations)', async () => {
    const qc = new QueryClient()
    const keys = [
      creditCardStatementKeys.cycle('a1', '2026-10-16'),
      creditCardStatementKeys.latestClosed('a1'),
    ]
    for (const k of keys) qc.setQueryData(k, { data: null })
    await qc.invalidateQueries({ queryKey: ['accounts'] })
    for (const k of keys) expect(qc.getQueryState(k)?.isInvalidated).toBe(true)
  })
})

describe('creditCardStatementInvalidators.write', () => {
  let qc: QueryClient
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    qc = new QueryClient()
    spy = vi.spyOn(qc, 'invalidateQueries')
  })

  it('invalidates that card’s statements and the dues list', () => {
    creditCardStatementInvalidators.write(qc, 'a1')
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenNthCalledWith(1, { queryKey: ['accounts', 'a1', 'statements'] })
    expect(spy).toHaveBeenNthCalledWith(2, { queryKey: creditCardDuesQueryKey })
  })

  it('marks the card’s cycle + latest-closed queries and dues stale, but not other cards or the account itself', async () => {
    const own = [
      creditCardStatementKeys.cycle('a1', '2026-10-16'),
      creditCardStatementKeys.cycle('a1', '2026-09-16'),
      creditCardStatementKeys.latestClosed('a1'),
      creditCardDuesQueryKey,
    ]
    const untouched = [
      creditCardStatementKeys.cycle('a2', '2026-10-16'),
      ['accounts', 'a1'],
      ['accounts'],
    ]
    for (const k of [...own, ...untouched]) qc.setQueryData(k, { seeded: true })

    creditCardStatementInvalidators.write(qc, 'a1')
    await Promise.all(spy.mock.results.map((r) => r.value))

    for (const k of own) expect(qc.getQueryState(k)?.isInvalidated).toBe(true)
    for (const k of untouched) expect(qc.getQueryState(k)?.isInvalidated).toBe(false)
  })
})

describe('credit card statement exports', () => {
  it('are exported from the package entrypoint', () => {
    expect(typeof shared.useCreditCardStatement).toBe('function')
    expect(typeof shared.useLatestClosedCreditCardStatement).toBe('function')
    expect(typeof shared.useUpsertCreditCardStatement).toBe('function')
    expect(typeof shared.useDeleteCreditCardStatement).toBe('function')
    expect(typeof shared.creditCardPayBlockState).toBe('function')
    expect(typeof shared.isInCreditCardPaymentWindow).toBe('function')
    expect(typeof shared.creditCardPaymentDefaults).toBe('function')
    expect(typeof shared.computeCycleSpending).toBe('function')
  })
})
