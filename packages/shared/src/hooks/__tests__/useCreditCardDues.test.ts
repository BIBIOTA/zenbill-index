import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { creditCardDuesQueryKey } from '../useCreditCardDues'

describe('creditCardDuesQueryKey', () => {
  it('is invalidated by the existing ["accounts"] invalidation', async () => {
    const qc = new QueryClient()
    qc.setQueryData(creditCardDuesQueryKey, { data: [] })
    await qc.invalidateQueries({ queryKey: ['accounts'] })
    expect(qc.getQueryState(creditCardDuesQueryKey)?.isInvalidated).toBe(true)
  })
})
