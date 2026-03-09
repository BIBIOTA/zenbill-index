# Credit Card Transfer Default Account

## Summary

When creating a transfer from a credit card account detail page, default the source account to the card's linked bank account (`auto_pay_from_id`) and the target account to the credit card itself. If no `auto_pay_from_id` is set, leave target account empty for user selection.

## Default Transfer Direction

Bank Account (AutoPayFrom) → Credit Card (current account)

- `source account` = `auto_pay_from_id` (bank account)
- `target account` = current credit card account

## Scope

Frontend only — no backend changes required.

### Files to Modify

| File | Change |
|------|--------|
| `app/app/accounts/[id].tsx` | Pass transfer default params when navigating to new transaction |
| `app/components/transactions/TransactionForm.tsx` | Accept and apply `targetAccountId` initial value |
| `frontend/src/pages/AccountDetailPage.tsx` | Pass transfer default params when navigating to new transaction |
| `frontend/src/components/transactions/TransactionForm.tsx` | Accept and apply `targetAccountId` initial value |

### Logic

1. Account detail page detects credit card with `auto_pay_from_id`
2. "New transfer" action passes: `type=TRANSFER`, `accountId=auto_pay_from_id`, `targetAccountId=currentAccountId`
3. TransactionForm initializes with these values
4. If `auto_pay_from_id` is null, pass only `type=TRANSFER` and `accountId=currentAccountId`, leave target empty
