# ZenBill 記帳功能 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full bookkeeping support to ZenBill — accounts, transactions, categories, merchants CRUD with balance management, multi-currency exchange rates, Taiwan bank seed data, and credit card auto-pay.

**Architecture:** Incremental extension of existing Clean Architecture (Domain → Repository → Usecase → HTTP). New `banks` table with seed data, extended `accounts` and `transactions` columns via GORM AutoMigrate, new exchange rate service using external API with in-memory daily cache.

**Tech Stack:** Go 1.22, Gin, GORM + PostgreSQL 16, slog, robfig/cron, net/http (exchange rate API)

---

## Task 1: Bank Domain Entity + Seed Migration

**Files:**
- Modify: `backend/internal/domain/bank.go` (create new)
- Modify: `backend/internal/domain/repository.go` (add BankRepository interface)
- Modify: `backend/cmd/migrate/main.go` (add Bank to AutoMigrate + seed)
- Create: `backend/migrations/20260220_seed_taiwan_banks.sql` (reference SQL)
- Test: `backend/internal/domain/bank_test.go`

**Step 1: Write the failing test**

```go
// backend/internal/domain/bank_test.go
package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestBank_TableName(t *testing.T) {
	bank := Bank{}
	assert.Equal(t, "banks", bank.TableName())
}

func TestBank_HasShortName(t *testing.T) {
	bank := Bank{ShortName: "台新"}
	assert.True(t, bank.HasShortName())

	bank2 := Bank{}
	assert.False(t, bank2.HasShortName())
}
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/domain/ -run TestBank -v`
Expected: FAIL — `Bank` type not defined

**Step 3: Write the Bank entity**

```go
// backend/internal/domain/bank.go
package domain

import (
	"time"

	"github.com/google/uuid"
)

// Bank represents a Taiwan bank institution
type Bank struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Code      string    `gorm:"type:varchar(3);uniqueIndex;not null" json:"code"`
	Name      string    `gorm:"type:varchar(100);not null" json:"name"`
	ShortName string    `gorm:"type:varchar(50)" json:"short_name,omitempty"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (Bank) TableName() string {
	return "banks"
}

func (b Bank) HasShortName() bool {
	return b.ShortName != ""
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/domain/ -run TestBank -v`
Expected: PASS

**Step 5: Add BankRepository interface to repository.go**

Add to `backend/internal/domain/repository.go`:

```go
// BankRepository defines the interface for bank data access
type BankRepository interface {
	FindAll(ctx context.Context) ([]Bank, error)
	FindByID(ctx context.Context, id uuid.UUID) (*Bank, error)
	FindByCode(ctx context.Context, code string) (*Bank, error)
	Search(ctx context.Context, query string) ([]Bank, error)
	Create(ctx context.Context, bank *Bank) error
}
```

**Step 6: Add Bank to AutoMigrate in cmd/migrate/main.go**

Add `&domain.Bank{}` to the AutoMigrate call (before `&domain.Account{}` since Account will reference it).

**Step 7: Create seed SQL reference file**

Create `backend/migrations/20260220_seed_taiwan_banks.sql` with all ~36 Taiwan banks. This is a reference — the actual seeding will be done in the migrate command's `--seed` flag.

**Step 8: Implement seed logic in cmd/migrate/main.go**

Add a `seedBanks(db *gorm.DB)` function that inserts all Taiwan banks. Call it when `--seed` flag is set.

```go
func seedBanks(db *gorm.DB) error {
	banks := []domain.Bank{
		{Code: "004", Name: "臺灣銀行", ShortName: "臺銀"},
		{Code: "005", Name: "臺灣土地銀行", ShortName: "土銀"},
		// ... all 36 banks
	}
	for _, bank := range banks {
		result := db.Where("code = ?", bank.Code).FirstOrCreate(&bank)
		if result.Error != nil {
			return result.Error
		}
	}
	return nil
}
```

**Step 9: Commit**

```bash
git add backend/internal/domain/bank.go backend/internal/domain/bank_test.go backend/internal/domain/repository.go backend/cmd/migrate/main.go backend/migrations/20260220_seed_taiwan_banks.sql
git commit -m "feat: add Bank entity with Taiwan bank seed data"
```

---

## Task 2: Extend Account Domain (bank_id, passbook_number, auto_pay_enabled)

**Files:**
- Modify: `backend/internal/domain/account.go`
- Test: `backend/internal/domain/account_test.go` (modify existing)

**Step 1: Write failing tests for new fields**

Add to `backend/internal/domain/account_test.go`:

```go
func TestAccount_HasBank(t *testing.T) {
	bankID := uuid.New()
	account := Account{BankID: &bankID}
	assert.True(t, account.HasBank())

	account2 := Account{}
	assert.False(t, account2.HasBank())
}

func TestAccount_IsAutoPayEnabled(t *testing.T) {
	enabled := true
	account := Account{AutoPayEnabled: &enabled}
	assert.True(t, account.IsAutoPayEnabled())

	disabled := false
	account2 := Account{AutoPayEnabled: &disabled}
	assert.False(t, account2.IsAutoPayEnabled())

	// nil defaults to false
	account3 := Account{}
	assert.False(t, account3.IsAutoPayEnabled())
}
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/domain/ -run "TestAccount_HasBank|TestAccount_IsAutoPayEnabled" -v`
Expected: FAIL

**Step 3: Add new fields to Account struct**

In `backend/internal/domain/account.go`, add to the `Account` struct:

```go
BankID         *uuid.UUID `gorm:"type:uuid" json:"bank_id,omitempty"`
PassbookNumber string     `gorm:"type:varchar(20)" json:"passbook_number,omitempty"`
AutoPayEnabled *bool      `gorm:"default:true" json:"auto_pay_enabled,omitempty"`

// Relations
Bank *Bank `gorm:"foreignKey:BankID" json:"bank,omitempty"`
```

Add helper methods:

```go
func (a Account) HasBank() bool {
	return a.BankID != nil
}

func (a Account) IsAutoPayEnabled() bool {
	if a.AutoPayEnabled == nil {
		return false
	}
	return *a.AutoPayEnabled
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/domain/ -run "TestAccount_HasBank|TestAccount_IsAutoPayEnabled" -v`
Expected: PASS

**Step 5: Run all domain tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/domain/ -v`
Expected: ALL PASS (existing + new)

**Step 6: Commit**

```bash
git add backend/internal/domain/account.go backend/internal/domain/account_test.go
git commit -m "feat: extend Account with bank_id, passbook_number, auto_pay_enabled"
```

---

## Task 3: Extend Transaction Domain (multi-currency fields)

**Files:**
- Modify: `backend/internal/domain/transaction.go`
- Test: `backend/internal/domain/transaction_test.go` (modify existing)

**Step 1: Write failing tests**

Add to `backend/internal/domain/transaction_test.go`:

```go
func TestTransaction_IsForeignCurrency(t *testing.T) {
	rate := 30.5
	tx := Transaction{
		OriginalAmount:   ptrFloat64(50.0),
		OriginalCurrency: ptrString("USD"),
		ExchangeRate:     &rate,
	}
	assert.True(t, tx.IsForeignCurrency())

	tx2 := Transaction{}
	assert.False(t, tx2.IsForeignCurrency())
}

func ptrFloat64(v float64) *float64 { return &v }
func ptrString(v string) *string    { return &v }
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/domain/ -run TestTransaction_IsForeignCurrency -v`
Expected: FAIL

**Step 3: Add multi-currency fields to Transaction struct**

In `backend/internal/domain/transaction.go`, add fields:

```go
OriginalAmount   *float64 `gorm:"type:decimal(19,4)" json:"original_amount,omitempty"`
OriginalCurrency *string  `gorm:"type:varchar(3)" json:"original_currency,omitempty"`
ExchangeRate     *float64 `gorm:"type:decimal(19,8)" json:"exchange_rate,omitempty"`
```

Add helper method:

```go
func (t Transaction) IsForeignCurrency() bool {
	return t.OriginalCurrency != nil && *t.OriginalCurrency != ""
}
```

**Step 4: Run all domain tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/domain/ -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/internal/domain/transaction.go backend/internal/domain/transaction_test.go
git commit -m "feat: extend Transaction with multi-currency fields"
```

---

## Task 4: Bank Repository

**Files:**
- Create: `backend/internal/repository/bank_repository.go`
- Test: `backend/internal/repository/bank_repository_test.go`

**Step 1: Write the repository implementation**

```go
// backend/internal/repository/bank_repository.go
package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
)

type BankRepositoryImpl struct {
	db *gorm.DB
}

func NewBankRepository(db *gorm.DB) domain.BankRepository {
	return &BankRepositoryImpl{db: db}
}

func (r *BankRepositoryImpl) FindAll(ctx context.Context) ([]domain.Bank, error) {
	var banks []domain.Bank
	result := r.db.WithContext(ctx).Order("code ASC").Find(&banks)
	return banks, result.Error
}

func (r *BankRepositoryImpl) FindByID(ctx context.Context, id uuid.UUID) (*domain.Bank, error) {
	var bank domain.Bank
	result := r.db.WithContext(ctx).First(&bank, "id = ?", id)
	if result.Error != nil {
		return nil, result.Error
	}
	return &bank, nil
}

func (r *BankRepositoryImpl) FindByCode(ctx context.Context, code string) (*domain.Bank, error) {
	var bank domain.Bank
	result := r.db.WithContext(ctx).First(&bank, "code = ?", code)
	if result.Error != nil {
		return nil, result.Error
	}
	return &bank, nil
}

func (r *BankRepositoryImpl) Search(ctx context.Context, query string) ([]domain.Bank, error) {
	var banks []domain.Bank
	pattern := "%" + query + "%"
	result := r.db.WithContext(ctx).
		Where("name LIKE ? OR short_name LIKE ? OR code LIKE ?", pattern, pattern, pattern).
		Order("code ASC").
		Find(&banks)
	return banks, result.Error
}

func (r *BankRepositoryImpl) Create(ctx context.Context, bank *domain.Bank) error {
	return r.db.WithContext(ctx).Create(bank).Error
}
```

**Step 2: Run build to verify compilation**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Success

**Step 3: Commit**

```bash
git add backend/internal/repository/bank_repository.go
git commit -m "feat: add BankRepository implementation"
```

---

## Task 5: Account Repository

**Files:**
- Create: `backend/internal/repository/account_repository.go`

**Step 1: Write the repository implementation**

```go
// backend/internal/repository/account_repository.go
package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
)

