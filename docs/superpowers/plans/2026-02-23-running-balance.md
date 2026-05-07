# Running Balance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display the account balance at the time of each transaction in the account detail transaction list.

**Architecture:** Backend calculates running balance at query time using the account's current balance minus the sum of effective amounts for newer transactions. No schema changes needed — the running_balance is a computed field added to the API response only when `account_id` filter is present.

**Tech Stack:** Go (GORM, Gin), React (TypeScript), PostgreSQL

**Design doc:** `docs/plans/2026-02-23-running-balance-design.md`

---

### Task 1: Add `SumEffectiveAmountForAccount` to Repository Interface

**Files:**
- Modify: `backend/internal/domain/repository.go:84-101` (TransactionRepository interface)

**Step 1: Add new method to interface**

Add this method to the `TransactionRepository` interface (after line 95, the `CountByAccountID` method):

```go
// SumEffectiveAmountForAccount calculates the net balance effect of the first
// `offset` transactions (ordered by occurred_at DESC) for the given account.
// This is used to compute running balance for paginated transaction lists.
SumEffectiveAmountForAccount(ctx context.Context, accountID uuid.UUID, offset int) (float64, error)
```

**Step 2: Verify it compiles (expect failure)**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/domain/...`
Expected: PASS (interface only, no implementation check yet)

**Step 3: Commit**

```bash
git add backend/internal/domain/repository.go
git commit -m "feat: add SumEffectiveAmountForAccount to TransactionRepository interface"
```

---

### Task 2: Implement `SumEffectiveAmountForAccount` in Repository

**Files:**
- Modify: `backend/internal/repository/transaction_repository.go` (add new method after `CountByAccountID`)

**Step 1: Write the implementation**

Add after the `CountByAccountID` method (after line 116):

```go
// SumEffectiveAmountForAccount calculates the net balance effect of the first
// `offset` transactions (ordered by occurred_at DESC) for the given account.
func (r *TransactionRepositoryImpl) SumEffectiveAmountForAccount(ctx context.Context, accountID uuid.UUID, offset int) (float64, error) {
	if offset <= 0 {
		return 0, nil
	}

	var result struct {
		Total float64 `gorm:"column:total"`
	}

	// Use a subquery to get the first N transactions (newest first),
	// then sum their effective amounts based on account role.
	subquery := r.db.WithContext(ctx).
		Model(&domain.Transaction{}).
		Select("type, amount, account_id, target_account_id").
		Where("account_id = ? OR target_account_id = ?", accountID, accountID).
		Order("occurred_at DESC").
		Limit(offset)

	err := r.db.WithContext(ctx).
		Table("(?) AS sub", subquery).
		Select(`COALESCE(SUM(
			CASE
				WHEN sub.type = 'EXPENSE' AND sub.account_id = ? THEN -sub.amount
				WHEN sub.type = 'INCOME' AND sub.account_id = ? THEN sub.amount
				WHEN sub.type = 'TRANSFER' AND sub.account_id = ? THEN -sub.amount
				WHEN sub.type = 'TRANSFER' AND sub.target_account_id = ? THEN sub.amount
				ELSE 0
			END
		), 0) as total`, accountID, accountID, accountID, accountID).
		Scan(&result).Error

	if err != nil {
		return 0, err
	}
	return result.Total, nil
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/internal/repository/transaction_repository.go
git commit -m "feat: implement SumEffectiveAmountForAccount repository method"
```

---

### Task 3: Add `TransactionWithBalance` response type and usecase method

**Files:**
- Modify: `backend/internal/usecase/transaction_service.go`

**Step 1: Add the response type and helper function**

Add after the `reverseBalance` function (after line 242):

```go
// TransactionWithBalance wraps a transaction with its running balance.
type TransactionWithBalance struct {
	domain.Transaction
	RunningBalance float64 `json:"running_balance"`
}

// effectiveAmount returns the net balance effect of a transaction for the given account.
func effectiveAmount(tx *domain.Transaction, accountID uuid.UUID) float64 {
	switch tx.Type {
	case domain.TransactionTypeExpense:
		return -tx.Amount
	case domain.TransactionTypeIncome:
		return tx.Amount
	case domain.TransactionTypeTransfer:
		if tx.AccountID == accountID {
			return -tx.Amount
		}
		if tx.TargetAccountID != nil && *tx.TargetAccountID == accountID {
			return tx.Amount
		}
	}
	return 0
}

// ListByAccountWithBalance returns transactions for an account with running balance.
// accountBalance is the account's current balance. Transactions are ordered newest-first.
func (s *TransactionService) ListByAccountWithBalance(
	ctx context.Context,
	accountID uuid.UUID,
	accountBalance float64,
	limit, offset int,
) ([]TransactionWithBalance, error) {
	txs, err := s.txRepo.FindByAccountID(ctx, accountID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("find transactions: %w", err)
	}

	// Sum of effective amounts for transactions newer than this page
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

	return result, nil
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/internal/usecase/transaction_service.go
git commit -m "feat: add ListByAccountWithBalance usecase method"
```

---

### Task 4: Write unit tests for `effectiveAmount` and `ListByAccountWithBalance`

**Files:**
- Create: `backend/internal/usecase/transaction_running_balance_test.go`

**Step 1: Write the test file**

```go
package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
)

// mockTxRepoForBalance is a minimal mock for running balance tests.
type mockTxRepoForBalance struct {
	domain.TransactionRepository
	transactions []domain.Transaction
	sumResult    float64
	sumErr       error
}

func (m *mockTxRepoForBalance) FindByAccountID(_ context.Context, _ uuid.UUID, limit, offset int) ([]domain.Transaction, error) {
	start := offset
	if start > len(m.transactions) {
		start = len(m.transactions)
	}
	end := start + limit
	if end > len(m.transactions) {
		end = len(m.transactions)
	}
	return m.transactions[start:end], nil
}

func (m *mockTxRepoForBalance) SumEffectiveAmountForAccount(_ context.Context, _ uuid.UUID, _ int) (float64, error) {
	return m.sumResult, m.sumErr
}

func TestEffectiveAmount(t *testing.T) {
	acctID := uuid.New()
	targetID := uuid.New()

	tests := []struct {
		name     string
		tx       domain.Transaction
		expected float64
	}{
		{
			name:     "expense deducts from source",
			tx:       domain.Transaction{AccountID: acctID, Type: domain.TransactionTypeExpense, Amount: 100},
			expected: -100,
		},
		{
			name:     "income adds to source",
			tx:       domain.Transaction{AccountID: acctID, Type: domain.TransactionTypeIncome, Amount: 200},
			expected: 200,
		},
		{
			name:     "transfer deducts from source",
			tx:       domain.Transaction{AccountID: acctID, TargetAccountID: &targetID, Type: domain.TransactionTypeTransfer, Amount: 300},
			expected: -300,
		},
		{
			name:     "transfer adds to target",
			tx:       domain.Transaction{AccountID: targetID, TargetAccountID: &acctID, Type: domain.TransactionTypeTransfer, Amount: 400},
			expected: 400,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := effectiveAmount(&tt.tx, acctID)
			if got != tt.expected {
				t.Errorf("effectiveAmount() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestListByAccountWithBalance(t *testing.T) {
	acctID := uuid.New()
	targetID := uuid.New()
	now := time.Now()

	// Account balance: 10000
	// Transactions (newest first):
	//   1. EXPENSE  500  → effective -500   → balance after = 10000
	//   2. INCOME  2000  → effective +2000  → balance after = 10500
	//   3. TRANSFER 1000 (source) → effective -1000 → balance after = 8500
	txs := []domain.Transaction{
		{AccountID: acctID, Type: domain.TransactionTypeExpense, Amount: 500, OccurredAt: now},
		{AccountID: acctID, Type: domain.TransactionTypeIncome, Amount: 2000, OccurredAt: now.Add(-time.Hour)},
		{AccountID: acctID, TargetAccountID: &targetID, Type: domain.TransactionTypeTransfer, Amount: 1000, OccurredAt: now.Add(-2 * time.Hour)},
	}

	mockRepo := &mockTxRepoForBalance{
		transactions: txs,
		sumResult:    0, // page 1, offset=0 → no newer transactions
	}

	svc := &TransactionService{txRepo: mockRepo}
	result, err := svc.ListByAccountWithBalance(context.Background(), acctID, 10000, 10, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result) != 3 {
		t.Fatalf("expected 3 results, got %d", len(result))
	}

	expected := []float64{10000, 10500, 8500}
	for i, want := range expected {
		if result[i].RunningBalance != want {
			t.Errorf("result[%d].RunningBalance = %v, want %v", i, result[i].RunningBalance, want)
		}
	}
}

func TestListByAccountWithBalance_Page2(t *testing.T) {
	acctID := uuid.New()

	// Page 2: offset=2, the first 2 transactions had effective sum of -500+2000 = 1500
	txs := []domain.Transaction{
		{AccountID: acctID, Type: domain.TransactionTypeExpense, Amount: 300, OccurredAt: time.Now()},
	}

	mockRepo := &mockTxRepoForBalance{
		transactions: txs,
		sumResult:    1500, // sum of effective amounts for the 2 newer transactions
	}

	svc := &TransactionService{txRepo: mockRepo}
	result, err := svc.ListByAccountWithBalance(context.Background(), acctID, 10000, 10, 2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// running_balance[0] = 10000 - 1500 = 8500
	if result[0].RunningBalance != 8500 {
		t.Errorf("RunningBalance = %v, want 8500", result[0].RunningBalance)
	}
}
```

**Step 2: Run the tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run "TestEffectiveAmount|TestListByAccountWithBalance" -v`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add backend/internal/usecase/transaction_running_balance_test.go
git commit -m "test: add unit tests for running balance calculation"
```

---

### Task 5: Update HTTP handler to use running balance

**Files:**
- Modify: `backend/internal/delivery/http/transaction_handler.go:87-179` (ListTransactions method)

**Step 1: Add acctRepo to TransactionHandler**

Modify the handler struct and constructor. Add `acctRepo` field:

In the struct (line 17-22), add `acctRepo`:
```go
type TransactionHandler struct {
	txRepo      domain.TransactionRepository
	acctRepo    domain.AccountRepository
	txService   *usecase.TransactionService
	exchangeSvc *exchangerate.Service
	logger      *slog.Logger
}
```

Update constructor signature (line 25-40) to accept `acctRepo`:
```go
func NewTransactionHandler(
	txRepo domain.TransactionRepository,
	acctRepo domain.AccountRepository,
	txService *usecase.TransactionService,
	exchangeSvc *exchangerate.Service,
	logger *slog.Logger,
) *TransactionHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &TransactionHandler{
		txRepo:      txRepo,
		acctRepo:    acctRepo,
		txService:   txService,
		exchangeSvc: exchangeSvc,
		logger:      logger,
	}
}
```

**Step 2: Update ListTransactions to return running balance when account_id is present**

Replace the `account_id` branch in `ListTransactions` (lines 112-118) and the response section (lines 156-178).

The `if accountIDStr != ""` block (line 112) should be replaced with:

```go
	if accountIDStr != "" {
		accountID, parseErr := uuid.Parse(accountIDStr)
		if parseErr != nil {
			BadRequest(c, "invalid account_id")
			return
		}

		// Fetch account for current balance
		account, acctErr := h.acctRepo.FindByID(ctx, accountID)
		if acctErr != nil {
			h.logger.ErrorContext(ctx, "Failed to find account", "error", acctErr)
			InternalServerError(c, "failed to find account")
			return
		}

		// Use running balance query
		txWithBalance, txErr := h.txService.ListByAccountWithBalance(ctx, accountID, account.Balance, pageSize, offset)
		if txErr != nil {
			h.logger.ErrorContext(ctx, "Failed to list transactions with balance", "error", txErr)
			InternalServerError(c, "failed to list transactions")
			return
		}

		total, countErr := h.txRepo.CountByAccountID(ctx, accountID)
		if countErr != nil {
			h.logger.ErrorContext(ctx, "Failed to count transactions", "error", countErr)
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
```

Then the rest of the function (lines 119 onwards) handles the non-account_id cases. Remove the account_id branch from the total count section (lines 156-162) since it's now handled above.

**Step 3: Update the call site where `NewTransactionHandler` is called**

Find and update the DI (dependency injection) site — likely in `cmd/api/main.go` or a setup file. Add `acctRepo` parameter.

Run: `grep -rn "NewTransactionHandler" /Users/yuki/projects/zen-bill/backend/` to find the call site.

**Step 4: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/internal/delivery/http/transaction_handler.go backend/cmd/api/main.go
git commit -m "feat: return running_balance in transaction list when filtered by account"
```

---

### Task 6: Update frontend types and display

**Files:**
- Modify: `frontend/src/types/index.ts:43-60` (Transaction interface)
- Modify: `frontend/src/pages/AccountDetailPage.tsx:284-309` (transaction rendering)

**Step 1: Add `running_balance` to Transaction type**

In `frontend/src/types/index.ts`, add after line 58 (`exchange_rate`):

```typescript
  running_balance?: number
```

**Step 2: Display running balance in transaction rows**

In `frontend/src/pages/AccountDetailPage.tsx`, modify the amount/actions section (lines 296-306).

Replace the existing amount display with running balance + amount:

```tsx
                  <div className="flex items-center gap-2 shrink-0">
                    {tx.running_balance !== undefined && (
                      <span className="text-xs tabular-nums text-[var(--text-muted)]">
                        餘額 {tx.running_balance.toLocaleString()}
                      </span>
                    )}
                    <span className={`text-sm font-medium tabular-nums ${tc.text}`}>
                      {tx.type === 'INCOME' ? '+' : '-'}${Math.abs(tx.amount).toLocaleString()}
                    </span>
                    <button
                      onClick={() => openEditTx(tx.id)}
                      className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--color-accent)] transition-opacity"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
```

**Step 3: Verify frontend builds**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/pages/AccountDetailPage.tsx
git commit -m "feat: display running balance in account detail transactions"
```

---

### Task 7: Manual verification

**Step 1: Start the backend and frontend**

```bash
cd /Users/yuki/projects/zen-bill/backend && docker-compose up -d db
cd /Users/yuki/projects/zen-bill/backend && go run cmd/api/main.go &
cd /Users/yuki/projects/zen-bill/frontend && npm run dev
```

**Step 2: Verify in browser**

1. Navigate to an account detail page
2. Check that each transaction row shows "餘額 X,XXX" next to the amount
3. Verify the first (newest) transaction's running_balance equals the account's current balance
4. Verify balances decrease logically as you scroll down

**Step 3: Run all backend tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./... -v`
Expected: ALL PASS

**Step 4: Run lint**

Run: `cd /Users/yuki/projects/zen-bill/backend && golangci-lint run`
Expected: PASS
