# Settlement INCOME/EXPENSE Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change settlement transactions from TRANSFER to two independent INCOME/EXPENSE transactions when a personal account is specified.

**Architecture:** Modify `Settle()` and `SettleAll()` in `SharedExpenseService` to create two separate transactions (one on personal account, one on receivable account) instead of one TRANSFER. Add `SettlementPersonalTransactionID` field to `SharedExpense`. Update `Delete()` to reverse both transactions.

**Tech Stack:** Go, GORM, PostgreSQL

---

### Task 1: Add SettlementPersonalTransactionID to SharedExpense entity

**Files:**
- Modify: `backend/internal/domain/shared_expense.go:56`

**Step 1: Add the new field**

In `shared_expense.go`, add after line 56 (`SettlementTransactionID`):

```go
SettlementPersonalTransactionID *uuid.UUID `gorm:"type:uuid" json:"settlement_personal_transaction_id"`
```

**Step 2: Verify compilation**

Run: `cd backend && go build ./internal/domain/...`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add backend/internal/domain/shared_expense.go
git commit -m "feat: add SettlementPersonalTransactionID to SharedExpense entity"
```

---

### Task 2: Create database migration

**Files:**
- Create: `backend/cmd/migrate/20260225_add_settlement_personal_transaction_id.sql`

**Step 1: Write migration SQL**

```sql
-- Add settlement_personal_transaction_id to shared_expenses
ALTER TABLE shared_expenses
ADD COLUMN IF NOT EXISTS settlement_personal_transaction_id UUID REFERENCES transactions(id);
```

**Step 2: Commit**

```bash
git add backend/cmd/migrate/20260225_add_settlement_personal_transaction_id.sql
git commit -m "feat: add settlement_personal_transaction_id migration"
```

---

### Task 3: Update Settle() to use INCOME/EXPENSE

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:401-515` (Settle method)
- Test: `backend/internal/usecase/shared_expense_service_test.go`

**Step 1: Write failing tests**

Replace the 4 existing Settle with-account tests. The new tests expect two separate transactions instead of one TRANSFER.

**Test: Owner paid, with account (partner owes owner → INCOME on personal, EXPENSE on receivable)**

```go
func TestSharedExpenseService_Settle_OwnerPaid_WithAccount(t *testing.T) {
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
		OwnerPaidAmount: 1000.0, PartnerPaidAmount: 0,
		PayerUserID: &ownerID, Description: "Dinner",
	}
	ledger := &domain.SharedLedger{
		ID: ledgerID, OwnerID: ownerID, ReceivableAccountID: receivableAcctID,
	}

	expenseRepo.On("FindByID", mock.Anything, expenseID).Return(expense, nil)
	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)

	// Expect INCOME on personal account (received repayment)
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeIncome &&
			tx.AccountID == receiveAcctID &&
			tx.Amount == 500.0
	})).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, receiveAcctID, 500.0).Return(nil)

	// Expect EXPENSE on receivable account (clear receivable)
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeExpense &&
			tx.AccountID == receivableAcctID &&
			tx.Amount == 500.0
	})).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -500.0).Return(nil)

	expenseRepo.On("Update", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.ID == expenseID && e.SettledAt != nil &&
			e.SettlementTransactionID != nil &&
			e.SettlementPersonalTransactionID != nil
	})).Return(nil)

	_, err := svc.Settle(context.Background(), expenseID, ownerID, &receiveAcctID)
	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
	expenseRepo.AssertExpectations(t)
}
```

**Test: Partner paid, with account (owner owes partner → EXPENSE on personal, INCOME on receivable)**