type AccountRepositoryImpl struct {
	db *gorm.DB
}

func NewAccountRepository(db *gorm.DB) domain.AccountRepository {
	return &AccountRepositoryImpl{db: db}
}

func (r *AccountRepositoryImpl) Create(ctx context.Context, account *domain.Account) error {
	return r.db.WithContext(ctx).Create(account).Error
}

func (r *AccountRepositoryImpl) FindByID(ctx context.Context, id uuid.UUID) (*domain.Account, error) {
	var account domain.Account
	result := r.db.WithContext(ctx).Preload("Bank").First(&account, "id = ?", id)
	if result.Error != nil {
		return nil, result.Error
	}
	return &account, nil
}

func (r *AccountRepositoryImpl) FindByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Account, error) {
	var accounts []domain.Account
	result := r.db.WithContext(ctx).Preload("Bank").Where("user_id = ?", userID).Order("created_at DESC").Find(&accounts)
	return accounts, result.Error
}

func (r *AccountRepositoryImpl) UpdateBalance(ctx context.Context, id uuid.UUID, amount float64) error {
	return r.db.WithContext(ctx).Model(&domain.Account{}).Where("id = ?", id).
		Update("balance", gorm.Expr("balance + ?", amount)).Error
}

func (r *AccountRepositoryImpl) Update(ctx context.Context, account *domain.Account) error {
	return r.db.WithContext(ctx).Save(account).Error
}

func (r *AccountRepositoryImpl) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&domain.Account{}, "id = ?", id).Error
}

func (r *AccountRepositoryImpl) FindCreditCardsDueToday(ctx context.Context, day int) ([]domain.Account, error) {
	var accounts []domain.Account
	result := r.db.WithContext(ctx).
		Where("type = ? AND payment_due_day = ? AND auto_pay_from_id IS NOT NULL", domain.AccountTypeCreditCard, day).
		Preload("Bank").
		Find(&accounts)
	return accounts, result.Error
}
```

Note: The `AccountRepository` interface in `repository.go` needs the `ctx context.Context` parameter added to all methods. Check the existing interface definition — if it doesn't have `ctx`, add it consistently with other repos. The existing interface uses `(ctx context.Context, ...)` pattern.

Also check the existing `AccountRepository` interface — it has `UpdateBalance(ctx context.Context, id uuid.UUID, amount float64) error`. The implementation above uses `gorm.Expr("balance + ?", amount)` to do atomic increment — this is important for concurrent safety. Positive `amount` increases balance, negative decreases it.

**Step 2: Run build to verify compilation**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Success

**Step 3: Commit**

```bash
git add backend/internal/repository/account_repository.go
git commit -m "feat: add AccountRepository implementation"
```

---

## Task 6: Transaction Repository

**Files:**
- Create: `backend/internal/repository/transaction_repository.go`

**Step 1: Write the repository implementation**

```go
// backend/internal/repository/transaction_repository.go
package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
)

type TransactionRepositoryImpl struct {
	db *gorm.DB
}

func NewTransactionRepository(db *gorm.DB) domain.TransactionRepository {
	return &TransactionRepositoryImpl{db: db}
}

func (r *TransactionRepositoryImpl) Create(ctx context.Context, tx *domain.Transaction) error {
	return r.db.WithContext(ctx).Create(tx).Error
}

func (r *TransactionRepositoryImpl) FindByID(ctx context.Context, id uuid.UUID) (*domain.Transaction, error) {
	var tx domain.Transaction
	result := r.db.WithContext(ctx).First(&tx, "id = ?", id)
	if result.Error != nil {
		return nil, result.Error
	}
	return &tx, nil
}

func (r *TransactionRepositoryImpl) FindByUserID(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.Transaction, error) {
	var txs []domain.Transaction
	result := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("occurred_at DESC").
		Limit(limit).Offset(offset).
		Find(&txs)
	return txs, result.Error
}

func (r *TransactionRepositoryImpl) FindByAccountID(ctx context.Context, accountID uuid.UUID, limit, offset int) ([]domain.Transaction, error) {
	var txs []domain.Transaction
	result := r.db.WithContext(ctx).
		Where("account_id = ? OR target_account_id = ?", accountID, accountID).
		Order("occurred_at DESC").
		Limit(limit).Offset(offset).
		Find(&txs)
	return txs, result.Error
}

func (r *TransactionRepositoryImpl) FindByDateRange(ctx context.Context, userID uuid.UUID, start, end time.Time) ([]domain.Transaction, error) {
	var txs []domain.Transaction
	result := r.db.WithContext(ctx).
		Where("user_id = ? AND occurred_at >= ? AND occurred_at <= ?", userID, start, end).
		Order("occurred_at DESC").
		Find(&txs)
	return txs, result.Error
}

func (r *TransactionRepositoryImpl) FindByInvoiceID(ctx context.Context, invoiceID uuid.UUID) (*domain.Transaction, error) {
	var tx domain.Transaction
	result := r.db.WithContext(ctx).First(&tx, "invoice_id = ?", invoiceID)
	if result.Error != nil {
		return nil, result.Error
	}
	return &tx, nil
}

func (r *TransactionRepositoryImpl) Update(ctx context.Context, tx *domain.Transaction) error {
	return r.db.WithContext(ctx).Save(tx).Error
}

func (r *TransactionRepositoryImpl) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&domain.Transaction{}, "id = ?", id).Error
}
```

**Step 2: Run build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Success

**Step 3: Commit**

```bash
git add backend/internal/repository/transaction_repository.go
git commit -m "feat: add TransactionRepository implementation"
```

---

## Task 7: Category Repository

**Files:**
- Create: `backend/internal/repository/category_repository.go`

**Step 1: Write the repository implementation**

```go
// backend/internal/repository/category_repository.go
package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
)

type CategoryRepositoryImpl struct {
	db *gorm.DB
}

func NewCategoryRepository(db *gorm.DB) domain.CategoryRepository {
	return &CategoryRepositoryImpl{db: db}
}

func (r *CategoryRepositoryImpl) Create(ctx context.Context, category *domain.Category) error {
	return r.db.WithContext(ctx).Create(category).Error
}

func (r *CategoryRepositoryImpl) FindByID(ctx context.Context, id uuid.UUID) (*domain.Category, error) {
	var category domain.Category
	result := r.db.WithContext(ctx).First(&category, "id = ?", id)
	if result.Error != nil {
		return nil, result.Error
	}
	return &category, nil
}

func (r *CategoryRepositoryImpl) FindByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Category, error) {
	var categories []domain.Category
	result := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("type ASC, name ASC").Find(&categories)
	return categories, result.Error
}

func (r *CategoryRepositoryImpl) FindByType(ctx context.Context, userID uuid.UUID, categoryType domain.CategoryType) ([]domain.Category, error) {
	var categories []domain.Category
	result := r.db.WithContext(ctx).Where("user_id = ? AND type = ?", userID, categoryType).Order("name ASC").Find(&categories)
	return categories, result.Error
}

