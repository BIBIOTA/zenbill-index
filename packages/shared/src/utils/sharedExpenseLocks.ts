import { ApiError } from '../api/client.ts'
import type { SharedExpense } from '../types/index.ts'

/**
 * Editable fields of a shared expense, named as in the `PUT` payload. These are
 * the names the backend reports in a 409's `locked_fields`.
 */
export const SHARED_EXPENSE_EDITABLE_FIELDS = [
  'date',
  'category',
  'description',
  'total_amount',
  'paid_by_owner',
  'split_method',
  'owner_amount',
  'partner_amount',
  'partner_payment_method',
] as const

export type LockedField = (typeof SHARED_EXPENSE_EDITABLE_FIELDS)[number]

export type LockableSharedExpense = Pick<SharedExpense, 'category'> &
  Partial<Pick<SharedExpense, 'settled_at' | 'expense_transaction_id' | 'linked_transaction_from_invoice'>>

export interface SharedExpenseLocks {
  /** Locked fields, in `SHARED_EXPENSE_EDITABLE_FIELDS` order. */
  fields: LockedField[]
  /** Why each locked field is locked (the first matching rule wins). */
  reasons: Partial<Record<LockedField, string>>
  /** The whole expense cannot be edited (settlement rows). `fields` then lists every editable field. */
  fullyLocked: boolean
  fullyLockedReason?: string
}

export const SHARED_EXPENSE_LOCK_REASONS = {
  settlement: '還款紀錄由系統產生，無法修改',
  settled: '已結清，金額無法修改',
  linkedTransaction: '已記入帳戶，無法更換付款人',
  fromInvoice: '金額來自發票，無法修改',
} as const

/**
 * Which fields of this expense the edit form should disable, and why. Mirrors
 * the backend's lock table; the backend stays authoritative (it answers 409 if
 * a locked field is sent with a different value), this only guides the form.
 *
 * Agent-actor rejection is not modelled here: the form is always used by a user.
 */
export function getSharedExpenseLockedFields(expense: LockableSharedExpense): SharedExpenseLocks {
  if (expense.category === 'settlement') {
    const reason = SHARED_EXPENSE_LOCK_REASONS.settlement
    return {
      fields: [...SHARED_EXPENSE_EDITABLE_FIELDS],
      reasons: Object.fromEntries(SHARED_EXPENSE_EDITABLE_FIELDS.map((f) => [f, reason])),
      fullyLocked: true,
      fullyLockedReason: reason,
    }
  }

  const reasons: Partial<Record<LockedField, string>> = {}
  const lock = (fields: LockedField[], reason: string) => {
    for (const f of fields) reasons[f] ??= reason
  }

  if (expense.settled_at) {
    lock(['total_amount', 'paid_by_owner', 'split_method', 'owner_amount', 'partner_amount'], SHARED_EXPENSE_LOCK_REASONS.settled)
  }
  if (expense.expense_transaction_id) {
    lock(['paid_by_owner'], SHARED_EXPENSE_LOCK_REASONS.linkedTransaction)
    if (expense.linked_transaction_from_invoice) {
      lock(['total_amount'], SHARED_EXPENSE_LOCK_REASONS.fromInvoice)
    }
  }

  return {
    fields: SHARED_EXPENSE_EDITABLE_FIELDS.filter((f) => f in reasons),
    reasons,
    fullyLocked: false,
  }
}

/**
 * The `locked_fields` of a 409 from `PUT /shared-ledgers/:id/expenses/:eid`, or
 * null when the error is not such a conflict. Reads both the standard envelope's
 * `data` and a top-level `{error, locked_fields}` body.
 */
export function getLockedFieldsFromError(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.code !== 409) return null
  for (const source of [error.data, error.body]) {
    if (source && typeof source === 'object' && 'locked_fields' in source) {
      const fields = (source as { locked_fields: unknown }).locked_fields
      if (Array.isArray(fields)) return fields.filter((f): f is string => typeof f === 'string')
    }
  }
  return null
}
