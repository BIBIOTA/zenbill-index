import { useQuery } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { ApiResponse, RewardSummary, RewardSummaryParams } from '../types/index.ts'
import { normalizeRewardSummaryParams, rewardProgressKeys } from './useRewardPlans.ts'

/** `GET /accounts/:id/reward-summary` 的路徑與 query string（`from`→`to`→`period`→`scope` 的固定順序）。 */
export function rewardSummaryPath(accountId: string, params: RewardSummaryParams): string {
  const p = normalizeRewardSummaryParams(params)
  const qs = new URLSearchParams()
  for (const k of ['from', 'to', 'period', 'scope'] as const) {
    const v = p[k]
    if (v) qs.set(k, v)
  }
  const q = qs.toString()
  return `/accounts/${accountId}/reward-summary${q ? `?${q}` : ''}`
}

/** 有 accountId 才查；自訂區間要起訖日都選好才查。 */
export function rewardSummaryEnabled(accountId: string | undefined, params: RewardSummaryParams): boolean {
  if (!accountId) return false
  if (params.from || params.to) return !!params.from && !!params.to
  return true
}

/**
 * 同一張卡在一段日期內的總回饋率。帳戶沒有任何方案時 data 為 `null`（UI 不顯示）。
 * key 在 `rewardProgressKeys` 底下，交易／方案／標記／商家的既有 invalidation 會一併刷新。
 */
export function useAccountRewardSummary(accountId: string | undefined, params: RewardSummaryParams = {}) {
  const api = getApiClient()
  return useQuery({
    queryKey: rewardProgressKeys.summary(accountId ?? '', params),
    queryFn: () => api.get<ApiResponse<RewardSummary | null>>(rewardSummaryPath(accountId ?? '', params)),
    enabled: rewardSummaryEnabled(accountId, params),
    select: (res): RewardSummary | null => res.data ?? null,
  })
}