func (r *CategoryRepositoryImpl) Update(ctx context.Context, category *domain.Category) error {
	return r.db.WithContext(ctx).Save(category).Error
}

func (r *CategoryRepositoryImpl) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&domain.Category{}, "id = ?", id).Error
}
```

**Step 2: Run build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Success

**Step 3: Commit**

```bash
git add backend/internal/repository/category_repository.go
git commit -m "feat: add CategoryRepository implementation"
```

---

## Task 8: User Repository

**Files:**
- Create: `backend/internal/repository/user_repository.go`

**Step 1: Write the repository implementation**

```go
// backend/internal/repository/user_repository.go
package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
)

type UserRepositoryImpl struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) domain.UserRepository {
	return &UserRepositoryImpl{db: db}
}

func (r *UserRepositoryImpl) Create(ctx context.Context, user *domain.User) error {
	return r.db.WithContext(ctx).Create(user).Error
}

func (r *UserRepositoryImpl) FindByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	var user domain.User
	result := r.db.WithContext(ctx).First(&user, "id = ?", id)
	if result.Error != nil {
		return nil, result.Error
	}
	return &user, nil
}

func (r *UserRepositoryImpl) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	var user domain.User
	result := r.db.WithContext(ctx).First(&user, "email = ?", email)
	if result.Error != nil {
		return nil, result.Error
	}
	return &user, nil
}

func (r *UserRepositoryImpl) Update(ctx context.Context, user *domain.User) error {
	return r.db.WithContext(ctx).Save(user).Error
}

func (r *UserRepositoryImpl) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&domain.User{}, "id = ?", id).Error
}
```

**Step 2: Run build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Success

**Step 3: Commit**

```bash
git add backend/internal/repository/user_repository.go
git commit -m "feat: add UserRepository implementation"
```

---

## Task 9: Transaction Usecase (Balance Management)

**Files:**
- Create: `backend/internal/usecase/transaction_service.go`
- Test: `backend/internal/usecase/transaction_service_test.go`

This is the most critical business logic — all balance updates must happen in a DB transaction.

**Step 1: Write failing tests**

```go
// backend/internal/usecase/transaction_service_test.go
package usecase

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/yukiota/zenbill/internal/domain"
)

// MockTransactionRepository
type MockTransactionRepository struct{ mock.Mock }

func (m *MockTransactionRepository) Create(ctx context.Context, tx *domain.Transaction) error {
	return m.Called(ctx, tx).Error(0)
}
func (m *MockTransactionRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.Transaction, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Transaction), args.Error(1)
}
func (m *MockTransactionRepository) FindByUserID(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.Transaction, error) {
	args := m.Called(ctx, userID, limit, offset)
	return args.Get(0).([]domain.Transaction), args.Error(1)
}
func (m *MockTransactionRepository) FindByAccountID(ctx context.Context, accountID uuid.UUID, limit, offset int) ([]domain.Transaction, error) {
	args := m.Called(ctx, accountID, limit, offset)
	return args.Get(0).([]domain.Transaction), args.Error(1)
}
func (m *MockTransactionRepository) FindByDateRange(ctx context.Context, userID uuid.UUID, start, end time.Time) ([]domain.Transaction, error) {
	args := m.Called(ctx, userID, start, end)
	return args.Get(0).([]domain.Transaction), args.Error(1)
}
func (m *MockTransactionRepository) FindByInvoiceID(ctx context.Context, invoiceID uuid.UUID) (*domain.Transaction, error) {
	args := m.Called(ctx, invoiceID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Transaction), args.Error(1)
}
func (m *MockTransactionRepository) Update(ctx context.Context, tx *domain.Transaction) error {
	return m.Called(ctx, tx).Error(0)
}
func (m *MockTransactionRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return m.Called(ctx, id).Error(0)
}

// MockAccountRepository
type MockAccountRepository struct{ mock.Mock }

func (m *MockAccountRepository) Create(ctx context.Context, a *domain.Account) error {
	return m.Called(ctx, a).Error(0)
}
func (m *MockAccountRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.Account, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Account), args.Error(1)
}
func (m *MockAccountRepository) FindByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Account, error) {
	args := m.Called(ctx, userID)
	return args.Get(0).([]domain.Account), args.Error(1)
}
func (m *MockAccountRepository) UpdateBalance(ctx context.Context, id uuid.UUID, amount float64) error {
	return m.Called(ctx, id, amount).Error(0)
}
func (m *MockAccountRepository) Update(ctx context.Context, a *domain.Account) error {
	return m.Called(ctx, a).Error(0)
}
func (m *MockAccountRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return m.Called(ctx, id).Error(0)
}
func (m *MockAccountRepository) FindCreditCardsDueToday(ctx context.Context, day int) ([]domain.Account, error) {
	args := m.Called(ctx, day)
	return args.Get(0).([]domain.Account), args.Error(1)
}

func TestTransactionService_CreateExpense(t *testing.T) {
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := NewTransactionService(txRepo, acctRepo, nil, nil)

	accountID := uuid.New()
	tx := &domain.Transaction{
		UserID:    uuid.New(),
		AccountID: accountID,
		Type:      domain.TransactionTypeExpense,
		Amount:    100.0,
	}

	txRepo.On("Create", mock.Anything, tx).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, accountID, -100.0).Return(nil)

	err := svc.Create(context.Background(), tx)
	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
}

func TestTransactionService_CreateIncome(t *testing.T) {
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := NewTransactionService(txRepo, acctRepo, nil, nil)

	accountID := uuid.New()
	tx := &domain.Transaction{
		UserID:    uuid.New(),
		AccountID: accountID,
		Type:      domain.TransactionTypeIncome,
		Amount:    500.0,
	}

	txRepo.On("Create", mock.Anything, tx).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, accountID, 500.0).Return(nil)

	err := svc.Create(context.Background(), tx)
	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
}

func TestTransactionService_CreateTransfer(t *testing.T) {
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := NewTransactionService(txRepo, acctRepo, nil, nil)

	sourceID := uuid.New()
	targetID := uuid.New()
	tx := &domain.Transaction{
		UserID:          uuid.New(),
		AccountID:       sourceID,
		TargetAccountID: &targetID,
		Type:            domain.TransactionTypeTransfer,
		Amount:          200.0,
	}

	txRepo.On("Create", mock.Anything, tx).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, sourceID, -200.0).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, targetID, 200.0).Return(nil)

	err := svc.Create(context.Background(), tx)
	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
}
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run TestTransactionService -v`
Expected: FAIL — `NewTransactionService` not defined

**Step 3: Implement TransactionService**

```go
// backend/internal/usecase/transaction_service.go
package usecase

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
)

type TransactionService struct {
	txRepo   domain.TransactionRepository
	acctRepo domain.AccountRepository
	db       interface{ Transaction(fc func(tx interface{}) error) error } // GORM DB for DB transactions — nil for unit tests
	logger   *slog.Logger
}

func NewTransactionService(
	txRepo domain.TransactionRepository,
	acctRepo domain.AccountRepository,
	db *gorm.DB,
	logger *slog.Logger,
) *TransactionService {
	if logger == nil {
		logger = slog.Default()
	}
	return &TransactionService{
		txRepo:   txRepo,
		acctRepo: acctRepo,
		db:       db,
		logger:   logger,
	}
}

func (s *TransactionService) Create(ctx context.Context, tx *domain.Transaction) error {
	// Create transaction record
	if err := s.txRepo.Create(ctx, tx); err != nil {
		return fmt.Errorf("create transaction: %w", err)
	}

	// Update balance(s) based on type
	if err := s.applyBalanceChange(ctx, tx); err != nil {
		return fmt.Errorf("update balance: %w", err)
	}

	return nil
}

func (s *TransactionService) Delete(ctx context.Context, id uuid.UUID) error {
	tx, err := s.txRepo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("find transaction: %w", err)
	}

	// Reverse the balance change
	if err := s.reverseBalanceChange(ctx, tx); err != nil {
		return fmt.Errorf("reverse balance: %w", err)
	}

	if err := s.txRepo.Delete(ctx, id); err != nil {
		return fmt.Errorf("delete transaction: %w", err)
	}

	return nil
}

func (s *TransactionService) Update(ctx context.Context, oldTx *domain.Transaction, newTx *domain.Transaction) error {
	// Reverse old balance
	if err := s.reverseBalanceChange(ctx, oldTx); err != nil {
		return fmt.Errorf("reverse old balance: %w", err)
	}

	// Update the transaction record
	if err := s.txRepo.Update(ctx, newTx); err != nil {
		return fmt.Errorf("update transaction: %w", err)
	}

	// Apply new balance
	if err := s.applyBalanceChange(ctx, newTx); err != nil {
		return fmt.Errorf("apply new balance: %w", err)
	}

	return nil
}

