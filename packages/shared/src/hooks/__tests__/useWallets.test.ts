import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { walletInvalidators, walletKeys } from '../useWallets'
import { rewardPlanKeys, rewardProgressKeys } from '../useRewardPlans'
import * as shared from '../../index'

describe('walletInvalidators', () => {
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

  it('create refreshes only the wallet list', async () => {
    const untouched = [['transactions'], ['accounts'], rewardPlanKeys.list, rewardProgressKeys.overview]
    seed([walletKeys.all, ...untouched])
    walletInvalidators.created(qc)
    await settle()
    expect(qc.getQueryState(walletKeys.all)?.isInvalidated).toBe(true)
    for (const k of untouched) expect(qc.getQueryState(k)?.isInvalidated).toBe(false)
  })

  it('rename/delete refreshes wallets, transactions, accounts, plans, progress and summary', async () => {
    const own = [
      walletKeys.all,
      ['transactions', { page: 1 }],
      ['transactions', 'infinite', {}],
      ['accounts'],
      ['accounts', 'a1'],
      rewardPlanKeys.list,
      rewardPlanKeys.detail('p1'),
      rewardProgressKeys.overview,
      rewardProgressKeys.plan('p1', 0),
      rewardProgressKeys.account('a1', -1),
      rewardProgressKeys.summary('a1', { period: 'current' }),
    ]
    const untouched = [['merchants'], ['invoices']]
    seed([...own, ...untouched])
    walletInvalidators.changed(qc)
    await settle()
    for (const k of own) expect(qc.getQueryState(k)?.isInvalidated).toBe(true)
    for (const k of untouched) expect(qc.getQueryState(k)?.isInvalidated).toBe(false)
  })
})

describe('package exports', () => {
  it('exposes wallet hooks and helper from the entry point', () => {
    for (const name of [
      'useWallets',
      'useCreateWallet',
      'useUpdateWallet',
      'useDeleteWallet',
      'walletKeys',
      'walletInvalidators',
      'resolveWalletDefault',
    ]) {
      expect(shared).toHaveProperty(name)
    }
  })
})
