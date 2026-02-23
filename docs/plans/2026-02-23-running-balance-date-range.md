# Running Balance for Date Range Queries — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add running balance display to credit card billing cycle (date range) transaction views, matching the existing normal-mode behavior.

**Architecture:** Extend the repository layer with a new method to sum effective amounts of transactions after a given date. Add a new service method that computes running balance for date-range-filtered transactions. Update the handler to use this service method instead of raw repository calls.

**Tech Stack:** Go, GORM, PostgreSQL, Gin

---

### Task 1: Add `SumEffectiveAmountAfterDate` to Domain Interface

**Files:**
- Modify: `backend/internal/domain/repository.go:86-103` (TransactionRepository interface)

**Step 1: Add the new method to the interface**

In `backend/internal/domain/repository.go`, add inside the `TransactionRepository` interface (after line 97):

```go
SumEffectiveAmountAfterDate(ctx context.Context, accountID uuid.UUID, afterDate time.Time) (float64, error)
```

This method sums the effective balance impact of all transactions with `occurred_at > afterDate` for the given account.

**Step 2: Verify compilation fails (TDD signal)**

Run: `cd backend && go build ./...`
Expected: FAIL — `TransactionRepositoryImpl` does not implement `SumEffectiveAmountAfterDate`

**Step 3: Commit**

```bash
cd backend && git add internal/domain/repository.go && git commit -m "feat: add SumEffectiveAmountAfterDate to TransactionRepository interface"
```

---

### Task 2: Implement `SumEffectiveAmountAfterDate` in Repository

**Files:**
- Modify: `backend/internal/repository/transaction_repository.go` (after `SumEffectiveAmountForAccount`, around line 166)

**Step 1: Implement the method**

Add after the existing `SumEffectiveAmountForAccount` method:

```go
// SumEffectiveAmountAfterDate calculates the net balance effect of all
// transactions after the given date for the specified account.
// Used to derive the account balance at a specific point in time.
func (r *TransactionRepositoryImpl) SumEffectiveAmountAfterDate(ctx context.Context, accountID uuid.UUID, afterDate time.Time) (float64, error) {
	var result struct {
		Total float64 `gorm:"column:total"`
	}

	err := r.db.WithContext(ctx).
		Model(&domain.Transaction{}).
		Select(`COALESCE(SUM(
			CASE
				WHEN type = 'EXPENSE' AND account_id = ? THEN -amount
				WHEN type = 'INCOME' AND account_id = ? THEN amount
				WHEN type = 'TRANSFER' AND account_id = ? THEN -amount
				WHEN type = 'TRANSFER' AND target_account_id = ? THEN amount
				ELSE 0
			END
		), 0) as total`, accountID, accountID, accountID, accountID).
		Where("(account_id = ? OR target_account_id = ?) AND occurred_at > ?", accountID, accountID, afterDate).
		Scan(&result).Error

	if err != nil {
		return 0, err
	}
	return result.Total, nil
}
```

**Step 2: Verify compilation succeeds**

Run: `cd backend && go build ./...`
Expected: PASS

**Step 3: Commit**

```bash
cd backend && git add internal/repository/transaction_repository.go && git commit -m "feat: implement SumEffectiveAmountAfterDate in repository"
```

---

### Task 3: Add `ListByAccountWithBalanceInDateRange` to Service (Test First)

**Files:**
- Modify: `backend/internal/usecase/transaction_running_balance_test.go`

**Step 1: Extend the mock to support date range methods**

Add the new mock method to `mockTxRepoForBalance`:

```go
func (m *mockTxRepoForBalance) FindByAccountIDAndDateRange(_ context.Context, _ uuid.UUID, _, _ time.Time) ([]domain.Transaction, error) {
	return m.transactions, nil
}

func (m *mockTxRepoForBalance) SumEffectiveAmountAfterDate(_ context.Context, _ uuid.UUID, _ time.Time) (float64, error) {
	return m.sumResult, m.sumErr
}
```