func (s *TransactionService) applyBalanceChange(ctx context.Context, tx *domain.Transaction) error {
	switch tx.Type {
	case domain.TransactionTypeExpense:
		return s.acctRepo.UpdateBalance(ctx, tx.AccountID, -tx.Amount)
	case domain.TransactionTypeIncome:
		return s.acctRepo.UpdateBalance(ctx, tx.AccountID, tx.Amount)
	case domain.TransactionTypeTransfer:
		if err := s.acctRepo.UpdateBalance(ctx, tx.AccountID, -tx.Amount); err != nil {
			return err
		}
		if tx.TargetAccountID != nil {
			return s.acctRepo.UpdateBalance(ctx, *tx.TargetAccountID, tx.Amount)
		}
		return nil
	default:
		return fmt.Errorf("unknown transaction type: %s", tx.Type)
	}
}

func (s *TransactionService) reverseBalanceChange(ctx context.Context, tx *domain.Transaction) error {
	switch tx.Type {
	case domain.TransactionTypeExpense:
		return s.acctRepo.UpdateBalance(ctx, tx.AccountID, tx.Amount)
	case domain.TransactionTypeIncome:
		return s.acctRepo.UpdateBalance(ctx, tx.AccountID, -tx.Amount)
	case domain.TransactionTypeTransfer:
		if err := s.acctRepo.UpdateBalance(ctx, tx.AccountID, tx.Amount); err != nil {
			return err
		}
		if tx.TargetAccountID != nil {
			return s.acctRepo.UpdateBalance(ctx, *tx.TargetAccountID, -tx.Amount)
		}
		return nil
	default:
		return fmt.Errorf("unknown transaction type: %s", tx.Type)
	}
}
```

Note: For proper DB transactions wrapping, the actual implementation should use `gorm.DB.Transaction()`. The mock-based tests above validate business logic without DB transactions. The actual DB transaction wrapping will be done in the handler/usecase layer when calling these methods. An alternative approach: add a `WithTx(func(txCtx context.Context) error) error` method to the service that wraps everything in a GORM transaction. Choose based on what feels right during implementation — the key invariant is that balance updates and transaction CRUD happen atomically.

**Step 4: Run tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run TestTransactionService -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/internal/usecase/transaction_service.go backend/internal/usecase/transaction_service_test.go
git commit -m "feat: add TransactionService with balance management"
```

---

## Task 10: Exchange Rate Service

**Files:**
- Create: `backend/pkg/exchangerate/service.go`
- Test: `backend/pkg/exchangerate/service_test.go`

**Step 1: Write failing test**

```go
// backend/pkg/exchangerate/service_test.go
package exchangerate

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCacheKey(t *testing.T) {
	key := cacheKey("USD", "TWD")
	assert.Equal(t, "USD_TWD", key)
}

func TestService_GetRate_Cached(t *testing.T) {
	svc := NewService("")
	// Manually set cache
	svc.setCache("USD", "TWD", 30.5)

	rate, err := svc.GetRate("USD", "TWD")
	assert.NoError(t, err)
	assert.Equal(t, 30.5, rate)
}
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./pkg/exchangerate/ -v`
Expected: FAIL

**Step 3: Implement exchange rate service**

```go
// backend/pkg/exchangerate/service.go
package exchangerate

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type cacheEntry struct {
	Rate      float64
	FetchedAt time.Time
}

type Service struct {
	apiBaseURL string
	cache      map[string]cacheEntry
	mu         sync.RWMutex
	client     *http.Client
}

// NewService creates a new exchange rate service.
// apiBaseURL example: "https://api.exchangerate-api.com/v4/latest"
// If empty, defaults to exchangerate-api.com.
func NewService(apiBaseURL string) *Service {
	if apiBaseURL == "" {
		apiBaseURL = "https://api.exchangerate-api.com/v4/latest"
	}
	return &Service{
		apiBaseURL: apiBaseURL,
		cache:      make(map[string]cacheEntry),
		client:     &http.Client{Timeout: 10 * time.Second},
	}
}

func cacheKey(from, to string) string {
	return from + "_" + to
}

func (s *Service) setCache(from, to string, rate float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache[cacheKey(from, to)] = cacheEntry{Rate: rate, FetchedAt: time.Now()}
}

func (s *Service) getFromCache(from, to string) (float64, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.cache[cacheKey(from, to)]
	if !ok {
		return 0, false
	}
	// Cache valid for 24 hours
	if time.Since(entry.FetchedAt) > 24*time.Hour {
		return 0, false
	}
	return entry.Rate, true
}

func (s *Service) GetRate(from, to string) (float64, error) {
	if from == to {
		return 1.0, nil
	}

	if rate, ok := s.getFromCache(from, to); ok {
		return rate, nil
	}

	rate, err := s.fetchRate(from, to)
	if err != nil {
		return 0, err
	}

	s.setCache(from, to, rate)
	return rate, nil
}

func (s *Service) fetchRate(from, to string) (float64, error) {
	url := fmt.Sprintf("%s/%s", s.apiBaseURL, from)
	resp, err := s.client.Get(url)
	if err != nil {
		return 0, fmt.Errorf("fetch exchange rate: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("exchange rate API returned status %d", resp.StatusCode)
	}

	var result struct {
		Rates map[string]float64 `json:"rates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, fmt.Errorf("decode exchange rate response: %w", err)
	}

	rate, ok := result.Rates[to]
	if !ok {
		return 0, fmt.Errorf("currency %s not found in rates", to)
	}

	return rate, nil
}
```

**Step 4: Run tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./pkg/exchangerate/ -v`
Expected: PASS (cache tests pass; API tests skipped for unit testing)

**Step 5: Commit**

```bash
git add backend/pkg/exchangerate/
git commit -m "feat: add exchange rate service with daily cache"
```

---

## Task 11: Bank HTTP Handler

**Files:**
- Create: `backend/internal/delivery/http/bank_handler.go`

**Step 1: Implement handler**

```go
// backend/internal/delivery/http/bank_handler.go
package http

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	"github.com/yukiota/zenbill/internal/domain"
)

type BankHandler struct {
	bankRepo domain.BankRepository
	logger   *slog.Logger
}

func NewBankHandler(bankRepo domain.BankRepository, logger *slog.Logger) *BankHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &BankHandler{bankRepo: bankRepo, logger: logger}
}

func (h *BankHandler) RegisterRoutes(r *gin.RouterGroup) {
	banks := r.Group("/banks")
	{
		banks.GET("", h.ListBanks)
	}
}

func (h *BankHandler) ListBanks(c *gin.Context) {
	ctx := c.Request.Context()
	query := c.Query("q")

	var banks []domain.Bank
	var err error

	if query != "" {
		banks, err = h.bankRepo.Search(ctx, query)
	} else {
		banks, err = h.bankRepo.FindAll(ctx)
	}

	if err != nil {
		h.logger.ErrorContext(ctx, "failed to list banks", "error", err)
		InternalServerError(c, "failed to list banks")
		return
	}

	Success(c, banks)
}
```

**Step 2: Run build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Success

**Step 3: Commit**

```bash
git add backend/internal/delivery/http/bank_handler.go
git commit -m "feat: add Bank HTTP handler (list + search)"
```

---

## Task 12: Account HTTP Handler

**Files:**
- Create: `backend/internal/delivery/http/account_handler.go`

**Step 1: Implement handler**

