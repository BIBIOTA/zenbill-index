# Invoice Import: Auto Rule Creation Prompt

**Date:** 2026-02-23
**Status:** Approved

## Problem

When importing an invoice to a transaction, if the Rule Engine doesn't match a merchant, the user must manually select/create a merchant. After creating the transaction, the system doesn't prompt the user to create a rule linking the invoice's `SellerName` to the chosen merchant. This means the same `SellerName` won't be matched next time.

## Solution

After successfully creating a transaction from an invoice import, if the selected merchant name differs from the invoice's `SellerName`, prompt the user to create a MerchantRule automatically.

## Flow

```
User clicks "匯入" on InvoicesPage
  → Calls POST /invoices/{id}/match (existing)
  → Navigates to TransactionFormPage with defaultValues + sellerName (NEW)
  → User adjusts form and submits
  → Transaction created successfully
  → Check: has invoiceId? has merchant_id? merchantName !== sellerName?
  → Show RuleCreatePrompt Dialog
  → User confirms → POST /merchant-rules (existing API)
    keyword = sellerName, match_type = CONTAINS, priority = 0
```

## Changes

### 1. `InvoicesPage.tsx` — Pass sellerName in route state

Add `sellerName: inv.seller_name` to the navigate state.

### 2. `TransactionFormPage.tsx` — Read sellerName from route state

Pass `sellerName` prop to `TransactionForm`.

### 3. `TransactionForm.tsx` — Post-submit rule creation prompt

After successful transaction creation:
- If `invoiceId` exists AND `merchant_id` is set AND merchant name !== sellerName
- Show `RuleCreatePrompt` dialog

### 4. New component: `RuleCreatePrompt.tsx`

Dialog asking: "是否將發票商家『{sellerName}』自動對應到『{merchantName}』？"
- Default rule: `match_type: CONTAINS`, `keyword: sellerName`, `priority: 0`
- Buttons: "建立規則" / "跳過"
- On confirm: calls `useCreateRule()` then navigates away

## No Backend Changes

All required APIs already exist:
- `POST /merchant-rules` — create rule
- `POST /invoices/{id}/match` — match invoice
- Existing hooks: `useCreateRule()`, `useMatchInvoice()`
