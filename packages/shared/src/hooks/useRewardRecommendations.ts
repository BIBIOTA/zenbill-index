import { useQuery } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { ApiResponse, RewardRecommendation, RewardRecommendationParams } from '../types/index.ts'
import { CURRENCY_COUNTRY } from '../utils/spendingCountry.ts'
import { rewardProgressKeys } from './useRewardPlans.ts'

/** `GET /reward-recommendations` 的路徑；有 merchantId 就不送 q，沒有 amount 就不送 currency。 */
export function rewardRecommendationPath(params: RewardRecommendationParams): string {
  const qs = new URLSearchParams()
  if (params.merchantId) qs.set('merchant_id', params.merchantId)
  else if (params.q?.trim()) qs.set('q', params.q.trim())
  if (params.country) qs.set('country', params.country)
  if (params.amount != null) {
    qs.set('amount', String(params.amount))
    if (params.currency) qs.set('currency', params.currency)
  }
  const q = qs.toString()
  return `/reward-recommendations${q ? `?${q}` : ''}`
}

/** 選了商家或輸入了文字才查。 */
export function rewardRecommendationEnabled(params: RewardRecommendationParams): boolean {
  return !!params.merchantId || !!params.q?.trim()
}

const COUNTRY_CURRENCY: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(CURRENCY_COUNTRY).map(([currency, country]) => [country, currency]),
)

/** 查詢頁金額幣別的預設值：國家只對應一個幣別時用它，否則 null（由畫面決定，通常是 TWD）。 */
export function countryDefaultCurrency(country: string | null | undefined): string | null {
  if (!country) return null
  return COUNTRY_CURRENCY[country.toUpperCase()] ?? null
}

/** 刷卡建議：某商家用哪張卡 × 哪個行動支付回饋最好。 */
export function useRewardRecommendations(params: RewardRecommendationParams) {
  const api = getApiClient()
  return useQuery({
    queryKey: rewardProgressKeys.recommendation(params),
    queryFn: () => api.get<ApiResponse<RewardRecommendation>>(rewardRecommendationPath(params)),
    enabled: rewardRecommendationEnabled(params),
    select: (res): RewardRecommendation => res.data,
    placeholderData: (prev) => prev,
  })
}