```go
// backend/internal/delivery/http/account_handler.go
package http

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
)

type AccountHandler struct {
	accountRepo domain.AccountRepository
	txRepo      domain.TransactionRepository
	logger      *slog.Logger
}

func NewAccountHandler(
	accountRepo domain.AccountRepository,
	txRepo domain.TransactionRepository,
	logger *slog.Logger,
) *AccountHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &AccountHandler{accountRepo: accountRepo, txRepo: txRepo, logger: logger}
}

func (h *AccountHandler) RegisterRoutes(r *gin.RouterGroup) {
	accounts := r.Group("/accounts")
	{
		accounts.GET("", h.ListAccounts)
		accounts.POST("", h.CreateAccount)
		accounts.GET("/:id", h.GetAccount)
		accounts.PUT("/:id", h.UpdateAccount)
		accounts.DELETE("/:id", h.DeleteAccount)
	}
}

// Hardcoded user ID (until auth middleware is implemented)
var defaultUserID = uuid.MustParse("4a7f8d30-e17f-4a1c-a18f-b711150df12d")

type CreateAccountRequest struct {
	Name           string  `json:"name" binding:"required"`
	Type           string  `json:"type" binding:"required"`
	Currency       string  `json:"currency"`
	Balance        float64 `json:"balance"`
	BankID         *string `json:"bank_id"`
	PassbookNumber string  `json:"passbook_number"`
	ClosingDay     *int    `json:"closing_day"`
	PaymentDueDay  *int    `json:"payment_due_day"`
	AutoPayFromID  *string `json:"auto_pay_from_id"`
	AutoPayEnabled *bool   `json:"auto_pay_enabled"`
}

func (h *AccountHandler) CreateAccount(c *gin.Context) {
	ctx := c.Request.Context()
	var req CreateAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	account := domain.Account{
		UserID:         defaultUserID,
		Name:           req.Name,
		Type:           domain.AccountType(req.Type),
		Currency:       req.Currency,
		Balance:        req.Balance,
		PassbookNumber: req.PassbookNumber,
		ClosingDay:     req.ClosingDay,
		PaymentDueDay:  req.PaymentDueDay,
		AutoPayEnabled: req.AutoPayEnabled,
	}

	if account.Currency == "" {
		account.Currency = "TWD"
	}

	if req.BankID != nil {
		bankID, err := uuid.Parse(*req.BankID)
		if err != nil {
			BadRequest(c, "invalid bank_id")
			return
		}
		account.BankID = &bankID
	}

	if req.AutoPayFromID != nil {
		autoPayID, err := uuid.Parse(*req.AutoPayFromID)
		if err != nil {
			BadRequest(c, "invalid auto_pay_from_id")
			return
		}
		account.AutoPayFromID = &autoPayID
	}

	if err := h.accountRepo.Create(ctx, &account); err != nil {
		h.logger.ErrorContext(ctx, "failed to create account", "error", err)
		InternalServerError(c, "failed to create account")
		return
	}

	SuccessWithMessage(c, "account created", account)
}

func (h *AccountHandler) ListAccounts(c *gin.Context) {
	ctx := c.Request.Context()
	accounts, err := h.accountRepo.FindByUserID(ctx, defaultUserID)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to list accounts", "error", err)
		InternalServerError(c, "failed to list accounts")
		return
	}
	Success(c, accounts)
}

func (h *AccountHandler) GetAccount(c *gin.Context) {
	ctx := c.Request.Context()
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		BadRequest(c, "invalid account id")
		return
	}

	account, err := h.accountRepo.FindByID(ctx, id)
	if err != nil {
		NotFound(c, "account not found")
		return
	}

	Success(c, account)
}

type UpdateAccountRequest struct {
	Name           *string  `json:"name"`
	Currency       *string  `json:"currency"`
	BankID         *string  `json:"bank_id"`
	PassbookNumber *string  `json:"passbook_number"`
	ClosingDay     *int     `json:"closing_day"`
	PaymentDueDay  *int     `json:"payment_due_day"`
	AutoPayFromID  *string  `json:"auto_pay_from_id"`
	AutoPayEnabled *bool    `json:"auto_pay_enabled"`
}

func (h *AccountHandler) UpdateAccount(c *gin.Context) {
	ctx := c.Request.Context()
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		BadRequest(c, "invalid account id")
		return
	}

	account, err := h.accountRepo.FindByID(ctx, id)
	if err != nil {
		NotFound(c, "account not found")
		return
	}

	var req UpdateAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	if req.Name != nil {
		account.Name = *req.Name
	}
	if req.Currency != nil {
		account.Currency = *req.Currency
	}
	if req.PassbookNumber != nil {
		account.PassbookNumber = *req.PassbookNumber
	}
	if req.ClosingDay != nil {
		account.ClosingDay = req.ClosingDay
	}
	if req.PaymentDueDay != nil {
		account.PaymentDueDay = req.PaymentDueDay
	}
	if req.AutoPayEnabled != nil {
		account.AutoPayEnabled = req.AutoPayEnabled
	}
	if req.BankID != nil {
		bankID, err := uuid.Parse(*req.BankID)
		if err != nil {
			BadRequest(c, "invalid bank_id")
			return
		}
		account.BankID = &bankID
	}
	if req.AutoPayFromID != nil {
		autoPayID, err := uuid.Parse(*req.AutoPayFromID)
		if err != nil {
			BadRequest(c, "invalid auto_pay_from_id")
			return
		}
		account.AutoPayFromID = &autoPayID
	}

	if err := h.accountRepo.Update(ctx, account); err != nil {
		h.logger.ErrorContext(ctx, "failed to update account", "error", err)
		InternalServerError(c, "failed to update account")
		return
	}

	SuccessWithMessage(c, "account updated", account)
}

func (h *AccountHandler) DeleteAccount(c *gin.Context) {
	ctx := c.Request.Context()
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		BadRequest(c, "invalid account id")
		return
	}

	// Check if account has transactions
	txs, err := h.txRepo.FindByAccountID(ctx, id, 1, 0)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to check transactions", "error", err)
		InternalServerError(c, "failed to check transactions")
		return
	}
	if len(txs) > 0 {
		BadRequest(c, "cannot delete account with existing transactions")
		return
	}

	if err := h.accountRepo.Delete(ctx, id); err != nil {
		h.logger.ErrorContext(ctx, "failed to delete account", "error", err)
		InternalServerError(c, "failed to delete account")
		return
	}

	SuccessWithMessage(c, "account deleted", nil)
}
```

**Step 2: Run build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Success

**Step 3: Commit**

```bash
git add backend/internal/delivery/http/account_handler.go
git commit -m "feat: add Account HTTP handler (CRUD)"
```

---

## Task 13: Transaction HTTP Handler

**Files:**
- Create: `backend/internal/delivery/http/transaction_handler.go`

**Step 1: Implement handler**

