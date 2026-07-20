import { describe, expect, it } from 'vitest'
import { computeCycleNetAmountDue } from '../cycleExpense'

const ACCOUNT_ID = 'acct-1'
const OTHER_ACCOUNT_ID = 'acct-2'

describe('computeCycleNetAmountDue', () => {
  it('EXPENSE increases the net amount due', () => {
    const total = computeCycleNetAmountDue(
      [{ type: 'EXPENSE', account_id: ACCOUNT_ID, target_account_id: null, amount: 300, original_amount: null }],
      ACCOUNT_ID,
    )
    expect(total).toBe(300)
  })

  it('INCOME decreases the net amount due', () => {
    const total = computeCycleNetAmountDue(
      [{ type: 'INCOME', account_id: ACCOUNT_ID, target_account_id: null, amount: 100, original_amount: null }],
      ACCOUNT_ID,
    )
    expect(total).toBe(-100)
  })

  it('TRANSFER out of this account increases the net amount due', () => {
    const total = computeCycleNetAmountDue(
      [{ type: 'TRANSFER', account_id: ACCOUNT_ID, target_account_id: OTHER_ACCOUNT_ID, amount: 200, original_amount: null }],
      ACCOUNT_ID,
    )
    expect(total).toBe(200)
  })

  it('TRANSFER into this account (a payment received) decreases the net amount due', () => {
    const total = computeCycleNetAmountDue(
      [{ type: 'TRANSFER', account_id: OTHER_ACCOUNT_ID, target_account_id: ACCOUNT_ID, amount: 1962, original_amount: null }],
      ACCOUNT_ID,
    )
    expect(total).toBe(-1962)
  })

  it('TRANSFER into this account uses original_amount when set (cross-currency)', () => {
    const total = computeCycleNetAmountDue(
      [{ type: 'TRANSFER', account_id: OTHER_ACCOUNT_ID, target_account_id: ACCOUNT_ID, amount: 3000, original_amount: 100 }],
      ACCOUNT_ID,
    )
    expect(total).toBe(-100)
  })

  it('mixes EXPENSE and an incoming payment into a net figure, matching the production reconciliation case', () => {
    // 永豐Sports信用卡 6/16-7/15: 9311 in EXPENSE, one 1962 TRANSFER-in payment.
    const transactions = [
      { type: 'EXPENSE', account_id: ACCOUNT_ID, target_account_id: null, amount: 262, original_amount: null },
      { type: 'EXPENSE', account_id: ACCOUNT_ID, target_account_id: null, amount: 9049, original_amount: null },
      { type: 'TRANSFER', account_id: OTHER_ACCOUNT_ID, target_account_id: ACCOUNT_ID, amount: 1962, original_amount: null },
    ]
    expect(computeCycleNetAmountDue(transactions, ACCOUNT_ID)).toBe(7349)
  })

  it('credit card cashback (recorded as INCOME) reduces the net amount due, aligning with the bill', () => {
    const transactions = [
      { type: 'EXPENSE', account_id: ACCOUNT_ID, target_account_id: null, amount: 9311, original_amount: null },
      { type: 'INCOME', account_id: ACCOUNT_ID, target_account_id: null, amount: 88, original_amount: null },
      { type: 'TRANSFER', account_id: OTHER_ACCOUNT_ID, target_account_id: ACCOUNT_ID, amount: 1962, original_amount: null },
    ]
    // 9311 (spend) - 88 (cashback) - 1962 (payment received) = 7261
    expect(computeCycleNetAmountDue(transactions, ACCOUNT_ID)).toBe(7261)
  })

  it('a TRANSFER not touching this account contributes nothing', () => {
    const total = computeCycleNetAmountDue(
      [{ type: 'TRANSFER', account_id: OTHER_ACCOUNT_ID, target_account_id: 'acct-3', amount: 500, original_amount: null }],
      ACCOUNT_ID,
    )
    expect(total).toBeCloseTo(0)
  })
})
