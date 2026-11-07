import { describe, expect, it } from 'vitest'
import {
  receivableTotalsByCurrency,
  getLedgerBalanceDisplay,
  partyInitial,
  getSplitMethodLabel,
  summarizeReceivables,
  getSharedLedgerPartyDisplayName,
  getPartnerJoinLabel,
  isPartnerJoined,
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

describe('partner join status', () => {
  it('treats a ledger with a partner_id as joined', () => {
    expect(isPartnerJoined({ partner_id: 'b3c1f1de-0000-0000-0000-000000000001' })).toBe(true)
    expect(getPartnerJoinLabel({ partner_id: 'b3c1f1de-0000-0000-0000-000000000001' })).toBe('已加入')
  })

  it('treats a ledger without a partner_id as still waiting', () => {
    expect(isPartnerJoined({ partner_id: null })).toBe(false)
    expect(getPartnerJoinLabel({ partner_id: null })).toBe('等待加入')
  })

  it('treats a missing ledger as not joined', () => {
    expect(isPartnerJoined(undefined)).toBe(false)
  })
})

describe('getLedgerBalanceDisplay', () => {
  const ledger = {
    partner_name: '小安',
    partner_aliases: [],
    owner_aliases: ['Yuki'],
    partner: undefined,
    owner: undefined,
  }

  it('owner sees a positive balance as owed by the partner', () => {
    expect(getLedgerBalanceDisplay(ledger, 2340, true)).toEqual({ label: '小安待付你', amount: 2340, tone: 'income' })
  })

  it('owner sees a negative balance as owed to the partner', () => {
    expect(getLedgerBalanceDisplay(ledger, -500, true)).toEqual({ label: '你待付小安', amount: 500, tone: 'expense' })
  })

  it('partner sees the same balance from their side, naming the owner', () => {
    expect(getLedgerBalanceDisplay(ledger, 2340, false)).toEqual({ label: '你待付Yuki', amount: 2340, tone: 'expense' })
    expect(getLedgerBalanceDisplay(ledger, -500, false)).toEqual({ label: 'Yuki待付你', amount: 500, tone: 'income' })
  })

  it('zero is settled for both sides', () => {
    expect(getLedgerBalanceDisplay(ledger, 0, true)).toEqual({ label: '已結清', amount: 0, tone: 'settled' })
    expect(getLedgerBalanceDisplay(ledger, 0, false).tone).toBe('settled')
  })
})

describe('partyInitial', () => {
  it('uses the last character of a CJK name', () => {
    expect(partyInitial('小安')).toBe('安')
    expect(partyInitial('阿哲')).toBe('哲')
  })

  it('uses the first letter of a Latin name, uppercased', () => {
    expect(partyInitial('Zumi')).toBe('Z')
    expect(partyInitial('mei.lin')).toBe('M')
  })

  it('falls back to ? for an empty name', () => {
    expect(partyInitial('  ')).toBe('?')
  })
})

describe('getSplitMethodLabel', () => {
  it('reads from the owner side', () => {
    expect(getSplitMethodLabel('FULL_OWNER', true, '小安')).toBe('全算你')
    expect(getSplitMethodLabel('FULL_PARTNER', true, '小安')).toBe('全算小安')
  })

  it('reads from the partner side', () => {
    expect(getSplitMethodLabel('FULL_OWNER', false, 'Yuki')).toBe('全算Yuki')
    expect(getSplitMethodLabel('FULL_PARTNER', false, 'Yuki')).toBe('全算你')
  })

  it('labels equal and custom splits the same for both sides', () => {
    expect(getSplitMethodLabel('EQUAL', false, 'Yuki')).toBe('均分')
    expect(getSplitMethodLabel('CUSTOM', true, '小安')).toBe('自訂')
  })
})

describe('summarizeReceivables', () => {
  // owner paid 2560 split evenly → partner owes 1280; partner paid 1846 split evenly → owner owes 923
  const expenses = [
    { owner_paid_amount: 2560, owner_amount: 1280 },
    { owner_paid_amount: 0, owner_amount: 923 },
    { owner_paid_amount: 386, owner_amount: 193 },
  ]

  it('sums what the owner is owed and owes', () => {
    expect(summarizeReceivables(expenses, true)).toEqual({ net: 550, receivable: 1473, receivableCount: 2, payable: 923, payableCount: 1 })
  })

  it('flips everything for the partner', () => {
    expect(summarizeReceivables(expenses, false)).toEqual({ net: -550, receivable: 923, receivableCount: 1, payable: 1473, payableCount: 2 })
  })

  it('ignores rows that net to zero', () => {
    expect(summarizeReceivables([{ owner_paid_amount: 500, owner_amount: 500 }], true)).toEqual({ net: 0, receivable: 0, receivableCount: 0, payable: 0, payableCount: 0 })
  })
})
