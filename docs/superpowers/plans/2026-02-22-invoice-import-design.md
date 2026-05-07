# Invoice Import to Transaction - Design Document

**Date:** 2026-02-22
**Status:** Approved

## Overview

Add the ability to import invoices as transactions. Users click "Import" on a PENDING invoice, the system auto-matches merchant rules to pre-fill fields, and users confirm via the existing TransactionFormModal.

## User Flow

1. User views InvoicesPage, sees PENDING invoices with an "Import" button
2. Clicks "Import" → system calls match API to find merchant/category/account
3. TransactionFormModal opens with pre-filled data:
   - Amount = invoice.total_amount
   - Date = invoice.invoice_date
   - Type = EXPENSE
   - Merchant = matched merchant (or empty)
   - Category = merchant's default_category (or empty)
   - Account = merchant's default_account (or empty)
   - Note = invoice.invoice_number
   - invoice_id = invoice.id (hidden)
4. User reviews/modifies and submits
5. Transaction created, invoice auto-marked as PROCESSED

## Design Decisions

- **Frontend-driven approach**: Reuse existing TransactionFormModal, user has full control before submission
- **No match = still importable**: Empty fields when no MerchantRule matches, user fills manually
- **Auto PROCESSED**: Invoice status automatically changes to PROCESSED on successful transaction creation
- **Atomic operation**: Transaction creation + invoice status update in same DB transaction

## Backend Changes

### New API Endpoint

**`POST /invoices/{id}/match`** - Rule matching API

Response (matched):
```json
{
  "matched": true,
  "merchant_id": "uuid",
  "merchant_name": "全家便利商店",
  "category_id": "uuid",
  "category_name": "餐飲食品",
  "account_id": "uuid",
  "account_name": "台新信用卡"
}
```

Response (no match):
```json
{
  "matched": false
}
```

### New Usecase: InvoiceMatchService

`InvoiceMatchService.Match(ctx, invoiceID) → MatchResult`

Logic:
1. Fetch invoice by ID → get seller_name
2. Fetch all MerchantRules for user
3. Iterate rules, regex match seller_name
4. If matched → fetch Merchant → return merchant + default_category + default_account
5. If no match → return { matched: false }

### Modified: TransactionService.Create

When `invoice_id` is provided:
- Validate invoice exists and is PENDING
- Within same DB transaction: create transaction + update invoice status to PROCESSED
- If invoice already PROCESSED → return error

## Frontend Changes

### InvoicesPage

- PENDING invoices: show "匯入" button
- PROCESSED invoices: show "已匯入" badge (disabled)
- IGNORED invoices: no import button
- Click "匯入" → call match API → open TransactionFormModal with pre-filled data

### TransactionFormModal

- Add `invoiceId?: string` prop (hidden field, included in submission)
- Add `defaultValues?: Partial<TransactionForm>` prop for external pre-fill
- No other changes needed

### New Hook: useMatchInvoice

- `POST /invoices/{id}/match` mutation
- Returns match result for pre-filling the form

## Data Flow

```
InvoicesPage
  │
  ├─ Click "匯入"
  │   → POST /invoices/{id}/match
  │   → Get { merchant_id, category_id, account_id }
  │
  ├─ Open TransactionFormModal(pre-filled)
  │   → User confirms/modifies
  │   → POST /transactions { ..., invoice_id }
  │       → TransactionService.Create()
  │           → Create transaction (with invoice_id)
  │           → Update account balance
  │           → invoice.status = PROCESSED
  │       → Return transaction
  │
  └─ Refresh invoice list
```
