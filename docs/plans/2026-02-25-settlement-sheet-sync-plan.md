# Settlement Google Sheet Sync - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When receivables are settled (single/batch), automatically write a `還款 💰` row to Google Sheet so Sheet amounts align with ZenBill.

**Architecture:** Add `WriteSettlementToSheet()` to `SheetSyncService` (which already has Google Sheets client access). Modify `Settle()` and `SettleAll()` to return net receivable amounts. HTTP handlers orchestrate: settle first, then call sheet write. Sheet write failure doesn't affect settlement.

**Tech Stack:** Go, GORM, Google Sheets API (existing `pkg/googlesheet`), testify/mock

---

### Task 1: Modify Settle() to return net receivable amount

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:320-422` (Settle method)
- Test: `backend/internal/usecase/shared_expense_service_test.go`

**Step 1: Write the failing test**

Update existing settle tests to expect `(float64, error)` return. Add a new test:

```go
func TestSharedExpenseService_Settle_ReturnsNetReceivable(t *testing.T) {
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestSharedExpenseService(expenseRepo, ledgerRepo, txRepo, acctRepo)

	ownerID := uuid.New()
	receivableAcctID := uuid.New()
	ledgerID := uuid.New()
	expenseID := uuid.New()

	expense := &domain.SharedExpense{
		ID: expenseID, LedgerID: ledgerID,
		TotalAmount: 1000.0, SplitMethod: domain.SplitMethodEqual,
		OwnerAmount: 500.0, PartnerAmount: 500.0,
		OwnerPaidAmount: 1000.0, PartnerPaidAmount: 0,
		PayerUserID: &ownerID, Description: "Dinner",
	}
	ledger := &domain.SharedLedger{
		ID: ledgerID, OwnerID: ownerID, ReceivableAccountID: receivableAcctID,
	}

	expenseRepo.On("FindByID", mock.Anything, expenseID).Return(expense, nil)
	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -500.0).Return(nil)
	expenseRepo.On("Update", mock.Anything, mock.Anything).Return(nil)

	netAmount, err := svc.Settle(context.Background(), expenseID, ownerID, nil)
	assert.NoError(t, err)
	assert.Equal(t, 500.0, netAmount) // positive = partner owes owner
}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/usecase/... -run TestSharedExpenseService_Settle_ReturnsNetReceivable -v`
Expected: FAIL — Settle returns `error` not `(float64, error)`

**Step 3: Change Settle() signature and implementation**

In `shared_expense_service.go`, change:
```go
func (s *SharedExpenseService) Settle(ctx context.Context, expenseID, userID uuid.UUID, receiveAccountID *uuid.UUID) (float64, error) {
```

At the end (before the logger.Info), return `netReceivable`:
```go
	s.logger.Info("shared expense settled",
		slog.String("expense_id", expenseID.String()),
		slog.Float64("amount", absAmount),
		slog.Bool("balance_only", receiveAccountID == nil),
	)
	return netReceivable, nil
```

Change error returns from `return err` / `return fmt.Errorf(...)` to `return 0, err` / `return 0, fmt.Errorf(...)`.

**Step 4: Update existing Settle tests for new signature**

All existing tests that call `svc.Settle()` need to capture two return values:
```go
// Was: err := svc.Settle(...)
// Now: _, err := svc.Settle(...)
```

Update these tests:
- `TestSharedExpenseService_Settle_OwnerPaid_WithAccount`
- `TestSharedExpenseService_Settle_OwnerPaid_NoAccount`
- `TestSharedExpenseService_Settle_PartnerPaid_WithAccount`
- `TestSharedExpenseService_Settle_PartnerPaid_NoAccount`

**Step 5: Update HTTP handler for new Settle signature**

In `backend/internal/delivery/http/shared_expense_handler.go:398`:
```go
// Was: if err := h.expenseService.Settle(...)
// Now: if _, err := h.expenseService.Settle(...)
```

**Step 6: Run all tests to verify they pass**

Run: `cd backend && go test ./internal/usecase/... -v`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add backend/internal/usecase/shared_expense_service.go backend/internal/usecase/shared_expense_service_test.go backend/internal/delivery/http/shared_expense_handler.go
git commit -m "refactor: Settle() returns net receivable amount for sheet sync"
```

---

### Task 2: Add NetAmount to SettleAllResult

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:424-537` (SettleAll method)
- Test: `backend/internal/usecase/shared_expense_service_test.go`

**Step 1: Write the failing test**

```go
func TestSharedExpenseService_SettleAll_ReturnsNetAmount(t *testing.T) {
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestSharedExpenseService(expenseRepo, ledgerRepo, txRepo, acctRepo)

	ownerID := uuid.New()
	receivableAcctID := uuid.New()
	ledgerID := uuid.New()

	ledger := &domain.SharedLedger{
		ID: ledgerID, OwnerID: ownerID, ReceivableAccountID: receivableAcctID,
	}

	// exp1: owner paid 1000, split equal → net +500 (partner owes)
	exp1 := domain.SharedExpense{
		ID: uuid.New(), LedgerID: ledgerID,
		TotalAmount: 1000.0, SplitMethod: domain.SplitMethodEqual,
		OwnerAmount: 500.0, PartnerAmount: 500.0,
		OwnerPaidAmount: 1000.0, PartnerPaidAmount: 0,
		Description: "Dinner",
	}
	// exp2: partner paid 600, split equal → net -300 (owner owes)
	exp2 := domain.SharedExpense{
		ID: uuid.New(), LedgerID: ledgerID,
		TotalAmount: 600.0, SplitMethod: domain.SplitMethodEqual,
		OwnerAmount: 300.0, PartnerAmount: 300.0,
		OwnerPaidAmount: 0, PartnerPaidAmount: 600.0,
		Description: "Lunch",
	}

	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)
	expenseRepo.On("FindUnsettledByLedgerID", mock.Anything, ledgerID).Return([]domain.SharedExpense{exp1, exp2}, nil)

	// Balance-only settlement
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -500.0).Return(nil) // exp1
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, 300.0).Return(nil)  // exp2

	expenseRepo.On("Update", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.SettledAt != nil
	})).Return(nil).Times(2)

	result, err := svc.SettleAll(context.Background(), ledgerID, ownerID, nil)
	assert.NoError(t, err)
	assert.Equal(t, 2, result.SettledCount)
	assert.Equal(t, 800.0, result.TotalAmount)  // abs sum: 500+300
	assert.Equal(t, 200.0, result.NetAmount)     // signed sum: 500-300 = +200
}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/usecase/... -run TestSharedExpenseService_SettleAll_ReturnsNetAmount -v`
Expected: FAIL — `NetAmount` field doesn't exist

**Step 3: Add NetAmount field and compute it**

In `shared_expense_service.go`:

```go
type SettleAllResult struct {
	SettledCount int     `json:"settled_count"`
	TotalAmount  float64 `json:"total_amount"`
	NetAmount    float64 `json:"net_amount"` // signed: positive = partner owes owner
}
```

In `SettleAll()`, add tracking variable alongside existing `totalAmount`:
```go
	var totalAmount float64
	var netAmount float64
