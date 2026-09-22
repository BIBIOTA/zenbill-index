import { describe, expect, it } from 'vitest'
import {
  LINKED_SHARED_EXPENSE_EDIT_HINT,
  linkedSharedExpenseDeleteMessage,
} from '../linkedSharedExpense'

describe('linkedSharedExpenseDeleteMessage', () => {
  it('says the shared expense is deleted too, naming the ledger', () => {
    const msg = linkedSharedExpenseDeleteMessage({ id: 'e1', ledger_name: '家用', settled: false })
    expect(msg).toContain('「家用」')
    expect(msg).toContain('共同支出會一起刪除')
    expect(msg).not.toContain('撤銷結算')
  })

  it('warns that a settled expense has its settlement undone', () => {
    const msg = linkedSharedExpenseDeleteMessage({ id: 'e1', ledger_name: '家用', settled: true })
    expect(msg).toContain('共同支出會一起刪除')
    expect(msg).toContain('會一併撤銷結算')
  })
})

describe('LINKED_SHARED_EXPENSE_EDIT_HINT', () => {
  it('says edits do not propagate', () => {
    expect(LINKED_SHARED_EXPENSE_EDIT_HINT).toBe('此交易連著共同支出，修改不會同步')
  })
})
