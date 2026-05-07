# Remove RECEIVABLE Account Type Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the RECEIVABLE account type entirely, switching shared ledger receivable tracking to pure calculation from shared_expenses data.

**Architecture:** Remove all RECEIVABLE account creation, receivable transactions, and balance-tracking logic. Settlement now only creates personal account income/expense transactions. Receivable amounts are always calculated on-the-fly from `owner_paid_amount - owner_amount` in shared_expenses. Database migration removes RECEIVABLE accounts, their transactions, and related columns.

**Tech Stack:** Go (GORM), PostgreSQL, React/TypeScript

---

### Task 1: Database Migration — Remove RECEIVABLE data and columns

**Files:**
- Create: `backend/migrations/20260225_remove_receivable_account_type.sql`

**Step 1: Write the migration SQL**

```sql
-- 20260225_remove_receivable_account_type.sql
-- Remove RECEIVABLE account type and all related data

BEGIN;

-- 1. Clear receivable transaction references from shared_expenses
UPDATE shared_expenses SET receivable_transaction_id = NULL WHERE receivable_transaction_id IS NOT NULL;
UPDATE shared_expenses SET partner_receivable_transaction_id = NULL WHERE partner_receivable_transaction_id IS NOT NULL;

-- 2. Clear settlement_transaction_id that point to receivable account transactions
-- (settlement transactions live on receivable accounts; personal ones are on settlement_personal_transaction_id)
UPDATE shared_expenses
SET settlement_transaction_id = NULL
WHERE settlement_transaction_id IN (
    SELECT t.id FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.type = 'RECEIVABLE'
);

-- 3. Delete all transactions on RECEIVABLE accounts
DELETE FROM transactions WHERE account_id IN (
    SELECT id FROM accounts WHERE type = 'RECEIVABLE'
);

-- 4. Clear foreign key references in shared_ledgers
UPDATE shared_ledgers SET receivable_account_id = NULL WHERE receivable_account_id IS NOT NULL;
UPDATE shared_ledgers SET partner_receivable_account_id = NULL WHERE partner_receivable_account_id IS NOT NULL;

-- 5. Delete all RECEIVABLE accounts
DELETE FROM accounts WHERE type = 'RECEIVABLE';

-- 6. Drop columns from shared_expenses
ALTER TABLE shared_expenses DROP COLUMN IF EXISTS receivable_transaction_id;
ALTER TABLE shared_expenses DROP COLUMN IF EXISTS partner_receivable_transaction_id;

-- 7. Make receivable_account_id nullable first, then drop
ALTER TABLE shared_ledgers ALTER COLUMN receivable_account_id DROP NOT NULL;
ALTER TABLE shared_ledgers DROP COLUMN IF EXISTS receivable_account_id;
ALTER TABLE shared_ledgers DROP COLUMN IF EXISTS partner_receivable_account_id;

COMMIT;
```

**Step 2: Run migration**

Run: `docker exec -i zenbill_db psql -U postgres -d zenbill_db < backend/migrations/20260225_remove_receivable_account_type.sql`
Expected: No errors

**Step 3: Commit**

```bash
cd backend && git add migrations/20260225_remove_receivable_account_type.sql
git commit -m "feat(migration): remove RECEIVABLE account type data and columns"
```

---

### Task 2: Domain Layer — Remove RECEIVABLE type and related fields

**Files:**
- Modify: `backend/internal/domain/account.go` (lines 17, 78-81)
- Modify: `backend/internal/domain/account_test.go` (TestAccount_IsReceivable)
- Modify: `backend/internal/domain/shared_ledger.go` (lines 20-21, 34-35)
- Modify: `backend/internal/domain/shared_expense.go` (lines 54-55)
- Modify: `backend/internal/domain/repository.go` (line 93 — FindByAccountIDWithSettlementSort, lines in SharedExpenseRepository)

**Step 1: Remove AccountTypeReceivable and IsReceivable**

In `backend/internal/domain/account.go`:
- Delete line 17: `AccountTypeReceivable AccountType = "RECEIVABLE"`
- Delete lines 78-81: entire `IsReceivable()` method

**Step 2: Remove RECEIVABLE fields from SharedLedger**

In `backend/internal/domain/shared_ledger.go`:
- Delete line 20: `ReceivableAccountID uuid.UUID ...`
- Delete line 21: `PartnerReceivableAccountID *uuid.UUID ...`
- Delete line 34: `ReceivableAccount *Account ...`
- Delete line 35: `PartnerReceivableAccount *Account ...`

