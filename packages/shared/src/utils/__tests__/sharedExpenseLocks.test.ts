import { describe, expect, it } from 'vitest'
import {
  getSharedExpenseLockedFields,
  getLockedFieldsFromError,
  SHARED_EXPENSE_EDITABLE_FIELDS,
  type LockableSharedExpense,
  type LockedField,
} from '../sharedExpenseLocks'
import { ApiError } from '../../api/client'

const base: LockableSharedExpense = {
  category: 'food',
  settled_at: null,
  expense_transaction_id: null,
  linked_transaction_from_invoice: false,
}

const SETTLED_MSG = '已結清，金額無法修改'
const LINKED_MSG = '已記入帳戶，無法更換付款人'
const INVOICE_MSG = '金額來自發票，無法修改'
const SETTLEMENT_MSG = '還款紀錄由系統產生，無法修改'

const AMOUNT_FIELDS: LockedField[] = ['total_amount', 'paid_by_owner', 'split_method', 'owner_amount', 'partner_amount']

describe('getSharedExpenseLockedFields', () => {
  const cases: Array<{
    name: string
    expense: Partial<LockableSharedExpense>
    fields: LockedField[]
    reasons: Partial<Record<LockedField, string>>
    fullyLocked?: boolean
  }> = [
    { name: '一般支出：沒有鎖', expense: {}, fields: [], reasons: {} },
    {
      name: '已結清：總額、付款人、拆分方式與各自金額',
      expense: { settled_at: '2026-10-01T00:00:00Z' },
      fields: AMOUNT_FIELDS,
      reasons: Object.fromEntries(AMOUNT_FIELDS.map((f) => [f, SETTLED_MSG])),
    },
    {
      name: '連著個人交易：付款人',
      expense: { expense_transaction_id: 'tx-1' },
      fields: ['paid_by_owner'],
      reasons: { paid_by_owner: LINKED_MSG },
    },
    {
      name: '個人交易來自發票：付款人（連著）與總額',
      expense: { expense_transaction_id: 'tx-1', linked_transaction_from_invoice: true },
      fields: ['total_amount', 'paid_by_owner'],
      reasons: { total_amount: INVOICE_MSG, paid_by_owner: LINKED_MSG },
    },
    {
      name: '已結清 + 連著發票交易：取聯集，原因以先列者（已結清）為準',
      expense: {
        settled_at: '2026-10-01T00:00:00Z',
        expense_transaction_id: 'tx-1',
        linked_transaction_from_invoice: true,
      },
      fields: AMOUNT_FIELDS,
      reasons: Object.fromEntries(AMOUNT_FIELDS.map((f) => [f, SETTLED_MSG])),
    },
    {
      name: '還款類：整筆鎖住',
      expense: { category: 'settlement' },
      fields: [...SHARED_EXPENSE_EDITABLE_FIELDS],
      reasons: Object.fromEntries(SHARED_EXPENSE_EDITABLE_FIELDS.map((f) => [f, SETTLEMENT_MSG])),
      fullyLocked: true,
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const result = getSharedExpenseLockedFields({ ...base, ...c.expense })
      expect([...result.fields].sort()).toEqual([...c.fields].sort())
      expect(result.reasons).toEqual(c.reasons)
      expect(result.fullyLocked).toBe(c.fullyLocked ?? false)
      expect(result.fullyLockedReason).toBe(c.fullyLocked ? SETTLEMENT_MSG : undefined)
    })
  }

  it('欄位缺漏（舊回應）時視為未連結、未結清', () => {
    const result = getSharedExpenseLockedFields({ category: 'food' })
    expect(result.fields).toEqual([])
  })

  it('fields 依固定順序回傳，方便 UI 顯示', () => {
    const result = getSharedExpenseLockedFields({ ...base, settled_at: '2026-10-01T00:00:00Z' })
    expect(result.fields).toEqual(AMOUNT_FIELDS)
  })
})

describe('getLockedFieldsFromError', () => {
  it('從 409 的 data.locked_fields 取出', () => {
    const err = new ApiError(409, 'locked', { locked_fields: ['total_amount'] })
    expect(getLockedFieldsFromError(err)).toEqual(['total_amount'])
  })

  it('從 409 的頂層 body.locked_fields 取出（{error, locked_fields}）', () => {
    const err = new ApiError(409, 'locked', undefined, { error: 'locked', locked_fields: ['paid_by_owner'] })
    expect(getLockedFieldsFromError(err)).toEqual(['paid_by_owner'])
  })

  it('非 409 或非 ApiError 回 null', () => {
    expect(getLockedFieldsFromError(new ApiError(400, 'bad', { locked_fields: ['x'] }))).toBeNull()
    expect(getLockedFieldsFromError(new Error('x'))).toBeNull()
    expect(getLockedFieldsFromError(new ApiError(409, 'locked'))).toBeNull()
  })
})