**Step 2: Write the test for date range running balance (page 1)**

Add to the same test file:

```go
func TestListByAccountWithBalanceInDateRange(t *testing.T) {
	acctID := uuid.New()
	targetID := uuid.New()
	now := time.Now()

	// Transactions within the date range (ordered DESC by occurred_at)
	txs := []domain.Transaction{
		{AccountID: acctID, Type: domain.TransactionTypeExpense, Amount: 500, OccurredAt: now},
		{AccountID: acctID, Type: domain.TransactionTypeIncome, Amount: 2000, OccurredAt: now.Add(-time.Hour)},
		{AccountID: acctID, TargetAccountID: &targetID, Type: domain.TransactionTypeTransfer, Amount: 1000, OccurredAt: now.Add(-2 * time.Hour)},
	}

	mockRepo := &mockTxRepoForBalance{
		transactions: txs,
		sumResult:    0, // no transactions after the date range end
	}

	svc := &TransactionService{txRepo: mockRepo}
	result, err := svc.ListByAccountWithBalanceInDateRange(
		context.Background(), acctID, 10000,
		now.Add(-3*time.Hour), now.Add(time.Hour),
		10, 0,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result) != 3 {
		t.Fatalf("expected 3 results, got %d", len(result))
	}

	// Account balance = 10000, sumAfterDate = 0
	// Balance at end of range = 10000 - 0 = 10000
	// tx[0]: EXPENSE 500 → balance after = 10000, before = 10500
	// tx[1]: INCOME 2000 → balance after = 10500, before = 8500
	// tx[2]: TRANSFER 1000 → balance after = 8500, before = 9500
	expected := []float64{10000, 10500, 8500}
	for i, want := range expected {
		if result[i].RunningBalance != want {
			t.Errorf("result[%d].RunningBalance = %v, want %v", i, result[i].RunningBalance, want)
		}
	}
}
```

**Step 3: Write the test for date range running balance with transactions after range**

```go
func TestListByAccountWithBalanceInDateRange_WithNewerTransactions(t *testing.T) {
	acctID := uuid.New()
	now := time.Now()

	// Only 1 transaction in the range
	txs := []domain.Transaction{
		{AccountID: acctID, Type: domain.TransactionTypeExpense, Amount: 300, OccurredAt: now},
	}

	mockRepo := &mockTxRepoForBalance{
		transactions: txs,
		sumResult:    -1500, // transactions after end date had net -1500 effect
	}

	svc := &TransactionService{txRepo: mockRepo}
	result, err := svc.ListByAccountWithBalanceInDateRange(
		context.Background(), acctID, 10000,
		now.Add(-time.Hour), now.Add(time.Hour),
		10, 0,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Balance at end of range = 10000 - (-1500) = 11500
	// tx[0]: EXPENSE 300 → balance after = 11500
	if result[0].RunningBalance != 11500 {
		t.Errorf("RunningBalance = %v, want 11500", result[0].RunningBalance)
	}
}
```

**Step 4: Write test for date range with pagination (page 2)**

```go
func TestListByAccountWithBalanceInDateRange_Page2(t *testing.T) {
	acctID := uuid.New()
	now := time.Now()

	// All 3 transactions in the range (simulating full fetch before manual slice)
	allTxs := []domain.Transaction{
		{AccountID: acctID, Type: domain.TransactionTypeExpense, Amount: 500, OccurredAt: now},
		{AccountID: acctID, Type: domain.TransactionTypeExpense, Amount: 300, OccurredAt: now.Add(-time.Hour)},
		{AccountID: acctID, Type: domain.TransactionTypeExpense, Amount: 200, OccurredAt: now.Add(-2 * time.Hour)},
	}

	mockRepo := &mockTxRepoForBalance{
		transactions: allTxs,
		sumResult:    0, // no transactions after end date
	}

	svc := &TransactionService{txRepo: mockRepo}
	// Page 2: limit=1, offset=1
	result, err := svc.ListByAccountWithBalanceInDateRange(
		context.Background(), acctID, 10000,
		now.Add(-3*time.Hour), now.Add(time.Hour),
		1, 1,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result) != 1 {
		t.Fatalf("expected 1 result, got %d", len(result))
	}

	// Balance at end of range = 10000
	// Skip tx[0] (EXPENSE 500) via offset → balance = 10000 - (-500) = 10500
	// tx[1]: EXPENSE 300 → balance after = 10500
	if result[0].RunningBalance != 10500 {
		t.Errorf("RunningBalance = %v, want 10500", result[0].RunningBalance)
	}
}
```