```go
// backend/internal/delivery/http/transaction_handler.go
package http

import (
	"log/slog"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"github.com/yukiota/zenbill/internal/usecase"
	"github.com/yukiota/zenbill/pkg/exchangerate"
)

type TransactionHandler struct {
	txRepo      domain.TransactionRepository
	txService   *usecase.TransactionService
	exchangeSvc *exchangerate.Service
	logger      *slog.Logger
}

func NewTransactionHandler(
	txRepo domain.TransactionRepository,
	txService *usecase.TransactionService,
	exchangeSvc *exchangerate.Service,
	logger *slog.Logger,
) *TransactionHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &TransactionHandler{
		txRepo:      txRepo,
		txService:   txService,
		exchangeSvc: exchangeSvc,
		logger:      logger,
	}
}

func (h *TransactionHandler) RegisterRoutes(r *gin.RouterGroup) {
	txs := r.Group("/transactions")
	{
		txs.GET("", h.ListTransactions)
		txs.POST("", h.CreateTransaction)
		txs.GET("/:id", h.GetTransaction)
		txs.PUT("/:id", h.UpdateTransaction)
		txs.DELETE("/:id", h.DeleteTransaction)
	}
}

type CreateTransactionRequest struct {
	AccountID        string   `json:"account_id" binding:"required"`
	TargetAccountID  *string  `json:"target_account_id"`
	Type             string   `json:"type" binding:"required"`
	Amount           float64  `json:"amount" binding:"required"`
	OccurredAt       string   `json:"occurred_at" binding:"required"`
	CategoryID       *string  `json:"category_id"`
	MerchantID       *string  `json:"merchant_id"`
	InvoiceID        *string  `json:"invoice_id"`
	Note             string   `json:"note"`
	OriginalAmount   *float64 `json:"original_amount"`
	OriginalCurrency *string  `json:"original_currency"`
	ExchangeRate     *float64 `json:"exchange_rate"`
}

func (h *TransactionHandler) CreateTransaction(c *gin.Context) {
	ctx := c.Request.Context()
	var req CreateTransactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	accountID, err := uuid.Parse(req.AccountID)
	if err != nil {
		BadRequest(c, "invalid account_id")
		return
	}

	occurredAt, err := time.Parse(time.RFC3339, req.OccurredAt)
	if err != nil {
		BadRequest(c, "invalid occurred_at format, use RFC3339")
		return
	}

	tx := domain.Transaction{
		UserID:           defaultUserID,
		AccountID:        accountID,
		Type:             domain.TransactionType(req.Type),
		Amount:           req.Amount,
		OccurredAt:       occurredAt,
		Note:             req.Note,
		OriginalAmount:   req.OriginalAmount,
		OriginalCurrency: req.OriginalCurrency,
		ExchangeRate:     req.ExchangeRate,
	}

	if req.TargetAccountID != nil {
		targetID, err := uuid.Parse(*req.TargetAccountID)
		if err != nil {
			BadRequest(c, "invalid target_account_id")
			return
		}
		tx.TargetAccountID = &targetID
	}

	if req.CategoryID != nil {
		catID, err := uuid.Parse(*req.CategoryID)
		if err != nil {
			BadRequest(c, "invalid category_id")
			return
		}
		tx.CategoryID = &catID
	}

	if req.MerchantID != nil {
		merchantID, err := uuid.Parse(*req.MerchantID)
		if err != nil {
			BadRequest(c, "invalid merchant_id")
			return
		}
		tx.MerchantID = &merchantID
	}

	if req.InvoiceID != nil {
		invoiceID, err := uuid.Parse(*req.InvoiceID)
		if err != nil {
			BadRequest(c, "invalid invoice_id")
			return
		}
		tx.InvoiceID = &invoiceID
	}

	// Auto-fetch exchange rate if original_currency is set but exchange_rate is not
	if tx.OriginalCurrency != nil && tx.ExchangeRate == nil && h.exchangeSvc != nil {
		// Need account currency to compute rate — for now assume TWD
		// In production, fetch account first to get its currency
		rate, err := h.exchangeSvc.GetRate(*tx.OriginalCurrency, "TWD")
		if err != nil {
			h.logger.ErrorContext(ctx, "failed to fetch exchange rate", "error", err)
			// Non-fatal: proceed without rate
		} else {
			tx.ExchangeRate = &rate
			if tx.OriginalAmount != nil {
				converted := *tx.OriginalAmount * rate
				tx.Amount = converted
			}
		}
	}

	if err := h.txService.Create(ctx, &tx); err != nil {
		h.logger.ErrorContext(ctx, "failed to create transaction", "error", err)
		InternalServerError(c, "failed to create transaction")
		return
	}

	SuccessWithMessage(c, "transaction created", tx)
}

func (h *TransactionHandler) ListTransactions(c *gin.Context) {
	ctx := c.Request.Context()

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	// Filter by account_id if provided
	accountIDStr := c.Query("account_id")
	if accountIDStr != "" {
		accountID, err := uuid.Parse(accountIDStr)
		if err != nil {
			BadRequest(c, "invalid account_id")
			return
		}
		txs, err := h.txRepo.FindByAccountID(ctx, accountID, pageSize, offset)
		if err != nil {
			h.logger.ErrorContext(ctx, "failed to list transactions", "error", err)
			InternalServerError(c, "failed to list transactions")
			return
		}
		Success(c, txs)
		return
	}

	// Filter by date range if provided
	startStr := c.Query("start_date")
	endStr := c.Query("end_date")
	if startStr != "" && endStr != "" {
		start, err := time.Parse("2006-01-02", startStr)
		if err != nil {
			BadRequest(c, "invalid start_date")
			return
		}
		end, err := time.Parse("2006-01-02", endStr)
		if err != nil {
			BadRequest(c, "invalid end_date")
			return
		}
		end = end.Add(24*time.Hour - time.Nanosecond) // end of day
		txs, err := h.txRepo.FindByDateRange(ctx, defaultUserID, start, end)
		if err != nil {
			h.logger.ErrorContext(ctx, "failed to list transactions", "error", err)
			InternalServerError(c, "failed to list transactions")
			return
		}
		Success(c, txs)
		return
	}

	// Default: paginated list
	txs, err := h.txRepo.FindByUserID(ctx, defaultUserID, pageSize, offset)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to list transactions", "error", err)
		InternalServerError(c, "failed to list transactions")
		return
	}

	Success(c, txs)
}

func (h *TransactionHandler) GetTransaction(c *gin.Context) {
	ctx := c.Request.Context()
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		BadRequest(c, "invalid transaction id")
		return
	}

	tx, err := h.txRepo.FindByID(ctx, id)
	if err != nil {
		NotFound(c, "transaction not found")
		return
	}

	Success(c, tx)
}

func (h *TransactionHandler) UpdateTransaction(c *gin.Context) {
	ctx := c.Request.Context()
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		BadRequest(c, "invalid transaction id")
		return
	}

	oldTx, err := h.txRepo.FindByID(ctx, id)
	if err != nil {
		NotFound(c, "transaction not found")
		return
	}

	var req CreateTransactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	accountID, err := uuid.Parse(req.AccountID)
	if err != nil {
		BadRequest(c, "invalid account_id")
		return
	}

	occurredAt, err := time.Parse(time.RFC3339, req.OccurredAt)
	if err != nil {
		BadRequest(c, "invalid occurred_at format")
		return
	}

	newTx := *oldTx
	newTx.AccountID = accountID
	newTx.Type = domain.TransactionType(req.Type)
	newTx.Amount = req.Amount
	newTx.OccurredAt = occurredAt
	newTx.Note = req.Note
	newTx.OriginalAmount = req.OriginalAmount
	newTx.OriginalCurrency = req.OriginalCurrency
	newTx.ExchangeRate = req.ExchangeRate

	if req.TargetAccountID != nil {
		targetID, err := uuid.Parse(*req.TargetAccountID)
		if err != nil {
			BadRequest(c, "invalid target_account_id")
			return
		}
		newTx.TargetAccountID = &targetID
	} else {
		newTx.TargetAccountID = nil
	}

	if req.CategoryID != nil {
		catID, err := uuid.Parse(*req.CategoryID)
		if err != nil {
			BadRequest(c, "invalid category_id")
			return
		}
		newTx.CategoryID = &catID
	}

	if req.MerchantID != nil {
		merchantID, err := uuid.Parse(*req.MerchantID)
		if err != nil {
			BadRequest(c, "invalid merchant_id")
			return
		}
		newTx.MerchantID = &merchantID
	}

	if err := h.txService.Update(ctx, oldTx, &newTx); err != nil {
		h.logger.ErrorContext(ctx, "failed to update transaction", "error", err)
		InternalServerError(c, "failed to update transaction")
		return
	}

	SuccessWithMessage(c, "transaction updated", newTx)
}

func (h *TransactionHandler) DeleteTransaction(c *gin.Context) {
	ctx := c.Request.Context()
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		BadRequest(c, "invalid transaction id")
		return
	}

	if err := h.txService.Delete(ctx, id); err != nil {
		h.logger.ErrorContext(ctx, "failed to delete transaction", "error", err)
		InternalServerError(c, "failed to delete transaction")
		return
	}

	SuccessWithMessage(c, "transaction deleted", nil)
}
```

**Step 2: Run build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Success

**Step 3: Commit**

```bash
git add backend/internal/delivery/http/transaction_handler.go
git commit -m "feat: add Transaction HTTP handler (CRUD with balance management)"
```

---

## Task 14: Category HTTP Handler

**Files:**
- Create: `backend/internal/delivery/http/category_handler.go`

**Step 1: Implement handler**

