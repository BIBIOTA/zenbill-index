# Settlement Transfer Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change settlement from SETTLEMENT transactions to TRANSFER-based (receivable account ↔ personal account), with optional account (balance-only mode when omitted).

**Architecture:** Modify `Settle()` and `SettleAll()` to accept optional `receiveAccountID`. When provided, create a TRANSFER between receivable account and personal account. When omitted, just adjust receivable account balance. The direction depends on who owes whom (isOwnerPayer determines flow).

**Tech Stack:** Go (Gin, GORM, testify/mock), React (TanStack Query), TypeScript

**Key insight:** `ReceivableAmount()` always returns positive. `isOwnerPayer=true` means partner owes owner (receivable→personal). `isOwnerPayer=false` means owner owes partner (personal→receivable).

---

### Task 1: Backend — Rewrite `Settle()` method

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:203-284`

**Step 1: Replace the entire `Settle` method**

Replace lines 203-284 with:

```go
// Settle settles a shared expense. If receiveAccountID is provided, creates a TRANSFER
// transaction between the receivable account and the specified account. If nil, only
// adjusts the receivable account balance (balance-only settlement).
func (s *SharedExpenseService) Settle(ctx context.Context, expenseID, userID uuid.UUID, receiveAccountID *uuid.UUID) error {
	expense, err := s.expenseRepo.FindByID(ctx, expenseID)
	if err != nil {
		return fmt.Errorf("find shared expense: %w", err)
	}

	if expense.IsSettled() {
		return fmt.Errorf("expense is already settled")
	}

	ledger, err := s.ledgerRepo.FindByID(ctx, expense.LedgerID)
	if err != nil {
		return fmt.Errorf("find shared ledger: %w", err)
	}

	isOwnerPayer := expense.PayerUserID != nil && *expense.PayerUserID == ledger.OwnerID
	amount := expense.ReceivableAmount(isOwnerPayer)

	if amount <= 0 {
		return fmt.Errorf("no receivable amount to settle")
	}

	now := time.Now()

	run := func(repos domain.TxRepos) error {
		if receiveAccountID != nil {
			// Create TRANSFER transaction
			var sourceAcct, targetAcct uuid.UUID
			if isOwnerPayer {
				// Partner owes owner: receivable_acct → personal_acct
				sourceAcct = ledger.ReceivableAccountID
				targetAcct = *receiveAccountID
			} else {
				// Owner owes partner: personal_acct → receivable_acct
				sourceAcct = *receiveAccountID
				targetAcct = ledger.ReceivableAccountID
			}

			transferTx := &domain.Transaction{
				ID:              uuid.New(),
				UserID:          ledger.OwnerID,
				AccountID:       sourceAcct,
				TargetAccountID: &targetAcct,
				Type:            domain.TransactionTypeTransfer,
				Amount:          amount,
				OccurredAt:      now,
				Note:            fmt.Sprintf("結算: %s", expense.Description),
			}
			if err := repos.TransactionRepo.Create(ctx, transferTx); err != nil {
				return fmt.Errorf("create settlement transfer: %w", err)
			}

			// Source account: -amount
			if err := repos.AccountRepo.UpdateBalance(ctx, sourceAcct, -amount); err != nil {
				return fmt.Errorf("update source account balance: %w", err)
			}
			// Target account: +amount
			if err := repos.AccountRepo.UpdateBalance(ctx, targetAcct, amount); err != nil {
				return fmt.Errorf("update target account balance: %w", err)
			}
		} else {
			// Balance-only: just zero out the receivable entry
			if isOwnerPayer {
				// Partner owes owner: decrease receivable
				if err := repos.AccountRepo.UpdateBalance(ctx, ledger.ReceivableAccountID, -amount); err != nil {
					return fmt.Errorf("update receivable account balance: %w", err)
				}
			} else {
				// Owner owes partner: increase receivable (it was negative)
				if err := repos.AccountRepo.UpdateBalance(ctx, ledger.ReceivableAccountID, amount); err != nil {
					return fmt.Errorf("update receivable account balance: %w", err)
				}
			}
		}

		// Mark expense as settled
		expense.SettledAt = &now
		if err := repos.SharedExpenseRepo.Update(ctx, expense); err != nil {
			return fmt.Errorf("update shared expense: %w", err)
		}

		return nil
	}

	if s.txMgr != nil {
		err = s.txMgr.WithTransaction(ctx, func(repos domain.TxRepos) error {
			return run(repos)
		})
	} else {
		err = run(domain.TxRepos{
			TransactionRepo:   s.txRepo,
			AccountRepo:       s.acctRepo,
			SharedExpenseRepo: s.expenseRepo,
		})
	}

	if err != nil {
		return err
	}

	s.logger.Info("shared expense settled",
		slog.String("expense_id", expenseID.String()),
		slog.Float64("amount", amount),
		slog.Bool("balance_only", receiveAccountID == nil),
	)
	return nil
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && gofmt -e internal/usecase/shared_expense_service.go > /dev/null`
Expected: No syntax errors

---

### Task 2: Backend — Rewrite `SettleAll()` method

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go` (SettleAll method, lines ~292-378)

**Step 1: Replace the `SettleAll` method**

Replace `SettleAll` with the same optional-account and transfer logic:

```go
// SettleAll settles all unsettled receivables for a ledger in a single transaction.
// If receiveAccountID is provided, creates TRANSFER transactions. If nil, balance-only.
func (s *SharedExpenseService) SettleAll(ctx context.Context, ledgerID, userID uuid.UUID, receiveAccountID *uuid.UUID) (*SettleAllResult, error) {
	ledger, err := s.ledgerRepo.FindByID(ctx, ledgerID)
	if err != nil {
		return nil, fmt.Errorf("find shared ledger: %w", err)
	}

	unsettled, err := s.expenseRepo.FindUnsettledByLedgerID(ctx, ledgerID)
	if err != nil {
		return nil, fmt.Errorf("find unsettled expenses: %w", err)
	}

	if len(unsettled) == 0 {
		return nil, fmt.Errorf("no unsettled receivables")
	}

	now := time.Now()
	var totalAmount float64

	run := func(repos domain.TxRepos) error {
		for i := range unsettled {
			exp := &unsettled[i]
			isOwnerPayer := exp.PayerUserID != nil && *exp.PayerUserID == ledger.OwnerID
			amount := exp.ReceivableAmount(isOwnerPayer)
			if amount <= 0 {
				continue
			}

			if receiveAccountID != nil {
				var sourceAcct, targetAcct uuid.UUID
				if isOwnerPayer {
					sourceAcct = ledger.ReceivableAccountID
					targetAcct = *receiveAccountID
				} else {
					sourceAcct = *receiveAccountID
					targetAcct = ledger.ReceivableAccountID
				}

				transferTx := &domain.Transaction{
					ID:              uuid.New(),
					UserID:          ledger.OwnerID,
					AccountID:       sourceAcct,
					TargetAccountID: &targetAcct,
					Type:            domain.TransactionTypeTransfer,
					Amount:          amount,
					OccurredAt:      now,
					Note:            fmt.Sprintf("結算: %s", exp.Description),
				}
				if err := repos.TransactionRepo.Create(ctx, transferTx); err != nil {
					return fmt.Errorf("create settlement transfer: %w", err)
				}

				if err := repos.AccountRepo.UpdateBalance(ctx, sourceAcct, -amount); err != nil {
					return fmt.Errorf("update source account balance: %w", err)
				}
				if err := repos.AccountRepo.UpdateBalance(ctx, targetAcct, amount); err != nil {
					return fmt.Errorf("update target account balance: %w", err)
				}
			} else {
				if isOwnerPayer {
					if err := repos.AccountRepo.UpdateBalance(ctx, ledger.ReceivableAccountID, -amount); err != nil {
						return fmt.Errorf("update receivable account balance: %w", err)
					}
				} else {
					if err := repos.AccountRepo.UpdateBalance(ctx, ledger.ReceivableAccountID, amount); err != nil {
						return fmt.Errorf("update receivable account balance: %w", err)
					}
				}
			}

			exp.SettledAt = &now
			if err := repos.SharedExpenseRepo.Update(ctx, exp); err != nil {
				return fmt.Errorf("update shared expense: %w", err)
			}

			totalAmount += amount
		}
		return nil
	}

	if s.txMgr != nil {
		err = s.txMgr.WithTransaction(ctx, func(repos domain.TxRepos) error {
			return run(repos)
		})
	} else {
		err = run(domain.TxRepos{
			TransactionRepo:   s.txRepo,
			AccountRepo:       s.acctRepo,
			SharedExpenseRepo: s.expenseRepo,
		})
	}

	if err != nil {
		return nil, err
	}

	result := &SettleAllResult{
		SettledCount: len(unsettled),
		TotalAmount:  totalAmount,
	}

	s.logger.Info("all receivables settled",
		slog.String("ledger_id", ledgerID.String()),
		slog.Int("count", result.SettledCount),
		slog.Float64("total", result.TotalAmount),
		slog.Bool("balance_only", receiveAccountID == nil),
	)
	return result, nil
}
```

**Step 2: Verify compilation**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/usecase/...`

Note: This will fail because handler still passes `uuid.UUID` not `*uuid.UUID`. That's expected — Task 3 fixes it.

---

### Task 3: Backend — Update HTTP handlers for optional account

**Files:**
- Modify: `backend/internal/delivery/http/shared_expense_handler.go`

**Step 1: Change `settleReceivableRequest` to make account optional**

Replace lines 80-83:

```go
// settleReceivableRequest defines the JSON body for settling a receivable.
type settleReceivableRequest struct {
	ReceiveAccountID string `json:"receive_account_id" binding:"required"`
}
```

With:

```go
// settleReceivableRequest defines the JSON body for settling a receivable.
// ReceiveAccountID is optional — when omitted, only balance is adjusted (no transfer).
type settleReceivableRequest struct {
	ReceiveAccountID *string `json:"receive_account_id"`
}
```

**Step 2: Update `SettleReceivable` handler (lines 366-399)**

Replace the handler body with:

```go
func (h *SharedExpenseHandler) SettleReceivable(c *gin.Context) {
	ctx := c.Request.Context()

	_, userID, ok := h.getLedgerAndVerifyMembership(c)
	if !ok {
		return
	}

	expenseID, err := uuid.Parse(c.Param("eid"))
	if err != nil {
		BadRequest(c, "invalid expense ID")
		return
	}

	var req settleReceivableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	var receiveAccountID *uuid.UUID
	if req.ReceiveAccountID != nil {
		id, err := uuid.Parse(*req.ReceiveAccountID)
		if err != nil {
			BadRequest(c, "invalid receive_account_id")
			return
		}
		receiveAccountID = &id
	}

	if err := h.expenseService.Settle(ctx, expenseID, userID, receiveAccountID); err != nil {
		h.logger.ErrorContext(ctx, "Failed to settle receivable", "error", err, "expense_id", expenseID)
		InternalServerError(c, "failed to settle receivable")
		return
	}

	SuccessWithMessage(c, "receivable settled", nil)
}
```

**Step 3: Update `SettleAllReceivables` handler (lines 415-445)**

Replace the handler body with:

```go
func (h *SharedExpenseHandler) SettleAllReceivables(c *gin.Context) {
	ctx := c.Request.Context()

	_, userID, ok := h.getLedgerAndVerifyMembership(c)
	if !ok {
		return
	}

	ledgerID, _ := uuid.Parse(c.Param("id"))

	var req settleReceivableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// Allow empty body (balance-only mode)
		req = settleReceivableRequest{}
	}

	var receiveAccountID *uuid.UUID
	if req.ReceiveAccountID != nil {
		id, err := uuid.Parse(*req.ReceiveAccountID)
		if err != nil {
			BadRequest(c, "invalid receive_account_id")
			return
		}
		receiveAccountID = &id
	}

	result, err := h.expenseService.SettleAll(ctx, ledgerID, userID, receiveAccountID)
	if err != nil {
		h.logger.ErrorContext(ctx, "Failed to settle all receivables", "error", err, "ledger_id", ledgerID)
		InternalServerError(c, "failed to settle all receivables")
		return
	}

	SuccessWithMessage(c, "all receivables settled", result)
}
```

**Step 4: Verify compilation**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: SUCCESS

---

### Task 4: Backend — Rewrite tests for all 4 scenarios

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service_test.go`