```go
func TestSharedExpenseService_Settle_PartnerPaid_WithAccount(t *testing.T) {
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
		OwnerPaidAmount: 0, PartnerPaidAmount: 1000.0,
		PayerUserID: &partnerID, Description: "Dinner",
	}
	ledger := &domain.SharedLedger{
		ID: ledgerID, OwnerID: ownerID, ReceivableAccountID: receivableAcctID,
	}

	expenseRepo.On("FindByID", mock.Anything, expenseID).Return(expense, nil)
	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)

	// Expect EXPENSE on personal account (paid repayment)
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeExpense &&
			tx.AccountID == personalAcctID &&
			tx.Amount == 500.0
	})).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, personalAcctID, -500.0).Return(nil)

	// Expect INCOME on receivable account (clear payable)
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeIncome &&
			tx.AccountID == receivableAcctID &&
			tx.Amount == 500.0
	})).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, 500.0).Return(nil)

	expenseRepo.On("Update", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.ID == expenseID && e.SettledAt != nil &&
			e.SettlementTransactionID != nil &&
			e.SettlementPersonalTransactionID != nil
	})).Return(nil)

	_, err := svc.Settle(context.Background(), expenseID, ownerID, &personalAcctID)
	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
	expenseRepo.AssertExpectations(t)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/usecase/ -run "TestSharedExpenseService_Settle_(Owner|Partner)Paid_WithAccount" -v`
Expected: FAIL (still creating TRANSFER instead of INCOME/EXPENSE)

**Step 3: Implement the new Settle() logic**

Replace the `if receiveAccountID != nil` block in `Settle()` (lines 434-467) with:

```go
		if receiveAccountID != nil {
			var personalTxType, receivableTxType domain.TransactionType
			var personalBalanceDelta, receivableBalanceDelta float64
			var personalNote, receivableNote string

			if netReceivable > 0 {
				// Partner owes owner → owner receives money
				personalTxType = domain.TransactionTypeIncome
				personalBalanceDelta = absAmount
				personalNote = fmt.Sprintf("收到還款: %s", expense.Description)

				receivableTxType = domain.TransactionTypeExpense
				receivableBalanceDelta = -absAmount
				receivableNote = fmt.Sprintf("沖銷應收: %s", expense.Description)
			} else {
				// Owner owes partner → owner pays money
				personalTxType = domain.TransactionTypeExpense
				personalBalanceDelta = -absAmount
				personalNote = fmt.Sprintf("還款給對方: %s", expense.Description)

				receivableTxType = domain.TransactionTypeIncome
				receivableBalanceDelta = absAmount
				receivableNote = fmt.Sprintf("沖銷應付: %s", expense.Description)
			}

			// Transaction 1: Personal account INCOME/EXPENSE
			personalTx := &domain.Transaction{
				ID:         uuid.New(),
				UserID:     ledger.OwnerID,
				AccountID:  *receiveAccountID,
				Type:       personalTxType,
				Amount:     absAmount,
				OccurredAt: now,
				Note:       personalNote,
			}
			if err := repos.TransactionRepo.Create(ctx, personalTx); err != nil {
				return fmt.Errorf("create settlement personal transaction: %w", err)
			}
			if err := repos.AccountRepo.UpdateBalance(ctx, *receiveAccountID, personalBalanceDelta); err != nil {
				return fmt.Errorf("update personal account balance: %w", err)
			}

			// Transaction 2: Receivable account EXPENSE/INCOME (clear receivable)
			receivableTx := &domain.Transaction{
				ID:         uuid.New(),
				UserID:     ledger.OwnerID,
				AccountID:  ledger.ReceivableAccountID,
				Type:       receivableTxType,
				Amount:     absAmount,
				OccurredAt: now,
				Note:       receivableNote,
			}
			if err := repos.TransactionRepo.Create(ctx, receivableTx); err != nil {
				return fmt.Errorf("create settlement receivable transaction: %w", err)
			}
			if err := repos.AccountRepo.UpdateBalance(ctx, ledger.ReceivableAccountID, receivableBalanceDelta); err != nil {
				return fmt.Errorf("update receivable account balance: %w", err)
			}

			expense.SettlementPersonalTransactionID = &personalTx.ID
			expense.SettlementTransactionID = &receivableTx.ID
		}
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./internal/usecase/ -run "TestSharedExpenseService_Settle" -v`
Expected: ALL Settle tests PASS (including NoAccount tests which should be unchanged)

