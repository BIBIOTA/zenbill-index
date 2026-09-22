import type { LinkedSharedExpense } from '../types'

// Shown on the edit form of a transaction that belongs to a shared expense:
// the two are not kept in sync after creation.
export const LINKED_SHARED_EXPENSE_EDIT_HINT = '此交易連著共同支出，修改不會同步'

// The confirmation shown before deleting a transaction that belongs to a
// shared expense. The backend deletes the shared expense with it, and undoes
// its settlement — including the personal transaction settling created.
export function linkedSharedExpenseDeleteMessage(linked: LinkedSharedExpense): string {
  const lines = [`此交易連著「${linked.ledger_name}」的共同支出，共同支出會一起刪除。`]
  if (linked.settled) {
    lines.push('這筆共同支出已結算，會一併撤銷結算（結算時產生的交易也會刪除）。')
  }
  lines.push('確定要刪除嗎？')
  return lines.join('\n')
}
