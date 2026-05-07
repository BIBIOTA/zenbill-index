# Shared Expense: Filter Payment Accounts by Ledger Currency

**Date:** 2026-03-15
**Status:** Approved

## Problem

When creating a shared expense and toggling "計入個人記帳", the payment account dropdown shows ALL user accounts regardless of currency. This allows selecting an account with a different currency than the shared ledger, which is semantically incorrect — the shared expense amount is in the ledger's currency, so the personal transaction should use an account of the same currency.

## Design

### Approach: Frontend Filtering

Filter the account options list by `account.currency === ledger.currency` in both App and Web shared expense forms.

### Changes

**1. `buildAccountOptions` — Add optional `currency` parameter (both App and Web versions)**

```typescript
export function buildAccountOptions(
  accounts: Account[],
  excludeId?: string,
  currency?: string,    // NEW: filter by currency
): SelectOption[]
```

When `currency` is provided, only include accounts where `account.currency === currency`.

**2. App `new.tsx` — Pass ledger currency**

```typescript
const accountOptions = buildAccountOptions(accounts ?? [], undefined, ledger?.currency)
```

When `accountOptions` is empty and `recordPersonal` is ON, show hint text: "無相同幣別的帳戶".

**3. Web `SharedExpenseFormPage.tsx` — Pass ledger currency**

```typescript
const personalAccountOptions = buildAccountOptions(accounts ?? [], undefined, ledger?.currency)
```

Same empty-state hint.

**4. Merchant default_account_id guard**

In `handleMerchantChange`, skip auto-filling `paymentAccountId` if the merchant's default account has a different currency than the ledger:

```typescript
if (!paymentAccountId && merchant?.default_account_id) {
  const defaultAccount = accounts?.find(a => a.id === merchant.default_account_id)
  if (!ledger?.currency || defaultAccount?.currency === ledger.currency) {
    setPaymentAccountId(merchant.default_account_id)
  }
}
```

### Edge Cases

- **No matching accounts:** Show "無相同幣別的帳戶" text in place of account dropdown. Toggle remains visible.
- **Selected account becomes invalid (e.g., ledger changes):** Reset `paymentAccountId` if it no longer matches.
- **Merchant default account has different currency:** Skip auto-fill silently.

### Files Modified

1. `app/components/transactions/accountOptions.ts` — add `currency` param
2. `frontend/src/components/transactions/accountOptions.ts` — add `currency` param
3. `app/app/shared-ledgers/[id]/expenses/new.tsx` — pass currency, guard merchant default, empty state
4. `frontend/src/pages/SharedExpenseFormPage.tsx` — pass currency, guard merchant default, empty state
