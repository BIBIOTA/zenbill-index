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
  ledger: Pick<SharedLedger, 'partner_aliases' | 'partner_name' | 'partner'> &
    Partial<Pick<SharedLedger, 'owner_aliases' | 'owner'>> | null | undefined,
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

/**
 * A ledger's payment-method options, as the API reports them.
 *
 * `available` separates "this ledger offers no list" from "the list is
 * momentarily unreachable" — the two look the same in the data but mean
 * different things to the user, and only the second is worth explaining.
 */
export interface PartnerPaymentMethodList {
  available: boolean
  payment_methods: string[]
  reason?: string
}

/**
 * Whether the partner-payment-method field belongs on this expense's form.
 *
 * Two conditions, deliberately both about capability rather than identity:
 * this ledger actually offers options to pick from, and the partner put money
 * into this expense. Who the partner is never enters into it — a rule keyed on
 * a person's name would quietly stop working the day a second ledger exists.
 *
 * The money test is the partner's *paid* amount, not who the main payer is, so
 * an expense both parties chipped in on still asks how the partner's share went
 * out.
 */
export function shouldShowPartnerPaymentMethodField(
  list: PartnerPaymentMethodList | null | undefined,
  expense: Pick<SharedExpense, 'partner_paid_amount'> | null | undefined,
): boolean {
  return resolvePartnerPaymentMethodField({ list, expense }).kind === 'ready'
}

/**
 * Label for the partner-payment-method field, e.g. "Zumi 付款方式".
 *
 * The naming in code binds to the partner *role*, but what the user reads is
 * the person they know, so this resolves through the ledger's display name.
 */
export function getPartnerPaymentMethodLabel(
  ledger: Pick<SharedLedger, 'partner_aliases' | 'partner_name' | 'partner'> | null | undefined,
): string {
  return `${getSharedLedgerPartyDisplayName(ledger, 'partner')} 付款方式`
}

/**
 * Reasons a list is missing because this ledger never had one, as opposed to
 * because a read went wrong just now. The distinction is what the user sees:
 * the first is not worth mentioning, the second is.
 */
const PERMANENTLY_NO_PAYMENT_METHOD_LIST = [
  'sheet_not_configured',
  'tab_not_found',
  'sync_not_configured',
  // A ledger with no stored Google credential is misconfigured, not offline:
  // the read will fail identically forever, so telling the user it is
  // temporarily unavailable would promise a recovery that never arrives.
  'credential_unavailable',
]

export type PartnerPaymentMethodFieldState =
  | { kind: 'hidden' }
  | { kind: 'loading' }
  | { kind: 'ready'; options: string[] }
  | { kind: 'unavailable' }

/**
 * What the partner-payment-method field should do on a form, given how the
 * list request went.
 *
 * Shared between web and app so the same expense never renders one way on the
 * phone and another on the desktop.
 *
 * The partner having paid is checked first and overrides everything: if the
 * field cannot apply to this expense, no amount of Google trouble is worth
 * telling the user about.
 */
export function resolvePartnerPaymentMethodField(input: {
  list?: PartnerPaymentMethodList | null
  isLoading?: boolean
  /** The request itself failed — a network error or a non-2xx response. */
  failed?: boolean
  expense: Pick<SharedExpense, 'partner_paid_amount'> | null | undefined
}): PartnerPaymentMethodFieldState {
  if ((input.expense?.partner_paid_amount ?? 0) <= 0) return { kind: 'hidden' }
  if (input.failed) return { kind: 'unavailable' }
  if (input.isLoading) return { kind: 'loading' }

  const list = input.list
  if (list?.available) {
    return list.payment_methods.length > 0
      ? { kind: 'ready', options: list.payment_methods }
      : { kind: 'hidden' }
  }
  if (list && !PERMANENTLY_NO_PAYMENT_METHOD_LIST.includes(list.reason ?? '')) {
    return { kind: 'unavailable' }
  }
  return { kind: 'hidden' }
}