**Step 1: Replace existing Settle/SettleAll tests (lines 213-368) with comprehensive tests**

Delete the 3 existing tests (`TestSharedExpenseService_Settle`, `TestSharedExpenseService_SettleAll`, `TestSharedExpenseService_SettleAll_NoUnsettled`) and replace with:

```go
func TestSharedExpenseService_Settle_OwnerPaid_WithAccount(t *testing.T) {
	// Scenario A: partner owes owner, account specified → TRANSFER receivable→personal
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestSharedExpenseService(expenseRepo, ledgerRepo, txRepo, acctRepo)

	ownerID := uuid.New()
	receivableAcctID := uuid.New()
	receiveAcctID := uuid.New()
	ledgerID := uuid.New()
	expenseID := uuid.New()

	expense := &domain.SharedExpense{
		ID: expenseID, LedgerID: ledgerID,
		TotalAmount: 1000.0, SplitMethod: domain.SplitMethodEqual,
		OwnerAmount: 500.0, PartnerAmount: 500.0,
		PayerUserID: &ownerID, Description: "Dinner",
	}
	ledger := &domain.SharedLedger{
		ID: ledgerID, OwnerID: ownerID, ReceivableAccountID: receivableAcctID,
	}

	expenseRepo.On("FindByID", mock.Anything, expenseID).Return(expense, nil)
	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)

	// Expect TRANSFER: receivable → personal (partner owes owner)
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeTransfer &&
			tx.AccountID == receivableAcctID &&
			tx.TargetAccountID != nil && *tx.TargetAccountID == receiveAcctID &&
			tx.Amount == 500.0
	})).Return(nil)

	// Source (receivable) decreases, target (personal) increases
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -500.0).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, receiveAcctID, 500.0).Return(nil)

	expenseRepo.On("Update", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.ID == expenseID && e.SettledAt != nil
	})).Return(nil)

	err := svc.Settle(context.Background(), expenseID, ownerID, &receiveAcctID)
	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
	expenseRepo.AssertExpectations(t)
}

func TestSharedExpenseService_Settle_OwnerPaid_NoAccount(t *testing.T) {
	// Scenario B: partner owes owner, no account → balance-only (receivable -500)
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
		PayerUserID: &ownerID, Description: "Dinner",
	}
	ledger := &domain.SharedLedger{
		ID: ledgerID, OwnerID: ownerID, ReceivableAccountID: receivableAcctID,
	}

	expenseRepo.On("FindByID", mock.Anything, expenseID).Return(expense, nil)
	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)

	// No transaction created
	// Only receivable account balance decreased
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -500.0).Return(nil)

	expenseRepo.On("Update", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.ID == expenseID && e.SettledAt != nil
	})).Return(nil)

	err := svc.Settle(context.Background(), expenseID, ownerID, nil)
	assert.NoError(t, err)
	txRepo.AssertNotCalled(t, "Create", mock.Anything, mock.Anything)
	acctRepo.AssertExpectations(t)
	expenseRepo.AssertExpectations(t)
}

func TestSharedExpenseService_Settle_PartnerPaid_WithAccount(t *testing.T) {
	// Scenario C: owner owes partner, account specified → TRANSFER personal→receivable
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestSharedExpenseService(expenseRepo, ledgerRepo, txRepo, acctRepo)

	ownerID := uuid.New()
	partnerID := uuid.New()
	receivableAcctID := uuid.New()
	personalAcctID := uuid.New()
	ledgerID := uuid.New()
	expenseID := uuid.New()

	expense := &domain.SharedExpense{
		ID: expenseID, LedgerID: ledgerID,
		TotalAmount: 1000.0, SplitMethod: domain.SplitMethodEqual,
		OwnerAmount: 500.0, PartnerAmount: 500.0,
		PayerUserID: &partnerID, Description: "Dinner",
	}
	ledger := &domain.SharedLedger{
		ID: ledgerID, OwnerID: ownerID, ReceivableAccountID: receivableAcctID,
	}

	expenseRepo.On("FindByID", mock.Anything, expenseID).Return(expense, nil)
	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)

	// Expect TRANSFER: personal → receivable (owner owes partner)
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeTransfer &&
			tx.AccountID == personalAcctID &&
			tx.TargetAccountID != nil && *tx.TargetAccountID == receivableAcctID &&
			tx.Amount == 500.0
	})).Return(nil)

	// Source (personal) decreases, target (receivable) increases
	acctRepo.On("UpdateBalance", mock.Anything, personalAcctID, -500.0).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, 500.0).Return(nil)

	expenseRepo.On("Update", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.ID == expenseID && e.SettledAt != nil
	})).Return(nil)

	err := svc.Settle(context.Background(), expenseID, ownerID, &personalAcctID)
	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
	expenseRepo.AssertExpectations(t)
}

func TestSharedExpenseService_Settle_PartnerPaid_NoAccount(t *testing.T) {
	// Scenario D: owner owes partner, no account → balance-only (receivable +500)
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestSharedExpenseService(expenseRepo, ledgerRepo, txRepo, acctRepo)

	ownerID := uuid.New()
	partnerID := uuid.New()
	receivableAcctID := uuid.New()
	ledgerID := uuid.New()
	expenseID := uuid.New()

	expense := &domain.SharedExpense{
		ID: expenseID, LedgerID: ledgerID,
		TotalAmount: 1000.0, SplitMethod: domain.SplitMethodEqual,
		OwnerAmount: 500.0, PartnerAmount: 500.0,
		PayerUserID: &partnerID, Description: "Dinner",
	}
	ledger := &domain.SharedLedger{
		ID: ledgerID, OwnerID: ownerID, ReceivableAccountID: receivableAcctID,
	}

	expenseRepo.On("FindByID", mock.Anything, expenseID).Return(expense, nil)
	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)

	// No transaction created
	// Receivable account balance increased (was negative, now zeroing out)
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, 500.0).Return(nil)

	expenseRepo.On("Update", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.ID == expenseID && e.SettledAt != nil
	})).Return(nil)

	err := svc.Settle(context.Background(), expenseID, ownerID, nil)
	assert.NoError(t, err)
	txRepo.AssertNotCalled(t, "Create", mock.Anything, mock.Anything)
	acctRepo.AssertExpectations(t)
	expenseRepo.AssertExpectations(t)
}

func TestSharedExpenseService_SettleAll_WithAccount(t *testing.T) {
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestSharedExpenseService(expenseRepo, ledgerRepo, txRepo, acctRepo)

	ownerID := uuid.New()
	receivableAcctID := uuid.New()
	receiveAcctID := uuid.New()
	ledgerID := uuid.New()

	ledger := &domain.SharedLedger{
		ID: ledgerID, OwnerID: ownerID, ReceivableAccountID: receivableAcctID,
	}

	exp1 := domain.SharedExpense{
		ID: uuid.New(), LedgerID: ledgerID,
		TotalAmount: 1000.0, SplitMethod: domain.SplitMethodEqual,
		OwnerAmount: 500.0, PartnerAmount: 500.0,
		PayerUserID: &ownerID, Description: "Dinner",
	}
	exp2 := domain.SharedExpense{
		ID: uuid.New(), LedgerID: ledgerID,
		TotalAmount: 600.0, SplitMethod: domain.SplitMethodEqual,
		OwnerAmount: 300.0, PartnerAmount: 300.0,
		PayerUserID: &ownerID, Description: "Lunch",
	}

	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)
	expenseRepo.On("FindUnsettledByLedgerID", mock.Anything, ledgerID).Return([]domain.SharedExpense{exp1, exp2}, nil)

	// Expect 2 TRANSFER transactions: receivable → personal
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeTransfer &&
			tx.AccountID == receivableAcctID &&
			tx.TargetAccountID != nil && *tx.TargetAccountID == receiveAcctID
	})).Return(nil).Times(2)

	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -500.0).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, receiveAcctID, 500.0).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -300.0).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, receiveAcctID, 300.0).Return(nil)

	expenseRepo.On("Update", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.SettledAt != nil
	})).Return(nil).Times(2)

	result, err := svc.SettleAll(context.Background(), ledgerID, ownerID, &receiveAcctID)
	assert.NoError(t, err)
	assert.Equal(t, 2, result.SettledCount)
	assert.Equal(t, 800.0, result.TotalAmount)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
	expenseRepo.AssertExpectations(t)
}

func TestSharedExpenseService_SettleAll_NoAccount(t *testing.T) {
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

	exp1 := domain.SharedExpense{
		ID: uuid.New(), LedgerID: ledgerID,
		TotalAmount: 1000.0, SplitMethod: domain.SplitMethodEqual,
		OwnerAmount: 500.0, PartnerAmount: 500.0,
		PayerUserID: &ownerID, Description: "Dinner",
	}

	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)
	expenseRepo.On("FindUnsettledByLedgerID", mock.Anything, ledgerID).Return([]domain.SharedExpense{exp1}, nil)

	// No transactions, only balance adjustment
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -500.0).Return(nil)

	expenseRepo.On("Update", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.SettledAt != nil
	})).Return(nil)

	result, err := svc.SettleAll(context.Background(), ledgerID, ownerID, nil)
	assert.NoError(t, err)
	assert.Equal(t, 1, result.SettledCount)
	assert.Equal(t, 500.0, result.TotalAmount)
	txRepo.AssertNotCalled(t, "Create", mock.Anything, mock.Anything)
	acctRepo.AssertExpectations(t)
	expenseRepo.AssertExpectations(t)
}

func TestSharedExpenseService_SettleAll_NoUnsettled(t *testing.T) {
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestSharedExpenseService(expenseRepo, ledgerRepo, txRepo, acctRepo)

	ownerID := uuid.New()
	ledgerID := uuid.New()

	ledger := &domain.SharedLedger{
		ID: ledgerID, OwnerID: ownerID, ReceivableAccountID: uuid.New(),
	}

	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)
	expenseRepo.On("FindUnsettledByLedgerID", mock.Anything, ledgerID).Return([]domain.SharedExpense{}, nil)

	result, err := svc.SettleAll(context.Background(), ledgerID, ownerID, nil)
	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "no unsettled receivables")
}
```

