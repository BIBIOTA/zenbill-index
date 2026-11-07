import type { SplitMethod } from '../types/index.ts'

export interface SharedExpensePreviewInput {
  /** Display-value total (what the user typed). */
  total: number
  method: SplitMethod
  /** Only read for CUSTOM. */
  ownerAmount?: number
  partnerAmount?: number
  payerIsOwner: boolean
  viewerIsOwner: boolean
  isSettlement: boolean
}

export interface SharedExpensePreview {
  /** Viewer's share and the other side's share, in display values. */
  mine: number
  theirs: number
  /** Share of the total as 0–100, for the ratio bar. */
  minePercent: number
  theirsPercent: number
  /** What recording it does to the balance, with {other} still to be filled in by the caller. */
  effect:
    | { kind: 'other-owes-you'; amount: number }
    | { kind: 'you-owe-other'; amount: number }
    | { kind: 'all-yours' }
    | { kind: 'all-theirs' }
    | { kind: 'you-repay-other'; amount: number }
    | { kind: 'other-repays-you'; amount: number }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Equal split as the form does it: the owner's half is floored, the partner takes the remainder. */
export function equalSplitShares(total: number): { owner: number; partner: number } {
  const owner = Math.floor((total / 2) * 100) / 100
  return { owner, partner: round2(total - owner) }
}

function ownerPartnerShares(input: SharedExpensePreviewInput): { owner: number; partner: number } {
  const { total, method } = input
  switch (method) {
    case 'FULL_OWNER':
      return { owner: total, partner: 0 }
    case 'FULL_PARTNER':
      return { owner: 0, partner: total }
    case 'CUSTOM':
      return { owner: input.ownerAmount ?? 0, partner: input.partnerAmount ?? 0 }
    default:
      return equalSplitShares(total)
  }
}

/**
 * The split preview beside the shared-expense form. Pure: everything comes from
 * the form's current values, nothing from the server.
 */
export function previewSharedExpenseSplit(input: SharedExpensePreviewInput): SharedExpensePreview {
  const { total, payerIsOwner, viewerIsOwner, isSettlement } = input
  const viewerPaid = payerIsOwner === viewerIsOwner

  if (isSettlement) {
    return {
      mine: 0,
      theirs: 0,
      minePercent: 0,
      theirsPercent: 0,
      effect: viewerPaid ? { kind: 'you-repay-other', amount: total } : { kind: 'other-repays-you', amount: total },
    }
  }

  const { owner, partner } = ownerPartnerShares(input)
  const mine = viewerIsOwner ? owner : partner
  const theirs = viewerIsOwner ? partner : owner
  const sum = mine + theirs
  const minePercent = sum > 0 ? Math.round((mine / sum) * 100) : 0

  let effect: SharedExpensePreview['effect']
  if (viewerPaid) effect = theirs > 0 ? { kind: 'other-owes-you', amount: theirs } : { kind: 'all-yours' }
  else effect = mine > 0 ? { kind: 'you-owe-other', amount: mine } : { kind: 'all-theirs' }

  return { mine, theirs, minePercent, theirsPercent: sum > 0 ? 100 - minePercent : 0, effect }
}

/** One-line wording of a preview effect; `money` formats a display value. */
export function describeSharedExpenseEffect(
  effect: SharedExpensePreview['effect'],
  otherName: string,
  money: (amount: number) => string,
): string {
  switch (effect.kind) {
    case 'other-owes-you':
      return `${otherName}要付你 ${money(effect.amount)}`
    case 'you-owe-other':
      return `你要付${otherName} ${money(effect.amount)}`
    case 'all-yours':
      return '全部算你，不影響待收款'
    case 'all-theirs':
      return `全部算${otherName}，不影響待收款`
    case 'you-repay-other':
      return `你還${otherName} ${money(effect.amount)}`
    case 'other-repays-you':
      return `${otherName}還你 ${money(effect.amount)}`
  }
}
