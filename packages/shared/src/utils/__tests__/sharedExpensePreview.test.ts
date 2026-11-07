import { describe, expect, it } from 'vitest'
import { describeSharedExpenseEffect, equalSplitShares, previewSharedExpenseSplit } from '../sharedExpensePreview'

const base = { total: 2560, payerIsOwner: true, viewerIsOwner: true, isSettlement: false } as const
const money = (n: number) => `NT$ ${n.toLocaleString()}`

describe('equalSplitShares', () => {
  it('floors the owner half and gives the remainder to the partner', () => {
    expect(equalSplitShares(2560)).toEqual({ owner: 1280, partner: 1280 })
    expect(equalSplitShares(101)).toEqual({ owner: 50.5, partner: 50.5 })
    expect(equalSplitShares(0.03)).toEqual({ owner: 0.01, partner: 0.02 })
  })
})

describe('previewSharedExpenseSplit', () => {
  it('equal split paid by the viewer: the other side owes their half', () => {
    const p = previewSharedExpenseSplit({ ...base, method: 'EQUAL' })
    expect(p).toMatchObject({ mine: 1280, theirs: 1280, minePercent: 50, theirsPercent: 50 })
    expect(describeSharedExpenseEffect(p.effect, '小安', money)).toBe('小安要付你 NT$ 1,280')
  })

  it('equal split paid by the other side: the viewer owes their own half', () => {
    const p = previewSharedExpenseSplit({ ...base, method: 'EQUAL', payerIsOwner: false })
    expect(describeSharedExpenseEffect(p.effect, '小安', money)).toBe('你要付小安 NT$ 1,280')
  })

  it('everything on the payer leaves the balance alone', () => {
    const p = previewSharedExpenseSplit({ ...base, method: 'FULL_OWNER' })
    expect(p).toMatchObject({ mine: 2560, theirs: 0, minePercent: 100 })
    expect(describeSharedExpenseEffect(p.effect, '小安', money)).toBe('全部算你，不影響待收款')
  })

  it('everything on the non-payer is owed in full', () => {
    const p = previewSharedExpenseSplit({ ...base, method: 'FULL_PARTNER' })
    expect(describeSharedExpenseEffect(p.effect, '小安', money)).toBe('小安要付你 NT$ 2,560')
  })

  it('custom shares are read from the form', () => {
    const p = previewSharedExpenseSplit({ ...base, method: 'CUSTOM', ownerAmount: 1500, partnerAmount: 1060 })
    expect(p).toMatchObject({ mine: 1500, theirs: 1060, minePercent: 59, theirsPercent: 41 })
  })

  it('reads from the partner side when the viewer is the partner', () => {
    const p = previewSharedExpenseSplit({ ...base, method: 'CUSTOM', ownerAmount: 1500, partnerAmount: 1060, viewerIsOwner: false })
    expect(p).toMatchObject({ mine: 1060, theirs: 1500 })
    // owner paid, viewer (partner) owes their own share
    expect(describeSharedExpenseEffect(p.effect, 'Yuki', money)).toBe('你要付Yuki NT$ 1,060')
  })

  it('a settlement is a repayment of the full amount, with no shares', () => {
    const mine = previewSharedExpenseSplit({ ...base, method: 'FULL_PARTNER', isSettlement: true })
    expect(mine).toMatchObject({ mine: 0, theirs: 0 })
    expect(describeSharedExpenseEffect(mine.effect, '小安', money)).toBe('你還小安 NT$ 2,560')
    const theirs = previewSharedExpenseSplit({ ...base, method: 'FULL_OWNER', isSettlement: true, payerIsOwner: false })
    expect(describeSharedExpenseEffect(theirs.effect, '小安', money)).toBe('小安還你 NT$ 2,560')
  })

  it('an empty amount gives zero shares and no ratio', () => {
    const p = previewSharedExpenseSplit({ ...base, total: 0, method: 'EQUAL' })
    expect(p).toMatchObject({ mine: 0, theirs: 0, minePercent: 0, theirsPercent: 0 })
  })
})
