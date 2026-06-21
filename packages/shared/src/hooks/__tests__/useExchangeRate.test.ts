import { describe, expect, it, vi } from 'vitest'
import { buildExchangeRateQuery } from '../useExchangeRate'
import * as shared from '../../index'

/**
 * No renderHook: the @zenbill/shared package has no DOM test infra (see
 * useTpass.test.ts). The hook's testable contract — rate-direction inversion,
 * enabled gating, and failure containment — lives in the exported
 * buildExchangeRateQuery() helper that the hook passes straight to useQuery.
 */
describe('useExchangeRate query builder', () => {
  it('Fetch and normalize rate direction', async () => {
    // API returns "1 USD = 31.5 TWD"; system rate is source/target = USD/TWD = 1/31.5.
    const api = {
      get: vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: { from: 'USD', to: 'TWD', rate: 31.5 } }),
    }
    const query = buildExchangeRateQuery(api as never, 'USD', 'TWD')
    const result = await query.queryFn()
    expect(result).toBeCloseTo(1 / 31.5, 6)
    expect(api.get).toHaveBeenCalledWith('/exchange-rates', { params: { from: 'USD', to: 'TWD' } })
  })

  it('Skip request for incomplete currencies', () => {
    const api = { get: vi.fn() }
    expect(buildExchangeRateQuery(api as never, '', 'TWD').enabled).toBe(false)
    expect(buildExchangeRateQuery(api as never, 'USD', '').enabled).toBe(false)
    expect(buildExchangeRateQuery(api as never, 'USD', 'TWD').enabled).toBe(true)
  })

  it('Rate service failure does not block the form', async () => {
    const api = { get: vi.fn().mockRejectedValue(new Error('network')) }
    const query = buildExchangeRateQuery(api as never, 'USD', 'TWD')
    // retry disabled so a failure settles into react-query's error state (never
    // thrown to the component) and the prefill value stays undefined.
    expect(query.retry).toBe(false)
    await expect(query.queryFn()).rejects.toThrow('network')
  })
})

describe('useExchangeRate is exported from the package entrypoint', () => {
  it('exposes the hook', () => {
    expect(typeof (shared as Record<string, unknown>).useExchangeRate).toBe('function')
  })
})