```go
// backend/internal/delivery/http/category_handler.go
package http

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
)

type CategoryHandler struct {
	categoryRepo domain.CategoryRepository
	txRepo       domain.TransactionRepository
	logger       *slog.Logger
}

func NewCategoryHandler(
	categoryRepo domain.CategoryRepository,
	txRepo domain.TransactionRepository,
	logger *slog.Logger,
) *CategoryHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &CategoryHandler{categoryRepo: categoryRepo, txRepo: txRepo, logger: logger}
}

func (h *CategoryHandler) RegisterRoutes(r *gin.RouterGroup) {
	categories := r.Group("/categories")
	{
		categories.GET("", h.ListCategories)
		categories.POST("", h.CreateCategory)
		categories.PUT("/:id", h.UpdateCategory)
		categories.DELETE("/:id", h.DeleteCategory)
	}
}

type CreateCategoryRequest struct {
	Name     string  `json:"name" binding:"required"`
	Type     string  `json:"type" binding:"required"`
	Icon     string  `json:"icon"`
	ParentID *string `json:"parent_id"`
}

func (h *CategoryHandler) CreateCategory(c *gin.Context) {
	ctx := c.Request.Context()
	var req CreateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	category := domain.Category{
		UserID: defaultUserID,
		Name:   req.Name,
		Type:   domain.CategoryType(req.Type),
		Icon:   req.Icon,
	}

	if req.ParentID != nil {
		parentID, err := uuid.Parse(*req.ParentID)
		if err != nil {
			BadRequest(c, "invalid parent_id")
			return
		}
		category.ParentID = &parentID
	}

	if err := h.categoryRepo.Create(ctx, &category); err != nil {
		h.logger.ErrorContext(ctx, "failed to create category", "error", err)
		InternalServerError(c, "failed to create category")
		return
	}

	SuccessWithMessage(c, "category created", category)
}

// CategoryTree represents a category with its children for tree response
type CategoryTree struct {
	domain.Category
	Children []CategoryTree `json:"children,omitempty"`
}

func (h *CategoryHandler) ListCategories(c *gin.Context) {
	ctx := c.Request.Context()
	categories, err := h.categoryRepo.FindByUserID(ctx, defaultUserID)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to list categories", "error", err)
		InternalServerError(c, "failed to list categories")
		return
	}

	// Build tree structure
	tree := buildCategoryTree(categories)
	Success(c, tree)
}

func buildCategoryTree(categories []domain.Category) []CategoryTree {
	childMap := make(map[uuid.UUID][]domain.Category)
	var roots []domain.Category

	for _, cat := range categories {
		if cat.ParentID == nil {
			roots = append(roots, cat)
		} else {
			childMap[*cat.ParentID] = append(childMap[*cat.ParentID], cat)
		}
	}

	var result []CategoryTree
	for _, root := range roots {
		result = append(result, buildNode(root, childMap))
	}
	return result
}

func buildNode(cat domain.Category, childMap map[uuid.UUID][]domain.Category) CategoryTree {
	node := CategoryTree{Category: cat}
	for _, child := range childMap[cat.ID] {
		node.Children = append(node.Children, buildNode(child, childMap))
	}
	return node
}

func (h *CategoryHandler) UpdateCategory(c *gin.Context) {
	ctx := c.Request.Context()
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		BadRequest(c, "invalid category id")
		return
	}

	category, err := h.categoryRepo.FindByID(ctx, id)
	if err != nil {
		NotFound(c, "category not found")
		return
	}

	var req CreateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	category.Name = req.Name
	category.Icon = req.Icon

	if err := h.categoryRepo.Update(ctx, category); err != nil {
		h.logger.ErrorContext(ctx, "failed to update category", "error", err)
		InternalServerError(c, "failed to update category")
		return
	}

	SuccessWithMessage(c, "category updated", category)
}

func (h *CategoryHandler) DeleteCategory(c *gin.Context) {
	ctx := c.Request.Context()
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		BadRequest(c, "invalid category id")
		return
	}

	// TODO: Check if category has transactions before deleting
	// For now, just delete
	if err := h.categoryRepo.Delete(ctx, id); err != nil {
		h.logger.ErrorContext(ctx, "failed to delete category", "error", err)
		InternalServerError(c, "failed to delete category")
		return
	}

	SuccessWithMessage(c, "category deleted", nil)
}
```

**Step 2: Run build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Success

**Step 3: Commit**

```bash
git add backend/internal/delivery/http/category_handler.go
git commit -m "feat: add Category HTTP handler (CRUD with tree structure)"
```

---

## Task 15: Merchant HTTP Handler

**Files:**
- Create: `backend/internal/delivery/http/merchant_handler.go`

**Step 1: Implement handler**

```go
// backend/internal/delivery/http/merchant_handler.go
package http

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
)

type MerchantHandler struct {
	merchantRepo domain.MerchantRepository
	logger       *slog.Logger
}

func NewMerchantHandler(merchantRepo domain.MerchantRepository, logger *slog.Logger) *MerchantHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &MerchantHandler{merchantRepo: merchantRepo, logger: logger}
}

func (h *MerchantHandler) RegisterRoutes(r *gin.RouterGroup) {
	merchants := r.Group("/merchants")
	{
		merchants.GET("", h.ListMerchants)
		merchants.POST("", h.CreateMerchant)
		merchants.PUT("/:id", h.UpdateMerchant)
		merchants.DELETE("/:id", h.DeleteMerchant)
	}
}

type CreateMerchantRequest struct {
	Name              string  `json:"name" binding:"required"`
	DefaultCategoryID *string `json:"default_category_id"`
	DefaultAccountID  *string `json:"default_account_id"`
}

func (h *MerchantHandler) CreateMerchant(c *gin.Context) {
	ctx := c.Request.Context()
	var req CreateMerchantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	merchant := domain.Merchant{
		UserID: defaultUserID,
		Name:   req.Name,
	}

	if req.DefaultCategoryID != nil {
		catID, err := uuid.Parse(*req.DefaultCategoryID)
		if err != nil {
			BadRequest(c, "invalid default_category_id")
			return
		}
		merchant.DefaultCategoryID = &catID
	}

	if req.DefaultAccountID != nil {
		acctID, err := uuid.Parse(*req.DefaultAccountID)
		if err != nil {
			BadRequest(c, "invalid default_account_id")
			return
		}
		merchant.DefaultAccountID = &acctID
	}

	if err := h.merchantRepo.Create(ctx, &merchant); err != nil {
		h.logger.ErrorContext(ctx, "failed to create merchant", "error", err)
		InternalServerError(c, "failed to create merchant")
		return
	}

	SuccessWithMessage(c, "merchant created", merchant)
}

func (h *MerchantHandler) ListMerchants(c *gin.Context) {
	ctx := c.Request.Context()
	merchants, err := h.merchantRepo.FindByUserID(ctx, defaultUserID)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to list merchants", "error", err)
		InternalServerError(c, "failed to list merchants")
		return
	}
	Success(c, merchants)
}

func (h *MerchantHandler) UpdateMerchant(c *gin.Context) {
	ctx := c.Request.Context()
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		BadRequest(c, "invalid merchant id")
		return
	}

	merchant, err := h.merchantRepo.FindByID(ctx, id)
	if err != nil {
		NotFound(c, "merchant not found")
		return
	}

	var req CreateMerchantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	merchant.Name = req.Name
	if req.DefaultCategoryID != nil {
		catID, err := uuid.Parse(*req.DefaultCategoryID)
		if err != nil {
			BadRequest(c, "invalid default_category_id")
			return
		}
		merchant.DefaultCategoryID = &catID
	}
	if req.DefaultAccountID != nil {
		acctID, err := uuid.Parse(*req.DefaultAccountID)
		if err != nil {
			BadRequest(c, "invalid default_account_id")
			return
		}
		merchant.DefaultAccountID = &acctID
	}

	if err := h.merchantRepo.Update(ctx, merchant); err != nil {
		h.logger.ErrorContext(ctx, "failed to update merchant", "error", err)
		InternalServerError(c, "failed to update merchant")
		return
	}

	SuccessWithMessage(c, "merchant updated", merchant)
}

func (h *MerchantHandler) DeleteMerchant(c *gin.Context) {
	ctx := c.Request.Context()
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		BadRequest(c, "invalid merchant id")
		return
	}

	if err := h.merchantRepo.Delete(ctx, id); err != nil {
		h.logger.ErrorContext(ctx, "failed to delete merchant", "error", err)
		InternalServerError(c, "failed to delete merchant")
		return
	}

	SuccessWithMessage(c, "merchant deleted", nil)
}
```

**Step 2: Run build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Success

**Step 3: Commit**

```bash
git add backend/internal/delivery/http/merchant_handler.go
git commit -m "feat: add Merchant HTTP handler (CRUD)"
```

---

## Task 16: Exchange Rate HTTP Handler

**Files:**
- Create: `backend/internal/delivery/http/exchange_rate_handler.go`

**Step 1: Implement handler**

```go
// backend/internal/delivery/http/exchange_rate_handler.go
package http

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	"github.com/yukiota/zenbill/pkg/exchangerate"
)

type ExchangeRateHandler struct {
	service *exchangerate.Service
	logger  *slog.Logger
}

func NewExchangeRateHandler(service *exchangerate.Service, logger *slog.Logger) *ExchangeRateHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &ExchangeRateHandler{service: service, logger: logger}
}

func (h *ExchangeRateHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/exchange-rates", h.GetRate)
}

func (h *ExchangeRateHandler) GetRate(c *gin.Context) {
	from := c.Query("from")
	to := c.Query("to")

	if from == "" || to == "" {
		BadRequest(c, "both 'from' and 'to' query parameters are required")
		return
	}

	rate, err := h.service.GetRate(from, to)
	if err != nil {
		h.logger.ErrorContext(c.Request.Context(), "failed to get exchange rate", "error", err, "from", from, "to", to)
		InternalServerError(c, "failed to get exchange rate")
		return
	}

	Success(c, gin.H{
		"from": from,
		"to":   to,
		"rate": rate,
	})
}
```

**Step 2: Run build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Success

**Step 3: Commit**

```bash
git add backend/internal/delivery/http/exchange_rate_handler.go
git commit -m "feat: add ExchangeRate HTTP handler"
```

---

## Task 17: Wire Everything in cmd/api/main.go

**Files:**
- Modify: `backend/cmd/api/main.go`

**Step 1: Update main.go to wire all new handlers**

Add the following to `main.go` after the existing invoice handler setup:

