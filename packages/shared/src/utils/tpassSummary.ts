/**
 * TPASS 卡片詳細的官方月彙總：五種運具的列與合計（App 與 Web 共用）。
 */
import type { TpassMonthlySummary } from '../types/index.ts'

type ModeKey = 'short_bus' | 'intercity_bus' | 'taipei_metro' | 'tra' | 'new_taipei_metro'

const MODES: { key: ModeKey; label: string }[] = [
  { key: 'short_bus', label: '短途公車' },
  { key: 'intercity_bus', label: '中長途國道' },
  { key: 'taipei_metro', label: '臺北捷運' },
  { key: 'tra', label: '臺鐵' },
  { key: 'new_taipei_metro', label: '新北捷運' },
]

export interface TpassModeRow {
  key: ModeKey
  label: string
  count: number
  amount: number
  reward: number
  green: number
}

export interface TpassMonthBreakdown {
  rows: TpassModeRow[]
  /** Σ 各運具官方回饋。 */
  rewardSum: number
  /** Σ 各運具綠色運輸加碼。 */
  greenSum: number
  /** 官方回饋總計（`official_total_reward_amount`），顯示一律以它為準。 */
  officialTotal: number
  /** rewardSum + greenSum 是否等於官方總計。 */
  matches: boolean
}

export function tpassMonthBreakdown(summary: TpassMonthlySummary): TpassMonthBreakdown {
  const rows = MODES.map(({ key, label }) => ({
    key,
    label,
    count: summary[`${key}_count`],
    amount: summary[`${key}_amount`],
    reward: summary[`${key}_official_reward`],
    green: summary[`${key}_green_reward`],
  }))
  const rewardSum = rows.reduce((n, r) => n + r.reward, 0)
  const greenSum = rows.reduce((n, r) => n + r.green, 0)
  const officialTotal = summary.official_total_reward_amount
  return { rows, rewardSum, greenSum, officialTotal, matches: rewardSum + greenSum === officialTotal }
}
