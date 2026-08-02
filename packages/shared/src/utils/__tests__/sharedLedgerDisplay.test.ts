import { describe, expect, it } from 'vitest'
import {
  getSharedLedgerPartyDisplayName,
  isAgentRecordedExpense,
  resolveSharedExpensePayerName,
} from '../sharedLedgerDisplay'
import type { SharedLedger } from '../../types'

describe('shared ledger display helpers', () => {
  const ledger = {
    owner_aliases: ['Yuki'],
    partner_aliases: [],
    partner_name: 'Zumi',
    owner: { email: 'yuki@example.com' },
  } as SharedLedger

  it('uses aliases and partner name for display labels', () => {
    expect(getSharedLedgerPartyDisplayName(ledger, 'owner')).toBe('Yuki')
    expect(getSharedLedgerPartyDisplayName(ledger, 'partner')).toBe('Zumi')
  })

  it('resolves shared expense payer names', () => {
    expect(resolveSharedExpensePayerName(ledger, 'owner')).toBe('Yuki')
    expect(resolveSharedExpensePayerName(ledger, 'partner')).toBe('Zumi')
    expect(resolveSharedExpensePayerName(ledger, 'Zumi')).toBe('Zumi')
  })
})

describe('agent-recorded expenses', () => {
  it('flags an expense an agent wrote', () => {
    expect(isAgentRecordedExpense({ created_by_actor: 'agent' })).toBe(true)
  })

  it('does not flag an expense a person wrote', () => {
    expect(isAgentRecordedExpense({ created_by_actor: 'user' })).toBe(false)
  })

  it('does not flag rows from before the field existed', () => {
    // Backfilled rows read as 'user'; an API that predates the field omits it
    // entirely. Neither may be badged — a badge on every historic row would
    // make the marker useless.
    expect(isAgentRecordedExpense({} as { created_by_actor: string })).toBe(false)
    expect(isAgentRecordedExpense(null)).toBe(false)
    expect(isAgentRecordedExpense(undefined)).toBe(false)
  })
})
