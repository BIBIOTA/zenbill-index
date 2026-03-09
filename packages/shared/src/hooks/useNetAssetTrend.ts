import { useQuery } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { ApiResponse, MonthlyNetAsset } from '../types/index.ts'

export function useNetAssetTrend(months = 6) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['net-asset-trend', months],
    queryFn: () =>
      api.get<ApiResponse<MonthlyNetAsset[]>>(`/accounts/net-asset-trend?months=${months}`),
    select: (res) => res.data,
  })
}
