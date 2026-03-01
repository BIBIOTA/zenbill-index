import { useQuery } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { ApiResponse, TransactionStats } from '../types/index.ts'

export function useTransactionStats(months = 6) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['transaction-stats', months],
    queryFn: () =>
      api.get<ApiResponse<TransactionStats>>(`/transactions/stats?months=${months}`),
    select: (res) => res.data,
  })
}
