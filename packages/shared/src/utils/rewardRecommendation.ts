/**
 * 刷卡建議（`GET /reward-recommendations`）的顯示文字，App 和 Web 共用。
 * 詞彙見 `CONTEXT.md`「刷卡建議」「付款組合」。
 */
import type { RecommendationCombo, RecommendationPlan } from '../types/index.ts'
import { formatRewardMoney } from './rewardProgress.ts'
import { formatRewardRate } from './rewardSummary.ts'
import { cardBaseName } from './spendingCountry.ts'

/** 「CUBE × Apple Pay」；沒有行動支付時是「實體卡」。 */
export function formatComboTitle(combo: RecommendationCombo): string {
  return `${cardBaseName(combo.card_label)} × ${combo.wallet?.name ?? '實體卡'}`
}

/** 有金額：「NT$18・1.5%」（方案幣別和查詢幣別不同時加 ≈）；沒金額：「3.0%」。 */
export function formatComboReward(combo: RecommendationCombo, currency: string | null): string {
  const rate = formatRewardRate(combo.reward_rate)
  if (combo.reward_amount == null || !currency) return rate
  const converted = combo.plans.some((p) => p.currency.toUpperCase() !== currency.toUpperCase())
  return `${formatRewardMoney(combo.reward_amount, currency, { converted })}・${rate}`
}

/** 「Apple Pay、LINE Pay 等同」；沒有收合任何行動支付時 null。 */
export function formatEquivalentWallets(combo: RecommendationCombo): string | null {
  if (combo.equivalent_wallets.length === 0) return null
  return `${combo.equivalent_wallets.map((w) => w.name).join('、')} 等同`
}

/** 方案列的註記，依序：封頂狀態、需手動計入、單筆門檻、剩餘可刷（已封頂時不顯示）。 */
export function recommendationPlanNotes(plan: RecommendationPlan): string[] {
  const notes: string[] = []
  if (plan.status === 'capped') notes.push('已封頂')
  if (plan.status === 'partially_capped') notes.push('部分封頂')
  if (plan.needs_manual_mark) notes.push('需手動計入')
  if (plan.min_single_amount_note != null) {
    notes.push(`需單筆滿 ${formatRewardMoney(plan.min_single_amount_note, plan.currency)}`)
  }
  if (plan.remaining_spend != null && plan.status !== 'capped') {
    notes.push(`剩餘可刷 ${formatRewardMoney(plan.remaining_spend, plan.currency)}`)
  }
  return notes
}

/** 保留順序，把回饋為 0 的組合分出來摺疊。 */
export function splitZeroCombos(combos: RecommendationCombo[]): {
  earning: RecommendationCombo[]
  zero: RecommendationCombo[]
} {
  const isZero = (c: RecommendationCombo) => (c.reward_amount ?? c.reward_rate) <= 0
  return { earning: combos.filter((c) => !isZero(c)), zero: combos.filter(isZero) }
}

/** 海外查詢時的提醒。 */
export const RECOMMENDATION_OVERSEAS_NOTE = '海外交易可能另收國外交易服務費，未計入排名。'
