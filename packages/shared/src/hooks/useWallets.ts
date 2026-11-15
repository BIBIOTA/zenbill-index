import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { ApiResponse, Wallet, WalletInput } from '../types/index.ts'
import { rewardInvalidators } from './useRewardPlans.ts'

/** 行動支付清單（`GET /wallets`）。 */
export const walletKeys = {
  all: ['wallets'] as const,
}

/** 寫入後要刷新的 query；hook 與測試共用同一份，避免 key 漂移。 */
export const walletInvalidators = {
  /** 新增：還沒有任何交易、帳戶、方案引用它，只刷新清單。 */
  created: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: walletKeys.all })
  },
  /**
   * 改名、刪除：交易內嵌的 `wallet.name`、帳戶的 `default_wallet_id`（刪除時 SET NULL）、
   * 方案的指定／排除行動支付（刪除時 CASCADE）都會變，計入結果也跟著變。
   * 進度與總回饋率都在 `['accounts', ...]` 底下，由 accounts 的前綴比對一併刷新。
   */
  changed: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: walletKeys.all })
    qc.invalidateQueries({ queryKey: ['transactions'] })
    qc.invalidateQueries({ queryKey: ['accounts'] })
    rewardInvalidators.plans(qc)
  },
}

/** 使用者的行動支付，後端已依 `sort_order`、`name` 排序。 */
export function useWallets() {
  const api = getApiClient()
  return useQuery({
    queryKey: walletKeys.all,
    queryFn: () => api.get<ApiResponse<Wallet[]>>('/wallets').then((r) => r.data),
  })
}

/** 新增行動支付；名稱重複時回 409（`ApiError`）。 */
export function useCreateWallet() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: WalletInput) =>
      api.post<ApiResponse<Wallet>>('/wallets', input).then((r) => r.data),
    onSuccess: () => walletInvalidators.created(qc),
  })
}

export interface UpdateWalletVariables extends WalletInput {
  id: string
}

/** 改名；名稱重複時回 409（`ApiError`）。 */
export function useUpdateWallet() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateWalletVariables) =>
      api.put<ApiResponse<Wallet>>(`/wallets/${id}`, input).then((r) => r.data),
    onSuccess: () => walletInvalidators.changed(qc),
  })
}

/** 直接刪除；交易、帳戶上的參照清空，方案條件移除。確認提示由前端顯示（用 `transaction_count`、`plan_count`）。 */
export function useDeleteWallet() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiResponse<null>>(`/wallets/${id}`),
    onSuccess: () => walletInvalidators.changed(qc),
  })
}
