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
 * Whether the invited partner has accepted and joined this ledger.
 *
 * Only two states on purpose. Copying the invite link always regenerates the
 * token, which silently kills any link sent earlier, so "pending but expired"
 * could not be shown truthfully — and the remedy is the same either way:
 * copy a fresh link and send it again.
 */
export function isPartnerJoined(
  ledger: Pick<SharedLedger, 'partner_id'> | null | undefined,
): boolean {
  return ledger?.partner_id != null
}

/** Badge text for the partner's join status; shared so web and app read identically. */
export function getPartnerJoinLabel(
  ledger: Pick<SharedLedger, 'partner_id'> | null | undefined,
): string {
  return isPartnerJoined(ledger) ? '已加入' : '等待加入'
}

/** Shown beside the invite button while the partner has not joined yet. */
export const INVITE_LINK_HINT = '連結 7 天內有效；重新產生會讓舊連結失效'

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

export interface ReceivableEntry {
  /** The ledger's currency; amounts of different currencies are never added together. */
  currency: string
  /** That ledger's `receivable_balance`. */
  balance: number
}

export interface ReceivableTotal {
  currency: string
  amount: number
}

/**
 * Totals what the user is owed, grouped by ledger currency. Only positive balances
 * count (a negative one is what the user owes), and currencies are never summed
 * together — the dashboard reports them side by side, the same way per-currency
 * assets and liabilities are reported.
 *
 * `preferred` (the currency to headline, normally the base currency) comes first when
 * it has a total; the rest follow by amount, descending. Currencies with nothing
 * outstanding are left out, so a single-currency user sees exactly one entry.
 */
export function receivableTotalsByCurrency(
  entries: ReceivableEntry[],
  preferred: string,
): ReceivableTotal[] {
  const totals = new Map<string, number>()
  for (const { currency, balance } of entries) {
    if (!(balance > 0)) continue
    const code = currency.toUpperCase()
    totals.set(code, (totals.get(code) ?? 0) + balance)
  }

  const key = preferred.toUpperCase()
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => {
      if (a.currency === key) return -1
      if (b.currency === key) return 1
      return b.amount - a.amount
    })
}

export interface LedgerBalanceDisplay {
  /** e.g. 「小安待付你」「你待付小安」「已結清」 */
  label: string
  /** Absolute amount in the ledger currency. */
  amount: number
  tone: 'income' | 'expense' | 'settled'
}

/**
 * How the outstanding balance reads for the person looking at it.
 * `receivable_balance` is from the owner's side: positive means the partner owes the owner.
 */
export function getLedgerBalanceDisplay(
  ledger: Pick<SharedLedger, 'partner_aliases' | 'partner_name' | 'partner' | 'owner_aliases' | 'owner'>,
  receivableBalance: number,
  viewerIsOwner: boolean,
): LedgerBalanceDisplay {
  const owedToViewer = viewerIsOwner ? receivableBalance : -receivableBalance
  const other = getSharedLedgerPartyDisplayName(ledger, viewerIsOwner ? 'partner' : 'owner')
  if (owedToViewer > 0) return { label: `${other}待付你`, amount: owedToViewer, tone: 'income' }
  if (owedToViewer < 0) return { label: `你待付${other}`, amount: -owedToViewer, tone: 'expense' }
  return { label: '已結清', amount: 0, tone: 'settled' }
}

/**
 * One character for a person's avatar: the last character of a CJK name
 * (小安 → 安, as people are called), the first letter of a Latin one (Zumi → Z).
 */
export function partyInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const chars = Array.from(trimmed)
  return /^[\p{Script=Latin}\d]/u.test(chars[0]) ? chars[0].toUpperCase() : chars[chars.length - 1]
}

/**
 * Split method as the viewer reads it. FULL_OWNER means the owner bears the
 * whole cost (not who paid — that is a separate field), so it reads 全算你 to
 * the owner and 全算{owner} to the partner.
 */
export function getSplitMethodLabel(method: string, viewerIsOwner: boolean, otherName: string): string {
  switch (method) {
    case 'EQUAL':
      return '均分'
    case 'FULL_OWNER':
      return viewerIsOwner ? '全算你' : `全算${otherName}`
    case 'FULL_PARTNER':
      return viewerIsOwner ? `全算${otherName}` : '全算你'
    case 'CUSTOM':
      return '自訂'
    default:
      return method
  }
}

export interface ReceivablesSummary {
  /** Positive: the other side owes the viewer after settling everything. */
  net: number
  receivable: number
  receivableCount: number
  payable: number
  payableCount: number
}

/**
 * Viewer-side totals for the unsettled list. Each expense's net is
 * `owner_paid_amount − owner_amount` from the owner's side (positive: the
 * partner owes the owner), flipped when the viewer is the partner.
 */
export function summarizeReceivables(
  expenses: Pick<SharedExpense, 'owner_paid_amount' | 'owner_amount'>[],
  viewerIsOwner: boolean,
): ReceivablesSummary {
  const summary: ReceivablesSummary = { net: 0, receivable: 0, receivableCount: 0, payable: 0, payableCount: 0 }
  for (const exp of expenses) {
    const ownerNet = exp.owner_paid_amount - exp.owner_amount
    const viewerNet = viewerIsOwner ? ownerNet : -ownerNet
    summary.net += viewerNet
    if (viewerNet > 0) {
      summary.receivable += viewerNet
      summary.receivableCount += 1
    } else if (viewerNet < 0) {
      summary.payable += -viewerNet
      summary.payableCount += 1
    }
  }
  return summary
}
