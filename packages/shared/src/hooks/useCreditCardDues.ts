import { useQuery } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { ApiResponse, CreditCardDue } from '../types/index.ts'

/**
 * 放在 `['accounts', ...]` 底下：既有 mutation invalidate `['accounts']`（前綴比對）時會一併刷新。
 */
export const creditCardDuesQueryKey = ['accounts', 'credit-card-dues'] as const

/** 已結帳、尚未過繳款日的信用卡上期帳單，依繳款日升冪。 */
export function useCreditCardDues() {
  const api = getApiClient()
  return useQuery({
    queryKey: creditCardDuesQueryKey,
    queryFn: () => api.get<ApiResponse<CreditCardDue[]>>('/accounts/credit-card-dues'),
    select: (res) => res.data ?? [],
  })
}
