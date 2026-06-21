import { useQuery } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { ApiClient } from '../api/client.ts'
import type { ApiResponse } from '../types/index.ts'

interface ExchangeRatePayload {
  from: string
  to: string
  rate: number
}

/**
 * Builds the react-query options for an exchange-rate lookup.
 *
 * The `/exchange-rates` endpoint returns "1 from = rate to". The cross-currency
 * transfer form defines its rate as `source / target` (see crossCurrency.ts),
 * so the value is inverted here to keep both sides consistent. Extracted from
 * the hook so the direction inversion, enabled gating, and failure containment
 * can be unit-tested without DOM infra.
 */
export function buildExchangeRateQuery(api: ApiClient, from: string, to: string) {
  return {
    queryKey: ['exchange-rate', from, to] as const,
    enabled: Boolean(from) && Boolean(to),
    retry: false as const,
    queryFn: async (): Promise<number | undefined> => {
      const res = await api.get<ApiResponse<ExchangeRatePayload>>('/exchange-rates', {
        params: { from, to },
      })
      const apiRate = res.data.rate
      return apiRate > 0 ? 1 / apiRate : undefined
    },
  }
}

/**
 * Fetches a live exchange rate for prefilling the cross-currency transfer form.
 * Returns the rate in `source / target` orientation; the caller may always
 * override it. A failed request settles into the query's error state without
 * throwing, leaving the prefill value undefined.
 */
export function useExchangeRate(from: string, to: string) {
  const api = getApiClient()
  return useQuery(buildExchangeRateQuery(api, from, to))
}
