# Credit Card Transfer Default Account

**Date:** 2026-02-23
**Status:** Approved

## Problem

When creating a transfer from a credit card detail page, the user switches type to TRANSFER. The existing logic moves the credit card to the target account (轉入帳戶) and clears the source account (帳戶). The user must then manually select the bank account to pay from.

Since credit cards already have an `auto_pay_from_id` field linking to a bank account, we should use it as the default source account.

## Design

**Single file change:** `frontend/src/components/transactions/TransactionForm.tsx`

**Current behavior (lines 246-254):**
When switching to TRANSFER type with `account_id` set and no `target_account_id`:
- Moves `account_id` → `target_account_id`
- Clears `account_id` to `''`

**New behavior:**
Same as above, plus:
- Look up the moved account in the `accounts` list
- If it's a CREDIT type account with `auto_pay_from_id` set → fill `account_id` with `auto_pay_from_id`
- Otherwise → leave `account_id` empty (existing behavior)

**Code change in the type switch onClick handler:**
```typescript
...(t === 'TRANSFER' ? {
  merchant_id: undefined,
  category_id: undefined,
  ...(form.account_id && !form.target_account_id ? (() => {
    const currentAccount = accounts?.find((a) => a.id === form.account_id)
    return {
      target_account_id: form.account_id,
      account_id: (currentAccount?.type === 'CREDIT' && currentAccount.auto_pay_from_id) || '',
    }
  })() : {}),
} : {}),
```

## Scope

- **Files changed:** 1 (TransactionForm.tsx)
- **No backend changes**
- **No new API calls** — `accounts` data is already fetched via `useAccounts()`
