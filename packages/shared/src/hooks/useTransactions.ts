import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { Transaction, PaginatedResponse, ApiResponse, CreateTransactionInput } from '../types/index.ts'

export interface TransactionFilters {
  page?: number
  page_size?: number
  type?: string
  account_id?: string
  category_id?: string
  search?: string
  start_date?: string
  end_date?: string
  prev_start_date?: string
  prev_end_date?: string
}

export function useTransactions(filters: TransactionFilters = {}) {
  const api = getApiClient()
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v))
  })
  const qs = params.toString()

  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () =>
      api.get<PaginatedResponse<Transaction>>(`/transactions${qs ? `?${qs}` : ''}`),
  })
}

export function useTransaction(id: string | undefined) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['transactions', id],
    queryFn: () => api.get<ApiResponse<Transaction>>(`/transactions/${id}`),
    enabled: !!id,
    select: (res) => res.data,
  })
}

export function useCreateTransaction() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      api.post<ApiResponse<Transaction>>('/transactions', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

export function useUpdateTransaction() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<CreateTransactionInput> & { id: string }) =>
      api.put<ApiResponse<Transaction>>(`/transactions/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useDeleteTransaction() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiResponse<null>>(`/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useBatchDeferTransactions() {
  const api = getApiClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ transactionIds, deferred }: { transactionIds: string[]; deferred: boolean }) => {
      return api.patch<ApiResponse<{ updated_count: number }>>('/transactions/batch-defer', {
        transaction_ids: transactionIds,
        deferred,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useInfiniteTransactions(filters: Omit<TransactionFilters, 'page'> = {}) {
  const api = getApiClient()

  return useInfiniteQuery({
    queryKey: ['transactions', 'infinite', filters],
    queryFn: ({ pageParam = 1 }) => {
      const params = new URLSearchParams()
      Object.entries({ ...filters, page: pageParam, page_size: filters.page_size ?? 20 }).forEach(
        ([k, v]) => {
          if (v !== undefined && v !== '') params.set(k, String(v))
        }
      )
      const qs = params.toString()
      return api.get<PaginatedResponse<Transaction>>(`/transactions${qs ? `?${qs}` : ''}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, total_pages } = lastPage.pagination
      return page < total_pages ? page + 1 : undefined
    },
  })
}
