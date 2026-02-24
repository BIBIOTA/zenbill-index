# Multi-Currency Transfer Balance Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix balance calculations so cross-currency transfers apply the correct amount to each account.

**Architecture:** Add `TargetTransferAmount()` method to Transaction domain entity. Update `applyBalance`, `reverseBalance`, `effectiveAmount` in usecase layer and `SumEffectiveAmountForAccount` SQL in repository layer to use target-currency amount for the target account side of transfers.

**Tech Stack:** Go, GORM, PostgreSQL, testify/mock

---

### Task 1: Add `TargetTransferAmount()` to domain entity

**Files:**
- Modify: `backend/internal/domain/transaction.go:84` (after `IsForeignCurrency`)
- Test: `backend/internal/domain/transaction_test.go`

**Step 1: Write the failing tests**

Add to `backend/internal/domain/transaction_test.go`:

```go
func TestTransaction_TargetTransferAmount(t *testing.T) {
	// Same-currency transfer: no OriginalAmount set
	t.Run("same currency returns Amount", func(t *testing.T) {
		tx := &Transaction{
			Type:   TransactionTypeTransfer,
			Amount: 1000,
		}
		if got := tx.TargetTransferAmount(); got != 1000 {
			t.Errorf("TargetTransferAmount() = %v, want 1000", got)
		}
	})

	// Cross-currency transfer: OriginalAmount is the target-side amount
	t.Run("cross currency returns OriginalAmount", func(t *testing.T) {
		origAmt := 100.0
		tx := &Transaction{
			Type:           TransactionTypeTransfer,
			Amount:         3000, // TWD (source)
			OriginalAmount: &origAmt, // USD (target)
		}
		if got := tx.TargetTransferAmount(); got != 100 {
			t.Errorf("TargetTransferAmount() = %v, want 100", got)
		}
	})
}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/domain/... -run TestTransaction_TargetTransferAmount -v`
Expected: FAIL — `TargetTransferAmount` not defined

**Step 3: Write minimal implementation**

Add after `IsForeignCurrency()` in `backend/internal/domain/transaction.go`:

```go
// TargetTransferAmount returns the amount that should be applied to the target
// account in a transfer. For cross-currency transfers where OriginalAmount is
// set, it returns the target-currency amount; otherwise falls back to Amount.
func (t *Transaction) TargetTransferAmount() float64 {
	if t.OriginalAmount != nil {
		return *t.OriginalAmount
	}
	return t.Amount
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/domain/... -run TestTransaction_TargetTransferAmount -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/internal/domain/transaction.go backend/internal/domain/transaction_test.go
git commit -m "feat: add TargetTransferAmount() to Transaction entity"
```

---

### Task 2: Fix `applyBalance` and `reverseBalance` for cross-currency transfers

**Files:**
- Modify: `backend/internal/usecase/transaction_service.go:199-242`
- Test: `backend/internal/usecase/transaction_service_test.go`

**Step 1: Write the failing tests**

Add to `backend/internal/usecase/transaction_service_test.go`:

```go
func TestTransactionService_CreateTransfer_CrossCurrency(t *testing.T) {
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestTransactionService(txRepo, acctRepo)

	sourceID := uuid.New() // TWD account
	targetID := uuid.New() // USD account
	origAmt := 100.0
	tx := &domain.Transaction{
		ID:              uuid.New(),
		UserID:          uuid.New(),
		AccountID:       sourceID,
		TargetAccountID: &targetID,
		Type:            domain.TransactionTypeTransfer,
		Amount:          3000.0, // 3000 TWD
		OriginalAmount:  &origAmt, // 100 USD
		OccurredAt:      time.Now(),
	}

	txRepo.On("Create", mock.Anything, tx).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, sourceID, -3000.0).Return(nil) // TWD deducted
	acctRepo.On("UpdateBalance", mock.Anything, targetID, 100.0).Return(nil)   // USD added

	err := svc.Create(context.Background(), tx)

	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
}

func TestTransactionService_DeleteTransfer_CrossCurrency(t *testing.T) {
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestTransactionService(txRepo, acctRepo)

	sourceID := uuid.New()
	targetID := uuid.New()
	txID := uuid.New()
	origAmt := 100.0
	existing := &domain.Transaction{
		ID:              txID,
		UserID:          uuid.New(),
		AccountID:       sourceID,
		TargetAccountID: &targetID,
		Type:            domain.TransactionTypeTransfer,
		Amount:          3000.0,
		OriginalAmount:  &origAmt,
		OccurredAt:      time.Now(),
	}

	txRepo.On("FindByID", mock.Anything, txID).Return(existing, nil)
	acctRepo.On("UpdateBalance", mock.Anything, sourceID, 3000.0).Return(nil)  // TWD restored
	acctRepo.On("UpdateBalance", mock.Anything, targetID, -100.0).Return(nil)  // USD reversed
	txRepo.On("Delete", mock.Anything, txID).Return(nil)

	err := svc.Delete(context.Background(), txID)

	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/usecase/... -run "TestTransactionService_(Create|Delete)Transfer_CrossCurrency" -v`