**Step 5: Run tests to verify they fail**

Run: `cd backend && go test ./internal/usecase/ -run "TestListByAccountWithBalanceInDateRange" -v`
Expected: FAIL — `ListByAccountWithBalanceInDateRange` method does not exist

**Step 6: Commit failing tests**

```bash
cd backend && git add internal/usecase/transaction_running_balance_test.go && git commit -m "test: add failing tests for ListByAccountWithBalanceInDateRange"
```

---

### Task 4: Implement `ListByAccountWithBalanceInDateRange` in Service

**Files:**
- Modify: `backend/internal/usecase/transaction_service.go` (after `ListByAccountWithBalance`, around line 294)

**Step 1: Add the method**

```go
// ListByAccountWithBalanceInDateRange returns transactions within a date range
// for an account with running balance. It fetches all transactions in the range,
// computes the balance at the end of the range by subtracting newer transactions'
// effects from the current account balance, then applies pagination in-memory.
func (s *TransactionService) ListByAccountWithBalanceInDateRange(
	ctx context.Context,
	accountID uuid.UUID,
	accountBalance float64,
	startDate, endDate time.Time,
	limit, offset int,
) ([]TransactionWithBalance, error) {
	// Fetch ALL transactions in the date range (ordered DESC)
	allTxs, err := s.txRepo.FindByAccountIDAndDateRange(ctx, accountID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("find transactions in date range: %w", err)
	}

	// Sum the effective amount of transactions AFTER the date range end
	sumAfter, err := s.txRepo.SumEffectiveAmountAfterDate(ctx, accountID, endDate)
	if err != nil {
		return nil, fmt.Errorf("sum transactions after date range: %w", err)
	}

	// Balance at the end of the date range
	balanceAtEnd := accountBalance - sumAfter

	// Compute the running balance for transactions before the current page offset
	// by summing the effective amounts of the first `offset` transactions (DESC order)
	sumBeforePage := 0.0
	for i := 0; i < offset && i < len(allTxs); i++ {
		sumBeforePage += effectiveAmount(&allTxs[i], accountID)
	}

	// Apply pagination (manual slice)
	pageTxs := allTxs
	if offset < len(pageTxs) {
		end := offset + limit
		if end > len(pageTxs) {
			end = len(pageTxs)
		}
		pageTxs = pageTxs[offset:end]
	} else {
		pageTxs = nil
	}

	// Walk through page transactions and assign running balance
	result := make([]TransactionWithBalance, len(pageTxs))
	runningBal := balanceAtEnd - sumBeforePage
	for i := range pageTxs {
		result[i].Transaction = pageTxs[i]
		result[i].RunningBalance = runningBal
		runningBal -= effectiveAmount(&pageTxs[i], accountID)
	}

	return result, nil
}
```

**Step 2: Run the tests**

Run: `cd backend && go test ./internal/usecase/ -run "TestListByAccountWithBalanceInDateRange" -v`
Expected: PASS — all 3 date range tests pass

**Step 3: Run all running balance tests to ensure no regression**

Run: `cd backend && go test ./internal/usecase/ -run "TestListByAccountWithBalance|TestEffectiveAmount" -v`
Expected: PASS — all existing tests still pass

**Step 4: Commit**