**Step 5: Commit**

```bash
git add backend/internal/usecase/shared_expense_service.go backend/internal/usecase/shared_expense_service_test.go
git commit -m "feat: settlement uses INCOME/EXPENSE instead of TRANSFER for Settle()"
```

---

### Task 4: Update SettleAll() to use INCOME/EXPENSE

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:526-643` (SettleAll method)
- Test: `backend/internal/usecase/shared_expense_service_test.go`

**Step 1: Update SettleAll tests**

Replace `TestSharedExpenseService_SettleAll_WithAccount` to expect INCOME/EXPENSE instead of TRANSFER. Same pattern as Task 3 but for batch.

```go
func TestSharedExpenseService_SettleAll_WithAccount(t *testing.T) {
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestSharedExpenseService(expenseRepo, ledgerRepo, txRepo, acctRepo)

	ownerID := uuid.New()
	receivableAcctID := uuid.New()
	personalAcctID := uuid.New()
	ledgerID := uuid.New()

	unsettled := []domain.SharedExpense{
		{
			ID: uuid.New(), LedgerID: ledgerID,
			TotalAmount: 1000.0, SplitMethod: domain.SplitMethodEqual,
			OwnerAmount: 500.0, PartnerAmount: 500.0,
			OwnerPaidAmount: 1000.0, PartnerPaidAmount: 0,
			Description: "Dinner",
		},
	}
	ledger := &domain.SharedLedger{
		ID: ledgerID, OwnerID: ownerID, ReceivableAccountID: receivableAcctID,
	}

	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)
	expenseRepo.On("FindUnsettledByLedgerID", mock.Anything, ledgerID).Return(unsettled, nil)

	// Expect INCOME on personal account
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeIncome &&
			tx.AccountID == personalAcctID &&
			tx.Amount == 500.0
	})).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, personalAcctID, 500.0).Return(nil)

	// Expect EXPENSE on receivable account
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeExpense &&
			tx.AccountID == receivableAcctID &&
			tx.Amount == 500.0
	})).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -500.0).Return(nil)

	expenseRepo.On("Update", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.SettledAt != nil &&
			e.SettlementTransactionID != nil &&
			e.SettlementPersonalTransactionID != nil
	})).Return(nil)

	result, err := svc.SettleAll(context.Background(), ledgerID, ownerID, &personalAcctID)
	assert.NoError(t, err)
	assert.Equal(t, 1, result.SettledCount)
	assert.Equal(t, 500.0, result.TotalAmount)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/usecase/ -run "TestSharedExpenseService_SettleAll_WithAccount" -v`
Expected: FAIL

**Step 3: Implement new SettleAll() logic**

Replace the `if receiveAccountID != nil` block in `SettleAll()` (lines 557-588) with the same INCOME/EXPENSE pattern used in Settle():

```go
			if receiveAccountID != nil {
				var personalTxType, receivableTxType domain.TransactionType
				var personalBalanceDelta, receivableBalanceDelta float64
				var personalNote, receivableNote string

				if netReceivable > 0 {
					personalTxType = domain.TransactionTypeIncome
					personalBalanceDelta = absAmount
					personalNote = fmt.Sprintf("收到還款: %s", exp.Description)
					receivableTxType = domain.TransactionTypeExpense
					receivableBalanceDelta = -absAmount
					receivableNote = fmt.Sprintf("沖銷應收: %s", exp.Description)
				} else {
					personalTxType = domain.TransactionTypeExpense
					personalBalanceDelta = -absAmount
					personalNote = fmt.Sprintf("還款給對方: %s", exp.Description)
					receivableTxType = domain.TransactionTypeIncome
					receivableBalanceDelta = absAmount
					receivableNote = fmt.Sprintf("沖銷應付: %s", exp.Description)
				}

				personalTx := &domain.Transaction{
					ID:         uuid.New(),
					UserID:     ledger.OwnerID,
					AccountID:  *receiveAccountID,
					Type:       personalTxType,
					Amount:     absAmount,
					OccurredAt: now,
					Note:       personalNote,
				}
				if err := repos.TransactionRepo.Create(ctx, personalTx); err != nil {
					return fmt.Errorf("create settlement personal transaction: %w", err)
				}
				if err := repos.AccountRepo.UpdateBalance(ctx, *receiveAccountID, personalBalanceDelta); err != nil {
					return fmt.Errorf("update personal account balance: %w", err)
				}

				receivableTx := &domain.Transaction{
					ID:         uuid.New(),
					UserID:     ledger.OwnerID,
					AccountID:  ledger.ReceivableAccountID,
					Type:       receivableTxType,
					Amount:     absAmount,
					OccurredAt: now,
					Note:       receivableNote,
				}
				if err := repos.TransactionRepo.Create(ctx, receivableTx); err != nil {
					return fmt.Errorf("create settlement receivable transaction: %w", err)
				}
				if err := repos.AccountRepo.UpdateBalance(ctx, ledger.ReceivableAccountID, receivableBalanceDelta); err != nil {
					return fmt.Errorf("update receivable account balance: %w", err)
				}

				exp.SettlementPersonalTransactionID = &personalTx.ID
				exp.SettlementTransactionID = &receivableTx.ID
			}
