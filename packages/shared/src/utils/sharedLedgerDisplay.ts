import type { SharedLedger } from '../types'

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
