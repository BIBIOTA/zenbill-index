# Merchant Defaults Auto-Learn Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically learn merchant default category and account from transaction creation, so future transactions with the same merchant auto-fill these fields.

**Architecture:** Add `MerchantRepository` to `TransactionService` and `TxRepos`. After creating a transaction, if the merchant is missing defaults, backfill them from the transaction's values. All within the same DB transaction.

**Tech Stack:** Go, GORM, testify/mock

---

### Task 1: Add MerchantRepo to TxRepos

**Files:**
- Modify: `backend/internal/domain/repository.go:119-124`
- Modify: `backend/internal/repository/tx_manager.go:22-30`

**Step 1: Add MerchantRepo field to TxRepos**

In `backend/internal/domain/repository.go`, add `MerchantRepo` to the `TxRepos` struct:

```go
// TxRepos holds transaction-scoped repository instances.
type TxRepos struct {
	TransactionRepo TransactionRepository
	AccountRepo     AccountRepository
	InvoiceRepo     InvoiceRepository
	MerchantRepo    MerchantRepository
}
```

**Step 2: Provide MerchantRepo in GormTxManager**

In `backend/internal/repository/tx_manager.go`, add `MerchantRepo` to the `TxRepos` construction:

```go
func (m *GormTxManager) WithTransaction(ctx context.Context, fn func(repos domain.TxRepos) error) error {
	return m.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(domain.TxRepos{
			TransactionRepo: NewTransactionRepository(tx),
			AccountRepo:     NewAccountRepository(tx),
			InvoiceRepo:     NewInvoiceRepository(tx),
			MerchantRepo:    NewMerchantRepository(tx),
		})
	})
}
```

**Step 3: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: SUCCESS (no errors)

**Step 4: Commit**

```bash
git add backend/internal/domain/repository.go backend/internal/repository/tx_manager.go
git commit -m "feat: add MerchantRepo to TxRepos for transaction-scoped access"
```

---

### Task 2: Add MerchantRepository to TransactionService

**Files:**
- Modify: `backend/internal/usecase/transaction_service.go:14-38`
- Modify: `backend/cmd/api/main.go:139`
- Modify: `backend/cmd/worker/main.go:103`

**Step 1: Add merchantRepo field and constructor parameter**

In `backend/internal/usecase/transaction_service.go`, update the struct and constructor:

```go
type TransactionService struct {
	txRepo       domain.TransactionRepository
	acctRepo     domain.AccountRepository
	invoiceRepo  domain.InvoiceRepository
	merchantRepo domain.MerchantRepository
	txMgr        domain.TxManager
	logger       *slog.Logger
}

func NewTransactionService(
	txRepo domain.TransactionRepository,
	acctRepo domain.AccountRepository,
	invoiceRepo domain.InvoiceRepository,
	merchantRepo domain.MerchantRepository,
	txMgr domain.TxManager,
	logger *slog.Logger,
) *TransactionService {
	return &TransactionService{
		txRepo:       txRepo,
		acctRepo:     acctRepo,
		invoiceRepo:  invoiceRepo,
		merchantRepo: merchantRepo,
		txMgr:        txMgr,
		logger:       logger,
	}
}
```

**Step 2: Update fallback TxRepos in Create/Delete/Update methods**

In the three methods that construct `domain.TxRepos` for the non-txMgr path, add `MerchantRepo`:

```go
// In Create() (line 66):
err = run(domain.TxRepos{TransactionRepo: s.txRepo, AccountRepo: s.acctRepo, InvoiceRepo: s.invoiceRepo, MerchantRepo: s.merchantRepo})

// In Delete() (line 100):
err = run(domain.TxRepos{TransactionRepo: s.txRepo, AccountRepo: s.acctRepo, InvoiceRepo: s.invoiceRepo, MerchantRepo: s.merchantRepo})

// In Update() (line 134):
err = run(domain.TxRepos{TransactionRepo: s.txRepo, AccountRepo: s.acctRepo, InvoiceRepo: s.invoiceRepo, MerchantRepo: s.merchantRepo})
```

**Step 3: Update DI call sites**