```

**Step 4: Run all tests**

Run: `cd backend && go test ./internal/usecase/ -run "TestSharedExpenseService_SettleAll" -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/internal/usecase/shared_expense_service.go backend/internal/usecase/shared_expense_service_test.go
git commit -m "feat: SettleAll uses INCOME/EXPENSE instead of TRANSFER"
```

---

### Task 5: Update Delete() to reverse both settlement transactions

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:341-361` (Delete method settlement section)
- Test: `backend/internal/usecase/shared_expense_service_test.go`

**Step 1: Update delete test for settled expenses**

Replace `TestSharedExpenseService_Delete_Settled_LastReference_DeletesTransfer`:

```go
func TestSharedExpenseService_Delete_Settled_LastReference_DeletesSettlement(t *testing.T) {
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestSharedExpenseService(expenseRepo, ledgerRepo, txRepo, acctRepo)

	ownerID := uuid.New()
	receivableAcctID := uuid.New()
	personalAcctID := uuid.New()
	ledgerID := uuid.New()
	expenseID := uuid.New()
	receivableTxID := uuid.New()
	settlementTxID := uuid.New()      // receivable EXPENSE
	personalSettleTxID := uuid.New()   // personal INCOME
	now := time.Now()

	expense := &domain.SharedExpense{
		ID: expenseID, LedgerID: ledgerID,
		TotalAmount: 1000.0, SplitMethod: domain.SplitMethodEqual,
		OwnerAmount: 500.0, PartnerAmount: 500.0,
		OwnerPaidAmount: 1000.0, PartnerPaidAmount: 0,
		PayerUserID:                     &ownerID,
		ReceivableTransactionID:         &receivableTxID,
		SettlementTransactionID:         &settlementTxID,
		SettlementPersonalTransactionID: &personalSettleTxID,
		SettledAt:                       &now,
	}
	ledger := &domain.SharedLedger{
		ID: ledgerID, OwnerID: ownerID, ReceivableAccountID: receivableAcctID,
	}

	receivableTx := &domain.Transaction{
		ID: receivableTxID, Type: domain.TransactionTypeIncome,
		Amount: 500.0, AccountID: receivableAcctID,
	}
	settlementRecvTx := &domain.Transaction{
		ID: settlementTxID, Type: domain.TransactionTypeExpense,
		Amount: 500.0, AccountID: receivableAcctID,
	}
	personalSettleTx := &domain.Transaction{
		ID: personalSettleTxID, Type: domain.TransactionTypeIncome,
		Amount: 500.0, AccountID: personalAcctID,
	}

	expenseRepo.On("FindByID", mock.Anything, expenseID).Return(expense, nil)
	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)

	// Reverse receivable tx (INCOME → -500)
	txRepo.On("FindByID", mock.Anything, receivableTxID).Return(receivableTx, nil)
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -500.0).Return(nil)
	txRepo.On("Delete", mock.Anything, receivableTxID).Return(nil)

	// Reverse settlement receivable tx (EXPENSE → +500)
	expenseRepo.On("CountBySettlementTransactionID", mock.Anything, settlementTxID).Return(int64(1), nil)
	txRepo.On("FindByID", mock.Anything, settlementTxID).Return(settlementRecvTx, nil)
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, 500.0).Return(nil)
	txRepo.On("Delete", mock.Anything, settlementTxID).Return(nil)

	// Reverse personal settlement tx (INCOME → -500)
	txRepo.On("FindByID", mock.Anything, personalSettleTxID).Return(personalSettleTx, nil)
	acctRepo.On("UpdateBalance", mock.Anything, personalAcctID, -500.0).Return(nil)
	txRepo.On("Delete", mock.Anything, personalSettleTxID).Return(nil)

	// Soft-delete expense
	expenseRepo.On("Delete", mock.Anything, expenseID).Return(nil)

	err := svc.Delete(context.Background(), expenseID)
	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
	expenseRepo.AssertExpectations(t)
}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/usecase/ -run "TestSharedExpenseService_Delete_Settled_LastReference" -v`
Expected: FAIL

