import { describe, expect, it } from 'vitest'
import { bestRailSystemCount, getTpassTierHint } from '../tpassTier'

describe('getTpassTierHint', () => {
  describe('short_bus', () => {
    it('回傳距離 15% 級距還需的次數（8 次）', () => {
      const hint = getTpassTierHint('short_bus', 8)
      expect(hint.label).toBe('再 3 次達 15%')
      expect(hint.remaining).toBe(3)
      expect(hint.isMax).toBe(false)
    })

    it('已進入 15% 級距時提示下一個 30% 級距（11 次）', () => {
      const hint = getTpassTierHint('short_bus', 11)
      expect(hint.label).toBe('再 20 次達 30%')
      expect(hint.remaining).toBe(20)
    })

    it('達最高 30% 級距（31 次）', () => {
      const hint = getTpassTierHint('short_bus', 31)
      expect(hint.label).toBe('已達 30%')
      expect(hint.isMax).toBe(true)
      expect(hint.remaining).toBe(0)
    })
  })

  describe('intercity_bus', () => {
    it('距離 15% 級距還需 1 次（1 次）', () => {
      const hint = getTpassTierHint('intercity_bus', 1)
      expect(hint.label).toBe('再 1 次達 15%')
    })

    it('0 次時提示再 2 次達 15%', () => {
      expect(getTpassTierHint('intercity_bus', 0).label).toBe('再 2 次達 15%')
    })

    it('達最高 30% 級距（4 次）', () => {
      expect(getTpassTierHint('intercity_bus', 4).label).toBe('已達 30%')
    })
  })

  describe('rail', () => {
    it('距離 2% 級距還需 1 次（10 次）', () => {
      const hint = getTpassTierHint('rail', 10)
      expect(hint.label).toBe('再 1 次達 2%')
    })

    it('達最高 2% 級距（11 次）', () => {
      const hint = getTpassTierHint('rail', 11)
      expect(hint.label).toBe('已達 2%')
      expect(hint.isMax).toBe(true)
    })
  })
})

// 官方回饋條件表格：軌道加碼「各運具分開計算」，所以提示必須由
// 單一運具的最高次數決定，不能把三個運具加總後比門檻。
describe('bestRailSystemCount', () => {
  it('回傳三個運具中次數最高者', () => {
    expect(
      bestRailSystemCount({ taipei_metro_count: 4, tra_count: 9, new_taipei_metro_count: 2 }),
    ).toBe(9)
  })

  it('合計達門檻但無單一運具達標時，不得讓提示變成「已達 2%」', () => {
    // 2025-12 production 真實資料：北捷 10 + 臺鐵 1 = 合計 11，
    // 但官方軌道回饋是 0，因為沒有任何單一運具達到 11 次。
    const summary = { taipei_metro_count: 10, tra_count: 1, new_taipei_metro_count: 0 }

    expect(bestRailSystemCount(summary)).toBe(10)
    expect(getTpassTierHint('rail', bestRailSystemCount(summary)).label).toBe('再 1 次達 2%')
  })

  it('任一運具單獨達標即為已達', () => {
    const summary = { taipei_metro_count: 11, tra_count: 0, new_taipei_metro_count: 0 }
    expect(getTpassTierHint('rail', bestRailSystemCount(summary)).isMax).toBe(true)
  })

  it('無月結資料時回傳 0', () => {
    expect(bestRailSystemCount(undefined)).toBe(0)
  })
})
