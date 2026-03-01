import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type {
  SharedLedger,
  SharedExpense,
  SharedLedgerSummary,
  InviteInfo,
  ApiResponse,
  PaginatedResponse,
  CreateSharedLedgerInput,
  CreateSharedExpenseInput,
  UpdateSharedLedgerInput,
} from '../types/index.ts'

// === Ledger CRUD ===

export function useSharedLedgers() {
  const api = getApiClient()
  return useQuery({
    queryKey: ['shared-ledgers'],
    queryFn: () =>
      api.get<ApiResponse<SharedLedger[]>>('/shared-ledgers').then((r) => r.data),
  })
}

export function useSharedLedger(id: string | undefined) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['shared-ledgers', id],
    queryFn: () =>
      api.get<ApiResponse<SharedLedger>>(`/shared-ledgers/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCreateSharedLedger() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSharedLedgerInput) =>
      api.post<ApiResponse<SharedLedger>>('/shared-ledgers', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useDeleteSharedLedger() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<ApiResponse<null>>(`/shared-ledgers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useUpdateSharedLedger(id: string) {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateSharedLedgerInput) =>
      api.put<ApiResponse<SharedLedger>>(`/shared-ledgers/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers', id] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers'] })
    },
  })
}

export function useUpdateAliases(ledgerId: string) {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { owner_aliases: string[]; partner_aliases: string[] }) =>
      api.put<ApiResponse<SharedLedger>>(`/shared-ledgers/${ledgerId}/aliases`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers'] })
    },
  })
}

// === Invite ===

export function useInviteInfo(token: string | undefined) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['shared-ledgers', 'invite', token],
    queryFn: () =>
      api.get<ApiResponse<InviteInfo>>(`/shared-ledgers/invite/${token}`).then((r) => r.data),
    enabled: !!token,
  })
}

export function useAcceptInvite() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (token: string) =>
      api.post<ApiResponse<SharedLedger>>(`/shared-ledgers/invite/${token}/accept`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers'] })
    },
  })
}

export function useRegenerateInvite() {
  const api = getApiClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiResponse<{ invite_token: string }>>(`/shared-ledgers/${id}/invite`, {}),
  })
}

// === Expenses ===

export function useSharedExpenses(ledgerId: string | undefined, page = 1, pageSize = 20) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['shared-ledgers', ledgerId, 'expenses', { page, pageSize }],
    queryFn: () =>
      api.get<PaginatedResponse<SharedExpense>>(
        `/shared-ledgers/${ledgerId}/expenses?page=${page}&page_size=${pageSize}`,
      ),
    enabled: !!ledgerId,
  })
}

export function useCreateSharedExpense(ledgerId: string) {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSharedExpenseInput) =>
      api.post<ApiResponse<SharedExpense>>(`/shared-ledgers/${ledgerId}/expenses`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'expenses'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'summary'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'receivables'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useDeleteSharedExpense(ledgerId: string) {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (expenseId: string) =>
      api.delete<ApiResponse<null>>(`/shared-ledgers/${ledgerId}/expenses/${expenseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'expenses'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'summary'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'receivables'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

// === Receivables ===

export function useReceivables(ledgerId: string | undefined) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['shared-ledgers', ledgerId, 'receivables'],
    queryFn: () =>
      api.get<ApiResponse<SharedExpense[]>>(`/shared-ledgers/${ledgerId}/receivables`).then((r) => r.data),
    enabled: !!ledgerId,
  })
}

export function useSettleReceivable(ledgerId: string) {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ expenseId, receive_account_id }: { expenseId: string; receive_account_id?: string }) =>
      api.post<ApiResponse<null>>(`/shared-ledgers/${ledgerId}/receivables/${expenseId}/settle`, {
        ...(receive_account_id ? { receive_account_id } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'receivables'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'expenses'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'summary'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useSettleAllReceivables(ledgerId: string) {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ receive_account_id }: { receive_account_id?: string }) =>
      api.post<ApiResponse<{ settled_count: number; total_amount: number }>>(
        `/shared-ledgers/${ledgerId}/receivables/settle-all`,
        { ...(receive_account_id ? { receive_account_id } : {}) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'receivables'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'expenses'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'summary'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

// === Summary ===

export function useSharedLedgerSummary(ledgerId: string | undefined) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['shared-ledgers', ledgerId, 'summary'],
    queryFn: () =>
      api.get<ApiResponse<SharedLedgerSummary>>(`/shared-ledgers/${ledgerId}/summary`).then((r) => r.data),
    enabled: !!ledgerId,
  })
}

// === Sync ===

export function useSyncSheet(ledgerId: string) {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<ApiResponse<{ pushed: number; pulled: number }>>(`/shared-ledgers/${ledgerId}/sync`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'expenses'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'summary'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'receivables'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
