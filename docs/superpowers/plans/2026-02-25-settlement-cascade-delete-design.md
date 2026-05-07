# Settlement Cascade Delete Design

## Problem

When a receivable is settled with a linked personal account, the system creates a TRANSFER transaction. If the user later deletes that TRANSFER from their personal account's transaction list, the account balances are reversed but `SharedExpense.SettledAt` remains set — causing inconsistency where receivables appear settled but the money transfer no longer exists.

## Root Cause

Settlement TRANSFER transactions have no back-reference to the SharedExpense(s) they settled. `TransactionService.Delete()` has no awareness of SharedExpense, so it cannot cascade the state change.

## Solution: SettlementTransactionID + Cascade Delete

### Schema Change

Add `settlement_transaction_id` to `shared_expenses`:

```sql
ALTER TABLE shared_expenses
  ADD COLUMN settlement_transaction_id UUID NULL;
```

- Nullable: balance-only settlements (no account) have no TRANSFER
- Many-to-one: `SettleAll()` creates one TRANSFER for multiple expenses

### Domain Change

```go
type SharedExpense struct {
    // ... existing fields ...
    SettlementTransactionID *uuid.UUID // TRANSFER created during settlement
}
```

`SettledAt` and `SettlementTransactionID` are always set/cleared together for consistency.

### Settle / SettleAll Modification

**Settle()** — after creating TRANSFER:
```
expense.SettledAt = &now
expense.SettlementTransactionID = &transferTx.ID  // NEW
```

**SettleAll()** — after creating single TRANSFER:
```
for each expense:
    expense.SettledAt = &now
    expense.SettlementTransactionID = &transferTx.ID  // NEW (all point to same TX)
```

**Balance-only mode** (receiveAccountID = nil): no change, `SettlementTransactionID` stays nil.

### TransactionService.Delete Cascade

When deleting any transaction, check for linked settlements:

```
TransactionService.Delete(txID):
  1. Fetch transaction                          // existing
  2. reverseBalance (both accounts)             // existing — handles money correctly
  3. Query SharedExpense WHERE                  // NEW
     settlement_transaction_id = txID
  4. If results found:                          // NEW
     - Clear SettledAt = nil
     - Clear SettlementTransactionID = nil
  5. Hard-delete transaction                    // existing
```

All within a single DB transaction for atomicity.

**New dependency:** `TransactionService` needs `SharedExpenseRepository` injected.

### SharedExpenseService.Delete Edge Case

When deleting a settled SharedExpense that has `SettlementTransactionID`:

- Query how many OTHER expenses share the same `SettlementTransactionID`
- If this is the LAST one → delete the TRANSFER transaction + reverse its balance
- If others remain → only clear this expense's link, leave TRANSFER intact

### New Repository Methods

```go
// SharedExpenseRepository
FindBySettlementTransactionID(ctx, txID uuid.UUID) ([]*SharedExpense, error)
ClearSettlement(ctx, expenseIDs []uuid.UUID) error
```

## Scope

| Layer | File | Change |
|-------|------|--------|
| Domain | `shared_expense.go` | Add `SettlementTransactionID` field |
| Repository | `shared_expense_repository.go` | Add `FindBySettlementTransactionID`, `ClearSettlement` |
| Usecase | `shared_expense_service.go` | Settle/SettleAll store ID; Delete handles shared TRANSFER |
| Usecase | `transaction_service.go` | Delete cascades to clear settlements; add SharedExpenseRepo dep |
| Migration | New SQL file | `ADD COLUMN settlement_transaction_id` |
| Delivery | No changes | API interface unchanged |

## Not Affected

- Balance-only settlements (no TRANSFER, no `SettlementTransactionID`)
- Non-settlement TRANSFER transactions (query returns empty, no side effects)
- Frontend (no API changes)
