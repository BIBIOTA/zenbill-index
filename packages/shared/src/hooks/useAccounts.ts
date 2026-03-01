import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { Account, ApiResponse, CreateAccountInput } from '../types/index.ts'

const typeOrder: Record<string, number> = { CASH: 0, BANK: 1, CRYPTO: 2, CREDIT: 3 }

function sortAccounts(accounts: Account[]): Account[] {
  return accounts.slice().sort((a, b) => {
    const typeA = typeOrder[a.type] ?? 99
    const typeB = typeOrder[b.type] ?? 99
    if (typeA !== typeB) return typeA - typeB
    return a.name.localeCompare(b.name, 'zh-Hant', { collation: 'stroke' })
  })
}

export function useAccounts() {
  const api = getApiClient()
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<ApiResponse<Account[]>>('/accounts').then((r) => r.data),
    select: sortAccounts,
  })
}

export function useAccount(id: string) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['accounts', id],
    queryFn: () => api.get<ApiResponse<Account>>(`/accounts/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCreateAccount() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAccountInput) =>
      api.post<ApiResponse<Account>>('/accounts', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useUpdateAccount() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<CreateAccountInput> & { id: string }) =>
      api.put<ApiResponse<Account>>(`/accounts/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useDeleteAccount() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiResponse<null>>(`/accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}
