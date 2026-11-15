import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { rewardInvalidators, rewardPlanKeys, rewardProgressKeys } from '../useRewardPlans'
import * as shared from '../../index'

describe('reward query keys', () => {
  it('nests every progress key under ["accounts", "reward-progress"]', () => {
    expect(rewardProgressKeys.all).toEqual(['accounts', 'reward-progress'])
    expect(rewardProgressKeys.overview).toEqual(['accounts', 'reward-progress', 'overview'])
    expect(rewardProgressKeys.plan('p1', -1)).toEqual(['accounts', 'reward-progress', 'plan', 'p1', -1])
    expect(rewardProgressKeys.account('a1', 0)).toEqual(['accounts', 'reward-progress', 'account', 'a1', 0])
  })

  it('progress is refreshed by the existing ["accounts"] invalidation (transaction mutations)', async () => {
    const qc = new QueryClient()
    const keys = [
      rewardProgressKeys.overview,
      rewardProgressKeys.plan('p1', 0),
      rewardProgressKeys.account('a1', 0),
    ]
    for (const k of keys) qc.setQueryData(k, { data: null })
    await qc.invalidateQueries({ queryKey: ['accounts'] })
    for (const k of keys) expect(qc.getQueryState(k)?.isInvalidated).toBe(true)
  })
})

describe('rewardInvalidators', () => {
  let qc: QueryClient
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    qc = new QueryClient()
    spy = vi.spyOn(qc, 'invalidateQueries')
  })

  const seed = (keys: readonly (readonly unknown[])[]) => {
    for (const k of keys) qc.setQueryData(k, { seeded: true })
  }
  const settle = () => Promise.all(spy.mock.results.map((r) => r.value))

  it('plan writes refresh plan lists/details and every progress query, not accounts themselves', async () => {
    const own = [
      rewardPlanKeys.list,
      rewardPlanKeys.detail('p1'),
      rewardProgressKeys.overview,
      rewardProgressKeys.plan('p2', 0),
      rewardProgressKeys.account('a1', -1),
    ]
    const untouched = [['accounts'], ['accounts', 'a1'], ['transactions']]
    seed([...own, ...untouched])
    rewardInvalidators.plans(qc)
    await settle()
    for (const k of own) expect(qc.getQueryState(k)?.isInvalidated).toBe(true)
    for (const k of untouched) expect(qc.getQueryState(k)?.isInvalidated).toBe(false)
  })

  it('mark writes refresh progress only (plan definitions unchanged)', async () => {
    const own = [rewardProgressKeys.plan('p1', 0), rewardProgressKeys.overview, rewardProgressKeys.account('a1', 0)]
    const untouched = [rewardPlanKeys.list, rewardPlanKeys.detail('p1'), ['accounts', 'a1']]
    seed([...own, ...untouched])
    rewardInvalidators.progress(qc)
    await settle()
    for (const k of own) expect(qc.getQueryState(k)?.isInvalidated).toBe(true)
    for (const k of untouched) expect(qc.getQueryState(k)?.isInvalidated).toBe(false)
  })
})

describe('reward exports', () => {
  it('are exported from the package entrypoint', () => {
    for (const name of [
      'useRewardPlans',
      'useRewardPlan',
      'useCreateRewardPlan',
      'useUpdateRewardPlan',
      'useDeleteRewardPlan',
      'useDuplicateRewardPlan',
      'useRewardPlanProgress',
      'useAccountRewardProgress',
      'useRewardOverview',
      'useSetRewardPlanMark',
      'useClearRewardPlanMark',
      'formatRemainingSpend',
      'formatEstimatedReward',
      'formatRewardPeriodLabel',
      'rewardProgressBarState',
      'sortRewardOverview',
      'searchCountries',
      'countryName',
    ] as const) {
      expect(typeof (shared as Record<string, unknown>)[name]).toBe('function')
    }
    expect(Array.isArray(shared.COUNTRIES)).toBe(true)
  })
})
