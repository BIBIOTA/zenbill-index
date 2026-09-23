import { describe, expect, it } from 'vitest'
import {
  receivableTotalsByCurrency,
  getSharedLedgerPartyDisplayName,
  isAgentRecordedExpense,
  getPartnerPaymentMethodLabel,
  resolvePartnerPaymentMethodField,
  resolveSharedExpensePayerName,
  shouldShowPartnerPaymentMethodField,
} from '../sharedLedgerDisplay'
import type { PartnerPaymentMethodList } from '../sharedLedgerDisplay'
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

describe('partner payment method field', () => {
  const ledger = {
    owner_aliases: ['Yuki'],
    partner_aliases: [],
    partner_name: 'Zumi',
  } as SharedLedger

  const list = (methods: string[]): PartnerPaymentMethodList => ({
    available: true,
    payment_methods: methods,
  })
  const unavailable: PartnerPaymentMethodList = {
    available: false,
    payment_methods: [],
    reason: 'read_failed',
  }

  it('shows the field when the partner paid and the ledger offers a list', () => {
    expect(
      shouldShowPartnerPaymentMethodField(list(['玉山卡']), { partner_paid_amount: 800 }),
    ).toBe(true)
  })

  it('shows the field when both parties paid', () => {
    // The trigger is the partner having spent money, not being the main payer.
    expect(
      shouldShowPartnerPaymentMethodField(list(['玉山卡']), { partner_paid_amount: 200 }),
    ).toBe(true)
  })

  it('hides the field when the partner paid nothing', () => {
    expect(
      shouldShowPartnerPaymentMethodField(list(['玉山卡']), { partner_paid_amount: 0 }),
    ).toBe(false)
  })

  it('hides the field when the ledger offers no list', () => {
    // An empty list and a failed read both mean there is nothing to pick from.
    expect(shouldShowPartnerPaymentMethodField(list([]), { partner_paid_amount: 800 })).toBe(false)
    expect(shouldShowPartnerPaymentMethodField(unavailable, { partner_paid_amount: 800 })).toBe(
      false,
    )
    expect(shouldShowPartnerPaymentMethodField(undefined, { partner_paid_amount: 800 })).toBe(false)
  })

  it('labels the field with the partner display name', () => {
    expect(getPartnerPaymentMethodLabel(ledger)).toBe('Zumi 付款方式')
  })

  it('falls back to the default party name when the ledger names no partner', () => {
    expect(getPartnerPaymentMethodLabel({} as SharedLedger)).toBe('Partner 付款方式')
  })
})

describe('partner payment method field state', () => {
  const paid = { partner_paid_amount: 800 }

  it('is ready with the ledger options once the list arrives', () => {
    expect(
      resolvePartnerPaymentMethodField({
        list: { available: true, payment_methods: ['玉山卡', 'Linepay'] },
        expense: paid,
      }),
    ).toEqual({ kind: 'ready', options: ['玉山卡', 'Linepay'] })
  })

  it('is loading while the list is still in flight', () => {
    expect(
      resolvePartnerPaymentMethodField({ list: undefined, isLoading: true, expense: paid }),
    ).toEqual({ kind: 'loading' })
  })

  it('is unavailable when the list could not be read', () => {
    // A ledger that has a list but cannot reach it right now: say so, rather
    // than showing an empty dropdown the user would read as "my list is empty".
    expect(
      resolvePartnerPaymentMethodField({
        list: { available: false, payment_methods: [], reason: 'read_failed' },
        expense: paid,
      }),
    ).toEqual({ kind: 'unavailable' })
    expect(resolvePartnerPaymentMethodField({ failed: true, expense: paid })).toEqual({
      kind: 'unavailable',
    })
  })

  it('is hidden when the ledger has no list to offer at all', () => {
    // No Sheet, no 付款方式 tab, no sync: this ledger will never have options,
    // so there is nothing to explain — the field simply does not apply.
    // 'credential_unavailable' belongs here too: a ledger with no stored Google
    // credential can never be read, so calling it a temporary outage would
    // promise a recovery that never comes.
    for (const reason of [
      'sheet_not_configured',
      'tab_not_found',
      'sync_not_configured',
      'credential_unavailable',
    ]) {
      expect(
        resolvePartnerPaymentMethodField({
          list: { available: false, payment_methods: [], reason },
          expense: paid,
        }),
      ).toEqual({ kind: 'hidden' })
    }
    expect(
      resolvePartnerPaymentMethodField({
        list: { available: true, payment_methods: [] },
        expense: paid,
      }),
    ).toEqual({ kind: 'hidden' })
  })

  it('is hidden whenever the partner paid nothing, whatever the list did', () => {
    const none = { partner_paid_amount: 0 }
    expect(
      resolvePartnerPaymentMethodField({
        list: { available: true, payment_methods: ['玉山卡'] },
        expense: none,
      }),
    ).toEqual({ kind: 'hidden' })
    expect(resolvePartnerPaymentMethodField({ failed: true, expense: none })).toEqual({
      kind: 'hidden',
    })
    expect(
      resolvePartnerPaymentMethodField({ list: undefined, isLoading: true, expense: none }),
    ).toEqual({ kind: 'hidden' })
  })
})

describe('receivableTotalsByCurrency', () => {
  it('sums per currency and never across currencies', () => {
    expect(
      receivableTotalsByCurrency(
        [
          { currency: 'TWD', balance: 100 },
          { currency: 'TWD', balance: 50 },
          { currency: 'USD', balance: 12.34 },
        ],
        'TWD',
      ),
    ).toEqual([
      { currency: 'TWD', amount: 150 },
      { currency: 'USD', amount: 12.34 },
    ])
  })

  it('ignores balances the user owes, and ledgers that are settled', () => {
    expect(
      receivableTotalsByCurrency(
        [
          { currency: 'TWD', balance: -500 },
          { currency: 'USD', balance: 0 },
          { currency: 'JPY', balance: 3000 },
        ],
        'TWD',
      ),
    ).toEqual([{ currency: 'JPY', amount: 3000 }])
  })

  it('headlines the preferred currency, then orders by amount', () => {
    const totals = receivableTotalsByCurrency(
      [
        { currency: 'USD', balance: 10 },
        { currency: 'JPY', balance: 90000 },
        { currency: 'TWD', balance: 1 },
      ],
      'TWD',
    )
    expect(totals.map((t) => t.currency)).toEqual(['TWD', 'JPY', 'USD'])
  })

  it('normalises the currency code', () => {
    expect(receivableTotalsByCurrency([{ currency: 'twd', balance: 5 }], 'TWD')).toEqual([
      { currency: 'TWD', amount: 5 },
    ])
  })

  it('returns nothing when there is nothing outstanding', () => {
    expect(receivableTotalsByCurrency([], 'TWD')).toEqual([])
  })
})
