# Running Balance in Account Transaction Detail

**Date:** 2026-02-23
**Status:** Approved

## Goal

Display the account balance **at the time of each transaction** in the account detail transaction list.

## Design Decisions

- **Calculation location:** Backend (API returns `running_balance` per transaction)
- **Sort order:** Maintained as `occurred_at DESC` (newest first)
- **Transfer handling:** Auto-detect account role (source = debit, target = credit)
- **Approach:** Runtime calculation from current account balance (no schema change)

## Calculation Logic

Transactions are sorted newest-first. The running balance represents the account balance **after** that transaction was applied.

```
effective_amount(tx, accountID):
  EXPENSE  → -amount
  INCOME   → +amount
  TRANSFER → -amount if accountID == tx.AccountID (source)
           → +amount if accountID == tx.TargetAccountID (target)

For page with offset:
  sum_newer = SUM(effective_amount) for all transactions newer than current page
  running_balance[0] = account.balance - sum_newer
  running_balance[i] = running_balance[i-1] - effective_amount(tx[i-1])
```

## API Change

**GET `/transactions?account_id={id}`** — each transaction in response includes `running_balance` field.

Only calculated when `account_id` filter is specified. Omitted otherwise.

```json
{
  "data": [
    {
      "id": "...",
      "type": "expense",
      "amount": 150.00,
      "occurred_at": "2026-02-23T12:00:00Z",
      "running_balance": 8500.00
    }
  ]
}
```

## Implementation Layers

1. **Repository:** New method to sum effective amounts for transactions newer than offset
2. **Usecase:** Calculate running_balance array after fetching transactions
3. **Delivery:** Include `running_balance` in response when account_id is present
4. **Frontend:** Display running balance in AccountDetailPage transaction rows
