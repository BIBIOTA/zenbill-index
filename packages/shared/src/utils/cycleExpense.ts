export interface CycleExpenseTransaction {
  type: string
  amount: number
}

/**
 * TRANSFER contributes nothing: a credit-card TRANSFER is a payment
 * (bank -> card) settling a *previous* cycle's balance, unrelated to the
 * current cycle's spending, so it must not affect 本期支出.
 */
function effectiveAmount(tx: CycleExpenseTransaction): number {
  switch (tx.type) {
    case 'EXPENSE':
      return -tx.amount
    case 'INCOME':
      return tx.amount
    case 'SETTLEMENT':
      return tx.amount
    default:
      return 0
  }
}

/**
 * Net amount due for a billing cycle: the total of the period's
 * EXPENSE/INCOME/SETTLEMENT transactions, expressed as a positive
 * "you owe this much" figure. TRANSFER is excluded (see effectiveAmount).
 */
export function computeCycleNetAmountDue(transactions: CycleExpenseTransaction[]): number {
  const netChange = transactions.reduce((sum, tx) => sum + effectiveAmount(tx), 0)
  return -netChange
}
