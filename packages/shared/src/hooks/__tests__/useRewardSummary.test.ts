import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { rewardInvalidators, rewardProgressKeys } from '../useRewardPlans'
import { rewardSummaryEnabled, rewardSummaryPath } from '../useRewardSummary'
import * as shared from '../../index'

describe('rewardProgressKeys.summary', () => {
  it('nests under ["accounts", "reward-progress", "summary", accountId, …]', () => {
    expect(rewardProgressKeys.summary('a1', { period: 'current' })).toEqual([
      'accounts', 'reward-progress', 'summary', 'a1', { period: 'current' },
    ])
    expect(rewardProgressKeys.summary('a1', { from: '2026-11-20', to: '2026-11-26', scope: 'overseas' })).toEqual([
      'accounts', 'reward-progress', 'summary', 'a1', { from: '2026-11-20', to: '2026-11-26', scope: 'overseas' },
    ])
  })

  it('drops undefined params from the key and prefers from/to over period', () => {
    expect(rewardProgressKeys.summary('a1', { from: undefined, period: 'previous', scope: undefined })).toEqual([
      'accounts', 'reward-progress', 'summary', 'a1', { period: 'previous' },
    ])
    expect(rewardProgressKeys.summary('a1', { from: '2026-11-20', to: '2026-11-26', period: 'current' })).toEqual([
      'accounts', 'reward-progress', 'summary', 'a1', { from: '2026-11-20', to: '2026-11-26' },
    ])
  })

  it('is refreshed by ["accounts"] invalidation and by reward invalidators', async () => {
    const key = rewardProgressKeys.summary('a1', {})
    for (const run of [
      (qc: QueryClient) => qc.invalidateQueries({ queryKey: ['accounts'] }),
      (qc: QueryClient) => rewardInvalidators.plans(qc),
      (qc: QueryClient) => rewardInvalidators.progress(qc),
    ]) {
      const qc = new QueryClient()
      qc.setQueryData(key, { data: null })
      await run(qc)
      expect(qc.getQueryState(key)?.isInvalidated).toBe(true)
    }
  })
})

describe('rewardSummaryPath', () => {
  it('no params → bare path (server default range)', () => {
    expect(rewardSummaryPath('a1', {})).toBe('/accounts/a1/reward-summary')
  })
  it('period with scope', () => {
    expect(rewardSummaryPath('a1', { period: 'previous', scope: 'overseas' })).toBe(
      '/accounts/a1/reward-summary?period=previous&scope=overseas',
    )
  })
  it('from+to never sent together with period', () => {
    expect(rewardSummaryPath('a1', { from: '2026-11-20', to: '2026-11-26', period: 'current', scope: 'all' })).toBe(
      '/accounts/a1/reward-summary?from=2026-11-20&to=2026-11-26&scope=all',
    )
  })
})

describe('rewardSummaryEnabled', () => {
  it('requires accountId', () => {
    expect(rewardSummaryEnabled(undefined, {})).toBe(false)
    expect(rewardSummaryEnabled('a1', {})).toBe(true)
    expect(rewardSummaryEnabled('a1', { period: 'current' })).toBe(true)
  })
  it('custom range needs both ends', () => {
    expect(rewardSummaryEnabled('a1', { from: '2026-11-20' })).toBe(false)
    expect(rewardSummaryEnabled('a1', { to: '2026-11-26' })).toBe(false)
    expect(rewardSummaryEnabled('a1', { from: '2026-11-20', to: '2026-11-26' })).toBe(true)
  })
})

describe('reward summary exports', () => {
  it('are exported from the package entrypoint', () => {
    for (const name of [
      'useAccountRewardSummary',
      'rewardSummaryPath',
      'rewardSummaryEnabled',
      'formatRewardRate',
      'formatRewardSummaryHeadline',
      'formatRewardSummaryNet',
      'formatRewardSummaryTotals',
      'formatRewardSummaryRange',
      'formatRewardSummaryPlan',
      'rewardSummaryNotes',
    ] as const) {
      expect(typeof (shared as Record<string, unknown>)[name]).toBe('function')
    }
  })
})
