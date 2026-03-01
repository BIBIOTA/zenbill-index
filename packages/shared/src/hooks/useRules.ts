import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { MerchantRule, ApiResponse, CreateMerchantRuleInput } from '../types/index.ts'

export function useRules() {
  const api = getApiClient()
  return useQuery({
    queryKey: ['rules'],
    queryFn: () => api.get<ApiResponse<MerchantRule[]>>('/merchant-rules').then((r) => r.data),
  })
}

export function useCreateRule() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMerchantRuleInput) =>
      api.post<ApiResponse<MerchantRule>>('/merchant-rules', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  })
}

export function useUpdateRule() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<CreateMerchantRuleInput> & { id: string }) =>
      api.put<ApiResponse<MerchantRule>>(`/merchant-rules/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  })
}

export function useDeleteRule() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiResponse<null>>(`/merchant-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  })
}
