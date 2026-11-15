/**
 * 總回饋率（`RewardSummary`）的顯示文案（App 與 Web 共用）。
 * 數字一律來自後端，這裡不重算。詞彙見 `CONTEXT.md`「回饋方案」的總回饋率／淨回饋率。
 */
import type { CurrencySetting, RewardSummaryGroup, RewardSummaryPlan } from '../types/index.ts'
import { formatAmount } from './currencyPrecision.ts'
import { REWARD_EXCLUDES_REFUNDS_NOTE, formatRewardMoney } from './rewardProgress.ts'

/** `spend_basis = qualifying` 時的註記。 */
export const REWARD_SUMMARY_QUALIFYING_NOTE = '僅計入消費'

/** `includes_points` 時的註記。 */
export const REWARD_SUMMARY_INCLUDES_POINTS_NOTE = '含點數，1 點以 1 元計'

/** 0.084973 → `8.5%`；null（消費為 0）→ `—`。 */
export function formatRewardRate(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

/** 主數字：「回饋率 8.5%」（毛回饋率）。 */
export function formatRewardSummaryHeadline(group: RewardSummaryGroup): string {
  return `回饋率 ${formatRewardRate(group.gross_rate)}`
}

/** 「扣手續費後 7.0%」；沒有手續費或無法計算時回傳 null。 */
export function formatRewardSummaryNet(group: RewardSummaryGroup): string | null {
  if (group.fees <= 0 || group.net_rate == null) return null
  return `扣手續費後 ${formatRewardRate(group.net_rate)}`
}

/** 「預估總回饋 ≈NT$272／消費 ≈NT$3,201」；換算過的加「≈」。 */
export function formatRewardSummaryTotals(group: RewardSummaryGroup, settings?: CurrencySetting[]): string {
  const opts = { converted: group.converted, settings }
  return `預估總回饋 ${formatRewardMoney(group.total_reward, group.currency, opts)}／消費 ${formatRewardMoney(group.spend, group.currency, opts)}`
}

/** 該組要顯示的註記：未扣除退款、僅計入消費、含點數（依序）。 */
export function rewardSummaryNotes(group: RewardSummaryGroup, excludesRefunds: boolean): string[] {
  const notes: string[] = []
  if (excludesRefunds) notes.push(REWARD_EXCLUDES_REFUNDS_NOTE)
  if (group.spend_basis === 'qualifying') notes.push(REWARD_SUMMARY_QUALIFYING_NOTE)
  if (group.includes_points) notes.push(REWARD_SUMMARY_INCLUDES_POINTS_NOTE)
  return notes
}

/**
 * 區間標籤：同一年 → `11/20 ~ 11/26`（與帳單週期標籤同格式）；
 * 跨年 → `2026/12/20 ~ 2027/1/5`。
 */
export function formatRewardSummaryRange(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  if (fy !== ty) return `${fy}/${fm}/${fd} ~ ${ty}/${tm}/${td}`
  return `${fm}/${fd} ~ ${tm}/${td}`
}

export interface RewardSummaryPlanLine {
  /** 「熊本熊日本 2.5%：80 元」 */
  label: string
  /** true → 顯示「已封頂」 */
  capped: boolean
}

/** 展開明細的一列：方案名稱與區間內回饋（以方案單位計）。 */
export function formatRewardSummaryPlan(
  plan: RewardSummaryPlan,
  currency: string,
  settings?: CurrencySetting[],
): RewardSummaryPlanLine {
  return {
    label: `${plan.name}：${formatAmount(plan.reward, currency, settings)} ${plan.unit_label}`,
    capped: plan.capped_in_range,
  }
}