In `backend/cmd/api/main.go` (line 139):
```go
txService := usecase.NewTransactionService(txRepo, accountRepo, invoiceRepo, merchantRepo, txMgr, logger.Get())
```

In `backend/cmd/worker/main.go` (line 103) — check if merchantRepo exists in worker; if not, create it:
```go
merchantRepo := repository.NewMerchantRepository(db)
txService := usecase.NewTransactionService(txRepo, accountRepo, invoiceRepo, merchantRepo, txMgr, logger.Get())
```

**Step 4: Update test helper**

In `backend/internal/usecase/transaction_service_test.go` (line 139), update `newTestTransactionService`:
```go
func newTestTransactionService(txRepo *MockTransactionRepository, acctRepo *MockAccountRepository) *TransactionService {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))
	return NewTransactionService(txRepo, acctRepo, nil, nil, nil, logger)
}
```

Also update the autopay test file (`backend/internal/usecase/autopay_service_test.go` line 17):
```go
txService := NewTransactionService(txRepo, acctRepo, nil, nil, nil, logger)
```

**Step 5: Verify it compiles and existing tests pass**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: SUCCESS

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/... -v -count=1`
Expected: All existing tests pass (no behavior change yet)

**Step 6: Commit**

```bash
git add backend/internal/usecase/transaction_service.go backend/internal/usecase/transaction_service_test.go backend/internal/usecase/autopay_service_test.go backend/cmd/api/main.go backend/cmd/worker/main.go
git commit -m "feat: inject MerchantRepository into TransactionService"
```

---

### Task 3: Write failing tests for auto-learn logic

**Files:**
- Modify: `backend/internal/usecase/transaction_service_test.go`

**Step 1: Add MockMerchantRepository**

```go
// MockMerchantRepository mocks domain.MerchantRepository.
type MockMerchantRepository struct {
	mock.Mock
}

func (m *MockMerchantRepository) Create(ctx context.Context, merchant *domain.Merchant) error {
	args := m.Called(ctx, merchant)
	return args.Error(0)
}

func (m *MockMerchantRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.Merchant, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Merchant), args.Error(1)
}

func (m *MockMerchantRepository) FindByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Merchant, error) {
	args := m.Called(ctx, userID)
	return args.Get(0).([]domain.Merchant), args.Error(1)
}

func (m *MockMerchantRepository) FindByName(ctx context.Context, userID uuid.UUID, name string) (*domain.Merchant, error) {
	args := m.Called(ctx, userID, name)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Merchant), args.Error(1)
}

func (m *MockMerchantRepository) Update(ctx context.Context, merchant *domain.Merchant) error {
	args := m.Called(ctx, merchant)
	return args.Error(0)
}

