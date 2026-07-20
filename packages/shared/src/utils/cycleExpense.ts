export interface CycleExpenseTransaction {
  type: string
  account_id: string
  target_account_id: string | null
  amount: number
  original_amount: number | null
}

/**
 * Mirrors the backend's per-account effective balance impact of a
 * transaction (backend/internal/usecase/transaction_service.go effectiveAmount).
 */
function effectiveAmount(tx: CycleExpenseTransaction, accountId: string): number {
  switch (tx.type) {
    case 'EXPENSE':
      return -tx.amount
    case 'INCOME':
      return tx.amount
    case 'TRANSFER':
      if (tx.account_id === accountId) return -tx.amount
      if (tx.target_account_id === accountId) return tx.original_amount ?? tx.amount
      return 0
    case 'SETTLEMENT':
      return tx.amount
    default:
      return 0
  }
}

/**
 * Net amount due for a billing cycle: the total balance impact of the
 * period's transactions, expressed as a positive "you owe this much"
 * figure. A TRANSFER received into the account during the period (e.g. a
 * mid-cycle payment) reduces this figure, consistent with how the
 * account's running balance treats it — keeping "本期支出" and the
 * displayed running balance mutually consistent.
 */
export function computeCycleNetAmountDue(
  transactions: CycleExpenseTransaction[],
  accountId: string,
): number {
  const netChange = transactions.reduce((sum, tx) => sum + effectiveAmount(tx, accountId), 0)
  return -netChange
}