**Step 3: Remove RECEIVABLE fields from SharedExpense**

In `backend/internal/domain/shared_expense.go`:
- Delete line 54: `ReceivableTransactionID *uuid.UUID ...`
- Delete line 55: `PartnerReceivableTransactionID *uuid.UUID ...`

**Step 4: Remove FindByAccountIDWithSettlementSort from TransactionRepository interface**

In `backend/internal/domain/repository.go`:
- Delete line 93: `FindByAccountIDWithSettlementSort(ctx context.Context, accountID uuid.UUID, limit, offset int) ([]Transaction, error)`

**Step 5: Remove FindSettledAtByReceivableTransactionIDs from SharedExpenseRepository interface**

In `backend/internal/domain/shared_expense.go` (SharedExpenseRepository interface):
- Delete `FindSettledAtByReceivableTransactionIDs` method declaration

**Step 6: Update FindUnsettledByLedgerID contract**

The repository query currently filters on `receivable_transaction_id IS NOT NULL`. After removal, unsettled means `settled_at IS NULL` and `owner_paid_amount != owner_amount` (there is a net receivable). Update the interface doc comment accordingly.

**Step 7: Remove TestAccount_IsReceivable**

In `backend/internal/domain/account_test.go`:
- Delete the `TestAccount_IsReceivable` test function entirely.

**Step 8: Verify compilation**

Run: `cd backend && go build ./internal/domain/...`
Expected: This will FAIL because other packages still reference removed items. That's expected at this stage.

**Step 9: Commit**

```bash
cd backend && git add internal/domain/
git commit -m "feat(domain): remove RECEIVABLE account type and related fields"
```

---

### Task 3: Repository Layer — Remove RECEIVABLE-specific queries

**Files:**
- Modify: `backend/internal/repository/transaction_repository.go` (lines 113-129, 282, 329)
- Modify: `backend/internal/repository/shared_expense_repository.go` (lines 72, 115-143)

**Step 1: Delete FindByAccountIDWithSettlementSort**

In `backend/internal/repository/transaction_repository.go`:
- Delete lines 113-129: the entire `FindByAccountIDWithSettlementSort` method.

**Step 2: Remove RECEIVABLE exclusion from stats queries**

In `backend/internal/repository/transaction_repository.go`:
- Line 282: Remove `AND accounts.type != 'RECEIVABLE'` from the WHERE clause. Since RECEIVABLE accounts no longer exist, this filter is unnecessary.
- Line 329: Same removal.

**Step 3: Delete FindSettledAtByReceivableTransactionIDs**

In `backend/internal/repository/shared_expense_repository.go`:
- Delete lines 115-143: the entire `FindSettledAtByReceivableTransactionIDs` method.

**Step 4: Update FindUnsettledByLedgerID query**

In `backend/internal/repository/shared_expense_repository.go` line 72:
- Change from: `"ledger_id = ? AND settled_at IS NULL AND receivable_transaction_id IS NOT NULL"`
- Change to: `"ledger_id = ? AND settled_at IS NULL AND (owner_paid_amount != owner_amount)"`

This ensures only expenses with a net receivable (someone paid more than their share) show up as unsettled.

**Step 5: Verify compilation**

Run: `cd backend && go build ./internal/repository/...`
Expected: May still fail due to usecase references. Expected at this stage.

**Step 6: Commit**

```bash
cd backend && git add internal/repository/
git commit -m "feat(repository): remove RECEIVABLE-specific queries and filters"
```

---

### Task 4: Usecase Layer — Remove receivable transaction logic

**Files:**
- Modify: `backend/internal/usecase/shared_ledger_service.go` (lines 33-71, 141-170)
- Modify: `backend/internal/usecase/shared_expense_service.go` (Create, Delete, Settle, SettleAll methods)
- Modify: `backend/internal/usecase/transaction_service.go` (lines 304-332, 340-347, 374-395)
- Modify: `backend/internal/usecase/sheet_sync_service.go` (lines 323-398)
- Modify: `backend/internal/usecase/shared_ledger_service_test.go`

**Step 1: SharedLedgerService.Create — stop creating RECEIVABLE account**