```

Inside the loop, after `totalAmount += absAmount`, add:
```go
			netAmount += netReceivable
```

In the result:
```go
	result := &SettleAllResult{
		SettledCount: len(unsettled),
		TotalAmount:  totalAmount,
		NetAmount:    netAmount,
	}
```

**Step 4: Run all tests**

Run: `cd backend && go test ./internal/usecase/... -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/internal/usecase/shared_expense_service.go backend/internal/usecase/shared_expense_service_test.go
git commit -m "feat: add NetAmount to SettleAllResult for sheet sync"
```

---

### Task 3: Add WriteSettlementToSheet to SheetSyncService

**Files:**
- Modify: `backend/internal/usecase/sheet_sync_service.go`
- Test: `backend/internal/usecase/sheet_sync_service_test.go` (create if not exists)

**Step 1: Write the failing test**

Create or append to `sheet_sync_service_test.go`. We need a mock for `googlesheet.Client`. Since the service creates clients via `clientForLedger()`, we test the public method with a ledger that has no credentials to verify the DB-only path, and test the full path with integration-style approach.

For unit testing, the simplest approach: test `WriteSettlementToSheet` by verifying it creates the correct SharedExpense in DB. The Google Sheet write is best-effort and tested separately.

```go
func TestSheetSyncService_WriteSettlementToSheet_PositiveNet(t *testing.T) {
	// Partner owes owner $500
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))
	svc := NewSheetSyncService(nil, expenseRepo, ledgerRepo, txRepo, acctRepo, nil, logger)

	ledgerID := uuid.New()
	ownerID := uuid.New()
	ledger := &domain.SharedLedger{
		ID:              ledgerID,
		OwnerID:         ownerID,
		OwnerAliases:    []string{"Yuki"},
		PartnerAliases:  []string{"Partner"},
		GoogleSheetID:   "", // no sheet configured
	}

	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)

	// Verify the settlement expense is created correctly
	expenseRepo.On("Create", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.LedgerID == ledgerID &&
			e.Category == "settlement" &&
			e.Description == "結清待收款" &&
			e.TotalAmount == 500.0 &&
			e.OwnerPaidAmount == 0 &&
			e.PartnerPaidAmount == 500.0 &&
			e.SplitMethod == domain.SplitMethodFullPartner &&
			e.OwnerAmount == 0 &&
			e.PartnerAmount == 500.0 &&
			e.SettledAt != nil &&
			e.ReceivableTransactionID == nil &&
			e.ExpenseTransactionID == nil &&
			e.SourceType == "zenbill"
	})).Return(nil)

	err := svc.WriteSettlementToSheet(context.Background(), ledgerID, 500.0)
	assert.NoError(t, err)
	expenseRepo.AssertExpectations(t)
}

