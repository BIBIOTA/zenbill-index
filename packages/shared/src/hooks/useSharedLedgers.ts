import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type {
  SharedLedger,
  SharedExpense,
  SharedLedgerSummary,
  InviteInfo,
  ApiResponse,
  CreateSharedLedgerInput,
  CreateSharedExpenseInput,
  UpdateSharedLedgerInput,
  SharedExpenseFilters,
  SharedExpenseListResponse,
  SharedExpenseFilterOptions,
} from '../types/index.ts'
import { sharedExpenseFiltersToQuery } from '../utils/sharedExpenseFilters.ts'
import type { PartnerPaymentMethodList } from '../utils/sharedLedgerDisplay.ts'

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

/**
 * The payment-method options this ledger offers, read live from its Google
 * Sheet on every mount.
 *
 * Deliberately uncached: the user maintains this list on the Sheet and expects
 * an edit there to show up the next time they open the form, which is worth
 * more than saving a round-trip on an optional field.
 *
 * The endpoint reports a failed read as an unavailable list rather than an
 * error, so a caller reads `isLoading` for "still fetching" and
 * `data.available` for "there is a list to offer". Retries are off: this field
 * is optional, and a form that keeps waiting on Google is worse than one that
 * quietly gives up on a nicety.
 */
export function useSharedLedgerPaymentMethods(ledgerId: string | undefined) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['shared-ledgers', ledgerId, 'payment-methods'],
    queryFn: () =>
      api
        .get<ApiResponse<PartnerPaymentMethodList>>(`/shared-ledgers/${ledgerId}/payment-methods`)
        .then((r) => r.data),
    enabled: !!ledgerId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    retry: false,
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

/**
 * Query keys for a ledger's expense list. Every list key sits under
 * `['shared-ledgers', id, 'expenses']`, so the existing invalidations on
 * create / delete / settle / sync refresh filtered and infinite lists too.
 * Filters are normalized via `sharedExpenseFiltersToQuery`, so `{}` or a
 * whitespace-only `q` share the unfiltered cache entry.
 */
export const sharedExpenseKeys = {
  all: (ledgerId: string | undefined) => ['shared-ledgers', ledgerId, 'expenses'] as const,
  list: (
    ledgerId: string | undefined,
    page: number,
    pageSize: number,
    filters?: SharedExpenseFilters,
  ) =>
    [
      'shared-ledgers',
      ledgerId,
      'expenses',
      { page, pageSize, filters: sharedExpenseFiltersToQuery(filters) },
    ] as const,
  infinite: (ledgerId: string | undefined, filters: SharedExpenseFilters | undefined, pageSize: number) =>
    [
      'shared-ledgers',
      ledgerId,
      'expenses',
      'infinite',
      { pageSize, filters: sharedExpenseFiltersToQuery(filters) },
    ] as const,
  filterOptions: (ledgerId: string | undefined) =>
    ['shared-ledgers', ledgerId, 'expense-filters'] as const,
}

/** `GET /shared-ledgers/:id/expenses` path with paging and (normalized) filters. */
export function sharedExpensesPath(
  ledgerId: string | undefined,
  page: number,
  pageSize: number,
  filters?: SharedExpenseFilters,
): string {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  for (const [k, v] of Object.entries(sharedExpenseFiltersToQuery(filters))) params.set(k, v)
  return `/shared-ledgers/${ledgerId}/expenses?${params.toString()}`
}

/**
 * One page of a ledger's expenses. `filters` is optional; when any is active the
 * response carries `summary` (count + total over all matches, not just this page).
 */
export function useSharedExpenses(
  ledgerId: string | undefined,
  page = 1,
  pageSize = 20,
  filters?: SharedExpenseFilters,
) {
  const api = getApiClient()
  return useQuery({
    queryKey: sharedExpenseKeys.list(ledgerId, page, pageSize, filters),
    queryFn: () => api.get<SharedExpenseListResponse>(sharedExpensesPath(ledgerId, page, pageSize, filters)),
    enabled: !!ledgerId,
  })
}

/** Infinite-scroll expense list (mirrors `useInfiniteTransactions`). */
export function useInfiniteSharedExpenses(
  ledgerId: string | undefined,
  filters: SharedExpenseFilters | undefined,
  pageSize = 20,
) {
  const api = getApiClient()
  return useInfiniteQuery({
    queryKey: sharedExpenseKeys.infinite(ledgerId, filters, pageSize),
    queryFn: ({ pageParam = 1 }) =>
      api.get<SharedExpenseListResponse>(sharedExpensesPath(ledgerId, pageParam, pageSize, filters)),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, total_pages } = lastPage.pagination
      return page < total_pages ? page + 1 : undefined
    },
    enabled: !!ledgerId,
  })
}

/** Distinct partner payment methods actually used in this ledger (for the filter menu). */
export function useSharedExpenseFilterOptions(ledgerId: string | undefined) {
  const api = getApiClient()
  return useQuery({
    queryKey: sharedExpenseKeys.filterOptions(ledgerId),
    queryFn: () =>
      api
        .get<ApiResponse<SharedExpenseFilterOptions>>(`/shared-ledgers/${ledgerId}/expense-filters`)
        .then((r) => r.data),
    enabled: !!ledgerId,
  })
}

export function useCreateSharedExpense(ledgerId: string) {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSharedExpenseInput) =>
      api.post<ApiResponse<SharedExpense>>(`/shared-ledgers/${ledgerId}/expenses`, input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'expenses'] })
      qc.invalidateQueries({ queryKey: sharedExpenseKeys.filterOptions(ledgerId) })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'summary'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'receivables'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      // 帶入帳帳戶代表同時建立了個人交易；帶發票則代表該發票已標成已處理。
      if (input.payment_account_id) qc.invalidateQueries({ queryKey: ['transactions'] })
      if (input.invoice_id) qc.invalidateQueries({ queryKey: ['invoices'] })
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
      qc.invalidateQueries({ queryKey: sharedExpenseKeys.filterOptions(ledgerId) })
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
      // 從 Sheet 拉回來的列可能帶新的付款方式。
      qc.invalidateQueries({ queryKey: sharedExpenseKeys.filterOptions(ledgerId) })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'summary'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'receivables'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
