// TPASS 2.0 悠遊卡「常客回饋」運具級距門檻。
//
// 注意：此處的級距門檻與回饋百分比，與 task 4.2 後端預估回饋計算所採用的
// 級距選擇繫於同一個「待產品確認」(product-confirmable) 的設定。任一處調整
// 時，兩端都需同步更新，否則前端逐列提示與後端核定回饋會不一致。
//
// 帳戶詳情頁 TPASS 區塊的標題「差 N 次」與底部提示文案，
// 直接顯示後端回傳的 remaining_ride_count_to_next_threshold（伺服器端依
// 短途公車主級距計算），前端不重算；下方逐列 hint 則因後端未提供分類別
// 剩餘次數，由前端依本月次數與下列門檻於用戶端計算。

export type TpassTierCategory = 'short_bus' | 'intercity_bus' | 'rail'

interface TpassTier {
  // 進入此級距所需的最低次數（含）。
  threshold: number
  // 此級距對應的回饋百分比。
  rewardPercent: number
}

// 各運具分類由低至高的回饋級距（threshold 須遞增）。
export const TPASS_TIERS: Record<TpassTierCategory, TpassTier[]> = {
  // 短途公車/客運：11 次 → 15%，31 次 → 30%（最高）。
  short_bus: [
    { threshold: 11, rewardPercent: 15 },
    { threshold: 31, rewardPercent: 30 },
  ],
  // 中長途國道：2 次 → 15%，4 次 → 30%（最高）。
  intercity_bus: [
    { threshold: 2, rewardPercent: 15 },
    { threshold: 4, rewardPercent: 30 },
  ],
  // 軌道加碼（臺北捷運 + 臺鐵 + 新北捷運）：11 次 → 2%（最高）。
  rail: [{ threshold: 11, rewardPercent: 2 }],
}

export interface TpassTierHint {
  // 距離下一級距還需的搭乘次數。
  remaining: number
  // 下一級距的回饋百分比。
  nextRewardPercent: number
  // 是否已達該分類最高級距。
  isMax: boolean
  // 給 UI 直接顯示的提示文案（例如「再 3 次達 15%」或「已達 30%」）。
  label: string
}

// 依本月搭乘次數計算逐列「再 N 次達 Z%」提示。
// 已達最高級距時回傳「已達 {maxPercent}%」。
export function getTpassTierHint(
  category: TpassTierCategory,
  currentCount: number,
): TpassTierHint {
  const tiers = TPASS_TIERS[category]
  const maxTier = tiers[tiers.length - 1]

  // 找出尚未達成的下一個級距。
  const nextTier = tiers.find((tier) => currentCount < tier.threshold)

  if (!nextTier) {
    return {
      remaining: 0,
      nextRewardPercent: maxTier.rewardPercent,
      isMax: true,
      label: `已達 ${maxTier.rewardPercent}%`,
    }
  }

  const remaining = nextTier.threshold - currentCount
  return {
    remaining,
    nextRewardPercent: nextTier.rewardPercent,
    isMax: false,
    label: `再 ${remaining} 次達 ${nextTier.rewardPercent}%`,
  }
}