In `backend/internal/usecase/shared_ledger_service.go`:
- Remove lines 35-44 (RECEIVABLE account creation block)
- Remove line 56 (`ReceivableAccountID: acct.ID`)
- The method should just create the SharedLedger directly without a RECEIVABLE account.

**Step 2: SharedLedgerService.AcceptInvite — stop creating partner RECEIVABLE account**

In `backend/internal/usecase/shared_ledger_service.go`:
- Remove lines 141-158 (partner RECEIVABLE account creation and `ledger.PartnerReceivableAccountID` assignment)

**Step 3: SharedExpenseService.Create — remove receivable transaction creation**

In `backend/internal/usecase/shared_expense_service.go`:
- Remove the entire block from line 143 to line 205 (receivable transaction creation for both owner and partner).
- Keep only: (1) expense transaction creation (lines 124-141) and (2) shared expense save (lines 207-209).
- Remove references to `expense.ReceivableTransactionID` and `expense.PartnerReceivableTransactionID`.

**Step 4: SharedExpenseService.Delete — remove receivable reversal logic**

In `backend/internal/usecase/shared_expense_service.go`:
- Remove lines 264-325: the entire receivable transaction reversal block (step 1 and 1b in the code).
- Remove lines 341-361: settlement receivable transaction reversal (step 3).
- Remove lines 377-386: partner receivable settlement balance reversal (step 3c).
- Keep: expense transaction reversal (step 2, lines 327-339), settlement personal transaction reversal (step 3b, lines 363-375), and shared expense soft-delete (step 4).

**Step 5: SharedExpenseService.Settle — simplify to personal-only**

In `backend/internal/usecase/shared_expense_service.go`:
- Remove the entire receivable account transaction block (lines 483-532).
- Remove the balance-only else branch (lines 536-542).
- Remove the partner receivable mirror update (lines 545-550).
- Keep: personal account transaction creation (lines 466-515 → simplified to only personal tx), and `expense.SettledAt` marking.
- If `receiveAccountID` is nil: just mark `SettledAt` (balance-only settlement = just mark as settled).
- If `receiveAccountID` is provided: create personal income/expense transaction, then mark `SettledAt`.
- Remove `expense.SettlementTransactionID` assignment (only keep `SettlementPersonalTransactionID`).

**Step 6: SharedExpenseService.SettleAll — same simplification**

Apply the same changes as Step 5 to the `SettleAll` method (lines 595-751).

**Step 7: TransactionService — remove RECEIVABLE-specific logic**

In `backend/internal/usecase/transaction_service.go`:
- Delete `populateSettledAt` method (lines 304-332) entirely.
- Delete `listReceivableTransactions` method (lines 374-395) entirely.
- In `ListByAccountWithBalance` (lines 335-372): remove the RECEIVABLE account check block (lines 341-347). The method should always use the standard `FindByAccountID` path.
- Remove all calls to `populateSettledAt` (lines 367, 391, 445).

**Step 8: SheetSyncService.createExpenseWithReceivable — remove receivable logic**

