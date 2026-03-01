import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { Invoice, PaginatedResponse, ApiResponse, InvoiceMatchResult, EInvoiceCredentialStatus } from '../types/index.ts'

export interface InvoiceFilters {
  page?: number
  page_size?: number
  status?: string
  search?: string
  month?: string
}

export function useInvoices(filters: InvoiceFilters = {}) {
  const api = getApiClient()
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v))
  })
  const qs = params.toString()

  return useQuery({
    queryKey: ['invoices', filters],
    queryFn: () =>
      api.get<PaginatedResponse<Invoice>>(`/invoices${qs ? `?${qs}` : ''}`),
  })
}

export function useUpdateInvoiceStatus() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch<ApiResponse<Invoice>>(`/invoices/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

export function useBatchUpdateInvoiceStatus() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      api.patch<ApiResponse<{ updated_count: number }>>('/invoices/batch/status', { ids, status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

export function useSyncStatus() {
  const api = getApiClient()
  return useQuery({
    queryKey: ['einvoice-credential-status'],
    queryFn: () => api.get<ApiResponse<EInvoiceCredentialStatus>>('/einvoice/credentials'),
    select: (res) => res.data,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.sync_status
      return status === 'syncing' ? 3000 : false
    },
  })
}

export function useSyncInvoices() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<ApiResponse<null>>('/invoices/sync', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['einvoice-credential-status'] })
    },
  })
}

export function useMatchInvoice() {
  const api = getApiClient()
  return useMutation({
    mutationFn: (invoiceId: string) =>
      api.post<ApiResponse<InvoiceMatchResult>>(`/invoices/${invoiceId}/match`, {}),
  })
}

export function useBindCredential() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { phone_barcode: string; verify_code: string }) =>
      api.post<ApiResponse<null>>('/einvoice/credentials', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['einvoice-credential-status'] }),
  })
}

export function useUnbindCredential() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete<ApiResponse<null>>('/einvoice/credentials'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['einvoice-credential-status'] }),
  })
}