**Step 2: Run all tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include" CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib" go test ./internal/usecase/... -v`
Expected: ALL PASS (7 new settle tests + existing tests)

**Step 3: Commit backend changes**

```bash
cd /Users/yuki/projects/zen-bill/backend
git add internal/usecase/shared_expense_service.go internal/usecase/shared_expense_service_test.go internal/delivery/http/shared_expense_handler.go
git commit -m "refactor(backend): change settlement from SETTLEMENT to TRANSFER with optional account"
```

---

### Task 5: Frontend — Make account optional in hooks and modals

**Files:**
- Modify: `frontend/src/hooks/useSharedLedgers.ts`
- Modify: `frontend/src/pages/ReceivablesPage.tsx`

**Step 1: Update `useSettleReceivable` hook (lines 151-163)**

Change `receive_account_id` from required `string` to optional `string | undefined`:

```typescript
export function useSettleReceivable(ledgerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ expenseId, receive_account_id }: { expenseId: string; receive_account_id?: string }) =>
      api.post<ApiResponse<null>>(`/shared-ledgers/${ledgerId}/receivables/${expenseId}/settle`, {
        ...(receive_account_id ? { receive_account_id } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'receivables'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'expenses'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'summary'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
```

**Step 2: Update `useSettleAllReceivables` hook (lines 165-179)**

Change `receive_account_id` to optional:

```typescript
export function useSettleAllReceivables(ledgerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ receive_account_id }: { receive_account_id?: string }) =>
      api.post<ApiResponse<{ settled_count: number; total_amount: number }>>(
        `/shared-ledgers/${ledgerId}/receivables/settle-all`,
        { ...(receive_account_id ? { receive_account_id } : {}) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'receivables'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'expenses'] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId, 'summary'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
```

**Step 3: Update `ReceivablesPage.tsx` — make single settle allow no account**

Change `handleSettle` (line 28-33):

```typescript
  const handleSettle = async () => {
    if (!settlingId) return
    await settleMutation.mutateAsync({ expenseId: settlingId, receive_account_id: receiveAccountId })
    setSettlingId(null)
    setReceiveAccountId(undefined)
  }
```

Change the confirm button's disabled condition (line 137):

From: `disabled={!receiveAccountId || settleMutation.isPending}`
To: `disabled={settleMutation.isPending}`

Add hint below the SearchableSelect in the single-settle modal (after line 125):

```tsx
                <p className="text-xs text-[var(--text-muted)] mt-1">未選帳戶時僅平帳待收款</p>
```

Change SearchableSelect `allowClear` to true (line 124):

From: `allowClear={false}`
To: `allowClear`

**Step 4: Update `ReceivablesPage.tsx` — make settle-all allow no account**

Change `handleSettleAll` (lines 37-42):

```typescript
  const handleSettleAll = async () => {
    await settleAllMutation.mutateAsync({ receive_account_id: settleAllAccountId })
    setShowSettleAll(false)
    setSettleAllAccountId(undefined)
  }
```

Change the settle-all confirm button's disabled condition (line 185):

From: `disabled={!settleAllAccountId || settleAllMutation.isPending}`
To: `disabled={settleAllMutation.isPending}`

Add hint below the settle-all SearchableSelect (after line 173):

```tsx
                <p className="text-xs text-[var(--text-muted)] mt-1">未選帳戶時僅平帳待收款</p>
```

Change settle-all SearchableSelect `allowClear` (line 172):

From: `allowClear={false}`
To: `allowClear`

**Step 5: Verify frontend compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit`
Expected: SUCCESS

**Step 6: Commit frontend changes**

```bash
cd /Users/yuki/projects/zen-bill
git add frontend/src/hooks/useSharedLedgers.ts frontend/src/pages/ReceivablesPage.tsx
git commit -m "refactor(frontend): make settlement account optional, add balance-only mode"
```
