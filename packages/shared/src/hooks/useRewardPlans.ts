import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type {
  ApiResponse,
  RewardPlan,
  RewardPlanInput,
  RewardPlanProgressDetail,
  RewardProgress,
  RewardSummaryParams,
} from '../types/index.ts'

/** 方案定義（`GET /reward-plans`、`GET /reward-plans/:id`）。 */
export const rewardPlanKeys = {
  all: ['reward-plans'] as const,
  list: ['reward-plans', 'list'] as const,
  detail: (planId: string) => ['reward-plans', 'detail', planId] as const,
}

/**
 * 進度全部放在 `['accounts', 'reward-progress', ...]` 底下：
 * 交易 mutation 既有的 `['accounts']` invalidate（前綴比對）會一併刷新計入消費，
 * 不必在每個交易 hook 另外列舉（同 `creditCardStatementKeys` 的做法）。
 */
export const rewardProgressKeys = {
  all: ['accounts', 'reward-progress'] as const,
  overview: ['accounts', 'reward-progress', 'overview'] as const,
  plan: (planId: string, offset: number) =>
    ['accounts', 'reward-progress', 'plan', planId, offset] as const,
  account: (accountId: string, offset: number) =>
    ['accounts', 'reward-progress', 'account', accountId, offset] as const,
  /** 總回饋率；params 先正規化（去掉 undefined，`from`/`to` 優先於 `period`），同一查詢只有一個 key。 */
  summary: (accountId: string, params: RewardSummaryParams) =>
    ['accounts', 'reward-progress', 'summary', accountId, normalizeRewardSummaryParams(params)] as const,
}

/** 送 `period` 或 `from`+`to` 擇一（有 `from`/`to` 就不送 `period`），省略 undefined。 */
export function normalizeRewardSummaryParams(params: RewardSummaryParams): RewardSummaryParams {
  const out: RewardSummaryParams = {}
  if (params.from || params.to) {
    if (params.from) out.from = params.from
    if (params.to) out.to = params.to
  } else if (params.period) {
    out.period = params.period
  }
  if (params.scope) out.scope = params.scope
  return out
}

/** 寫入後要刷新的 query；hook 與測試共用同一份，避免 key 漂移。 */
export const rewardInvalidators = {
  /** 方案新增／修改／刪除／複製：方案清單與明細，加上所有進度。 */
  plans: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: rewardPlanKeys.all })
    qc.invalidateQueries({ queryKey: rewardProgressKeys.all })
  },
  /** 手動標記、商家預設國家等只影響計算結果的寫入：所有進度。 */
  progress: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: rewardProgressKeys.all })
  },
}

/** 使用者的所有回饋方案（含已過期）。 */
export function useRewardPlans() {
  const api = getApiClient()
  return useQuery({
    queryKey: rewardPlanKeys.list,
    queryFn: () => api.get<ApiResponse<RewardPlan[]>>('/reward-plans'),
    select: (res) => res.data,
  })
}

/** 單一方案；`planId` 為空時不發 request。 */
export function useRewardPlan(planId: string | undefined) {
  const api = getApiClient()
  return useQuery({
    queryKey: rewardPlanKeys.detail(planId ?? ''),
    queryFn: () => api.get<ApiResponse<RewardPlan>>(`/reward-plans/${planId}`),
    enabled: !!planId,
    select: (res) => res.data,
  })
}

export function useCreateRewardPlan() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RewardPlanInput) =>
      api.post<ApiResponse<RewardPlan>>('/reward-plans', input).then((r) => r.data),
    onSuccess: () => rewardInvalidators.plans(qc),
  })
}

export interface UpdateRewardPlanVariables {
  id: string
  input: RewardPlanInput
}

/** `PUT` 整條方案（關聯的帳戶、商家名單一併取代）。 */
export function useUpdateRewardPlan() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: UpdateRewardPlanVariables) =>
      api.put<ApiResponse<RewardPlan>>(`/reward-plans/${id}`, input).then((r) => r.data),
    onSuccess: () => rewardInvalidators.plans(qc),
  })
}

export function useDeleteRewardPlan() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiResponse<null>>(`/reward-plans/${id}`),
    onSuccess: () => rewardInvalidators.plans(qc),
  })
}

/** 複製整條方案，後端在名稱加「（複製）」；回傳新方案。 */
export function useDuplicateRewardPlan() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiResponse<RewardPlan>>(`/reward-plans/${id}/duplicate`).then((r) => r.data),
    onSuccess: () => rewardInvalidators.plans(qc),
  })
}

/** 一條方案在某期（0 = 目前，-1 = 上一期…）的進度與計入／不計入明細。 */
export function useRewardPlanProgress(planId: string | undefined, offset: number = 0) {
  const api = getApiClient()
  return useQuery({
    queryKey: rewardProgressKeys.plan(planId ?? '', offset),
    queryFn: () =>
      api.get<ApiResponse<RewardPlanProgressDetail>>(
        `/reward-plans/${planId}/progress?offset=${offset}`,
      ),
    enabled: !!planId,
    select: (res) => res.data,
  })
}

/** 帳戶所屬的所有有效方案在某期的進度（不含明細）；帳戶頁「回饋進度」區塊用。 */
export function useAccountRewardProgress(accountId: string | undefined, offset: number = 0) {
  const api = getApiClient()
  return useQuery({
    queryKey: rewardProgressKeys.account(accountId ?? '', offset),
    queryFn: () =>
      api.get<ApiResponse<RewardProgress[]>>(
        `/accounts/${accountId}/reward-progress?offset=${offset}`,
      ),
    enabled: !!accountId,
    select: (res) => res.data,
  })
}

/** 總覽：所有有效方案目前這一期的進度，後端已依「已封頂 → usage_ratio 高到低 → 無上限」排序。 */
export function useRewardOverview() {
  const api = getApiClient()
  return useQuery({
    queryKey: rewardProgressKeys.overview,
    queryFn: () => api.get<ApiResponse<RewardProgress[]>>('/reward-progress'),
    select: (res) => res.data,
  })
}

export interface RewardPlanMarkVariables {
  planId: string
  transactionId: string
}

const markPath = ({ planId, transactionId }: RewardPlanMarkVariables) =>
  `/reward-plans/${planId}/marks/${transactionId}`

/** 手動標記一筆交易「計入」或「不計入」此方案（優先於條件比對）。 */
export function useSetRewardPlanMark() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ included, ...vars }: RewardPlanMarkVariables & { included: boolean }) =>
      api.put<ApiResponse<null>>(markPath(vars), { included }),
    onSuccess: () => rewardInvalidators.progress(qc),
  })
}

/** 清除手動標記，回到依條件比對（或 manual 模式的不計入）。 */
export function useClearRewardPlanMark() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: RewardPlanMarkVariables) => api.delete<ApiResponse<null>>(markPath(vars)),
    onSuccess: () => rewardInvalidators.progress(qc),
  })
}
