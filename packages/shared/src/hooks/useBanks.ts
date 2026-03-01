import { useQuery } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { Bank, ApiResponse } from '../types/index.ts'

export function useBanks() {
  const api = getApiClient()
  return useQuery({
    queryKey: ['banks'],
    queryFn: () => api.get<ApiResponse<Bank[]>>('/banks').then((r) => r.data),
  })
}
