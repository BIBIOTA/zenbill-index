import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { Merchant, ApiResponse, CreateMerchantInput } from '../types/index.ts'

export function useMerchants() {
  const api = getApiClient()
  return useQuery({
    queryKey: ['merchants'],
    queryFn: () => api.get<ApiResponse<Merchant[]>>('/merchants').then((r) => r.data),
  })
}

export function useCreateMerchant() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMerchantInput) =>
      api.post<ApiResponse<Merchant>>('/merchants', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchants'] }),
  })
}

export function useUpdateMerchant() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<CreateMerchantInput> & { id: string }) =>
      api.put<ApiResponse<Merchant>>(`/merchants/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchants'] }),
  })
}

export function useDeleteMerchant() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiResponse<null>>(`/merchants/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchants'] }),
  })
}
