import { describe, expect, it } from 'vitest'
import type { RewardPlan, RewardProgress } from '../../types/index'
import {
  formatCapExceeded,
  formatEstimatedReward,
  formatRemainingSpend,
  formatRewardHeadline,
  formatRewardMoney,
  formatRewardPeriodLabel,
  formatUnknownCountryHint,
  rewardProgressBarFill,
  rewardProgressBarState,
  sortRewardOverview,
} from '../rewardProgress'

const plan = (over: Partial<RewardPlan> = {}): RewardPlan => ({
  id: 'p1',
  user_id: 'u1',
  name: '熊本熊指定店 6%',
  rate: 0.06,
  cap_amount: 500,
  unit_label: '元',
  currency: 'TWD',
  period_type: 'billing_cycle',
  starts_on: null,
  ends_on: null,
  location_type: 'any',
  countries: [],
  min_single_amount: null,
  inclusion_mode: 'auto',
  note: '',
  account_ids: ['a1'],
  merchant_ids: [],
  excluded_merchant_ids: [],
  created_at: '',
  updated_at: '',
  ...over,
})

const progress = (over: Partial<RewardProgress> = {}, planOver: Partial<RewardPlan> = {}): RewardProgress => ({
  plan: plan(planOver),
  offset: 0,
  period_start: '2026-10-17',
  period_end: '2026-11-16',
  qualifying_spend: 2000,
  estimated_reward: 120,
  spend_cap: 8333.33,
  remaining_spend: 6333.33,
  over_cap_spend: 0,
  capped: false,
  usage_ratio: 0.24,
  unknown_country_count: 0,
  converted: false,
  excludes_refunds: true,
  ...over,
})

const uncapped = (over: Partial<RewardProgress> = {}) =>
  progress(
    { spend_cap: null, remaining_spend: null, usage_ratio: null, capped: false, ...over },
    { cap_amount: null },
  )

const capped = (over: Partial<RewardProgress> = {}) =>
  progress({
    qualifying_spend: 9000,
    estimated_reward: 500,
    remaining_spend: 0,
    over_cap_spend: 666.67,
    capped: true,
    usage_ratio: 1.08,
    ...over,
  })

describe('formatRewardMoney', () => {
  it('uses NT$ for TWD with the currency precision', () => {
    expect(formatRewardMoney(6250, 'TWD')).toBe('NT$6,250')
    expect(formatRewardMoney(14285.71, 'TWD')).toBe('NT$14,286')
  })
  it('prefixes ≈ when converted', () => {
    expect(formatRewardMoney(6250, 'TWD', { converted: true })).toBe('≈NT$6,250')
  })
  it('uses ¥ for JPY and the code for currencies without a symbol', () => {
    expect(formatRewardMoney(12000, 'JPY')).toBe('¥12,000')
    expect(formatRewardMoney(12.5, 'EUR')).toBe('EUR 12.50')
  })
})

describe('formatRemainingSpend / formatCapExceeded / formatRewardHeadline', () => {
  it('shows remaining spend when not capped', () => {
    expect(formatRemainingSpend(progress())).toBe('剩餘可刷 NT$6,333')
    expect(formatRewardHeadline(progress())).toBe('剩餘可刷 NT$6,333')
  })
  it('marks converted remaining spend with ≈', () => {
    expect(formatRemainingSpend(progress({ converted: true }))).toBe('剩餘可刷 ≈NT$6,333')
  })
  it('shows the over-cap amount once capped', () => {
    expect(formatCapExceeded(capped())).toBe('已封頂，超出 NT$667')
    expect(formatRewardHeadline(capped())).toBe('已封頂，超出 NT$667')
    expect(formatRemainingSpend(capped())).toBeNull()
  })
  it('capped with no overflow still reads 已封頂', () => {
    expect(formatCapExceeded(capped({ over_cap_spend: 0 }))).toBe('已封頂')
  })
  it('uncapped plans have no remaining spend; headline shows qualifying spend', () => {
    expect(formatRemainingSpend(uncapped())).toBeNull()
    expect(formatCapExceeded(uncapped())).toBeNull()
    expect(formatRewardHeadline(uncapped())).toBe('已計入 NT$2,000')
  })
})

