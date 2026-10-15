import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import { ApiError } from '../api/client.ts'
import type { Account, AccountBlockReason, ApiResponse, CreateAccountInput, BuyStockInput, SellStockInput, StockSearchResult } from '../types/index.ts'

const typeOrder: Record<string, number> = { CASH: 0, BANK: 1, CRYPTO: 2, STOCK: 3, CREDIT: 4 }

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

export function useArchiveAccount() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiResponse<Account>>(`/accounts/${id}/archive`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useUnarchiveAccount() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiResponse<Account>>(`/accounts/${id}/unarchive`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

/** Extracts the block reasons from a 409 archive / delete error; empty for any other error. */
export function getAccountBlockReasons(err: unknown): AccountBlockReason[] {
  if (!(err instanceof ApiError) || err.code !== 409) return []
  const data = err.data as { reasons?: AccountBlockReason[] } | undefined
  return data?.reasons ?? []
}

export function isAccountArchived(account: { archived_at?: string | null }): boolean {
  return account.archived_at != null
}

/**
 * 「選帳戶」或總覽加總時用：排除已封存帳戶，保留原順序。`keepIds` 內的帳戶即使已封存仍保留
 * （編輯既有交易時，目前選中的帳戶必須還看得到）。舊版 API 沒有 `archived_at` 時視為未封存。
 */
export function selectableAccounts<T extends { id: string; archived_at?: string | null }>(
  accounts: T[],
  keepIds: Array<string | null | undefined> = [],
): T[] {
  const keep = new Set(keepIds.filter((id): id is string => !!id))
  return accounts.filter((a) => !isAccountArchived(a) || keep.has(a.id))
}

export function useRefreshStockPrices() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<ApiResponse<Account[]>>('/accounts/stocks/refresh-prices').then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useBuyStock() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BuyStockInput) =>
      api.post<ApiResponse<Account>>('/accounts/stocks/buy', input).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useSellStock() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SellStockInput) =>
      api.post<ApiResponse<Account>>('/accounts/stocks/sell', input).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useStockSearch(query: string, market: 'TW' | 'US' = 'TW') {
  const api = getApiClient()
  return useQuery({
    queryKey: ['stock-search', query, market],
    queryFn: () =>
      api.get<ApiResponse<StockSearchResult[]>>('/accounts/stocks/search', { params: { q: query, market } })
        .then((r) => r.data),
    enabled: query.length >= 1,
    staleTime: 30_000,
  })
}
