/**
 * 回饋方案進度的顯示計算（App 與 Web 共用）：文案、進度條狀態、總覽排序。
 * 數字一律來自後端 `RewardProgress`，這裡不重算計入消費。詞彙見 `CONTEXT.md`「回饋方案」。
 */
import type { CurrencySetting, RewardPeriodType, RewardProgress } from '../types/index.ts'
import { formatAmount } from './currencyPrecision.ts'

/** 進度條達到此比例即顯示警示色（固定 80%，不開放設定）。 */
export const REWARD_WARNING_RATIO = 0.8

/** 回應帶 `excludes_refunds = true` 時顯示的提示。 */
export const REWARD_EXCLUDES_REFUNDS_NOTE = '未扣除退款'

const CURRENCY_SYMBOLS: Record<string, string> = {
  TWD: 'NT$',
  JPY: '¥',
  USD: 'US$',
  KRW: '₩',
  HKD: 'HK$',
  SGD: 'S$',
  THB: '฿',
  VND: '₫',
}

export interface RewardMoneyOptions {
  /** 經過匯率換算 → 前面加「≈」 */
  converted?: boolean
  settings?: CurrencySetting[]
}

/** 例如 `NT$6,250`、`≈NT$6,250`、`¥12,000`；沒有符號的幣別用代碼加空格（`EUR 12.50`）。 */
export function formatRewardMoney(amount: number, currency: string, opts: RewardMoneyOptions = {}): string {
  const code = currency.toUpperCase()
  const symbol = CURRENCY_SYMBOLS[code] ?? `${code} `
  return `${opts.converted ? '≈' : ''}${symbol}${formatAmount(amount, code, opts.settings)}`
}

const money = (p: RewardProgress, amount: number, settings?: CurrencySetting[]) =>
  formatRewardMoney(amount, p.plan.currency, { converted: p.converted, settings })

/** 「剩餘可刷 NT$X」；已封頂或沒有上限時回傳 null。 */
export function formatRemainingSpend(p: RewardProgress, settings?: CurrencySetting[]): string | null {
  if (p.remaining_spend == null || p.capped) return null
  return `剩餘可刷 ${money(p, p.remaining_spend, settings)}`
}

/** 「已封頂，超出 NT$Y」（沒有超出時只顯示「已封頂」）；未封頂回傳 null。 */
export function formatCapExceeded(p: RewardProgress, settings?: CurrencySetting[]): string | null {
  if (!p.capped) return null
  if (p.over_cap_spend <= 0) return '已封頂'
  return `已封頂，超出 ${money(p, p.over_cap_spend, settings)}`
}

/**
 * 方案列的主要數字：未封頂 →「剩餘可刷」、已封頂 →「已封頂，超出」、
 * 沒有上限 →「已計入 NT$X」。
 */
export function formatRewardHeadline(p: RewardProgress, settings?: CurrencySetting[]): string {
  return (
    formatCapExceeded(p, settings) ??
    formatRemainingSpend(p, settings) ??
    `已計入 ${money(p, p.qualifying_spend, settings)}`
  )
}

/** 「預估回饋 A／上限 B 元」（或「點」）；沒有上限時「預估回饋 A 元」。換算過的 A 加「≈」。 */
export function formatEstimatedReward(p: RewardProgress, settings?: CurrencySetting[]): string {
  const { currency, unit_label, cap_amount } = p.plan
  const reward = `${p.converted ? '≈' : ''}${formatAmount(p.estimated_reward, currency, settings)}`
  if (cap_amount == null) return `預估回饋 ${reward} ${unit_label}`
  return `預估回饋 ${reward}／上限 ${formatAmount(cap_amount, currency, settings)} ${unit_label}`
}

function parseDate(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

/**
 * 計算期間標籤：
 * - `billing_cycle` → `10/17 ~ 11/16`（與 `getBillingCycle().label` 同格式）
 * - `calendar_month` → `2026 年 11 月`
 * - `calendar_quarter` → `2026 年第 4 季`
 * - `whole_validity` → `活動期間 2026/9/1 ~ 2026/11/30`
 *
 * 月／季以 `start` 所在的月份判定，所以被有效期間截短的期間仍顯示完整月份或季度。
 */
export function formatRewardPeriodLabel(periodType: RewardPeriodType, start: string, end: string): string {
  const [sy, sm, sd] = parseDate(start)
  const [ey, em, ed] = parseDate(end)
  switch (periodType) {
    case 'calendar_month':
      return `${sy} 年 ${sm} 月`
    case 'calendar_quarter':
      return `${sy} 年第 ${Math.ceil(sm / 3)} 季`
    case 'whole_validity':
      return `活動期間 ${sy}/${sm}/${sd} ~ ${ey}/${em}/${ed}`
    case 'billing_cycle':
    default:
      return `${sm}/${sd} ~ ${em}/${ed}`
  }
}

/** `formatRewardPeriodLabel` 的 RewardProgress 便利版。 */
export function rewardProgressPeriodLabel(p: RewardProgress): string {
  return formatRewardPeriodLabel(p.plan.period_type, p.period_start, p.period_end)
}

/** 「有 N 筆海外交易未判定國家」；0 筆回傳 null。 */
export function formatUnknownCountryHint(count: number): string | null {
  return count > 0 ? `有 ${count} 筆海外交易未判定國家` : null
}

export type RewardProgressBarState = 'normal' | 'warning' | 'capped' | 'uncapped'

/** 進度條狀態：沒有上限 → uncapped；封頂 → capped；usage_ratio ≥ 0.8 → warning；其餘 normal。 */
export function rewardProgressBarState(p: RewardProgress): RewardProgressBarState {
  if (p.spend_cap == null || p.usage_ratio == null) return 'uncapped'
  if (p.capped) return 'capped'
  if (p.usage_ratio >= REWARD_WARNING_RATIO) return 'warning'
  return 'normal'
}

/** 進度條填滿比例，夾在 [0, 1]；沒有上限為 0。 */
export function rewardProgressBarFill(p: RewardProgress): number {
  if (p.usage_ratio == null) return 0
  if (p.capped) return 1
  return Math.min(1, Math.max(0, p.usage_ratio))
}

function overviewRank(p: RewardProgress): number {
  if (p.usage_ratio == null) return 2
  return p.capped ? 0 : 1
}

/**
 * 總覽排序：已封頂 → usage_ratio 由高到低 → 沒有上限排最後。同序維持原順序；不修改輸入。
 * （後端 `GET /reward-progress` 已依此排序；前端合併或篩選後可再套用。）
 */
export function sortRewardOverview<T extends RewardProgress>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const rank = overviewRank(a) - overviewRank(b)
    if (rank !== 0) return rank
    return (b.usage_ratio ?? 0) - (a.usage_ratio ?? 0)
  })
}