describe('formatEstimatedReward', () => {
  it('shows reward / cap with the unit label', () => {
    expect(formatEstimatedReward(progress())).toBe('預估回饋 120／上限 500 元')
    expect(formatEstimatedReward(progress({}, { unit_label: '點' }))).toBe('預估回饋 120／上限 500 點')
  })
  it('omits the cap when uncapped', () => {
    expect(formatEstimatedReward(uncapped())).toBe('預估回饋 120 元')
  })
  it('prefixes ≈ when converted and groups thousands', () => {
    expect(
      formatEstimatedReward(progress({ estimated_reward: 1234, converted: true }, { cap_amount: 2000 })),
    ).toBe('預估回饋 ≈1,234／上限 2,000 元')
  })
})

describe('formatRewardPeriodLabel', () => {
  it('billing cycle reuses the short M/D ~ M/D format', () => {
    expect(formatRewardPeriodLabel('billing_cycle', '2026-10-17', '2026-11-16')).toBe('10/17 ~ 11/16')
  })
  it('calendar month', () => {
    expect(formatRewardPeriodLabel('calendar_month', '2026-11-01', '2026-11-30')).toBe('2026 年 11 月')
  })
  it('calendar month clipped by validity still names the month', () => {
    expect(formatRewardPeriodLabel('calendar_month', '2026-11-10', '2026-11-30')).toBe('2026 年 11 月')
  })
  it('calendar quarter', () => {
    expect(formatRewardPeriodLabel('calendar_quarter', '2026-10-01', '2026-12-31')).toBe('2026 年第 4 季')
    expect(formatRewardPeriodLabel('calendar_quarter', '2027-01-01', '2027-03-31')).toBe('2027 年第 1 季')
  })
  it('whole validity shows the full range', () => {
    expect(formatRewardPeriodLabel('whole_validity', '2026-09-01', '2026-11-30')).toBe(
      '活動期間 2026/9/1 ~ 2026/11/30',
    )
  })
})

describe('formatUnknownCountryHint', () => {
  it('returns the hint only when there are unknown-country transactions', () => {
    expect(formatUnknownCountryHint(0)).toBeNull()
    expect(formatUnknownCountryHint(3)).toBe('有 3 筆海外交易未判定國家')
  })
})

describe('rewardProgressBarState', () => {
  it('normal below 80%', () => {
    expect(rewardProgressBarState(progress({ usage_ratio: 0.79 }))).toBe('normal')
  })
  it('warning at and above 80%', () => {
    expect(rewardProgressBarState(progress({ usage_ratio: 0.8 }))).toBe('warning')
    expect(rewardProgressBarState(progress({ usage_ratio: 0.99 }))).toBe('warning')
  })
  it('capped', () => {
    expect(rewardProgressBarState(capped())).toBe('capped')
  })
  it('uncapped', () => {
    expect(rewardProgressBarState(uncapped())).toBe('uncapped')
  })
})

describe('rewardProgressBarFill', () => {
  it('clamps to [0, 1]; uncapped is 0', () => {
    expect(rewardProgressBarFill(progress({ usage_ratio: 0.24 }))).toBe(0.24)
    expect(rewardProgressBarFill(capped())).toBe(1)
    expect(rewardProgressBarFill(uncapped())).toBe(0)
  })
})

describe('sortRewardOverview', () => {
  it('capped first, then usage_ratio desc, uncapped last', () => {
    const items = [
      uncapped({ plan: plan({ id: 'u' }) }),
      progress({ plan: plan({ id: 'low' }), usage_ratio: 0.1 }),
      capped({ plan: plan({ id: 'c1' }), usage_ratio: 1.0 }),
      progress({ plan: plan({ id: 'high' }), usage_ratio: 0.9 }),
      capped({ plan: plan({ id: 'c2' }), usage_ratio: 1.5 }),
    ]
    expect(sortRewardOverview(items).map((p) => p.plan.id)).toEqual(['c2', 'c1', 'high', 'low', 'u'])
  })
  it('does not mutate the input and keeps ties stable', () => {
    const items = [
      progress({ plan: plan({ id: 'a' }), usage_ratio: 0.5 }),
      progress({ plan: plan({ id: 'b' }), usage_ratio: 0.5 }),
      uncapped({ plan: plan({ id: 'x' }) }),
      uncapped({ plan: plan({ id: 'y' }) }),
    ]
    const copy = [...items]
    expect(sortRewardOverview(items).map((p) => p.plan.id)).toEqual(['a', 'b', 'x', 'y'])
    expect(items).toEqual(copy)
  })
})