func TestSheetSyncService_WriteSettlementToSheet_NegativeNet(t *testing.T) {
	// Owner owes partner $300
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))
	svc := NewSheetSyncService(nil, expenseRepo, ledgerRepo, txRepo, acctRepo, nil, logger)

	ledgerID := uuid.New()
	ownerID := uuid.New()
	ledger := &domain.SharedLedger{
		ID:              ledgerID,
		OwnerID:         ownerID,
		OwnerAliases:    []string{"Yuki"},
		PartnerAliases:  []string{"Partner"},
		GoogleSheetID:   "", // no sheet
	}

	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)

	expenseRepo.On("Create", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.TotalAmount == 300.0 &&
			e.OwnerPaidAmount == 300.0 &&
			e.PartnerPaidAmount == 0 &&
			e.SplitMethod == domain.SplitMethodFullOwner &&
			e.OwnerAmount == 300.0 &&
			e.PartnerAmount == 0
	})).Return(nil)

	err := svc.WriteSettlementToSheet(context.Background(), ledgerID, -300.0)
	assert.NoError(t, err)
	expenseRepo.AssertExpectations(t)
}

func TestSheetSyncService_WriteSettlementToSheet_ZeroAmount(t *testing.T) {
	// Zero net = no-op
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))
	svc := NewSheetSyncService(nil, expenseRepo, ledgerRepo, txRepo, acctRepo, nil, logger)

	err := svc.WriteSettlementToSheet(context.Background(), uuid.New(), 0)
	assert.NoError(t, err)
	expenseRepo.AssertNotCalled(t, "Create", mock.Anything, mock.Anything)
}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/usecase/... -run TestSheetSyncService_WriteSettlementToSheet -v`
Expected: FAIL — method doesn't exist

**Step 3: Implement WriteSettlementToSheet**

Add to `sheet_sync_service.go`:

```go
// WriteSettlementToSheet creates a settlement SharedExpense record and writes it
// to the Google Sheet. The netAmount is signed: positive = partner owes owner,
// negative = owner owes partner. If netAmount is 0, this is a no-op.
// Sheet write failure is non-fatal: the expense is saved to DB with SyncedAt=nil
// so that background SyncToSheet will pick it up later.
func (s *SheetSyncService) WriteSettlementToSheet(ctx context.Context, ledgerID uuid.UUID, netAmount float64) error {
	if netAmount == 0 {
		return nil
	}

	ledger, err := s.ledgerRepo.FindByID(ctx, ledgerID)
	if err != nil {
		return fmt.Errorf("find ledger: %w", err)
	}

	now := time.Now()
	absAmount := netAmount
	if absAmount < 0 {
		absAmount = -absAmount
	}

	expense := &domain.SharedExpense{
		ID:          uuid.New(),
		LedgerID:    ledgerID,
		Date:        now,
		Category:    string(domain.ExpenseCategorySettlement),
		Description: "結清待收款",
		TotalAmount: absAmount,
		SourceType:  "zenbill",
		SettledAt:   &now,
		// No receivable or expense transactions
	}

	if netAmount > 0 {
		// Partner owes owner → partner pays, partner bears full cost
		expense.PartnerPaidAmount = absAmount
		expense.OwnerPaidAmount = 0
		expense.SplitMethod = domain.SplitMethodFullPartner
		expense.OwnerAmount = 0
		expense.PartnerAmount = absAmount
		expense.PayerName = ledger.GetPartnerDisplayName()
	} else {
		// Owner owes partner → owner pays, owner bears full cost
		expense.OwnerPaidAmount = absAmount
		expense.PartnerPaidAmount = 0
		expense.SplitMethod = domain.SplitMethodFullOwner
		expense.OwnerAmount = absAmount
		expense.PartnerAmount = 0
		expense.PayerName = ledger.GetOwnerDisplayName()
	}

	// Save to DB first (this always succeeds or returns error)
	if err := s.expenseRepo.Create(ctx, expense); err != nil {
		return fmt.Errorf("create settlement expense: %w", err)
	}

	// Try to write to Google Sheet (best-effort)
	if ledger.GoogleSheetID != "" {
		s.syncExpenseToSheet(ctx, ledger, expense)
	}

	s.logger.Info("settlement expense created",
		slog.String("ledger_id", ledgerID.String()),
		slog.Float64("net_amount", netAmount),
		slog.Bool("synced_to_sheet", expense.SyncedAt != nil),
	)
	return nil
}