Expected: FAIL — mock expects `UpdateBalance(targetID, 100.0)` but gets `UpdateBalance(targetID, 3000.0)`

**Step 3: Fix `applyBalance` and `reverseBalance`**

In `backend/internal/usecase/transaction_service.go`, change line 214:

```go
// OLD:
return acctRepo.UpdateBalance(ctx, *tx.TargetAccountID, tx.Amount)
// NEW:
return acctRepo.UpdateBalance(ctx, *tx.TargetAccountID, tx.TargetTransferAmount())
```

And change line 237:

```go
// OLD:
return acctRepo.UpdateBalance(ctx, *tx.TargetAccountID, -tx.Amount)
// NEW:
return acctRepo.UpdateBalance(ctx, *tx.TargetAccountID, -tx.TargetTransferAmount())
```

**Step 4: Run all transfer tests to verify**

Run: `cd backend && go test ./internal/usecase/... -run "TestTransactionService_.*Transfer" -v`
Expected: ALL PASS (both same-currency and cross-currency)

**Step 5: Commit**

```bash
git add backend/internal/usecase/transaction_service.go backend/internal/usecase/transaction_service_test.go
git commit -m "fix: use TargetTransferAmount for cross-currency transfer balance"
```

---

### Task 3: Fix `effectiveAmount` for running balance calculation

**Files:**
- Modify: `backend/internal/usecase/transaction_service.go:250-266`
- Test: `backend/internal/usecase/transaction_running_balance_test.go`

**Step 1: Write the failing test**

Add to `backend/internal/usecase/transaction_running_balance_test.go`:

```go
func TestEffectiveAmount_CrossCurrencyTransfer(t *testing.T) {
	sourceID := uuid.New() // TWD
	targetID := uuid.New() // USD
	origAmt := 100.0

	tx := domain.Transaction{
		AccountID:       sourceID,
		TargetAccountID: &targetID,
		Type:            domain.TransactionTypeTransfer,
		Amount:          3000, // TWD
		OriginalAmount:  &origAmt, // USD
	}

	// From source account perspective: deducts Amount (3000 TWD)
	gotSource := effectiveAmount(&tx, sourceID)
	if gotSource != -3000 {
		t.Errorf("effectiveAmount(source) = %v, want -3000", gotSource)
	}

	// From target account perspective: adds OriginalAmount (100 USD)
	gotTarget := effectiveAmount(&tx, targetID)
	if gotTarget != 100 {
		t.Errorf("effectiveAmount(target) = %v, want 100", gotTarget)
	}
}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/usecase/... -run TestEffectiveAmount_CrossCurrencyTransfer -v`
Expected: FAIL — `effectiveAmount(target) = 3000, want 100`

**Step 3: Fix `effectiveAmount`**

In `backend/internal/usecase/transaction_service.go`, change line 262:

```go
// OLD:
return tx.Amount
// NEW:
return tx.TargetTransferAmount()
```

**Step 4: Run all running balance tests**

Run: `cd backend && go test ./internal/usecase/... -run "TestEffectiveAmount|TestListByAccountWithBalance" -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/internal/usecase/transaction_service.go backend/internal/usecase/transaction_running_balance_test.go
git commit -m "fix: effectiveAmount uses TargetTransferAmount for target account"
```

---

### Task 4: Fix `SumEffectiveAmountForAccount` SQL query

**Files:**
- Modify: `backend/internal/repository/transaction_repository.go:142-159`

**Step 1: Update the SQL subquery and CASE expression**

In `backend/internal/repository/transaction_repository.go`, change the subquery select (line 144) to include `original_amount`:

```go
// OLD:
Select("type, amount, account_id, target_account_id").
// NEW:
Select("type, amount, original_amount, account_id, target_account_id").
```

And change line 156 in the CASE expression:

```go
// OLD:
WHEN sub.type = 'TRANSFER' AND sub.target_account_id = ? THEN sub.amount
// NEW:
WHEN sub.type = 'TRANSFER' AND sub.target_account_id = ? THEN COALESCE(sub.original_amount, sub.amount)
```

**Step 2: Run all tests to verify nothing breaks**

Run: `cd backend && go test ./internal/usecase/... -v`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add backend/internal/repository/transaction_repository.go
git commit -m "fix: SumEffectiveAmountForAccount uses original_amount for cross-currency target"
```

---

### Task 5: Run full test suite and verify

**Step 1: Run all domain tests**

Run: `cd backend && go test ./internal/domain/... -v`
Expected: ALL PASS

**Step 2: Run all usecase tests**

Run: `cd backend && go test ./internal/usecase/... -v`
Expected: ALL PASS

**Step 3: Build check**

Run: `cd backend && go build ./...`
Expected: No errors

**Step 4: Lint check**

Run: `cd backend && golangci-lint run`
Expected: No new issues
