import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { ApiResponse, CurrencySetting, UpdateCurrencySettingsInput } from '../types/index.ts'

export function useCurrencySettings() {
  const api = getApiClient()
  return useQuery({
    queryKey: ['currency-settings'],
    queryFn: () =>
      api.get<ApiResponse<CurrencySetting[]>>('/currency-settings').then((r) => r.data),
  })
}

export function useUpdateCurrencySettings() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateCurrencySettingsInput) =>
      api.put<ApiResponse<CurrencySetting[]>>('/currency-settings', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['currency-settings'] }),
  })
}

/**
 * Returns the multiplier for a given currency code.
 * Returns 1 if no setting exists (no multiplier applied).
 */
export function getMultiplier(
  settings: CurrencySetting[] | undefined,
  currencyCode: string,
): number {
  if (!settings) return 1
  const found = settings.find((s) => s.currency_code === currencyCode)
  return found?.multiplier ?? 1
}
