import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { rewardInvalidators, rewardProgressKeys } from '../useRewardPlans'
import {
  countryDefaultCurrency,
  rewardRecommendationPath,
  rewardRecommendationEnabled,
} from '../useRewardRecommendations'

describe('rewardRecommendationPath', () => {
  it('fixed order merchant_id → q → country → amount → currency, dropping empties', () => {
    expect(rewardRecommendationPath({ merchantId: 'm1', country: 'JP', amount: 3000, currency: 'JPY' })).toBe(
      '/reward-recommendations?merchant_id=m1&country=JP&amount=3000&currency=JPY',
    )
    expect(rewardRecommendationPath({ q: '新開的店' })).toBe(
      '/reward-recommendations?q=%E6%96%B0%E9%96%8B%E7%9A%84%E5%BA%97',
    )
  })

  it('never sends q with merchant_id, nor currency without an amount', () => {
    expect(rewardRecommendationPath({ merchantId: 'm1', q: '全聯', currency: 'TWD' })).toBe(
      '/reward-recommendations?merchant_id=m1',
    )
  })
})

describe('rewardRecommendationEnabled', () => {
  it('needs a merchant or some text', () => {
    expect(rewardRecommendationEnabled({})).toBe(false)
    expect(rewardRecommendationEnabled({ q: '  ' })).toBe(false)
    expect(rewardRecommendationEnabled({ q: '全聯' })).toBe(true)
    expect(rewardRecommendationEnabled({ merchantId: 'm1' })).toBe(true)
  })
})

describe('rewardProgressKeys.recommendation', () => {
  it('is refreshed by reward invalidators', async () => {
    const key = rewardProgressKeys.recommendation({ merchantId: 'm1' })
    expect(key.slice(0, 3)).toEqual(['accounts', 'reward-progress', 'recommendation'])
    const qc = new QueryClient()
    qc.setQueryData(key, { data: null })
    await rewardInvalidators.progress(qc)
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true)
  })
})

describe('countryDefaultCurrency', () => {
  it('maps single-currency countries, otherwise null', () => {
    expect(countryDefaultCurrency('TW')).toBe('TWD')
    expect(countryDefaultCurrency('jp')).toBe('JPY')
    expect(countryDefaultCurrency('DE')).toBeNull()
    expect(countryDefaultCurrency(null)).toBeNull()
  })
})