```go
// New repositories
bankRepo := repository.NewBankRepository(db)
accountRepo := repository.NewAccountRepository(db)
txRepo := repository.NewTransactionRepository(db)
categoryRepo := repository.NewCategoryRepository(db)
merchantRepo := repository.NewMerchantRepository(db)

// Services
exchangeSvc := exchangerate.NewService("")
txService := usecase.NewTransactionService(txRepo, accountRepo, db, logger.Get())

// New handlers
bankHandler := httpdelivery.NewBankHandler(bankRepo, logger.Get())
accountHandler := httpdelivery.NewAccountHandler(accountRepo, txRepo, logger.Get())
txHandler := httpdelivery.NewTransactionHandler(txRepo, txService, exchangeSvc, logger.Get())
categoryHandler := httpdelivery.NewCategoryHandler(categoryRepo, txRepo, logger.Get())
merchantHandler := httpdelivery.NewMerchantHandler(merchantRepo, logger.Get())
exchangeRateHandler := httpdelivery.NewExchangeRateHandler(exchangeSvc, logger.Get())

// Register routes on existing v1 group
bankHandler.RegisterRoutes(v1)
accountHandler.RegisterRoutes(v1)
txHandler.RegisterRoutes(v1)
categoryHandler.RegisterRoutes(v1)
merchantHandler.RegisterRoutes(v1)
exchangeRateHandler.RegisterRoutes(v1)
```

Remove the existing stub handlers for `/accounts` and `/transactions` that return "Coming soon".

Add imports:
```go
"github.com/yukiota/zenbill/pkg/exchangerate"
```

**Step 2: Run build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Success

**Step 3: Commit**

```bash
git add backend/cmd/api/main.go
git commit -m "feat: wire all bookkeeping handlers in API server"
```

---

## Task 18: Credit Card Auto-Pay Worker

**Files:**
- Create: `backend/internal/usecase/autopay_service.go`
- Test: `backend/internal/usecase/autopay_service_test.go`
- Modify: `backend/cmd/worker/main.go`

**Step 1: Write failing test**

```go
// backend/internal/usecase/autopay_service_test.go
package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/yukiota/zenbill/internal/domain"
)

func TestAutoPayService_ProcessDueCards(t *testing.T) {
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	txService := NewTransactionService(txRepo, acctRepo, nil, nil)
	svc := NewAutoPayService(acctRepo, txService, nil)

	bankAccountID := uuid.New()
	cardID := uuid.New()
	enabled := true
	card := domain.Account{
		ID:             cardID,
		UserID:         uuid.New(),
		Type:           domain.AccountTypeCreditCard,
		Balance:        3000.0,
		AutoPayFromID:  &bankAccountID,
		AutoPayEnabled: &enabled,
		PaymentDueDay:  intPtr(20),
	}

	acctRepo.On("FindCreditCardsDueToday", mock.Anything, 20).Return([]domain.Account{card}, nil)

	// Expect a TRANSFER transaction to be created
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeTransfer &&
			tx.AccountID == bankAccountID &&
			*tx.TargetAccountID == cardID &&
			tx.Amount == 3000.0
	})).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, bankAccountID, -3000.0).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, cardID, 3000.0).Return(nil)

	err := svc.ProcessDueCards(context.Background(), 20)
	assert.NoError(t, err)
	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
}

func intPtr(i int) *int { return &i }
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run TestAutoPayService -v`
Expected: FAIL

**Step 3: Implement AutoPayService**

```go
// backend/internal/usecase/autopay_service.go
package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/yukiota/zenbill/internal/domain"
)

type AutoPayService struct {
	acctRepo  domain.AccountRepository
	txService *TransactionService
	logger    *slog.Logger
}

func NewAutoPayService(
	acctRepo domain.AccountRepository,
	txService *TransactionService,
	logger *slog.Logger,
) *AutoPayService {
	if logger == nil {
		logger = slog.Default()
	}
	return &AutoPayService{
		acctRepo:  acctRepo,
		txService: txService,
		logger:    logger,
	}
}

func (s *AutoPayService) ProcessDueCards(ctx context.Context, today int) error {
	cards, err := s.acctRepo.FindCreditCardsDueToday(ctx, today)
	if err != nil {
		return fmt.Errorf("find due credit cards: %w", err)
	}

	for _, card := range cards {
		if !card.IsAutoPayEnabled() {
			continue
		}
		if card.Balance <= 0 {
			continue
		}
		if card.AutoPayFromID == nil {
			s.logger.Warn("credit card has auto-pay enabled but no source account", "card_id", card.ID)
			continue
		}

		tx := &domain.Transaction{
			UserID:          card.UserID,
			AccountID:       *card.AutoPayFromID,
			TargetAccountID: &card.ID,
			Type:            domain.TransactionTypeTransfer,
			Amount:          card.Balance,
			OccurredAt:      time.Now(),
			Note:            fmt.Sprintf("信用卡自動繳款 - %s", card.Name),
		}

		if err := s.txService.Create(ctx, tx); err != nil {
			s.logger.Error("failed to process auto-pay", "card_id", card.ID, "error", err)
			continue
		}

		s.logger.Info("auto-pay processed", "card_id", card.ID, "amount", card.Balance)
	}

	return nil
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run TestAutoPayService -v`
Expected: PASS

**Step 5: Wire in worker/main.go**

Update the auto-pay cron job in `cmd/worker/main.go` to call `autoPayService.ProcessDueCards(ctx, time.Now().Day())`.

**Step 6: Run all tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./... -v`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add backend/internal/usecase/autopay_service.go backend/internal/usecase/autopay_service_test.go backend/cmd/worker/main.go
git commit -m "feat: add credit card auto-pay service with worker integration"
```

---

## Task 19: Run Migration + Manual Smoke Test

**Step 1: Run migration to create new tables and columns**

```bash
cd /Users/yuki/projects/zen-bill/backend && docker exec -it zenbill_api /app/migrate --seed
```

Or if running locally:
```bash
cd /Users/yuki/projects/zen-bill/backend && go run cmd/migrate/main.go --seed
```

Expected: Banks table created and seeded with 36 Taiwan banks, Account and Transaction tables updated with new columns.

**Step 2: Verify bank seed data**

```bash
docker exec zenbill_postgres psql -U zenbill -d zenbill_db -c "SELECT code, name, short_name FROM banks ORDER BY code LIMIT 10;"
```

Expected: First 10 banks listed.

**Step 3: Start API server and test endpoints**

```bash
# Test banks endpoint
curl -s http://localhost:8090/api/v1/banks | jq '.data | length'
# Expected: 36

# Test bank search
curl -s 'http://localhost:8090/api/v1/banks?q=台新' | jq
# Expected: 台新國際商業銀行

# Test create account
curl -s -X POST http://localhost:8090/api/v1/accounts \
  -H 'Content-Type: application/json' \
  -d '{"name":"台新 Richart","type":"BANK","currency":"TWD","balance":50000}' | jq

# Test create transaction
curl -s -X POST http://localhost:8090/api/v1/transactions \
  -H 'Content-Type: application/json' \
  -d '{"account_id":"<account-id-from-above>","type":"EXPENSE","amount":150,"occurred_at":"2026-02-20T12:00:00Z","note":"午餐"}' | jq

# Test exchange rate
curl -s 'http://localhost:8090/api/v1/exchange-rates?from=USD&to=TWD' | jq
```

**Step 4: Commit any fixes from smoke testing**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```

---

## Task 20: Final Review + Cleanup

**Step 1: Run all tests**

```bash
cd /Users/yuki/projects/zen-bill/backend && go test ./... -v
```
Expected: ALL PASS

**Step 2: Run build**

```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./...
```
Expected: Success

**Step 3: Run lint (if golangci-lint available)**

```bash
cd /Users/yuki/projects/zen-bill/backend && golangci-lint run
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: bookkeeping feature complete - all tests passing"
```

---

## Summary

| Task | Component | Description |
|------|-----------|-------------|
| 1 | Domain | Bank entity + seed migration |
| 2 | Domain | Account extensions (bank_id, passbook, auto_pay_enabled) |
| 3 | Domain | Transaction extensions (multi-currency) |
| 4 | Repository | BankRepository |
| 5 | Repository | AccountRepository |
| 6 | Repository | TransactionRepository |
| 7 | Repository | CategoryRepository |
| 8 | Repository | UserRepository |
| 9 | Usecase | TransactionService (balance management) |
| 10 | Package | Exchange rate service |
| 11 | HTTP | Bank handler |
| 12 | HTTP | Account handler |
| 13 | HTTP | Transaction handler |
| 14 | HTTP | Category handler |
| 15 | HTTP | Merchant handler |
| 16 | HTTP | Exchange rate handler |
| 17 | Wiring | cmd/api/main.go integration |
| 18 | Usecase + Worker | Credit card auto-pay |
| 19 | Integration | Migration + smoke test |
| 20 | QA | Final review + cleanup |
