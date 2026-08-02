import type { SharedExpense, SharedLedger } from '../types'

type SharedLedgerParty = 'owner' | 'partner'

function firstNonEmpty(values: Array<string | null | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim() !== '')?.trim()
}

function emailLocalPart(email: string | null | undefined): string | undefined {
  const value = email?.trim()
  if (!value) return undefined
  return value.split('@')[0] || value
}

export function getSharedLedgerPartyDisplayName(
  ledger: Pick<SharedLedger, 'owner_aliases' | 'partner_aliases' | 'partner_name' | 'owner' | 'partner'> | null | undefined,
  party: SharedLedgerParty,
): string {
  if (party === 'owner') {
    return firstNonEmpty([
      ledger?.owner_aliases?.[0],
      emailLocalPart(ledger?.owner?.email),
      'Owner',
    ]) ?? 'Owner'
  }

  return firstNonEmpty([
    ledger?.partner_aliases?.[0],
    ledger?.partner_name,
    emailLocalPart(ledger?.partner?.email),
    'Partner',
  ]) ?? 'Partner'
}

export function resolveSharedExpensePayerName(
  ledger: Pick<SharedLedger, 'owner_aliases' | 'partner_aliases' | 'partner_name' | 'owner' | 'partner'> | null | undefined,
  payerName: string,
): string {
  const normalized = payerName.trim().toLowerCase()
  if (normalized === 'owner') return getSharedLedgerPartyDisplayName(ledger, 'owner')
  if (normalized === 'partner') return getSharedLedgerPartyDisplayName(ledger, 'partner')
  return payerName
}

/**
 * Label for an expense an AI agent recorded.
 *
 * Shared so the app and the web read identically; a marker that differs
 * between the two is worse than none, because it teaches the user to look for
 * the wrong thing on the other device.
 */
export const AGENT_RECORDED_LABEL = '🤖 Agent'

/**
 * Whether this expense was recorded by an agent rather than by a person.
 *
 * Agent bookkeeping is fast and low-friction, which is exactly why these rows
 * are the ones worth glancing over: they can land without the user having
 * watched them land.
 *
 * Anything that is not explicitly an agent row is treated as a person's —
 * historic rows backfilled to 'user', and responses from an API predating the
 * field, must both stay unbadged. A badge on every old row would carry no
 * information at all.
 */
export function isAgentRecordedExpense(
  expense: Pick<SharedExpense, 'created_by_actor'> | null | undefined,
): boolean {
  return expense?.created_by_actor === 'agent'
}
