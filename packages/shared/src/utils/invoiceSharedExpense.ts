import type { CreateSharedExpenseInput, ExpenseCategory, SharedLedger, TransactionType } from '../types'
import { getSharedLedgerPartyDisplayName } from './sharedLedgerDisplay.ts'

/**
 * 「從發票建立」交易時「同時記入共同帳本」的共用邏輯，Web 與 App 共用一份。
 *
 * 開關打開時，送出只呼叫建立共同支出的端點：後端在同一個 DB transaction
 * 內建立個人交易（連到發票）與連著它的共同支出。
 */

/** 開關只在從發票建立、類型是支出、且至少屬於一個共同帳本時出現。 */
export function shouldOfferInvoiceSharedExpense(args: {
  invoiceId: string | undefined
  type: TransactionType
  ledgerCount: number
}): boolean {
  return !!args.invoiceId && args.type === 'EXPENSE' && args.ledgerCount > 0
}

/**
 * 預設帳本：只有一本就用它；多本時用這台裝置上次選的，已不在清單中就用第一本。
 */
export function pickDefaultSharedLedgerId(
  ledgers: ReadonlyArray<Pick<SharedLedger, 'id'>>,
  lastPickedId: string | null | undefined,
): string | undefined {
  if (ledgers.length === 0) return undefined
  if (lastPickedId && ledgers.some((l) => l.id === lastPickedId)) return lastPickedId
  return ledgers[0].id
}

/** 交易表單上已填好的值，金額已換算成實際金額。 */
export interface InvoiceSharedExpenseTransaction {
  account_id: string
  amount: number
  /** YYYY-MM-DD */
  occurred_at: string
  category_id?: string
  merchant_id?: string
  invoice_id: string
}

/** 自訂分帳以「我 / 對方」表示，由本函式依呼叫者角色對應成 owner / partner。 */
export type InvoiceSharedExpenseSplit =
  | { method: 'EQUAL' }
  | { method: 'CUSTOM'; selfAmount: number; otherAmount: number }

export interface InvoiceSharedExpenseArgs {
  transaction: InvoiceSharedExpenseTransaction
  ledger: Pick<SharedLedger, 'owner_id' | 'owner_aliases' | 'partner_aliases' | 'partner_name' | 'owner' | 'partner'>
  currentUserId: string
  /** 說明的預設值。 */
  merchantName: string
  /** 使用者輸入的說明；空白時用商家名稱。 */
  description: string
  category: ExpenseCategory
  split: InvoiceSharedExpenseSplit
}

export type InvoiceSharedExpenseResult =
  | { ok: true; input: CreateSharedExpenseInput }
  | { ok: false; error: string }

const toCents = (n: number) => Math.round(n * 100)
const fromCents = (c: number) => c / 100

export function buildInvoiceSharedExpenseInput(args: InvoiceSharedExpenseArgs): InvoiceSharedExpenseResult {
  const { transaction: tx, ledger, split } = args

  const description = args.description.trim() || args.merchantName.trim()
  if (!description) return { ok: false, error: '請輸入共同支出的說明' }

  // 付款人固定是自己：從自己帳戶扣的錢，不能記成對方付的。
  const isOwner = ledger.owner_id === args.currentUserId

  const input: CreateSharedExpenseInput = {
    date: tx.occurred_at,
    category: args.category,
    description,
    payer_name: getSharedLedgerPartyDisplayName(ledger, isOwner ? 'owner' : 'partner'),
    paid_by_owner: isOwner,
    total_amount: tx.amount,
    split_method: split.method,
    payment_account_id: tx.account_id,
    invoice_id: tx.invoice_id,
  }
  if (tx.merchant_id) input.merchant_id = tx.merchant_id
  if (tx.category_id) input.personal_category_id = tx.category_id

  if (split.method === 'CUSTOM') {
    // 以「分」為單位比較，避免 0.1 + 0.2 這類浮點誤差把對得起來的帳擋下。
    const sumCents = toCents(split.selfAmount) + toCents(split.otherAmount)
    if (sumCents !== toCents(tx.amount)) {
      return {
        ok: false,
        error: `兩邊金額加總（${fromCents(sumCents)}）需等於交易金額（${fromCents(toCents(tx.amount))}）`,
      }
    }
    const ownerAmount = isOwner ? split.selfAmount : split.otherAmount
    input.owner_amount = ownerAmount
    // 由總額反推，讓兩邊加總在浮點數上也剛好等於總額，通過後端的檢查。
    input.partner_amount = tx.amount - ownerAmount
  }

  return { ok: true, input }
}