func (m *MockMerchantRepository) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}
```

**Step 2: Add helper that includes merchant repo**

```go
func newTestTransactionServiceWithMerchant(
	txRepo *MockTransactionRepository,
	acctRepo *MockAccountRepository,
	merchantRepo *MockMerchantRepository,
) *TransactionService {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))
	return NewTransactionService(txRepo, acctRepo, nil, merchantRepo, nil, logger)
}
```

**Step 3: Write test — auto-learn both defaults when merchant has none**

```go
func TestTransactionService_Create_AutoLearnMerchantDefaults(t *testing.T) {
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	merchantRepo := new(MockMerchantRepository)
	svc := newTestTransactionServiceWithMerchant(txRepo, acctRepo, merchantRepo)

	accountID := uuid.New()
	categoryID := uuid.New()
	merchantID := uuid.New()
	tx := &domain.Transaction{
		ID:         uuid.New(),
		UserID:     uuid.New(),
		AccountID:  accountID,
		Type:       domain.TransactionTypeExpense,
		Amount:     100.0,
		OccurredAt: time.Now(),
		CategoryID: &categoryID,
		MerchantID: &merchantID,
	}

	merchant := &domain.Merchant{
		ID:     merchantID,
		UserID: tx.UserID,
		Name:   "7-Eleven",
		// No defaults set
	}

	txRepo.On("Create", mock.Anything, tx).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, accountID, -100.0).Return(nil)
	merchantRepo.On("FindByID", mock.Anything, merchantID).Return(merchant, nil)
	merchantRepo.On("Update", mock.Anything, mock.MatchedBy(func(m *domain.Merchant) bool {
		return m.ID == merchantID &&
			m.DefaultCategoryID != nil && *m.DefaultCategoryID == categoryID &&
			m.DefaultAccountID != nil && *m.DefaultAccountID == accountID
	})).Return(nil)

	err := svc.Create(context.Background(), tx)

	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
	merchantRepo.AssertExpectations(t)
}
```

**Step 4: Write test — skip when merchant already has both defaults**

```go
func TestTransactionService_Create_SkipAutoLearnWhenDefaultsExist(t *testing.T) {
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	merchantRepo := new(MockMerchantRepository)
	svc := newTestTransactionServiceWithMerchant(txRepo, acctRepo, merchantRepo)

	accountID := uuid.New()
	categoryID := uuid.New()
	merchantID := uuid.New()
	existingCatID := uuid.New()
	existingAcctID := uuid.New()
	tx := &domain.Transaction{
		ID:         uuid.New(),
		UserID:     uuid.New(),
		AccountID:  accountID,
		Type:       domain.TransactionTypeExpense,
		Amount:     50.0,
		OccurredAt: time.Now(),
		CategoryID: &categoryID,
		MerchantID: &merchantID,
	}

	merchant := &domain.Merchant{
		ID:                merchantID,
		UserID:            tx.UserID,
		Name:              "Uber Eats",
		DefaultCategoryID: &existingCatID,
		DefaultAccountID:  &existingAcctID,
	}

	txRepo.On("Create", mock.Anything, tx).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, accountID, -50.0).Return(nil)
	merchantRepo.On("FindByID", mock.Anything, merchantID).Return(merchant, nil)
	// No Update call expected — defaults already exist

	err := svc.Create(context.Background(), tx)

	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
	merchantRepo.AssertExpectations(t)
}
```

**Step 5: Write test — partial fill (only account missing)**

```go
func TestTransactionService_Create_AutoLearnPartialDefaults(t *testing.T) {
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	merchantRepo := new(MockMerchantRepository)
	svc := newTestTransactionServiceWithMerchant(txRepo, acctRepo, merchantRepo)

	accountID := uuid.New()
	categoryID := uuid.New()
	merchantID := uuid.New()
	existingCatID := uuid.New()
	tx := &domain.Transaction{
		ID:         uuid.New(),
		UserID:     uuid.New(),
		AccountID:  accountID,
		Type:       domain.TransactionTypeExpense,
		Amount:     75.0,
		OccurredAt: time.Now(),
		CategoryID: &categoryID,
		MerchantID: &merchantID,
	}

	merchant := &domain.Merchant{
		ID:                merchantID,
		UserID:            tx.UserID,
		Name:              "FamilyMart",
		DefaultCategoryID: &existingCatID, // already set
		// DefaultAccountID is nil
	}

	txRepo.On("Create", mock.Anything, tx).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, accountID, -75.0).Return(nil)
	merchantRepo.On("FindByID", mock.Anything, merchantID).Return(merchant, nil)
	merchantRepo.On("Update", mock.Anything, mock.MatchedBy(func(m *domain.Merchant) bool {
		return m.ID == merchantID &&
			m.DefaultCategoryID != nil && *m.DefaultCategoryID == existingCatID && // unchanged
			m.DefaultAccountID != nil && *m.DefaultAccountID == accountID // newly set
	})).Return(nil)

	err := svc.Create(context.Background(), tx)

	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
	merchantRepo.AssertExpectations(t)
}
```

**Step 6: Write test — no merchant on transaction (no-op)**

```go
func TestTransactionService_Create_NoMerchant_NoAutoLearn(t *testing.T) {
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	merchantRepo := new(MockMerchantRepository)
	svc := newTestTransactionServiceWithMerchant(txRepo, acctRepo, merchantRepo)

	accountID := uuid.New()
	tx := &domain.Transaction{
		ID:         uuid.New(),
		UserID:     uuid.New(),
		AccountID:  accountID,
		Type:       domain.TransactionTypeExpense,
		Amount:     30.0,
		OccurredAt: time.Now(),
		// No MerchantID
	}

	txRepo.On("Create", mock.Anything, tx).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, accountID, -30.0).Return(nil)
	// No merchant repo calls expected

	err := svc.Create(context.Background(), tx)

	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
	merchantRepo.AssertExpectations(t)
}
```

**Step 7: Run tests to verify they fail**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/... -run "AutoLearn|NoMerchant_NoAutoLearn" -v -count=1`
Expected: FAIL — merchant repo methods are called but no implementation exists yet

