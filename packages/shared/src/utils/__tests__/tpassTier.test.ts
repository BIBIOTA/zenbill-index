import { describe, expect, it } from 'vitest'
import { getTpassTierHint } from '../tpassTier'

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
