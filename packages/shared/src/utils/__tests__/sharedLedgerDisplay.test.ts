import { describe, expect, it } from 'vitest'
import {
  getSharedLedgerPartyDisplayName,
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
