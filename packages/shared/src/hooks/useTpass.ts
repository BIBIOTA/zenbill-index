import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type {
  ApiResponse,
  TpassCredentialStatus,
  SetTpassCredentialsInput,
  TpassSyncResult,
  TpassCardListItem,
  TpassCardDetail,
  TpassMonthlySummary,
  TpassSummaryFilter,
  TpassAccountSection,
  LinkTpassCardAccountInput,
} from '../types/index.ts'

// Query key factory. Keeping these centralized makes the mutation
// invalidations below obviously consistent with the queries.
export const tpassKeys = {
  all: ['tpass'] as const,
  status: () => ['tpass', 'status'] as const,
  cards: () => ['tpass', 'cards'] as const,
  card: (id: string) => ['tpass', 'card', id] as const,
  summaries: (filter: TpassSummaryFilter) => ['tpass', 'summaries', filter] as const,
}

// Mutation invalidation helpers. Each mutation's onSuccess body lives here so
// both the hook AND its tests exercise the exact same invalidation code path —
// a drift in any key fails the corresponding test. Keys must match tpassKeys.
export const tpassInvalidators = {
  setCredentials: (qc: QueryClient) =>
    qc.invalidateQueries({ queryKey: tpassKeys.status() }),
  deleteCredentials: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: tpassKeys.status() })
    qc.invalidateQueries({ queryKey: tpassKeys.cards() })
  },
  sync: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: tpassKeys.all })
    qc.invalidateQueries({ queryKey: ['accounts'] })
  },
  linkAccount: (qc: QueryClient, cardId: string) => {
    qc.invalidateQueries({ queryKey: tpassKeys.cards() })
    qc.invalidateQueries({ queryKey: tpassKeys.card(cardId) })
    qc.invalidateQueries({ queryKey: ['accounts'] })
  },
}

// GET /tpass/status. Polls while a sync is in progress (mirrors useSyncStatus).
export function useTpassStatus() {
  const api = getApiClient()
  return useQuery({
    queryKey: tpassKeys.status(),
    queryFn: () => api.get<ApiResponse<TpassCredentialStatus>>('/tpass/status'),
    select: (res) => res.data,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.sync_status
      return status === 'syncing' ? 3000 : false
    },
  })
}

// PUT /tpass/credentials — set or update query credentials.
export function useSetTpassCredentials() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SetTpassCredentialsInput) =>
      api.put<ApiResponse<null>>('/tpass/credentials', input),
    onSuccess: () => tpassInvalidators.setCredentials(qc),
  })
}

// DELETE /tpass/credentials — unbind credentials (synced cards are preserved).
export function useDeleteTpassCredentials() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete<ApiResponse<null>>('/tpass/credentials'),
    onSuccess: () => tpassInvalidators.deleteCredentials(qc),
  })
}

// POST /tpass/sync — trigger a manual sync. Invalidates all tpass data plus
// accounts (the credit-account TPASS section reflects the new data).
export function useSyncTpass() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<ApiResponse<TpassSyncResult>>('/tpass/sync', {}),
    onSuccess: () => tpassInvalidators.sync(qc),
  })
}

// GET /tpass/cards — list cards (masked numbers only).
export function useTpassCards() {
  const api = getApiClient()
  return useQuery({
    queryKey: tpassKeys.cards(),
    queryFn: () =>
      api.get<ApiResponse<TpassCardListItem[]>>('/tpass/cards').then((r) => r.data),
  })
}

// GET /tpass/cards/:id — single-card detail (includes full card number).
export function useTpassCard(id: string) {
  const api = getApiClient()
  return useQuery({
    queryKey: tpassKeys.card(id),
    queryFn: () =>
      api.get<ApiResponse<TpassCardDetail>>(`/tpass/cards/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

// PUT /tpass/cards/:id/linked-account — link/unlink a card to a credit account.
// Invalidates tpass cards + this card detail, and accounts (incl. the
// account TPASS section) since linkage changes account-side data too.
export function useLinkTpassCardAccount() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, linked_account_id }: { id: string } & LinkTpassCardAccountInput) =>
      api.put<ApiResponse<null>>(`/tpass/cards/${id}/linked-account`, { linked_account_id }),
    onSuccess: (_data, variables) => tpassInvalidators.linkAccount(qc, variables.id),
  })
}

// GET /tpass/summaries — monthly reward summaries (filter by card/year/month).
export function useTpassSummaries(filter: TpassSummaryFilter = {}) {
  const api = getApiClient()
  const params: Record<string, string> = {}
  if (filter.card_id) params.card_id = filter.card_id
  if (filter.year !== undefined) params.year = String(filter.year)
  if (filter.month !== undefined) params.month = String(filter.month)

  return useQuery({
    queryKey: tpassKeys.summaries(filter),
    queryFn: () =>
      api
        .get<ApiResponse<TpassMonthlySummary[]>>('/tpass/summaries', { params })
        .then((r) => r.data),
  })
}

// GET /accounts/:id/tpass — the TPASS section for a credit account.
// Keyed under ['accounts', id, 'tpass'] so it is naturally invalidated by
// the broader ['accounts'] invalidations from sync/link mutations.
export function useAccountTpass(accountId: string) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['accounts', accountId, 'tpass'],
    queryFn: () =>
      api
        .get<ApiResponse<TpassAccountSection>>(`/accounts/${accountId}/tpass`)
        .then((r) => r.data),
    enabled: !!accountId,
  })
}