```bash
cd backend && git add internal/usecase/transaction_service.go && git commit -m "feat: add ListByAccountWithBalanceInDateRange to TransactionService"
```

---

### Task 5: Update Handler to Use Date Range Running Balance

**Files:**
- Modify: `backend/internal/delivery/http/transaction_handler.go:122-163`

**Step 1: Replace the billing cycle path**

Replace the block at lines 122–163 (the `if startDateStr != "" && endDateStr != ""` block inside the `accountID != uuid.Nil` section) with:

```go
		// When date range is also provided, filter by account + date (billing cycle view)
		if startDateStr != "" && endDateStr != "" {
			startDate, pErr := time.Parse("2006-01-02", startDateStr)
			if pErr != nil {
				BadRequest(c, "invalid start_date format, expected YYYY-MM-DD")
				return
			}
			endDate, pErr := time.Parse("2006-01-02", endDateStr)
			if pErr != nil {
				BadRequest(c, "invalid end_date format, expected YYYY-MM-DD")
				return
			}
			endOfDay := endDate.Add(23*time.Hour + 59*time.Minute + 59*time.Second)

			account, acctErr := h.acctRepo.FindByID(ctx, accountID)
			if acctErr != nil {
				h.logger.ErrorContext(ctx, "Failed to find account", "error", acctErr)
				InternalServerError(c, "failed to find account")
				return
			}

			txWithBalance, txErr := h.txService.ListByAccountWithBalanceInDateRange(
				ctx, accountID, account.Balance, startDate, endOfDay, pageSize, offset,
			)
			if txErr != nil {
				h.logger.ErrorContext(ctx, "Failed to list transactions with balance in date range", "error", txErr)
				InternalServerError(c, "failed to list transactions")
				return
			}

			// Count total for pagination — fetch all in range via repo
			allTxs, countErr := h.txRepo.FindByAccountIDAndDateRange(ctx, accountID, startDate, endOfDay)
			total := int64(len(allTxs))
			if countErr != nil {
				h.logger.ErrorContext(ctx, "Failed to count transactions in date range", "error", countErr)
				total = int64(len(txWithBalance))
			}

			totalPages := int(math.Ceil(float64(total) / float64(pageSize)))
			SuccessWithPagination(c, txWithBalance, PaginationMeta{
				Page:       page,
				PageSize:   pageSize,
				Total:      total,
				TotalPages: totalPages,
			})
			return
		}
```

**Step 2: Verify compilation**

Run: `cd backend && go build ./...`
Expected: PASS

**Step 3: Run all tests**

Run: `cd backend && go test ./... -v`
Expected: PASS

**Step 4: Commit**

```bash
cd backend && git add internal/delivery/http/transaction_handler.go && git commit -m "feat: use running balance for billing cycle transaction views"
```

---

### Task 6: Update Mock in Handler Tests (if any exist)

**Step 1: Check if handler tests exist that mock TransactionRepository**

Run: `cd backend && grep -r "TransactionRepository" internal/delivery/ --include="*_test.go" -l`

If no test files are found, skip this task.

If test files exist, add the `SumEffectiveAmountAfterDate` method to the mock:

```go
func (m *mockTransactionRepo) SumEffectiveAmountAfterDate(_ context.Context, _ uuid.UUID, _ time.Time) (float64, error) {
	return 0, nil
}
```

**Step 2: Run all tests**

Run: `cd backend && go test ./... -v`
Expected: PASS

**Step 3: Commit (if changes were made)**

```bash
cd backend && git add -A && git commit -m "test: update handler mocks for SumEffectiveAmountAfterDate"
```

---

### Task 7: Final Verification

**Step 1: Run linter**

Run: `cd backend && golangci-lint run`
Expected: PASS (no new issues)

**Step 2: Run full test suite**

Run: `cd backend && go test ./... -v`
Expected: ALL PASS

**Step 3: Verify build**

Run: `cd backend && go build ./...`
Expected: PASS