**Step 3: Implement Delete() changes**

Add personal settlement transaction reversal in the Delete method. After the existing `SettlementTransactionID` handling block (around line 361), add:

```go
		// 3b. Handle settlement personal transaction (INCOME/EXPENSE on personal account)
		if expense.SettlementPersonalTransactionID != nil {
			personalSettleTx, err := repos.TransactionRepo.FindByID(ctx, *expense.SettlementPersonalTransactionID)
			if err != nil {
				return fmt.Errorf("find settlement personal transaction: %w", err)
			}
			if err := reverseBalance(ctx, repos.AccountRepo, personalSettleTx); err != nil {
				return fmt.Errorf("reverse settlement personal balance: %w", err)
			}
			if err := repos.TransactionRepo.Delete(ctx, personalSettleTx.ID); err != nil {
				return fmt.Errorf("delete settlement personal transaction: %w", err)
			}
		}
```

Also update the `CountBySettlementTransactionID` check: since settlement transactions are now per-expense (not shared), the count check may simplify. But to maintain backward compatibility with existing TRANSFER settlements, keep the count check.

**Step 4: Run all tests**

Run: `cd backend && go test ./internal/usecase/ -run "TestSharedExpenseService_Delete" -v`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `cd backend && go test ./internal/usecase/ -v`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add backend/internal/usecase/shared_expense_service.go backend/internal/usecase/shared_expense_service_test.go
git commit -m "feat: Delete() reverses both settlement transactions"
```

---

### Task 6: Update Settle() doc comment and run lint

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:401-403` (Settle doc comment)

**Step 1: Update doc comment**

Change the `Settle()` doc comment from:
```go
// Settle settles a shared expense. If receiveAccountID is provided, creates a TRANSFER
// transaction between the receivable account and the specified account. If nil, only
// adjusts the receivable account balance (balance-only settlement).
```
to:
```go
// Settle settles a shared expense. If receiveAccountID is provided, creates two
// transactions: an INCOME/EXPENSE on the personal account and a matching EXPENSE/INCOME
// on the receivable account to clear the receivable. If nil, only adjusts the receivable
// account balance (balance-only settlement).
```

Similarly update `SettleAll()` doc comment.

**Step 2: Run lint**

Run: `cd backend && golangci-lint run ./internal/usecase/...`
Expected: PASS

**Step 3: Run full test suite**

Run: `cd backend && go test ./... -v -count=1`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add backend/internal/usecase/shared_expense_service.go
git commit -m "docs: update Settle/SettleAll doc comments for INCOME/EXPENSE approach"
```
