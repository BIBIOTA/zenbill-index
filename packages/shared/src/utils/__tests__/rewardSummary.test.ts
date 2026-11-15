import { describe, expect, it } from 'vitest'
import type { RewardSummaryGroup, RewardSummaryPlan } from '../../types/index'
import {
  REWARD_SUMMARY_INCLUDES_POINTS_NOTE,
  REWARD_SUMMARY_QUALIFYING_NOTE,
  formatRewardRate,
  formatRewardSummaryHeadline,
  formatRewardSummaryNet,
  formatRewardSummaryPlan,
  formatRewardSummaryRange,
  formatRewardSummaryTotals,
  rewardSummaryNotes,
} from '../rewardSummary'
import { REWARD_EXCLUDES_REFUNDS_NOTE } from '../rewardProgress'

const planRow = (over: Partial<RewardSummaryPlan> = {}): RewardSummaryPlan => ({
  plan_id: 'p1',
  name: '熊本熊日本 2.5%',
  unit_label: '元',
  reward: 80,
  qualifying_spend: 3201,
  capped_in_range: false,
  ...over,
})

const group = (over: Partial<RewardSummaryGroup> = {}): RewardSummaryGroup => ({
  currency: 'TWD',
  total_reward: 272,
  spend: 3201,
  spend_basis: 'all',
  fees: 48,
  gross_rate: 0.084973,
  net_rate: 0.069978,
  converted: true,
  includes_points: false,
  plans: [planRow()],
  ...over,
})

describe('formatRewardRate', () => {
  it('formats with one decimal', () => {
    expect(formatRewardRate(0.084973)).toBe('8.5%')
    expect(formatRewardRate(0.069978)).toBe('7.0%')
    expect(formatRewardRate(0)).toBe('0.0%')
    expect(formatRewardRate(-0.01)).toBe('-1.0%')
  })
  it('null → em dash', () => {
    expect(formatRewardRate(null)).toBe('—')
  })
})

describe('formatRewardSummaryHeadline / Net', () => {
  it('headline shows gross rate', () => {
    expect(formatRewardSummaryHeadline(group())).toBe('回饋率 8.5%')
    expect(formatRewardSummaryHeadline(group({ gross_rate: null }))).toBe('回饋率 —')
  })
  it('net shows rate after fees', () => {
    expect(formatRewardSummaryNet(group())).toBe('扣手續費後 7.0%')
  })
  it('net is null when there are no fees or no rate', () => {
    expect(formatRewardSummaryNet(group({ fees: 0 }))).toBeNull()
    expect(formatRewardSummaryNet(group({ net_rate: null }))).toBeNull()
  })
})

describe('formatRewardSummaryTotals', () => {
  it('uses ≈ for converted reward and spend', () => {
    expect(formatRewardSummaryTotals(group())).toBe('預估總回饋 ≈NT$272／消費 ≈NT$3,201')
  })
  it('no ≈ when not converted', () => {
    expect(formatRewardSummaryTotals(group({ converted: false }))).toBe('預估總回饋 NT$272／消費 NT$3,201')
  })
  it('uses the group currency', () => {
    expect(formatRewardSummaryTotals(group({ currency: 'JPY', converted: false, total_reward: 1200, spend: 48000 }))).toBe(
      '預估總回饋 ¥1,200／消費 ¥48,000',
    )
  })
})

describe('rewardSummaryNotes', () => {
  it('always includes 未扣除退款 when excludes_refunds', () => {
    expect(rewardSummaryNotes(group(), true)).toEqual([REWARD_EXCLUDES_REFUNDS_NOTE])
    expect(rewardSummaryNotes(group(), false)).toEqual([])
  })
  it('adds qualifying / points notes', () => {
    expect(rewardSummaryNotes(group({ spend_basis: 'qualifying', includes_points: true }), true)).toEqual([
      REWARD_EXCLUDES_REFUNDS_NOTE,
      REWARD_SUMMARY_QUALIFYING_NOTE,
      REWARD_SUMMARY_INCLUDES_POINTS_NOTE,
    ])
    expect(REWARD_SUMMARY_QUALIFYING_NOTE).toBe('僅計入消費')
    expect(REWARD_SUMMARY_INCLUDES_POINTS_NOTE).toBe('含點數，1 點以 1 元計')
  })
})

describe('formatRewardSummaryRange', () => {
  it('short style within one year', () => {
    expect(formatRewardSummaryRange('2026-11-20', '2026-11-26')).toBe('11/20 ~ 11/26')
    expect(formatRewardSummaryRange('2026-10-17', '2026-11-16')).toBe('10/17 ~ 11/16')
  })
  it('includes years when the range crosses a year', () => {
    expect(formatRewardSummaryRange('2026-12-20', '2027-01-05')).toBe('2026/12/20 ~ 2027/1/5')
  })
})

describe('formatRewardSummaryPlan', () => {
  it('name, rate-free label and reward with unit', () => {
    expect(formatRewardSummaryPlan(planRow(), 'TWD')).toEqual({ label: '熊本熊日本 2.5%：80 元', capped: false })
  })
  it('points unit and capped flag', () => {
    expect(formatRewardSummaryPlan(planRow({ name: '加碼', unit_label: '點', reward: 1500, capped_in_range: true }), 'TWD')).toEqual({
      label: '加碼：1,500 點',
      capped: true,
    })
  })
})