**Step 8: Commit failing tests**

```bash
git add backend/internal/usecase/transaction_service_test.go
git commit -m "test: add failing tests for merchant defaults auto-learn"
```

---

### Task 4: Implement auto-learn logic

**Files:**
- Modify: `backend/internal/usecase/transaction_service.go:43-78`

**Step 1: Add auto-learn call inside the `run` function in Create()**

Update the `Create` method's `run` function to include merchant defaults learning. The auto-learn happens inside the DB transaction so it's atomic:

```go
func (s *TransactionService) Create(ctx context.Context, tx *domain.Transaction) error {
	run := func(repos domain.TxRepos) error {
		if err := repos.TransactionRepo.Create(ctx, tx); err != nil {
			return fmt.Errorf("create transaction: %w", err)
		}
		if err := applyBalance(ctx, repos.AccountRepo, tx); err != nil {
			return err
		}
		// Auto-mark linked invoice as PROCESSED
		if tx.InvoiceID != nil && repos.InvoiceRepo != nil {
			if err := repos.InvoiceRepo.UpdateStatus(ctx, *tx.InvoiceID, domain.InvoiceStatusProcessed); err != nil {
				return fmt.Errorf("update invoice status: %w", err)
			}
		}
		// Auto-learn merchant defaults from this transaction
		if tx.MerchantID != nil && repos.MerchantRepo != nil {
			if err := s.learnMerchantDefaults(ctx, repos.MerchantRepo, tx); err != nil {
				s.logger.Warn("failed to auto-learn merchant defaults",
					slog.String("merchant_id", tx.MerchantID.String()),
					slog.String("error", err.Error()),
				)
			}
		}
		return nil
	}

	// ... rest unchanged
}
```

**Step 2: Add the learnMerchantDefaults helper method**

Add this method to `transaction_service.go` (before the `applyBalance` function, around line 158):

```go
// learnMerchantDefaults backfills a merchant's default category/account
// from the transaction if they are not already set.
func (s *TransactionService) learnMerchantDefaults(ctx context.Context, merchantRepo domain.MerchantRepository, tx *domain.Transaction) error {
	merchant, err := merchantRepo.FindByID(ctx, *tx.MerchantID)
	if err != nil {
		return fmt.Errorf("find merchant: %w", err)
	}

	needsUpdate := false
	if !merchant.HasDefaultCategory() && tx.CategoryID != nil {
		merchant.DefaultCategoryID = tx.CategoryID
		needsUpdate = true
	}
	if !merchant.HasDefaultAccount() {
		merchant.DefaultAccountID = &tx.AccountID
		needsUpdate = true
	}

	if !needsUpdate {
		return nil
	}

	return merchantRepo.Update(ctx, merchant)
}
```

**Step 3: Run the new tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/... -run "AutoLearn|NoMerchant_NoAutoLearn" -v -count=1`
Expected: All 4 new tests PASS

**Step 4: Run ALL existing tests to ensure no regressions**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/... -v -count=1`
Expected: All tests pass (existing + new)

**Step 5: Verify build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: SUCCESS

**Step 6: Commit**

```bash
git add backend/internal/usecase/transaction_service.go
git commit -m "feat: auto-learn merchant default category and account from transactions"
```

---

### Task 5: Lint check and final verification

**Files:** None (verification only)

**Step 1: Run linter**

Run: `cd /Users/yuki/projects/zen-bill/backend && golangci-lint run`
Expected: No new errors

**Step 2: Run full test suite**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./... -count=1`
Expected: All tests pass

**Step 3: Final commit (if lint fixes needed)**

Only if lint requires changes:
```bash
git add -A && git commit -m "fix: address lint issues in merchant auto-learn"
```
