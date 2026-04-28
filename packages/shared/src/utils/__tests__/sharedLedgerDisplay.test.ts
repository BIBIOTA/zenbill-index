import assert from 'node:assert/strict'
import {
  getSharedLedgerPartyDisplayName,
  resolveSharedExpensePayerName,
} from '../sharedLedgerDisplay'
import type { SharedLedger } from '../../types'

const ledger = {
  owner_aliases: ['Yuki'],
  partner_aliases: [],
  partner_name: 'Zumi',
  owner: { email: 'yuki@example.com' },
} as SharedLedger

assert.equal(getSharedLedgerPartyDisplayName(ledger, 'owner'), 'Yuki')
assert.equal(getSharedLedgerPartyDisplayName(ledger, 'partner'), 'Zumi')
assert.equal(resolveSharedExpensePayerName(ledger, 'owner'), 'Yuki')
assert.equal(resolveSharedExpensePayerName(ledger, 'partner'), 'Zumi')
assert.equal(resolveSharedExpensePayerName(ledger, 'Zumi'), 'Zumi')
