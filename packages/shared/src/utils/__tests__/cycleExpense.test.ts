import { describe, expect, it } from 'vitest'
import { computeCycleNetAmountDue } from '../cycleExpense'

describe('computeCycleNetAmountDue', () => {
  it('EXPENSE increases the net amount due', () => {
    const total = computeCycleNetAmountDue([{ type: 'EXPENSE', amount: 300 }])
    expect(total).toBe(300)
  })

  it('INCOME decreases the net amount due', () => {
    const total = computeCycleNetAmountDue([{ type: 'INCOME', amount: 100 }])
    expect(total).toBe(-100)
  })

  it('TRANSFER contributes nothing, whether a payment out or a payment received', () => {
    const total = computeCycleNetAmountDue([
      { type: 'TRANSFER', amount: 200 },
      { type: 'TRANSFER', amount: 1962 },
    ])
    expect(total).toBeCloseTo(0)
  })

  it('mixes EXPENSE and an incoming payment, matching the production reconciliation case', () => {
    // 永豐Sports信用卡 6/16-7/15 bill: 9311 in EXPENSE; the 1962 mid-cycle
    // payment settles a previous cycle's balance and must not reduce this.
    const transactions = [
      { type: 'EXPENSE', amount: 262 },
      { type: 'EXPENSE', amount: 9049 },
      { type: 'TRANSFER', amount: 1962 },
    ]
    expect(computeCycleNetAmountDue(transactions)).toBe(9311)
  })

  it('credit card cashback (recorded as INCOME) reduces the net amount due, aligning with the bill', () => {
    const transactions = [
      { type: 'EXPENSE', amount: 9311 },
      { type: 'INCOME', amount: 88 },
      { type: 'TRANSFER', amount: 1962 },
    ]
    // 9311 (spend) - 88 (cashback) = 9223; the payment received is excluded.
    expect(computeCycleNetAmountDue(transactions)).toBe(9223)
  })
})