In `backend/internal/usecase/sheet_sync_service.go`:
- Remove the receivable transaction creation and balance update from `createExpenseWithReceivable` (lines 323-398).
- The function should just save the shared expense directly (it doesn't create expense transactions for sheet-synced data anyway).
- Consider renaming to `createExpense` since there's no receivable component anymore.

**Step 9: Update tests**

In `backend/internal/usecase/shared_ledger_service_test.go`:
- Remove mock expectations for RECEIVABLE account creation in Create test.
- Remove mock expectations for partner RECEIVABLE account creation in AcceptInvite test.

**Step 10: Verify compilation and tests**

Run: `cd backend && go build ./... && go test ./internal/usecase/... -v`
Expected: All builds and tests pass.

**Step 11: Commit**

```bash
cd backend && git add internal/usecase/
git commit -m "feat(usecase): remove receivable transaction logic, use pure calculation"
```

---

### Task 5: HTTP Handler — Clean up settlement handlers

**Files:**
- Modify: `backend/internal/delivery/http/shared_expense_handler.go`

**Step 1: Verify handlers still work**

The handlers call `SharedExpenseService.Settle` and `SettleAll` which were simplified in Task 4. The handler code itself (ListReceivables, SettleReceivable, SettleAllReceivables) should still work since it just passes through to the service. Verify no compile errors.

**Step 2: Verify routes are still registered**

Routes at lines 508-510 should remain:
```
GET  /:id/receivables
POST /:id/receivables/settle-all
POST /:id/receivables/:eid/settle
```

**Step 3: Verify compilation**

Run: `cd backend && go build ./...`
Expected: PASS

**Step 4: Commit (if changes needed)**

```bash
cd backend && git add internal/delivery/
git commit -m "feat(handler): update settlement handlers after RECEIVABLE removal"
```

---

### Task 6: Frontend — Remove RECEIVABLE type and UI logic

**Files:**
- Modify: `frontend/src/types/index.ts` (lines 8, 243, 251)
- Modify: `frontend/src/hooks/useAccounts.ts` (line 5)
- Modify: `frontend/src/pages/AccountsPage.tsx` (RECEIVABLE typeConfig, line 134)
- Modify: `frontend/src/pages/AccountDetailPage.tsx` (isReceivable checks)
- Modify: `frontend/src/pages/TransactionsPage.tsx` (receivableIds logic)
- Modify: `frontend/src/pages/SharedLedgersPage.tsx` (getReceivableBalance)
- Modify: `frontend/src/pages/SharedExpenseFormPage.tsx` (RECEIVABLE filter)
- Modify: `frontend/src/pages/ReceivablesPage.tsx` (RECEIVABLE filter in accountOptions)
- Modify: `frontend/src/hooks/useSharedLedgers.ts` (receivable query invalidations)

**Step 1: types/index.ts**

- Line 8: Change `'BANK' | 'CREDIT' | 'CASH' | 'CRYPTO' | 'RECEIVABLE'` → `'BANK' | 'CREDIT' | 'CASH' | 'CRYPTO'`
- Line 243: Delete `receivable_account_id: string`
- Line 251: Delete `receivable_account?: Account`

**Step 2: useAccounts.ts**

- Line 5: Change `{ CASH: 0, BANK: 1, CRYPTO: 2, CREDIT: 3, RECEIVABLE: 4 }` → `{ CASH: 0, BANK: 1, CRYPTO: 2, CREDIT: 3 }`

**Step 3: AccountsPage.tsx**

- Remove RECEIVABLE entry from `typeConfig` object.
- Line 134: Remove the `account.type !== 'RECEIVABLE'` condition — edit/delete buttons should now always show.

**Step 4: AccountDetailPage.tsx**

- Remove `isReceivable` variable and all its conditional checks.
- Remove RECEIVABLE from `typeConfig`.
- Edit mode and edit button should always be available (except for CREDIT which may have its own rules).

**Step 5: TransactionsPage.tsx**

- Remove the `receivableIds` Set creation (line 40).
- Remove the `showEditButton` condition that checks receivableIds (line 98). Edit button should always show.

**Step 6: SharedLedgersPage.tsx**

- Remove `getReceivableBalance` function (lines 22-24).
- Replace receivable balance display (lines 73-76) with a summary-based display or remove entirely. Since GetSummary already calculates receivable from pure data, use that API endpoint or just remove the balance display from the ledger card.

**Step 7: SharedExpenseFormPage.tsx**

- Line 94: Remove `.filter((a) => a.type !== 'RECEIVABLE')` — this filter is no longer needed since RECEIVABLE accounts won't exist.

**Step 8: ReceivablesPage.tsx**

- Line 30: Change `.filter((a) => a.type !== 'RECEIVABLE' && a.type !== 'CREDIT')` → `.filter((a) => a.type !== 'CREDIT')`

**Step 9: useSharedLedgers.ts**

- Verify `useReceivables`, `useSettleReceivable`, `useSettleAllReceivables` hooks still work (they call the same API endpoints which are unchanged).
- Receivable query invalidations should still work fine.

**Step 10: Verify frontend builds**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors.

**Step 11: Commit**

```bash
cd frontend && git add src/
git commit -m "feat(frontend): remove RECEIVABLE account type from UI"
```

---

### Task 7: Full Integration Test

**Step 1: Run all backend tests**

Run: `cd backend && go test ./... -v`
Expected: All tests pass.

**Step 2: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

**Step 3: Manual smoke test**

1. Open the app, verify accounts page shows no RECEIVABLE accounts.
2. Navigate to a shared ledger, verify receivables page still loads.
3. Create a shared expense, verify it appears in receivables list.
4. Settle an expense, verify it works.

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A && git commit -m "fix: address integration issues from RECEIVABLE removal"
```
