import { describe, expect, it } from 'vitest'
import type { RecommendationCombo, RecommendationPlan } from '../../types/index'
import {
  formatComboReward,
  formatComboTitle,
  formatEquivalentWallets,
  formatRecommendationPlanReward,
  recommendationPlanNotes,
  splitZeroCombos,
} from '../rewardRecommendation'

const plan = (over: Partial<RecommendationPlan> = {}): RecommendationPlan => ({
  plan_id: 'p1', name: '基本 1%', rate: 0.01, unit_label: '元', currency: 'TWD', status: 'counted',
  reward: 10, remaining_spend: null, min_single_amount_note: null, needs_manual_mark: false, ...over,
})

const combo = (over: Partial<RecommendationCombo> = {}): RecommendationCombo => ({
  account_ids: ['a1'], card_label: 'CUBE 台幣', wallet: null, equivalent_wallets: [],
  reward_amount: 10, reward_rate: 0.01, plans: [plan()], ...over,
})

describe('formatComboTitle', () => {
  it('card base name × wallet, or 實體卡', () => {
    expect(formatComboTitle(combo())).toBe('CUBE × 實體卡')
    expect(formatComboTitle(combo({ wallet: { id: 'w', name: 'Apple Pay' } }))).toBe('CUBE × Apple Pay')
  })
})

describe('formatComboReward', () => {
  it('amount and rate when the query had an amount', () => {
    expect(formatComboReward(combo({ reward_amount: 18, reward_rate: 0.015 }), 'TWD')).toBe('NT$18・1.5%')
  })
  it('≈ when any plan is in another currency', () => {
    const c = combo({ reward_amount: 88.5714, reward_rate: 0.029524, plans: [plan({ currency: 'TWD' })] })
    expect(formatComboReward(c, 'JPY')).toBe('≈¥89・3.0%')
  })
  it('rate only without an amount', () => {
    expect(formatComboReward(combo({ reward_amount: null, reward_rate: 0.03 }), null)).toBe('3.0%')
  })
})

describe('formatEquivalentWallets', () => {
  it('lists folded wallets', () => {
    expect(formatEquivalentWallets(combo())).toBeNull()
    expect(formatEquivalentWallets(combo({
      equivalent_wallets: [{ id: '1', name: 'Apple Pay' }, { id: '2', name: 'LINE Pay' }],
    }))).toBe('Apple Pay、LINE Pay 等同')
  })
  it('abbreviates long lists', () => {
    const names = ['Apple Pay', 'Google Pay', 'Samsung Pay', 'LINE Pay']
    expect(formatEquivalentWallets(combo({ equivalent_wallets: names.map((name, i) => ({ id: String(i), name })) })))
      .toBe('Apple Pay、Google Pay 等 4 個行動支付等同')
  })
})

describe('recommendationPlanNotes', () => {
  it('status, manual mark, threshold and remaining spend', () => {
    expect(recommendationPlanNotes(plan())).toEqual([])
    expect(recommendationPlanNotes(plan({ status: 'capped', remaining_spend: 0 }))).toEqual(['已封頂'])
    expect(recommendationPlanNotes(plan({ status: 'partially_capped', remaining_spend: 300 }))).toEqual([
      '部分封頂', '剩餘可刷 NT$300',
    ])
    expect(recommendationPlanNotes(plan({ needs_manual_mark: true, min_single_amount_note: 1000, reward: null }))).toEqual([
      '需手動計入', '需單筆滿 NT$1,000',
    ])
    expect(recommendationPlanNotes(plan({ remaining_spend: 4000 }))).toEqual(['剩餘可刷 NT$4,000'])
  })
})

describe('formatRecommendationPlanReward', () => {
  it('money for 元, points for 點, rate without an amount', () => {
    expect(formatRecommendationPlanReward(plan({ reward: 103 }))).toBe('NT$103')
    expect(formatRecommendationPlanReward(plan({ reward: 103, unit_label: '點' }))).toBe('103 點')
    expect(formatRecommendationPlanReward(plan({ reward: null, rate: 0.025, unit_label: '點' }))).toBe('2.5%')
    expect(formatRecommendationPlanReward(plan({ reward: null, rate: 0.03, status: 'capped' }))).toBe('0.0%')
  })
})

describe('splitZeroCombos', () => {
  it('keeps order and moves zero-reward combos aside', () => {
    const a = combo({ card_label: 'A', reward_amount: 30 })
    const z = combo({ card_label: 'Z', reward_amount: 0, reward_rate: 0, plans: [] })
    const b = combo({ card_label: 'B', reward_amount: 10 })
    expect(splitZeroCombos([a, b, z])).toEqual({ earning: [a, b], zero: [z] })
  })
})
