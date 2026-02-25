# Receivable Account Sorting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sort RECEIVABLE account transactions by unsettled-first, then by updated_at DESC, and hide running balance for RECEIVABLE accounts.

**Architecture:** Add a new repository method `FindByAccountIDWithSettlementSort` that LEFT JOINs `shared_expenses` to sort by settlement status. The usecase detects RECEIVABLE accounts and calls this method instead of `FindByAccountID`, skipping running balance calculation. Frontend hides running balance column for RECEIVABLE accounts.

**Tech Stack:** Go/GORM (backend), React/TypeScript (frontend)

---

### Task 1: Add new repository interface method

**Files:**
- Modify: `backend/internal/domain/repository.go:92` (add method after FindByAccountID)

**Step 1: Add interface method**

Add `FindByAccountIDWithSettlementSort` to `TransactionRepository` interface, right after line 92 (`FindByAccountID`):

```go
FindByAccountIDWithSettlementSort(ctx context.Context, accountID uuid.UUID, limit, offset int) ([]Transaction, error)
```

**Step 2: Verify it compiles (expect failure — implementation missing)**

Run: `cd backend && go build ./internal/domain/...`
Expected: PASS (interface only, no implementors checked yet)

**Step 3: Commit**

```bash
git add backend/internal/domain/repository.go
git commit -m "feat(domain): add FindByAccountIDWithSettlementSort to TransactionRepository interface"
```

---

### Task 2: Implement repository method

**Files:**
- Modify: `backend/internal/repository/transaction_repository.go` (add method after FindByAccountID, ~line 111)

**Step 1: Implement the method**

Add after the existing `FindByAccountID` method (after line 111):

```go
// FindByAccountIDWithSettlementSort finds transactions for a RECEIVABLE account,
// sorted by unsettled first, then by updated_at DESC.
func (r *TransactionRepositoryImpl) FindByAccountIDWithSettlementSort(ctx context.Context, accountID uuid.UUID, limit, offset int) ([]domain.Transaction, error) {
	var transactions []domain.Transaction
	err := r.db.WithContext(ctx).
		Select("transactions.*").
		Joins("LEFT JOIN shared_expenses ON shared_expenses.receivable_transaction_id = transactions.id OR shared_expenses.partner_receivable_transaction_id = transactions.id").
		Where("transactions.account_id = ? OR transactions.target_account_id = ?", accountID, accountID).
		Order("(shared_expenses.settled_at IS NULL OR shared_expenses.id IS NULL) DESC, transactions.updated_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&transactions).Error
	if err != nil {
		return nil, err
	}
	return transactions, nil
}
```

**Step 2: Verify compilation**

Run: `cd backend && go build ./...`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/internal/repository/transaction_repository.go
git commit -m "feat(repository): implement FindByAccountIDWithSettlementSort with LEFT JOIN"
```

---

### Task 3: Update usecase to use new sort for RECEIVABLE accounts

**Files:**
- Modify: `backend/internal/usecase/transaction_service.go` — `ListByAccountWithBalance` method (~line 334-364)

**Step 1: Modify ListByAccountWithBalance**

Replace the current `ListByAccountWithBalance` method with logic that:
1. Fetches the account to check its type
2. If RECEIVABLE: uses `FindByAccountIDWithSettlementSort`, skips running balance, populates settled_at
3. If not RECEIVABLE: keeps existing logic unchanged

```go
func (s *TransactionService) ListByAccountWithBalance(
	ctx context.Context,
	accountID uuid.UUID,
	accountBalance float64,
	limit, offset int,
) ([]TransactionWithBalance, error) {
	// Check if this is a RECEIVABLE account
	if s.acctRepo != nil {
		account, err := s.acctRepo.FindByID(ctx, accountID)
		if err == nil && account.Type == domain.AccountTypeReceivable {
			return s.listReceivableTransactions(ctx, accountID, limit, offset)
		}
	}

	txs, err := s.txRepo.FindByAccountID(ctx, accountID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("find transactions: %w", err)
	}

	sumNewer, err := s.txRepo.SumEffectiveAmountForAccount(ctx, accountID, offset)
	if err != nil {
		return nil, fmt.Errorf("sum newer transactions: %w", err)
	}

	result := make([]TransactionWithBalance, len(txs))
	runningBal := accountBalance - sumNewer
	for i := range txs {
		result[i].Transaction = txs[i]
		result[i].RunningBalance = runningBal
		runningBal -= effectiveAmount(&txs[i], accountID)
	}

	if err := s.populateSettledAt(ctx, accountID, result); err != nil {
		return nil, err
	}

	return result, nil
}

// listReceivableTransactions returns transactions for a RECEIVABLE account,
// sorted by unsettled-first then updated_at DESC, without running balance.
func (s *TransactionService) listReceivableTransactions(
	ctx context.Context,
	accountID uuid.UUID,
	limit, offset int,
) ([]TransactionWithBalance, error) {
	txs, err := s.txRepo.FindByAccountIDWithSettlementSort(ctx, accountID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("find receivable transactions: %w", err)
	}

	result := make([]TransactionWithBalance, len(txs))
	for i := range txs {
		result[i].Transaction = txs[i]
	}

	if err := s.populateSettledAt(ctx, accountID, result); err != nil {
		return nil, err
	}

	return result, nil
}
```

**Step 2: Verify compilation**

Run: `cd backend && go build ./...`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/internal/usecase/transaction_service.go
git commit -m "feat(usecase): use settlement-sorted query for RECEIVABLE accounts, skip running balance"
```

---

### Task 4: Hide running balance in frontend for RECEIVABLE accounts

**Files:**
- Modify: `frontend/src/pages/AccountDetailPage.tsx` (~line 337)

**Step 1: Conditionally pass runningBalance**

On line 337, change:
```tsx
runningBalance={tx.running_balance}
```
to:
```tsx
runningBalance={isReceivable ? undefined : tx.running_balance}
```

**Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/pages/AccountDetailPage.tsx
git commit -m "feat(frontend): hide running balance for RECEIVABLE accounts"
```

---

### Task 5: Verify end-to-end

**Step 1: Run backend tests**

Run: `cd backend && go test ./... -v -count=1`
Expected: All tests PASS

**Step 2: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

**Step 3: Manual verification checklist**
- [ ] RECEIVABLE account detail page shows unsettled transactions first
- [ ] Settled transactions appear after unsettled ones
- [ ] Within each group, most recently updated transactions appear first
- [ ] Running balance is NOT shown for RECEIVABLE accounts
- [ ] Non-RECEIVABLE accounts are unchanged (still sorted by occurred_at DESC with running balance)
