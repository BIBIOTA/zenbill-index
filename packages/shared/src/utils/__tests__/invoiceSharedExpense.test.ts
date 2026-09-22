import { describe, expect, it } from 'vitest'
import {
  buildInvoiceSharedExpenseInput,
  pickDefaultSharedLedgerId,
  shouldOfferInvoiceSharedExpense,
} from '../invoiceSharedExpense'
import type { InvoiceSharedExpenseArgs, InvoiceSharedExpenseTransaction } from '../invoiceSharedExpense'
import type { SharedLedger } from '../../types'

const ledger = {
  owner_id: 'owner-1',
  partner_name: '小美',
  owner_aliases: ['阿明'],
  partner_aliases: [],
} as unknown as SharedLedger

const tx: InvoiceSharedExpenseTransaction = {
  account_id: 'acct-1',
  amount: 600,
  occurred_at: '2026-09-20',
  category_id: 'cat-1',
  merchant_id: 'merchant-1',
  invoice_id: 'inv-1',
}

const base: InvoiceSharedExpenseArgs = {
  transaction: tx,
  ledger,
  currentUserId: 'owner-1',
  merchantName: '全聯',
  description: '',
  category: 'other',
  split: { method: 'EQUAL' },
}

function build(overrides: Partial<InvoiceSharedExpenseArgs> = {}) {
  const result = buildInvoiceSharedExpenseInput({ ...base, ...overrides })
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`)
  return result.input
}

describe('buildInvoiceSharedExpenseInput', () => {
  it('carries the transaction form over: account, amount, date, category, merchant, invoice', () => {
    const input = build()
    expect(input.payment_account_id).toBe('acct-1')
    expect(input.total_amount).toBe(600)
    expect(input.date).toBe('2026-09-20')
    expect(input.personal_category_id).toBe('cat-1')
    expect(input.merchant_id).toBe('merchant-1')
    expect(input.invoice_id).toBe('inv-1')
    expect(input.category).toBe('other')
  })

  it('splits equally by default, leaving the halves to the server', () => {
    const input = build()
    expect(input.split_method).toBe('EQUAL')
    expect(input.owner_amount).toBeUndefined()
    expect(input.partner_amount).toBeUndefined()
  })

  it('maps a custom split onto owner and partner for the owner', () => {
    const input = build({ split: { method: 'CUSTOM', selfAmount: 400, otherAmount: 200 } })
    expect(input.split_method).toBe('CUSTOM')
    expect(input.owner_amount).toBe(400)
    expect(input.partner_amount).toBe(200)
  })

  it('maps a custom split the other way round for the partner', () => {
    const input = build({
      currentUserId: 'partner-1',
      split: { method: 'CUSTOM', selfAmount: 400, otherAmount: 200 },
    })
    expect(input.owner_amount).toBe(200)
    expect(input.partner_amount).toBe(400)
  })

  it('refuses a custom split that does not add up to the transaction amount', () => {
    const result = buildInvoiceSharedExpenseInput({
      ...base,
      split: { method: 'CUSTOM', selfAmount: 400, otherAmount: 100 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('500')
      expect(result.error).toContain('600')
    }
  })

  it('accepts a custom split whose decimals only add up after rounding', () => {
    const result = buildInvoiceSharedExpenseInput({
      ...base,
      transaction: { ...tx, amount: 0.3 },
      split: { method: 'CUSTOM', selfAmount: 0.1, otherAmount: 0.2 },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Exactly equal in floating point, so the server's own check passes.
      expect(result.input.owner_amount! + result.input.partner_amount!).toBe(0.3)
    }
  })

  it('describes the expense by the merchant name by default', () => {
    expect(build().description).toBe('全聯')
  })

  it('keeps a description the user typed', () => {
    expect(build({ description: '全聯 日用品' }).description).toBe('全聯 日用品')
  })

  it('refuses when there is neither a description nor a merchant name', () => {
    const result = buildInvoiceSharedExpenseInput({ ...base, merchantName: '', description: '  ' })
    expect(result.ok).toBe(false)
  })

  it('always records the caller as the payer — owner', () => {
    const input = build()
    expect(input.paid_by_owner).toBe(true)
    expect(input.payer_name).toBe('阿明')
  })

  it('always records the caller as the payer — partner', () => {
    const input = build({ currentUserId: 'partner-1' })
    expect(input.paid_by_owner).toBe(false)
    expect(input.payer_name).toBe('小美')
  })

  it('omits the optional personal fields the form left empty', () => {
    const input = build({ transaction: { ...tx, category_id: undefined, merchant_id: undefined } })
    expect('personal_category_id' in input).toBe(false)
    expect('merchant_id' in input).toBe(false)
  })
})

describe('shouldOfferInvoiceSharedExpense', () => {
  it('offers the toggle on an invoice expense for a ledger member', () => {
    expect(shouldOfferInvoiceSharedExpense({ invoiceId: 'inv-1', type: 'EXPENSE', ledgerCount: 1 })).toBe(true)
  })

  it('hides it when the form is not from an invoice', () => {
    expect(shouldOfferInvoiceSharedExpense({ invoiceId: undefined, type: 'EXPENSE', ledgerCount: 1 })).toBe(false)
  })

  it('hides it for income and transfers', () => {
    expect(shouldOfferInvoiceSharedExpense({ invoiceId: 'inv-1', type: 'INCOME', ledgerCount: 1 })).toBe(false)
    expect(shouldOfferInvoiceSharedExpense({ invoiceId: 'inv-1', type: 'TRANSFER', ledgerCount: 1 })).toBe(false)
  })

  it('hides it from someone in no shared ledger', () => {
    expect(shouldOfferInvoiceSharedExpense({ invoiceId: 'inv-1', type: 'EXPENSE', ledgerCount: 0 })).toBe(false)
  })
})

describe('pickDefaultSharedLedgerId', () => {
  const ledgers = [{ id: 'a' }, { id: 'b' }]

  it('uses the only ledger there is', () => {
    expect(pickDefaultSharedLedgerId([{ id: 'a' }], 'b')).toBe('a')
  })

  it('uses the last-picked ledger when it is still one of them', () => {
    expect(pickDefaultSharedLedgerId(ledgers, 'b')).toBe('b')
  })

  it('falls back to the first ledger when the last pick is gone or unknown', () => {
    expect(pickDefaultSharedLedgerId(ledgers, 'gone')).toBe('a')
    expect(pickDefaultSharedLedgerId(ledgers, null)).toBe('a')
  })

  it('has nothing to pick without ledgers', () => {
    expect(pickDefaultSharedLedgerId([], 'a')).toBeUndefined()
  })
})