// syncExpenseToSheet attempts to write a single expense to the Google Sheet.
// On failure, logs a warning. The expense remains in DB with SyncedAt=nil
// so background SyncToSheet will retry.
func (s *SheetSyncService) syncExpenseToSheet(ctx context.Context, ledger *domain.SharedLedger, expense *domain.SharedExpense) {
	client, err := s.clientForLedger(ctx, ledger)
	if err != nil {
		s.logger.Warn("failed to create sheets client for settlement sync",
			slog.String("ledger_id", ledger.ID.String()),
			slog.String("error", err.Error()),
		)
		return
	}

	row := googlesheet.ExpenseToRow(expense, ledger.OwnerAliases, ledger.PartnerAliases)
	formRange := sheetTabForm + "!" + sheetColRange

	if err := client.AppendRows(ctx, ledger.GoogleSheetID, formRange, [][]interface{}{row}); err != nil {
		s.logger.Warn("failed to write settlement to sheet",
			slog.String("ledger_id", ledger.ID.String()),
			slog.String("error", err.Error()),
		)
		return
	}

	// Mark as synced
	now := time.Now()
	expense.SyncedAt = &now
	rowIdx := 1 // placeholder
	expense.GoogleSheetRowIndex = &rowIdx
	if err := s.expenseRepo.Update(ctx, expense); err != nil {
		s.logger.Warn("failed to mark settlement expense as synced",
			slog.String("expense_id", expense.ID.String()),
			slog.String("error", err.Error()),
		)
	}
}
```

**Step 4: Run tests**

Run: `cd backend && go test ./internal/usecase/... -run TestSheetSyncService_WriteSettlementToSheet -v`
Expected: ALL PASS

**Step 5: Run all tests to check for regressions**

Run: `cd backend && go test ./internal/usecase/... -v`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add backend/internal/usecase/sheet_sync_service.go backend/internal/usecase/sheet_sync_service_test.go
git commit -m "feat: add WriteSettlementToSheet to SheetSyncService"
```

---

### Task 4: Wire up HTTP handlers to call WriteSettlementToSheet

**Files:**
- Modify: `backend/internal/delivery/http/shared_expense_handler.go:368-454`

**Step 1: Update SettleReceivable handler**

In `SettleReceivable()`, change the settle call and add sheet write:

```go
	netAmount, err := h.expenseService.Settle(ctx, expenseID, userID, receiveAccountID)
	if err != nil {
		h.logger.ErrorContext(ctx, "Failed to settle receivable", "error", err, "expense_id", expenseID)
		InternalServerError(c, "failed to settle receivable")
		return
	}

	// Write settlement to Google Sheet (best-effort, non-blocking)
	ledgerID, _ := uuid.Parse(c.Param("id"))
	if err := h.syncService.WriteSettlementToSheet(ctx, ledgerID, netAmount); err != nil {
		h.logger.WarnContext(ctx, "Failed to write settlement to sheet", "error", err, "ledger_id", ledgerID)
	}

	SuccessWithMessage(c, "receivable settled", nil)
```

**Step 2: Update SettleAllReceivables handler**

In `SettleAllReceivables()`, add sheet write after settle:

```go
	result, err := h.expenseService.SettleAll(ctx, ledgerID, userID, receiveAccountID)
	if err != nil {
		h.logger.ErrorContext(ctx, "Failed to settle all receivables", "error", err, "ledger_id", ledgerID)
		InternalServerError(c, "failed to settle all receivables")
		return
	}

	// Write consolidated settlement to Google Sheet (best-effort)
	if err := h.syncService.WriteSettlementToSheet(ctx, ledgerID, result.NetAmount); err != nil {
		h.logger.WarnContext(ctx, "Failed to write settlement to sheet", "error", err, "ledger_id", ledgerID)
	}

	SuccessWithMessage(c, "all receivables settled", result)
```

**Step 3: Verify compilation**

Run: `cd backend && go build ./...`
Expected: SUCCESS

**Step 4: Run all tests**

Run: `cd backend && go test ./... -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/internal/delivery/http/shared_expense_handler.go
git commit -m "feat: write settlement to Google Sheet on receivable settle"
```

---

### Task 5: Lint check and final verification

**Step 1: Run linter**

Run: `cd backend && golangci-lint run`
Expected: No new warnings/errors

**Step 2: Run full test suite**

Run: `cd backend && go test ./... -v`
Expected: ALL PASS

**Step 3: Fix any issues found**

If lint or tests fail, fix and re-run.

**Step 4: Final commit (if any fixes)**

```bash
git add -A
git commit -m "fix: address lint issues in settlement sheet sync"
```
