# Shared Ledger (共同記帳) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement shared expense tracking between two users with bidirectional Google Sheet sync.

**Architecture:** New SharedLedger and SharedExpense domain entities following existing Clean Architecture patterns. Uses RECEIVABLE account type and RECEIVABLE/SETTLEMENT transaction types to connect shared expenses with personal ledgers. Google Sheets API v4 with Service Account for bidirectional sync.

**Tech Stack:** Go 1.23, GORM, Gin, Google Sheets API v4, React 19, TanStack Query, Tailwind CSS v4

**Design Doc:** `docs/plans/2026-02-24-shared-ledger-design.md`

---

## Phase 1: Backend Domain Layer

### Task 1: Add RECEIVABLE account type and new transaction types

**Files:**
- Modify: `backend/internal/domain/account.go`
- Modify: `backend/internal/domain/transaction.go`
- Modify: `backend/internal/domain/account_test.go`
- Modify: `backend/internal/domain/transaction_test.go`

**Step 1: Add RECEIVABLE account type**

In `backend/internal/domain/account.go`, add to the AccountType constants:

```go
AccountTypeReceivable AccountType = "RECEIVABLE"
```

Add helper method:

```go
func (a *Account) IsReceivable() bool {
	return a.Type == AccountTypeReceivable
}
```

**Step 2: Add RECEIVABLE and SETTLEMENT transaction types**

In `backend/internal/domain/transaction.go`, add to the TransactionType constants:

```go
TransactionTypeReceivable  TransactionType = "RECEIVABLE"
TransactionTypeSettlement  TransactionType = "SETTLEMENT"
```

Add helper methods:

```go
func (t *Transaction) IsReceivable() bool {
	return t.Type == TransactionTypeReceivable
}

func (t *Transaction) IsSettlement() bool {
	return t.Type == TransactionTypeSettlement
}
```

**Step 3: Write tests**

In `backend/internal/domain/account_test.go`, add:

```go
func TestAccount_IsReceivable(t *testing.T) {
	a := &Account{Type: AccountTypeReceivable}
	assert.True(t, a.IsReceivable())
	assert.False(t, a.IsCreditCard())
	assert.False(t, a.IsBank())
}
```

In `backend/internal/domain/transaction_test.go`, add:

```go
func TestTransaction_IsReceivable(t *testing.T) {
	tx := &Transaction{Type: TransactionTypeReceivable}
	assert.True(t, tx.IsReceivable())
	assert.False(t, tx.IsExpense())
}

func TestTransaction_IsSettlement(t *testing.T) {
	tx := &Transaction{Type: TransactionTypeSettlement}
	assert.True(t, tx.IsSettlement())
	assert.False(t, tx.IsExpense())
}
```

**Step 4: Run tests**

```bash
cd backend && go test ./internal/domain/... -v
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add backend/internal/domain/account.go backend/internal/domain/transaction.go backend/internal/domain/account_test.go backend/internal/domain/transaction_test.go
git commit -m "feat(domain): add RECEIVABLE account type and RECEIVABLE/SETTLEMENT transaction types"
```

---

### Task 2: Create SharedLedger domain entity

**Files:**
- Create: `backend/internal/domain/shared_ledger.go`
- Create: `backend/internal/domain/shared_ledger_test.go`

**Step 1: Write the SharedLedger entity and repository interface**

Create `backend/internal/domain/shared_ledger.go`:

```go
package domain

import (
	"time"

	"github.com/google/uuid"
)

type SharedLedger struct {
	ID                  uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Name                string     `gorm:"type:varchar(100);not null" json:"name"`
	Currency            string     `gorm:"type:varchar(10);not null;default:'TWD'" json:"currency"`
	OwnerID             uuid.UUID  `gorm:"type:uuid;not null;index" json:"owner_id"`
	PartnerID           *uuid.UUID `gorm:"type:uuid;index" json:"partner_id"`
	PartnerName         string     `gorm:"type:varchar(100);not null" json:"partner_name"`
	ReceivableAccountID uuid.UUID  `gorm:"type:uuid;not null" json:"receivable_account_id"`
	GoogleSheetID       string     `gorm:"type:varchar(255)" json:"google_sheet_id"`
	GoogleSheetGID      string     `gorm:"type:varchar(50)" json:"google_sheet_gid"`
	SyncEnabled         bool       `gorm:"default:false" json:"sync_enabled"`
	InviteToken         string     `gorm:"type:varchar(100);uniqueIndex" json:"-"`
	InviteExpiresAt     *time.Time `json:"-"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`

	// Relationships
	Owner              *User    `gorm:"foreignKey:OwnerID" json:"owner,omitempty"`
	Partner            *User    `gorm:"foreignKey:PartnerID" json:"partner,omitempty"`
	ReceivableAccount  *Account `gorm:"foreignKey:ReceivableAccountID" json:"receivable_account,omitempty"`
}

func (SharedLedger) TableName() string {
	return "shared_ledgers"
}

func (l *SharedLedger) IsPartnerJoined() bool {
	return l.PartnerID != nil
}

func (l *SharedLedger) IsOwner(userID uuid.UUID) bool {
	return l.OwnerID == userID
}

func (l *SharedLedger) IsPartner(userID uuid.UUID) bool {
	return l.PartnerID != nil && *l.PartnerID == userID
}

func (l *SharedLedger) IsMember(userID uuid.UUID) bool {
	return l.IsOwner(userID) || l.IsPartner(userID)
}

func (l *SharedLedger) IsInviteValid() bool {
	return l.InviteToken != "" && l.InviteExpiresAt != nil && l.InviteExpiresAt.After(time.Now())
}

func (l *SharedLedger) OwnerName() string {
	if l.Owner != nil {
		return l.Owner.Email
	}
	return ""
}
```

**Step 2: Add repository interface**

Append to `backend/internal/domain/shared_ledger.go`:

```go
type SharedLedgerRepository interface {
	Create(ctx context.Context, ledger *SharedLedger) error
	FindByID(ctx context.Context, id uuid.UUID) (*SharedLedger, error)
	FindByUserID(ctx context.Context, userID uuid.UUID) ([]SharedLedger, error)
	FindByInviteToken(ctx context.Context, token string) (*SharedLedger, error)
	Update(ctx context.Context, ledger *SharedLedger) error
	Delete(ctx context.Context, id uuid.UUID) error
}
```

**Step 3: Write tests**

Create `backend/internal/domain/shared_ledger_test.go`:

```go
package domain

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestSharedLedger_IsPartnerJoined(t *testing.T) {
	l := &SharedLedger{}
	assert.False(t, l.IsPartnerJoined())

	partnerID := uuid.New()
	l.PartnerID = &partnerID
	assert.True(t, l.IsPartnerJoined())
}

func TestSharedLedger_IsMember(t *testing.T) {
	ownerID := uuid.New()
	partnerID := uuid.New()
	otherID := uuid.New()

	l := &SharedLedger{OwnerID: ownerID, PartnerID: &partnerID}

	assert.True(t, l.IsOwner(ownerID))
	assert.False(t, l.IsOwner(partnerID))
	assert.True(t, l.IsPartner(partnerID))
	assert.False(t, l.IsPartner(ownerID))
	assert.True(t, l.IsMember(ownerID))
	assert.True(t, l.IsMember(partnerID))
	assert.False(t, l.IsMember(otherID))
}

func TestSharedLedger_IsInviteValid(t *testing.T) {
	l := &SharedLedger{}
	assert.False(t, l.IsInviteValid())

	future := time.Now().Add(24 * time.Hour)
	l.InviteToken = "abc"
	l.InviteExpiresAt = &future
	assert.True(t, l.IsInviteValid())

	past := time.Now().Add(-1 * time.Hour)
	l.InviteExpiresAt = &past
	assert.False(t, l.IsInviteValid())
}
```

**Step 4: Run tests**

```bash
cd backend && go test ./internal/domain/... -v -run TestSharedLedger
```

Expected: All 3 tests pass.

**Step 5: Commit**

```bash
git add backend/internal/domain/shared_ledger.go backend/internal/domain/shared_ledger_test.go
git commit -m "feat(domain): add SharedLedger entity and repository interface"
```

---

### Task 3: Create SharedExpense domain entity

**Files:**
- Create: `backend/internal/domain/shared_expense.go`
- Create: `backend/internal/domain/shared_expense_test.go`

**Step 1: Write the SharedExpense entity**

Create `backend/internal/domain/shared_expense.go`:

```go
package domain

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type SplitMethod string

const (
	SplitMethodEqual       SplitMethod = "EQUAL"
	SplitMethodFullOwner   SplitMethod = "FULL_OWNER"
	SplitMethodFullPartner SplitMethod = "FULL_PARTNER"
	SplitMethodCustom      SplitMethod = "CUSTOM"
)

type ExpenseCategory string

const (
	ExpenseCategoryFood          ExpenseCategory = "food"
	ExpenseCategoryTransport     ExpenseCategory = "transport"
	ExpenseCategoryAccommodation ExpenseCategory = "accommodation"
	ExpenseCategoryTicket        ExpenseCategory = "ticket"
	ExpenseCategorySupplies      ExpenseCategory = "supplies"
	ExpenseCategorySettlement    ExpenseCategory = "settlement"
	ExpenseCategoryOther         ExpenseCategory = "other"
)

type SharedExpense struct {
	ID                      uuid.UUID   `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	LedgerID                uuid.UUID   `gorm:"type:uuid;not null;index" json:"ledger_id"`
	Date                    time.Time   `gorm:"type:date;not null" json:"date"`
	Category                string      `gorm:"type:varchar(50);not null" json:"category"`
	Description             string      `gorm:"type:varchar(255);not null" json:"description"`
	PayerName               string      `gorm:"type:varchar(100);not null" json:"payer_name"`
	PayerUserID             *uuid.UUID  `gorm:"type:uuid" json:"payer_user_id"`
	TotalAmount             float64     `gorm:"type:decimal(19,4);not null" json:"total_amount"`
	SplitMethod             SplitMethod `gorm:"type:varchar(20);not null" json:"split_method"`
	OwnerAmount             float64     `gorm:"type:decimal(19,4);not null" json:"owner_amount"`
	PartnerAmount           float64     `gorm:"type:decimal(19,4);not null" json:"partner_amount"`
	OwnerPaidAmount         float64     `gorm:"type:decimal(19,4);not null;default:0" json:"owner_paid_amount"`
	PartnerPaidAmount       float64     `gorm:"type:decimal(19,4);not null;default:0" json:"partner_paid_amount"`

	ExpenseTransactionID    *uuid.UUID `gorm:"type:uuid" json:"expense_transaction_id"`
	ReceivableTransactionID *uuid.UUID `gorm:"type:uuid" json:"receivable_transaction_id"`
	SettledAt               *time.Time `json:"settled_at"`

	GoogleSheetRowIndex     *int       `json:"google_sheet_row_index"`
	SyncedAt                *time.Time `json:"synced_at"`
	SourceType              string     `gorm:"type:varchar(20);not null;default:'zenbill'" json:"source_type"`

	CreatedAt               time.Time  `json:"created_at"`
	UpdatedAt               time.Time  `json:"updated_at"`

	// Relationships
	Ledger                  *SharedLedger `gorm:"foreignKey:LedgerID" json:"ledger,omitempty"`
}

func (SharedExpense) TableName() string {
	return "shared_expenses"
}

func (e *SharedExpense) IsSettled() bool {
	return e.SettledAt != nil
}

func (e *SharedExpense) IsSyncedToSheet() bool {
	return e.GoogleSheetRowIndex != nil
}

// CalculateSplit computes OwnerAmount and PartnerAmount based on SplitMethod and TotalAmount.
// For CUSTOM split, OwnerAmount and PartnerAmount must be set by the caller before calling this.
func (e *SharedExpense) CalculateSplit() error {
	switch e.SplitMethod {
	case SplitMethodEqual:
		half := e.TotalAmount / 2
		e.OwnerAmount = half
		e.PartnerAmount = half
	case SplitMethodFullOwner:
		e.OwnerAmount = e.TotalAmount
		e.PartnerAmount = 0
	case SplitMethodFullPartner:
		e.OwnerAmount = 0
		e.PartnerAmount = e.TotalAmount
	case SplitMethodCustom:
		// Validate custom amounts sum to total
		if e.OwnerAmount+e.PartnerAmount != e.TotalAmount {
			return fmt.Errorf("custom split amounts (%f + %f) do not equal total (%f)",
				e.OwnerAmount, e.PartnerAmount, e.TotalAmount)
		}
	default:
		return fmt.Errorf("unknown split method: %s", e.SplitMethod)
	}
	return nil
}

// ReceivableAmount returns the amount the payer should receive from the other party.
// Positive means money owed TO the payer.
func (e *SharedExpense) ReceivableAmount(isOwnerPayer bool) float64 {
	if isOwnerPayer {
		// Owner paid, partner owes their share
		return e.PartnerAmount
	}
	// Partner paid, owner owes their share
	return e.OwnerAmount
}

// CategoryToSheetLabel converts internal category to Google Sheet display label.
func CategoryToSheetLabel(cat string) string {
	switch ExpenseCategory(cat) {
	case ExpenseCategoryFood:
		return "飲食 🍽️"
	case ExpenseCategoryTransport:
		return "交通 🚗"
	case ExpenseCategoryAccommodation:
		return "住宿 🏠"
	case ExpenseCategoryTicket:
		return "票券 🎞️"
	case ExpenseCategorySupplies:
		return "用品 🛒"
	case ExpenseCategorySettlement:
		return "還款 💰"
	case ExpenseCategoryOther:
		return "其他"
	default:
		return cat
	}
}

// SheetLabelToCategory converts Google Sheet display label to internal category.
func SheetLabelToCategory(label string) string {
	switch label {
	case "飲食 🍽️":
		return string(ExpenseCategoryFood)
	case "交通 🚗":
		return string(ExpenseCategoryTransport)
	case "住宿 🏠":
		return string(ExpenseCategoryAccommodation)
	case "票券 🎞️":
		return string(ExpenseCategoryTicket)
	case "用品 🛒":
		return string(ExpenseCategorySupplies)
	case "還款 💰":
		return string(ExpenseCategorySettlement)
	case "其他":
		return string(ExpenseCategoryOther)
	default:
		return string(ExpenseCategoryOther)
	}
}

// SplitMethodToSheetLabel converts SplitMethod to Google Sheet label.
func SplitMethodToSheetLabel(method SplitMethod, ownerName, partnerName string) string {
	switch method {
	case SplitMethodEqual:
		return "均分"
	case SplitMethodFullOwner:
		return fmt.Sprintf("由 %s 全部負擔", ownerName)
	case SplitMethodFullPartner:
		return fmt.Sprintf("由 %s 全部負擔", partnerName)
	case SplitMethodCustom:
		return "非均分(次頁填金額)"
	default:
		return string(method)
	}
}

// SheetLabelToSplitMethod converts Google Sheet label to SplitMethod.
func SheetLabelToSplitMethod(label, ownerName, partnerName string) SplitMethod {
	switch label {
	case "均分":
		return SplitMethodEqual
	case fmt.Sprintf("由 %s 全部負擔", ownerName):
		return SplitMethodFullOwner
	case fmt.Sprintf("由 %s 全部負擔", partnerName):
		return SplitMethodFullPartner
	case "非均分(次頁填金額)":
		return SplitMethodCustom
	default:
		return SplitMethodEqual
	}
}

type SharedExpenseRepository interface {
	Create(ctx context.Context, expense *SharedExpense) error
	FindByID(ctx context.Context, id uuid.UUID) (*SharedExpense, error)
	FindByLedgerID(ctx context.Context, ledgerID uuid.UUID, limit, offset int) ([]SharedExpense, int64, error)
	FindUnsettledByLedgerID(ctx context.Context, ledgerID uuid.UUID) ([]SharedExpense, error)
	FindUnsyncedByLedgerID(ctx context.Context, ledgerID uuid.UUID) ([]SharedExpense, error)
	Update(ctx context.Context, expense *SharedExpense) error
	Delete(ctx context.Context, id uuid.UUID) error
	SumByLedgerID(ctx context.Context, ledgerID uuid.UUID) (ownerTotal, partnerTotal, ownerPaid, partnerPaid float64, err error)
}
```

**Step 2: Write tests**

Create `backend/internal/domain/shared_expense_test.go`:

```go
package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSharedExpense_CalculateSplit_Equal(t *testing.T) {
	e := &SharedExpense{TotalAmount: 500, SplitMethod: SplitMethodEqual}
	err := e.CalculateSplit()
	assert.NoError(t, err)
	assert.Equal(t, 250.0, e.OwnerAmount)
	assert.Equal(t, 250.0, e.PartnerAmount)
}

func TestSharedExpense_CalculateSplit_FullOwner(t *testing.T) {
	e := &SharedExpense{TotalAmount: 500, SplitMethod: SplitMethodFullOwner}
	err := e.CalculateSplit()
	assert.NoError(t, err)
	assert.Equal(t, 500.0, e.OwnerAmount)
	assert.Equal(t, 0.0, e.PartnerAmount)
}

func TestSharedExpense_CalculateSplit_FullPartner(t *testing.T) {
	e := &SharedExpense{TotalAmount: 500, SplitMethod: SplitMethodFullPartner}
	err := e.CalculateSplit()
	assert.NoError(t, err)
	assert.Equal(t, 0.0, e.OwnerAmount)
	assert.Equal(t, 500.0, e.PartnerAmount)
}

func TestSharedExpense_CalculateSplit_Custom_Valid(t *testing.T) {
	e := &SharedExpense{
		TotalAmount:   600,
		SplitMethod:   SplitMethodCustom,
		OwnerAmount:   400,
		PartnerAmount: 200,
	}
	err := e.CalculateSplit()
	assert.NoError(t, err)
	assert.Equal(t, 400.0, e.OwnerAmount)
	assert.Equal(t, 200.0, e.PartnerAmount)
}

func TestSharedExpense_CalculateSplit_Custom_Invalid(t *testing.T) {
	e := &SharedExpense{
		TotalAmount:   600,
		SplitMethod:   SplitMethodCustom,
		OwnerAmount:   400,
		PartnerAmount: 100,
	}
	err := e.CalculateSplit()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "do not equal total")
}

func TestSharedExpense_ReceivableAmount(t *testing.T) {
	e := &SharedExpense{
		OwnerAmount:   250,
		PartnerAmount: 250,
	}
	assert.Equal(t, 250.0, e.ReceivableAmount(true))  // Owner paid → partner owes 250
	assert.Equal(t, 250.0, e.ReceivableAmount(false)) // Partner paid → owner owes 250
}

func TestCategoryToSheetLabel(t *testing.T) {
	assert.Equal(t, "飲食 🍽️", CategoryToSheetLabel("food"))
	assert.Equal(t, "交通 🚗", CategoryToSheetLabel("transport"))
	assert.Equal(t, "還款 💰", CategoryToSheetLabel("settlement"))
	assert.Equal(t, "其他", CategoryToSheetLabel("other"))
	assert.Equal(t, "unknown", CategoryToSheetLabel("unknown"))
}

func TestSheetLabelToCategory(t *testing.T) {
	assert.Equal(t, "food", SheetLabelToCategory("飲食 🍽️"))
	assert.Equal(t, "transport", SheetLabelToCategory("交通 🚗"))
	assert.Equal(t, "other", SheetLabelToCategory("其他"))
	assert.Equal(t, "other", SheetLabelToCategory("未知類別"))
}

func TestSplitMethodToSheetLabel(t *testing.T) {
	assert.Equal(t, "均分", SplitMethodToSheetLabel(SplitMethodEqual, "Yuki", "Zumi"))
	assert.Equal(t, "由 Yuki 全部負擔", SplitMethodToSheetLabel(SplitMethodFullOwner, "Yuki", "Zumi"))
	assert.Equal(t, "由 Zumi 全部負擔", SplitMethodToSheetLabel(SplitMethodFullPartner, "Yuki", "Zumi"))
	assert.Equal(t, "非均分(次頁填金額)", SplitMethodToSheetLabel(SplitMethodCustom, "Yuki", "Zumi"))
}

func TestSheetLabelToSplitMethod(t *testing.T) {
	assert.Equal(t, SplitMethodEqual, SheetLabelToSplitMethod("均分", "Yuki", "Zumi"))
	assert.Equal(t, SplitMethodFullOwner, SheetLabelToSplitMethod("由 Yuki 全部負擔", "Yuki", "Zumi"))
	assert.Equal(t, SplitMethodFullPartner, SheetLabelToSplitMethod("由 Zumi 全部負擔", "Yuki", "Zumi"))
	assert.Equal(t, SplitMethodCustom, SheetLabelToSplitMethod("非均分(次頁填金額)", "Yuki", "Zumi"))
}
```

**Step 3: Run tests**

```bash
cd backend && go test ./internal/domain/... -v -run "TestSharedExpense|TestCategory|TestSheet|TestSplitMethod"
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add backend/internal/domain/shared_expense.go backend/internal/domain/shared_expense_test.go
git commit -m "feat(domain): add SharedExpense entity with split calculation and Sheet label conversion"
```

---

### Task 4: Update TxManager to include new repositories

**Files:**
- Modify: `backend/internal/domain/repository.go` (where TxRepos is defined)

**Step 1: Add SharedLedger and SharedExpense repos to TxRepos**

Find the `TxRepos` struct and add:

```go
SharedLedgerRepo  SharedLedgerRepository
SharedExpenseRepo SharedExpenseRepository
```

**Step 2: Commit**

```bash
git add backend/internal/domain/repository.go
git commit -m "feat(domain): add shared ledger/expense repos to TxRepos"
```

---

## Phase 2: Backend Repository Layer

### Task 5: Implement SharedLedger repository

**Files:**
- Create: `backend/internal/repository/shared_ledger_repository.go`

**Step 1: Implement the repository**

```go
package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
)

type SharedLedgerRepositoryImpl struct {
	db *gorm.DB
}

func NewSharedLedgerRepository(db *gorm.DB) domain.SharedLedgerRepository {
	return &SharedLedgerRepositoryImpl{db: db}
}

func (r *SharedLedgerRepositoryImpl) Create(ctx context.Context, ledger *domain.SharedLedger) error {
	return r.db.WithContext(ctx).Create(ledger).Error
}

func (r *SharedLedgerRepositoryImpl) FindByID(ctx context.Context, id uuid.UUID) (*domain.SharedLedger, error) {
	var ledger domain.SharedLedger
	err := r.db.WithContext(ctx).
		Preload("Owner").
		Preload("Partner").
		Preload("ReceivableAccount").
		First(&ledger, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &ledger, nil
}

func (r *SharedLedgerRepositoryImpl) FindByUserID(ctx context.Context, userID uuid.UUID) ([]domain.SharedLedger, error) {
	var ledgers []domain.SharedLedger
	err := r.db.WithContext(ctx).
		Preload("Owner").
		Preload("Partner").
		Preload("ReceivableAccount").
		Where("owner_id = ? OR partner_id = ?", userID, userID).
		Order("created_at DESC").
		Find(&ledgers).Error
	return ledgers, err
}

func (r *SharedLedgerRepositoryImpl) FindByInviteToken(ctx context.Context, token string) (*domain.SharedLedger, error) {
	var ledger domain.SharedLedger
	err := r.db.WithContext(ctx).
		Preload("Owner").
		First(&ledger, "invite_token = ?", token).Error
	if err != nil {
		return nil, err
	}
	return &ledger, nil
}

func (r *SharedLedgerRepositoryImpl) Update(ctx context.Context, ledger *domain.SharedLedger) error {
	return r.db.WithContext(ctx).Save(ledger).Error
}

func (r *SharedLedgerRepositoryImpl) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&domain.SharedLedger{}, "id = ?", id).Error
}
```

**Step 2: Commit**

```bash
git add backend/internal/repository/shared_ledger_repository.go
git commit -m "feat(repository): implement SharedLedger GORM repository"
```

---

### Task 6: Implement SharedExpense repository

**Files:**
- Create: `backend/internal/repository/shared_expense_repository.go`

**Step 1: Implement the repository**

```go
package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
)

type SharedExpenseRepositoryImpl struct {
	db *gorm.DB
}

func NewSharedExpenseRepository(db *gorm.DB) domain.SharedExpenseRepository {
	return &SharedExpenseRepositoryImpl{db: db}
}

func (r *SharedExpenseRepositoryImpl) Create(ctx context.Context, expense *domain.SharedExpense) error {
	return r.db.WithContext(ctx).Create(expense).Error
}

func (r *SharedExpenseRepositoryImpl) FindByID(ctx context.Context, id uuid.UUID) (*domain.SharedExpense, error) {
	var expense domain.SharedExpense
	err := r.db.WithContext(ctx).
		Preload("Ledger").
		First(&expense, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &expense, nil
}

func (r *SharedExpenseRepositoryImpl) FindByLedgerID(ctx context.Context, ledgerID uuid.UUID, limit, offset int) ([]domain.SharedExpense, int64, error) {
	var expenses []domain.SharedExpense
	var total int64

	q := r.db.WithContext(ctx).Where("ledger_id = ?", ledgerID)
	q.Model(&domain.SharedExpense{}).Count(&total)

	err := q.Order("date DESC, created_at DESC").
		Limit(limit).Offset(offset).
		Find(&expenses).Error
	return expenses, total, err
}

func (r *SharedExpenseRepositoryImpl) FindUnsettledByLedgerID(ctx context.Context, ledgerID uuid.UUID) ([]domain.SharedExpense, error) {
	var expenses []domain.SharedExpense
	err := r.db.WithContext(ctx).
		Where("ledger_id = ? AND settled_at IS NULL AND receivable_transaction_id IS NOT NULL", ledgerID).
		Order("date DESC").
		Find(&expenses).Error
	return expenses, err
}

func (r *SharedExpenseRepositoryImpl) FindUnsyncedByLedgerID(ctx context.Context, ledgerID uuid.UUID) ([]domain.SharedExpense, error) {
	var expenses []domain.SharedExpense
	err := r.db.WithContext(ctx).
		Where("ledger_id = ? AND google_sheet_row_index IS NULL AND source_type = ?", ledgerID, "zenbill").
		Order("created_at ASC").
		Find(&expenses).Error
	return expenses, err
}

func (r *SharedExpenseRepositoryImpl) Update(ctx context.Context, expense *domain.SharedExpense) error {
	return r.db.WithContext(ctx).Save(expense).Error
}

func (r *SharedExpenseRepositoryImpl) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&domain.SharedExpense{}, "id = ?", id).Error
}

func (r *SharedExpenseRepositoryImpl) SumByLedgerID(ctx context.Context, ledgerID uuid.UUID) (ownerTotal, partnerTotal, ownerPaid, partnerPaid float64, err error) {
	var result struct {
		OwnerTotal  float64
		PartnerTotal float64
		OwnerPaid   float64
		PartnerPaid float64
	}
	err = r.db.WithContext(ctx).
		Model(&domain.SharedExpense{}).
		Select("COALESCE(SUM(owner_amount), 0) as owner_total, COALESCE(SUM(partner_amount), 0) as partner_total, COALESCE(SUM(owner_paid_amount), 0) as owner_paid, COALESCE(SUM(partner_paid_amount), 0) as partner_paid").
		Where("ledger_id = ?", ledgerID).
		Scan(&result).Error
	return result.OwnerTotal, result.PartnerTotal, result.OwnerPaid, result.PartnerPaid, err
}
```

**Step 2: Commit**

```bash
git add backend/internal/repository/shared_expense_repository.go
git commit -m "feat(repository): implement SharedExpense GORM repository"
```

---

### Task 7: Update TxManager implementation and migration

**Files:**
- Modify: `backend/internal/repository/tx_manager.go` (add new repos to WithTransaction)
- Modify: `backend/cmd/migrate/main.go` (add new entities to AutoMigrate)

**Step 1: Update TxManager to provide new repos in transaction scope**

In the `WithTransaction` method, add SharedLedger and SharedExpense repos to the `TxRepos`:

```go
SharedLedgerRepo:  NewSharedLedgerRepository(tx),
SharedExpenseRepo: NewSharedExpenseRepository(tx),
```

**Step 2: Update migration**

In `backend/cmd/migrate/main.go`, add to the AutoMigrate call (after Transaction):

```go
&domain.SharedLedger{},
&domain.SharedExpense{},
```

**Step 3: Run migration**

```bash
cd backend && go run cmd/migrate/main.go
```

Expected: Tables `shared_ledgers` and `shared_expenses` created.

**Step 4: Commit**

```bash
git add backend/internal/repository/tx_manager.go backend/cmd/migrate/main.go
git commit -m "feat: add shared ledger/expense to TxManager and migration"
```

---

## Phase 3: Backend Usecase Layer

### Task 8: Implement SharedLedgerService

**Files:**
- Create: `backend/internal/usecase/shared_ledger_service.go`
- Create: `backend/internal/usecase/shared_ledger_service_test.go`

**Step 1: Write failing tests first**

Create `backend/internal/usecase/shared_ledger_service_test.go`:

```go
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

// --- Mocks ---

type MockSharedLedgerRepository struct {
	mock.Mock
}

func (m *MockSharedLedgerRepository) Create(ctx context.Context, ledger *domain.SharedLedger) error {
	return m.Called(ctx, ledger).Error(0)
}

func (m *MockSharedLedgerRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.SharedLedger, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.SharedLedger), args.Error(1)
}

func (m *MockSharedLedgerRepository) FindByUserID(ctx context.Context, userID uuid.UUID) ([]domain.SharedLedger, error) {
	args := m.Called(ctx, userID)
	return args.Get(0).([]domain.SharedLedger), args.Error(1)
}

func (m *MockSharedLedgerRepository) FindByInviteToken(ctx context.Context, token string) (*domain.SharedLedger, error) {
	args := m.Called(ctx, token)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.SharedLedger), args.Error(1)
}

func (m *MockSharedLedgerRepository) Update(ctx context.Context, ledger *domain.SharedLedger) error {
	return m.Called(ctx, ledger).Error(0)
}

func (m *MockSharedLedgerRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return m.Called(ctx, id).Error(0)
}

// --- Tests ---

func TestSharedLedgerService_Create(t *testing.T) {
	ledgerRepo := new(MockSharedLedgerRepository)
	acctRepo := new(MockAccountRepository)
	svc := NewSharedLedgerService(ledgerRepo, acctRepo, nil)

	userID := uuid.New()
	ctx := context.Background()

	acctRepo.On("Create", mock.Anything, mock.MatchedBy(func(a *domain.Account) bool {
		return a.Type == domain.AccountTypeReceivable && a.UserID == userID
	})).Return(nil)

	ledgerRepo.On("Create", mock.Anything, mock.MatchedBy(func(l *domain.SharedLedger) bool {
		return l.OwnerID == userID && l.Name == "Test Ledger" && l.Currency == "TWD" && l.InviteToken != ""
	})).Return(nil)

	ledger, err := svc.Create(ctx, userID, "Test Ledger", "TWD", "Zumi")
	assert.NoError(t, err)
	assert.Equal(t, userID, ledger.OwnerID)
	assert.Equal(t, "Zumi", ledger.PartnerName)
	assert.NotEmpty(t, ledger.InviteToken)
	assert.NotNil(t, ledger.InviteExpiresAt)

	acctRepo.AssertExpectations(t)
	ledgerRepo.AssertExpectations(t)
}

func TestSharedLedgerService_AcceptInvite(t *testing.T) {
	ledgerRepo := new(MockSharedLedgerRepository)
	acctRepo := new(MockAccountRepository)
	svc := NewSharedLedgerService(ledgerRepo, acctRepo, nil)

	ownerID := uuid.New()
	partnerID := uuid.New()
	future := time.Now().Add(24 * time.Hour)
	ledger := &domain.SharedLedger{
		ID:              uuid.New(),
		OwnerID:         ownerID,
		InviteToken:     "valid-token",
		InviteExpiresAt: &future,
		PartnerName:     "Zumi",
		Currency:        "TWD",
		Name:            "Test",
	}

	ledgerRepo.On("FindByInviteToken", mock.Anything, "valid-token").Return(ledger, nil)
	ledgerRepo.On("Update", mock.Anything, mock.MatchedBy(func(l *domain.SharedLedger) bool {
		return l.PartnerID != nil && *l.PartnerID == partnerID
	})).Return(nil)

	result, err := svc.AcceptInvite(context.Background(), "valid-token", partnerID)
	assert.NoError(t, err)
	assert.Equal(t, partnerID, *result.PartnerID)

	ledgerRepo.AssertExpectations(t)
}

func TestSharedLedgerService_AcceptInvite_ExpiredToken(t *testing.T) {
	ledgerRepo := new(MockSharedLedgerRepository)
	svc := NewSharedLedgerService(ledgerRepo, nil, nil)

	past := time.Now().Add(-1 * time.Hour)
	ledger := &domain.SharedLedger{
		InviteToken:     "expired-token",
		InviteExpiresAt: &past,
	}

	ledgerRepo.On("FindByInviteToken", mock.Anything, "expired-token").Return(ledger, nil)

	_, err := svc.AcceptInvite(context.Background(), "expired-token", uuid.New())
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "expired")
}

func TestSharedLedgerService_AcceptInvite_OwnerCannotJoinOwn(t *testing.T) {
	ledgerRepo := new(MockSharedLedgerRepository)
	svc := NewSharedLedgerService(ledgerRepo, nil, nil)

	ownerID := uuid.New()
	future := time.Now().Add(24 * time.Hour)
	ledger := &domain.SharedLedger{
		OwnerID:         ownerID,
		InviteToken:     "token",
		InviteExpiresAt: &future,
	}

	ledgerRepo.On("FindByInviteToken", mock.Anything, "token").Return(ledger, nil)

	_, err := svc.AcceptInvite(context.Background(), "token", ownerID)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "own ledger")
}
```

**Step 2: Run tests to see them fail**

```bash
cd backend && go test ./internal/usecase/... -v -run TestSharedLedgerService
```

Expected: Compilation error (service not implemented yet).

**Step 3: Implement SharedLedgerService**

Create `backend/internal/usecase/shared_ledger_service.go`:

```go
package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
)

type SharedLedgerService struct {
	ledgerRepo domain.SharedLedgerRepository
	acctRepo   domain.AccountRepository
	logger     *slog.Logger
}

func NewSharedLedgerService(
	ledgerRepo domain.SharedLedgerRepository,
	acctRepo domain.AccountRepository,
	logger *slog.Logger,
) *SharedLedgerService {
	if logger == nil {
		logger = slog.Default()
	}
	return &SharedLedgerService{
		ledgerRepo: ledgerRepo,
		acctRepo:   acctRepo,
		logger:     logger,
	}
}

func (s *SharedLedgerService) Create(ctx context.Context, ownerID uuid.UUID, name, currency, partnerName string) (*domain.SharedLedger, error) {
	// Create RECEIVABLE account
	acct := &domain.Account{
		UserID:   ownerID,
		Name:     fmt.Sprintf("%s 應收帳款", name),
		Type:     domain.AccountTypeReceivable,
		Currency: currency,
	}
	if err := s.acctRepo.Create(ctx, acct); err != nil {
		return nil, fmt.Errorf("create receivable account: %w", err)
	}

	// Generate invite token
	inviteToken := uuid.New().String()
	inviteExpires := time.Now().Add(7 * 24 * time.Hour)

	ledger := &domain.SharedLedger{
		Name:                name,
		Currency:            currency,
		OwnerID:             ownerID,
		PartnerName:         partnerName,
		ReceivableAccountID: acct.ID,
		InviteToken:         inviteToken,
		InviteExpiresAt:     &inviteExpires,
	}

	if err := s.ledgerRepo.Create(ctx, ledger); err != nil {
		return nil, fmt.Errorf("create shared ledger: %w", err)
	}

	s.logger.Info("shared ledger created",
		"ledger_id", ledger.ID,
		"owner_id", ownerID,
		"name", name,
	)
	return ledger, nil
}

func (s *SharedLedgerService) GetByID(ctx context.Context, id uuid.UUID) (*domain.SharedLedger, error) {
	return s.ledgerRepo.FindByID(ctx, id)
}

func (s *SharedLedgerService) ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.SharedLedger, error) {
	return s.ledgerRepo.FindByUserID(ctx, userID)
}

func (s *SharedLedgerService) Update(ctx context.Context, ledger *domain.SharedLedger) error {
	return s.ledgerRepo.Update(ctx, ledger)
}

func (s *SharedLedgerService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.ledgerRepo.Delete(ctx, id)
}

func (s *SharedLedgerService) GetInviteInfo(ctx context.Context, token string) (*domain.SharedLedger, error) {
	return s.ledgerRepo.FindByInviteToken(ctx, token)
}

func (s *SharedLedgerService) RegenerateInvite(ctx context.Context, ledgerID uuid.UUID) (*domain.SharedLedger, error) {
	ledger, err := s.ledgerRepo.FindByID(ctx, ledgerID)
	if err != nil {
		return nil, fmt.Errorf("find ledger: %w", err)
	}

	ledger.InviteToken = uuid.New().String()
	expires := time.Now().Add(7 * 24 * time.Hour)
	ledger.InviteExpiresAt = &expires

	if err := s.ledgerRepo.Update(ctx, ledger); err != nil {
		return nil, fmt.Errorf("update invite: %w", err)
	}
	return ledger, nil
}

func (s *SharedLedgerService) AcceptInvite(ctx context.Context, token string, partnerUserID uuid.UUID) (*domain.SharedLedger, error) {
	ledger, err := s.ledgerRepo.FindByInviteToken(ctx, token)
	if err != nil {
		return nil, fmt.Errorf("find ledger by invite: %w", err)
	}

	if !ledger.IsInviteValid() {
		return nil, fmt.Errorf("invite token expired")
	}

	if ledger.OwnerID == partnerUserID {
		return nil, fmt.Errorf("cannot join own ledger")
	}

	if ledger.IsPartnerJoined() {
		return nil, fmt.Errorf("ledger already has a partner")
	}

	ledger.PartnerID = &partnerUserID

	if err := s.ledgerRepo.Update(ctx, ledger); err != nil {
		return nil, fmt.Errorf("update ledger partner: %w", err)
	}

	s.logger.Info("partner joined shared ledger",
		"ledger_id", ledger.ID,
		"partner_id", partnerUserID,
	)
	return ledger, nil
}
```

**Step 4: Run tests**

```bash
cd backend && go test ./internal/usecase/... -v -run TestSharedLedgerService
```

Expected: All 4 tests pass.

**Step 5: Commit**

```bash
git add backend/internal/usecase/shared_ledger_service.go backend/internal/usecase/shared_ledger_service_test.go
git commit -m "feat(usecase): implement SharedLedgerService with create, invite, and accept"
```

---

### Task 9: Implement SharedExpenseService

**Files:**
- Create: `backend/internal/usecase/shared_expense_service.go`
- Create: `backend/internal/usecase/shared_expense_service_test.go`

**Step 1: Write failing tests**

Create `backend/internal/usecase/shared_expense_service_test.go` with mock for SharedExpenseRepository and tests for:

1. `TestSharedExpenseService_Create_EqualSplit_OwnerPays` - Owner pays 500, equal split → creates EXPENSE -500 + RECEIVABLE +250
2. `TestSharedExpenseService_Create_FullOwnerSplit` - Owner負擔 → no receivable transaction
3. `TestSharedExpenseService_Settle` - Confirm receipt → creates SETTLEMENT transaction, updates SettledAt

(These are the most critical business logic tests. Full mock setup follows existing `transaction_service_test.go` patterns.)

**Step 2: Implement SharedExpenseService**

Create `backend/internal/usecase/shared_expense_service.go`:

The service handles:
- `Create(ctx, ledgerID, userID, input)` → calculate split, create SharedExpense, create personal EXPENSE transaction, create RECEIVABLE transaction if applicable
- `List(ctx, ledgerID, limit, offset)` → paginated list
- `GetByID(ctx, id)` → single expense
- `Update(ctx, expense)` → update
- `Delete(ctx, id)` → delete (also delete linked transactions)
- `ListReceivables(ctx, ledgerID)` → unsettled expenses
- `Settle(ctx, expenseID, userID, receiveAccountID)` → create SETTLEMENT transaction, clear receivable
- `GetSummary(ctx, ledgerID)` → totals

Key logic for `Create`:
```go
func (s *SharedExpenseService) Create(ctx context.Context, ledgerID, userID uuid.UUID, input CreateSharedExpenseInput) (*domain.SharedExpense, error) {
    // 1. Get ledger to know owner/partner
    ledger, err := s.ledgerRepo.FindByID(ctx, ledgerID)

    // 2. Determine if payer is owner
    isOwnerPayer := (input.PayerName == getOwnerDisplayName(ledger))

    // 3. Build SharedExpense, calculate split
    expense := &domain.SharedExpense{...}
    expense.CalculateSplit()

    // 4. Set paid amounts
    if isOwnerPayer {
        expense.OwnerPaidAmount = expense.TotalAmount
    } else {
        expense.PartnerPaidAmount = expense.TotalAmount
    }

    // 5. If payer is a ZenBill user and provided an account → create EXPENSE transaction
    if input.PaymentAccountID != nil {
        expenseTx := &domain.Transaction{
            UserID:    userID,
            AccountID: *input.PaymentAccountID,
            Type:      domain.TransactionTypeExpense,
            Amount:    expense.TotalAmount,
            Note:      fmt.Sprintf("%s（共同支出）", input.Description),
            OccurredAt: input.Date,
        }
        // Create via transaction service
    }

    // 6. If there's a receivable amount → create RECEIVABLE transaction
    receivableAmt := expense.ReceivableAmount(isOwnerPayer)
    if receivableAmt > 0 {
        receivableTx := &domain.Transaction{
            UserID:    userID,
            AccountID: ledger.ReceivableAccountID,
            Type:      domain.TransactionTypeReceivable,
            Amount:    receivableAmt,
            Note:      fmt.Sprintf("%s - 待收 %s", input.Description, otherName),
            OccurredAt: input.Date,
        }
        // Create transaction, update receivable account balance
    }

    // 7. Save SharedExpense
    return expense, nil
}
```

Key logic for `Settle`:
```go
func (s *SharedExpenseService) Settle(ctx context.Context, expenseID, userID uuid.UUID, receiveAccountID uuid.UUID) error {
    // 1. Get expense and ledger
    // 2. Calculate settlement amount
    // 3. Create SETTLEMENT transaction to receive account
    // 4. Decrease RECEIVABLE account balance
    // 5. Update expense.SettledAt
}
```

**Step 3: Run tests**

```bash
cd backend && go test ./internal/usecase/... -v -run TestSharedExpenseService
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add backend/internal/usecase/shared_expense_service.go backend/internal/usecase/shared_expense_service_test.go
git commit -m "feat(usecase): implement SharedExpenseService with create, settle, and summary"
```

---

## Phase 4: Backend HTTP Delivery Layer

### Task 10: Implement SharedLedger handler

**Files:**
- Create: `backend/internal/delivery/http/shared_ledger_handler.go`

**Step 1: Implement handler**

Follow existing handler patterns (request types, swagger docs, RegisterRoutes). Implement:

- `POST /shared-ledgers` → CreateLedger
- `GET /shared-ledgers` → ListLedgers
- `GET /shared-ledgers/:id` → GetLedger
- `PUT /shared-ledgers/:id` → UpdateLedger
- `DELETE /shared-ledgers/:id` → DeleteLedger
- `POST /shared-ledgers/:id/invite` → RegenerateInvite
- `GET /shared-ledgers/invite/:token` → GetInviteInfo (public, no auth needed)
- `POST /shared-ledgers/invite/:token/accept` → AcceptInvite

Request types:
```go
type createSharedLedgerRequest struct {
    Name          string `json:"name" binding:"required"`
    Currency      string `json:"currency" binding:"required"`
    PartnerName   string `json:"partner_name" binding:"required"`
    GoogleSheetID string `json:"google_sheet_id"`
    GoogleSheetGID string `json:"google_sheet_gid"`
}
```

**Step 2: Commit**

```bash
git add backend/internal/delivery/http/shared_ledger_handler.go
git commit -m "feat(http): implement SharedLedger API handler"
```

---

### Task 11: Implement SharedExpense handler

**Files:**
- Create: `backend/internal/delivery/http/shared_expense_handler.go`

**Step 1: Implement handler**

- `POST /shared-ledgers/:id/expenses` → CreateExpense
- `GET /shared-ledgers/:id/expenses` → ListExpenses
- `GET /shared-ledgers/:id/expenses/:eid` → GetExpense
- `PUT /shared-ledgers/:id/expenses/:eid` → UpdateExpense
- `DELETE /shared-ledgers/:id/expenses/:eid` → DeleteExpense
- `GET /shared-ledgers/:id/receivables` → ListReceivables
- `POST /shared-ledgers/:id/receivables/:eid/settle` → SettleReceivable
- `GET /shared-ledgers/:id/summary` → GetSummary

Request types:
```go
type createSharedExpenseRequest struct {
    Date             string  `json:"date" binding:"required"`
    Category         string  `json:"category" binding:"required"`
    Description      string  `json:"description" binding:"required"`
    PayerName        string  `json:"payer_name" binding:"required"`
    TotalAmount      float64 `json:"total_amount" binding:"required"`
    SplitMethod      string  `json:"split_method" binding:"required"`
    OwnerAmount      float64 `json:"owner_amount"`
    PartnerAmount    float64 `json:"partner_amount"`
    PaymentAccountID *string `json:"payment_account_id"`
}

type settleReceivableRequest struct {
    ReceiveAccountID string `json:"receive_account_id" binding:"required"`
}
```

**Step 2: Commit**

```bash
git add backend/internal/delivery/http/shared_expense_handler.go
git commit -m "feat(http): implement SharedExpense API handler with receivables"
```

---

### Task 12: Wire up routes and dependency injection

**Files:**
- Modify: `backend/cmd/api/main.go`

**Step 1: Add dependency injection**

In `main.go`, after existing repo/service creation:

```go
// Shared Ledger
sharedLedgerRepo := repository.NewSharedLedgerRepository(db)
sharedExpenseRepo := repository.NewSharedExpenseRepository(db)
sharedLedgerService := usecase.NewSharedLedgerService(sharedLedgerRepo, accountRepo, logger)
sharedExpenseService := usecase.NewSharedExpenseService(sharedExpenseRepo, sharedLedgerRepo, txRepo, accountRepo, txMgr, logger)
sharedLedgerHandler := httpdelivery.NewSharedLedgerHandler(sharedLedgerService, logger)
sharedExpenseHandler := httpdelivery.NewSharedExpenseHandler(sharedExpenseService, sharedLedgerService, logger)
```

**Step 2: Register routes**

In the protected routes group:
```go
sharedLedgerHandler.RegisterRoutes(protected)
sharedExpenseHandler.RegisterRoutes(protected)
```

For the public invite info route, add to public routes:
```go
sharedLedgerHandler.RegisterPublicRoutes(v1)
```

**Step 3: Build and verify**

```bash
cd backend && go build ./...
```

Expected: Compiles successfully.

**Step 4: Commit**

```bash
git add backend/cmd/api/main.go
git commit -m "feat: wire up shared ledger routes and dependency injection"
```

---

## Phase 5: Google Sheets Integration

### Task 13: Implement Google Sheets client

**Files:**
- Create: `backend/pkg/googlesheet/client.go`

**Step 1: Add Google Sheets API dependency**

```bash
cd backend && go get google.golang.org/api/sheets/v4 google.golang.org/api/option
```

**Step 2: Implement client**

```go
package googlesheet

import (
	"context"
	"fmt"

	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

type Client struct {
	service *sheets.Service
}

func NewClient(ctx context.Context, credentialsPath string) (*Client, error) {
	svc, err := sheets.NewService(ctx, option.WithCredentialsFile(credentialsPath))
	if err != nil {
		return nil, fmt.Errorf("create sheets service: %w", err)
	}
	return &Client{service: svc}, nil
}

func (c *Client) ReadSheet(ctx context.Context, spreadsheetID, sheetRange string) ([][]interface{}, error) {
	resp, err := c.service.Spreadsheets.Values.Get(spreadsheetID, sheetRange).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("read sheet: %w", err)
	}
	return resp.Values, nil
}

func (c *Client) AppendRows(ctx context.Context, spreadsheetID, sheetRange string, rows [][]interface{}) error {
	vr := &sheets.ValueRange{Values: rows}
	_, err := c.service.Spreadsheets.Values.Append(spreadsheetID, sheetRange, vr).
		ValueInputOption("USER_ENTERED").
		InsertDataOption("INSERT_ROWS").
		Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("append rows: %w", err)
	}
	return nil
}
```

**Step 3: Commit**

```bash
cd backend && go mod tidy
git add backend/pkg/googlesheet/ backend/go.mod backend/go.sum
git commit -m "feat: add Google Sheets API client"
```

---

### Task 14: Implement Sheet mapper and sync service

**Files:**
- Create: `backend/pkg/googlesheet/mapper.go`
- Create: `backend/internal/usecase/sheet_sync_service.go`
- Create: `backend/internal/usecase/sheet_sync_service_test.go`

**Step 1: Implement mapper**

`backend/pkg/googlesheet/mapper.go` converts between SharedExpense and Sheet row format:

```go
package googlesheet

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/yukiota/zenbill/internal/domain"
)

// ExpenseToRow converts a SharedExpense to a Google Sheet row.
// Columns: 時間戳記, 日期, 類別, 支出說明, {Owner} 付款, {Partner} 付款, 分帳方式, {Owner}, {Partner}
func ExpenseToRow(e *domain.SharedExpense, ownerName, partnerName string) []interface{} {
	row := make([]interface{}, 9)

	// 時間戳記
	row[0] = e.CreatedAt.Format("2006/1/2 下午 3:04:05")

	// 日期 (MM/DD)
	row[1] = fmt.Sprintf("%d/%d", e.Date.Month(), e.Date.Day())

	// 類別
	row[2] = domain.CategoryToSheetLabel(e.Category)

	// 支出說明
	row[3] = e.Description

	// Owner 付款
	if e.OwnerPaidAmount > 0 {
		row[4] = e.OwnerPaidAmount
	} else {
		row[4] = ""
	}

	// Partner 付款
	if e.PartnerPaidAmount > 0 {
		row[5] = e.PartnerPaidAmount
	} else {
		row[5] = ""
	}

	// 分帳方式
	row[6] = domain.SplitMethodToSheetLabel(e.SplitMethod, ownerName, partnerName)

	// 非均分金額
	if e.SplitMethod == domain.SplitMethodCustom {
		row[7] = e.OwnerAmount
		row[8] = e.PartnerAmount
	} else {
		row[7] = ""
		row[8] = ""
	}

	return row
}

// RowToExpenseInput parses a Google Sheet row into SharedExpense fields.
func RowToExpenseInput(row []interface{}, ownerName, partnerName string) (*domain.SharedExpense, error) {
	if len(row) < 7 {
		return nil, fmt.Errorf("row too short: %d columns", len(row))
	}

	expense := &domain.SharedExpense{
		SourceType: "google_sheet",
	}

	// Parse timestamp (col 0)
	if ts, ok := row[0].(string); ok && ts != "" {
		if t, err := parseSheetTimestamp(ts); err == nil {
			expense.CreatedAt = t
		}
	}

	// Parse date (col 1, MM/DD format) — use current year
	if dateStr, ok := row[1].(string); ok && dateStr != "" {
		expense.Date = parseMMDD(dateStr)
	} else {
		expense.Date = time.Now()
	}

	// Category (col 2)
	if cat, ok := row[2].(string); ok {
		expense.Category = domain.SheetLabelToCategory(cat)
	}

	// Description (col 3)
	if desc, ok := row[3].(string); ok {
		expense.Description = desc
	}

	// Owner paid (col 4)
	expense.OwnerPaidAmount = parseAmount(row[4])

	// Partner paid (col 5)
	expense.PartnerPaidAmount = parseAmount(row[5])

	// Total = owner paid + partner paid
	expense.TotalAmount = expense.OwnerPaidAmount + expense.PartnerPaidAmount

	// Split method (col 6)
	if method, ok := row[6].(string); ok {
		expense.SplitMethod = domain.SheetLabelToSplitMethod(method, ownerName, partnerName)
	}

	// Payer name
	if expense.OwnerPaidAmount > 0 {
		expense.PayerName = ownerName
	} else {
		expense.PayerName = partnerName
	}

	// Custom split amounts (col 7, 8)
	if expense.SplitMethod == domain.SplitMethodCustom && len(row) >= 9 {
		expense.OwnerAmount = parseAmount(row[7])
		expense.PartnerAmount = parseAmount(row[8])
	} else {
		expense.CalculateSplit()
	}

	return expense, nil
}

func parseAmount(val interface{}) float64 {
	switch v := val.(type) {
	case float64:
		return v
	case string:
		v = strings.TrimSpace(v)
		if v == "" {
			return 0
		}
		f, _ := strconv.ParseFloat(v, 64)
		return f
	}
	return 0
}

func parseMMDD(s string) time.Time {
	parts := strings.Split(strings.TrimSpace(s), "/")
	if len(parts) == 2 {
		month, _ := strconv.Atoi(parts[0])
		day, _ := strconv.Atoi(parts[1])
		return time.Date(time.Now().Year(), time.Month(month), day, 0, 0, 0, 0, time.Local)
	}
	return time.Now()
}

func parseSheetTimestamp(s string) (time.Time, error) {
	// Format: "2026/2/23 下午 10:55:23"
	s = strings.Replace(s, "上午", "AM", 1)
	s = strings.Replace(s, "下午", "PM", 1)
	return time.Parse("2006/1/2 PM 3:04:05", s)
}
```

**Step 2: Implement SheetSyncService**

Create `backend/internal/usecase/sheet_sync_service.go`:

```go
package usecase

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"github.com/yukiota/zenbill/pkg/googlesheet"
)

type SheetSyncService struct {
	sheetClient  *googlesheet.Client
	expenseRepo  domain.SharedExpenseRepository
	ledgerRepo   domain.SharedLedgerRepository
	logger       *slog.Logger
}

func NewSheetSyncService(
	sheetClient *googlesheet.Client,
	expenseRepo domain.SharedExpenseRepository,
	ledgerRepo domain.SharedLedgerRepository,
	logger *slog.Logger,
) *SheetSyncService {
	if logger == nil {
		logger = slog.Default()
	}
	return &SheetSyncService{
		sheetClient: sheetClient,
		expenseRepo: expenseRepo,
		ledgerRepo:  ledgerRepo,
		logger:      logger,
	}
}

// SyncToSheet pushes unsynced ZenBill expenses to Google Sheet.
func (s *SheetSyncService) SyncToSheet(ctx context.Context, ledgerID uuid.UUID) (int, error) {
	ledger, err := s.ledgerRepo.FindByID(ctx, ledgerID)
	if err != nil {
		return 0, fmt.Errorf("find ledger: %w", err)
	}
	if ledger.GoogleSheetID == "" {
		return 0, nil // No sheet configured
	}

	expenses, err := s.expenseRepo.FindUnsyncedByLedgerID(ctx, ledgerID)
	if err != nil {
		return 0, fmt.Errorf("find unsynced: %w", err)
	}
	if len(expenses) == 0 {
		return 0, nil
	}

	ownerName := ledger.PartnerName // Will need to determine display names
	if ledger.Owner != nil {
		ownerName = ledger.Owner.Email
	}

	var rows [][]interface{}
	for _, e := range expenses {
		rows = append(rows, googlesheet.ExpenseToRow(&e, ownerName, ledger.PartnerName))
	}

	sheetRange := fmt.Sprintf("'表單回應 1'!A:I")
	if err := s.sheetClient.AppendRows(ctx, ledger.GoogleSheetID, sheetRange, rows); err != nil {
		return 0, fmt.Errorf("append to sheet: %w", err)
	}

	// Mark as synced
	for i := range expenses {
		rowIdx := -1 // Placeholder — actual row index from append response
		expenses[i].GoogleSheetRowIndex = &rowIdx
		now := expenses[i].UpdatedAt
		expenses[i].SyncedAt = &now
		if err := s.expenseRepo.Update(ctx, &expenses[i]); err != nil {
			s.logger.Error("failed to mark expense as synced", "id", expenses[i].ID, "error", err)
		}
	}

	s.logger.Info("synced expenses to sheet", "ledger_id", ledgerID, "count", len(expenses))
	return len(expenses), nil
}

// SyncFromSheet reads Google Sheet and imports new entries.
func (s *SheetSyncService) SyncFromSheet(ctx context.Context, ledgerID uuid.UUID) (int, error) {
	ledger, err := s.ledgerRepo.FindByID(ctx, ledgerID)
	if err != nil {
		return 0, fmt.Errorf("find ledger: %w", err)
	}
	if ledger.GoogleSheetID == "" {
		return 0, nil
	}

	sheetRange := fmt.Sprintf("'表單回應 1'!A:I")
	rows, err := s.sheetClient.ReadSheet(ctx, ledger.GoogleSheetID, sheetRange)
	if err != nil {
		return 0, fmt.Errorf("read sheet: %w", err)
	}

	if len(rows) <= 1 {
		return 0, nil // Only header or empty
	}

	// Get existing expenses to check for duplicates
	existingExpenses, _, err := s.expenseRepo.FindByLedgerID(ctx, ledgerID, 10000, 0)
	if err != nil {
		return 0, fmt.Errorf("find existing: %w", err)
	}

	// Build set of existing timestamps for dedup
	existingTimestamps := make(map[string]bool)
	for _, e := range existingExpenses {
		existingTimestamps[e.CreatedAt.Format("2006/1/2 15:04:05")] = true
	}

	ownerName := "Owner"
	if ledger.Owner != nil {
		ownerName = ledger.Owner.Email
	}

	imported := 0
	for i, row := range rows[1:] { // Skip header
		if len(row) < 4 {
			continue
		}

		// Check timestamp for dedup
		if ts, ok := row[0].(string); ok && ts != "" {
			normalized := ts // TODO: normalize timestamp format
			if existingTimestamps[normalized] {
				continue
			}
		}

		expense, err := googlesheet.RowToExpenseInput(row, ownerName, ledger.PartnerName)
		if err != nil {
			s.logger.Warn("skip invalid row", "row", i+2, "error", err)
			continue
		}

		expense.LedgerID = ledgerID
		rowIdx := i + 2 // 1-indexed, skip header
		expense.GoogleSheetRowIndex = &rowIdx

		if err := s.expenseRepo.Create(ctx, expense); err != nil {
			s.logger.Error("failed to import expense", "row", i+2, "error", err)
			continue
		}
		imported++
	}

	s.logger.Info("imported expenses from sheet", "ledger_id", ledgerID, "count", imported)
	return imported, nil
}

// Sync performs bidirectional sync: push to sheet then pull from sheet.
func (s *SheetSyncService) Sync(ctx context.Context, ledgerID uuid.UUID) (pushed, pulled int, err error) {
	pushed, err = s.SyncToSheet(ctx, ledgerID)
	if err != nil {
		return pushed, 0, fmt.Errorf("sync to sheet: %w", err)
	}

	pulled, err = s.SyncFromSheet(ctx, ledgerID)
	if err != nil {
		return pushed, pulled, fmt.Errorf("sync from sheet: %w", err)
	}

	return pushed, pulled, nil
}
```

**Step 3: Add sync endpoint to handler and config**

Add to `SharedLedgerHandler`:
```go
// POST /shared-ledgers/:id/sync
func (h *SharedLedgerHandler) SyncSheet(c *gin.Context) { ... }
```

Add to `backend/internal/config/config.go`:
```go
type GoogleConfig struct {
    ServiceAccountKeyPath string `mapstructure:"service_account_key_path"`
}
```

**Step 4: Commit**

```bash
git add backend/pkg/googlesheet/ backend/internal/usecase/sheet_sync_service.go backend/internal/config/config.go
git commit -m "feat: implement Google Sheet bidirectional sync service"
```

---

## Phase 6: Backend — Update balance logic for new transaction types

### Task 15: Update transaction balance logic

**Files:**
- Modify: `backend/internal/usecase/transaction_service.go` (the `applyBalance` function)

**Step 1: Add RECEIVABLE and SETTLEMENT to balance logic**

In the `applyBalance` function, add cases:

```go
case domain.TransactionTypeReceivable:
    return acctRepo.UpdateBalance(ctx, tx.AccountID, tx.Amount)
case domain.TransactionTypeSettlement:
    return acctRepo.UpdateBalance(ctx, tx.AccountID, tx.Amount)
```

RECEIVABLE adds to the receivable account balance.
SETTLEMENT adds to the receive account balance. (The receivable account decrease is handled by SharedExpenseService.Settle.)

**Step 2: Update `effectiveAmount` function**

```go
case domain.TransactionTypeReceivable:
    return tx.Amount
case domain.TransactionTypeSettlement:
    return tx.Amount
```

**Step 3: Run all existing tests to verify no regression**

```bash
cd backend && go test ./internal/usecase/... -v
```

Expected: All existing tests still pass.

**Step 4: Commit**

```bash
git add backend/internal/usecase/transaction_service.go
git commit -m "feat(usecase): add RECEIVABLE and SETTLEMENT balance logic"
```

---

## Phase 7: Frontend Implementation

### Task 16: Add TypeScript types for shared ledger

**Files:**
- Modify: `frontend/src/types/index.ts`

**Step 1: Add types**

```typescript
// Shared Ledger
export interface SharedLedger {
  id: string
  name: string
  currency: string
  owner_id: string
  partner_id: string | null
  partner_name: string
  receivable_account_id: string
  google_sheet_id: string
  google_sheet_gid: string
  sync_enabled: boolean
  created_at: string
  updated_at: string
  owner?: User
  partner?: User
  receivable_account?: Account
}

export interface CreateSharedLedgerInput {
  name: string
  currency: string
  partner_name: string
  google_sheet_id?: string
  google_sheet_gid?: string
}

export type SplitMethod = 'EQUAL' | 'FULL_OWNER' | 'FULL_PARTNER' | 'CUSTOM'
export type ExpenseCategory = 'food' | 'transport' | 'accommodation' | 'ticket' | 'supplies' | 'settlement' | 'other'

export interface SharedExpense {
  id: string
  ledger_id: string
  date: string
  category: string
  description: string
  payer_name: string
  payer_user_id: string | null
  total_amount: number
  split_method: SplitMethod
  owner_amount: number
  partner_amount: number
  owner_paid_amount: number
  partner_paid_amount: number
  expense_transaction_id: string | null
  receivable_transaction_id: string | null
  settled_at: string | null
  google_sheet_row_index: number | null
  synced_at: string | null
  source_type: string
  created_at: string
  updated_at: string
}

export interface CreateSharedExpenseInput {
  date: string
  category: string
  description: string
  payer_name: string
  total_amount: number
  split_method: SplitMethod
  owner_amount?: number
  partner_amount?: number
  payment_account_id?: string
}

export interface SharedLedgerSummary {
  owner_total: number
  partner_total: number
  owner_paid: number
  partner_paid: number
  receivable_amount: number
}

export interface InviteInfo {
  ledger_name: string
  owner_email: string
  partner_name: string
  currency: string
}
```

Also add `'RECEIVABLE'` to the `AccountType` union and `'RECEIVABLE' | 'SETTLEMENT'` to `TransactionType`.

**Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(frontend): add shared ledger TypeScript types"
```

---

### Task 17: Add React Query hooks for shared ledger

**Files:**
- Create: `frontend/src/hooks/useSharedLedgers.ts`

**Step 1: Implement hooks**

Follow existing hook patterns (useTransactions.ts as reference):

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  ApiResponse, PaginatedResponse,
  SharedLedger, CreateSharedLedgerInput,
  SharedExpense, CreateSharedExpenseInput,
  SharedLedgerSummary, InviteInfo,
} from '../types'

// --- Ledger ---

export function useSharedLedgers() {
  return useQuery({
    queryKey: ['shared-ledgers'],
    queryFn: () => api.get<ApiResponse<SharedLedger[]>>('/shared-ledgers'),
    select: (res) => res.data,
  })
}

export function useSharedLedger(id: string | undefined) {
  return useQuery({
    queryKey: ['shared-ledgers', id],
    queryFn: () => api.get<ApiResponse<SharedLedger>>(`/shared-ledgers/${id}`),
    enabled: !!id,
    select: (res) => res.data,
  })
}

export function useCreateSharedLedger() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSharedLedgerInput) =>
      api.post<ApiResponse<SharedLedger>>('/shared-ledgers', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shared-ledgers'] }),
  })
}

export function useDeleteSharedLedger() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiResponse<null>>(`/shared-ledgers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shared-ledgers'] }),
  })
}

// --- Invite ---

export function useInviteInfo(token: string | undefined) {
  return useQuery({
    queryKey: ['shared-ledger-invite', token],
    queryFn: () => api.get<ApiResponse<InviteInfo>>(`/shared-ledgers/invite/${token}`),
    enabled: !!token,
    select: (res) => res.data,
  })
}

export function useAcceptInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (token: string) =>
      api.post<ApiResponse<SharedLedger>>(`/shared-ledgers/invite/${token}/accept`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shared-ledgers'] }),
  })
}

export function useRegenerateInvite() {
  return useMutation({
    mutationFn: (ledgerId: string) =>
      api.post<ApiResponse<{ invite_token: string }>>(`/shared-ledgers/${ledgerId}/invite`, {}),
  })
}

// --- Expenses ---

export function useSharedExpenses(ledgerId: string | undefined, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['shared-expenses', ledgerId, page],
    queryFn: () =>
      api.get<PaginatedResponse<SharedExpense>>(
        `/shared-ledgers/${ledgerId}/expenses?page=${page}&page_size=${pageSize}`,
      ),
    enabled: !!ledgerId,
  })
}

export function useCreateSharedExpense(ledgerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSharedExpenseInput) =>
      api.post<ApiResponse<SharedExpense>>(`/shared-ledgers/${ledgerId}/expenses`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-expenses', ledgerId] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

// --- Receivables ---

export function useReceivables(ledgerId: string | undefined) {
  return useQuery({
    queryKey: ['receivables', ledgerId],
    queryFn: () =>
      api.get<ApiResponse<SharedExpense[]>>(`/shared-ledgers/${ledgerId}/receivables`),
    enabled: !!ledgerId,
    select: (res) => res.data,
  })
}

export function useSettleReceivable(ledgerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ expenseId, receiveAccountId }: { expenseId: string; receiveAccountId: string }) =>
      api.post<ApiResponse<null>>(
        `/shared-ledgers/${ledgerId}/receivables/${expenseId}/settle`,
        { receive_account_id: receiveAccountId },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receivables', ledgerId] })
      qc.invalidateQueries({ queryKey: ['shared-expenses', ledgerId] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

// --- Summary ---

export function useSharedLedgerSummary(ledgerId: string | undefined) {
  return useQuery({
    queryKey: ['shared-ledger-summary', ledgerId],
    queryFn: () =>
      api.get<ApiResponse<SharedLedgerSummary>>(`/shared-ledgers/${ledgerId}/summary`),
    enabled: !!ledgerId,
    select: (res) => res.data,
  })
}

// --- Sync ---

export function useSyncSheet(ledgerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<ApiResponse<{ pushed: number; pulled: number }>>(`/shared-ledgers/${ledgerId}/sync`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-expenses', ledgerId] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers'] })
    },
  })
}
```

**Step 2: Commit**

```bash
git add frontend/src/hooks/useSharedLedgers.ts
git commit -m "feat(frontend): add React Query hooks for shared ledger API"
```

---

### Task 18: Implement SharedLedgersPage (list)

**Files:**
- Create: `frontend/src/pages/SharedLedgersPage.tsx`
- Modify: `frontend/src/App.tsx` (add route)
- Modify: `frontend/src/components/layout/Sidebar.tsx` (add nav link)
- Modify: `frontend/src/components/layout/BottomNav.tsx` (add nav link)

Follow existing page patterns (AccountsPage.tsx as reference). Shows list of shared ledgers with name, partner, currency, and receivable balance. "建立共同帳本" button navigates to create form.

**Commit after implementation:**

```bash
git add frontend/src/pages/SharedLedgersPage.tsx frontend/src/App.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/components/layout/BottomNav.tsx
git commit -m "feat(frontend): add SharedLedgersPage with routing and navigation"
```

---

### Task 19: Implement SharedLedgerDetailPage

**Files:**
- Create: `frontend/src/pages/SharedLedgerDetailPage.tsx`
- Modify: `frontend/src/App.tsx` (add route)

Shows:
- Summary cards (total spent, each person's share, receivable amount)
- Expense list (date, category emoji, description, payer, amount, split)
- "新增支出" and "同步 Google Sheet" buttons
- Pagination

Follow DashboardPage.tsx patterns for stat cards and TransactionsPage.tsx for list display.

**Commit after implementation:**

```bash
git add frontend/src/pages/SharedLedgerDetailPage.tsx frontend/src/App.tsx
git commit -m "feat(frontend): add SharedLedgerDetailPage with summary and expense list"
```

---

### Task 20: Implement SharedExpenseFormPage

**Files:**
- Create: `frontend/src/pages/SharedExpenseFormPage.tsx`
- Modify: `frontend/src/App.tsx` (add route)

Form fields:
- 日期 (date input)
- 類別 (select: food/transport/accommodation/ticket/supplies/settlement/other)
- 支出說明 (text)
- 付款人 (radio: Owner name / Partner name)
- 金額 (number)
- 付款帳戶 (AccountSelect, only when payer is current user)
- 分帳方式 (radio: 均分/Owner全負擔/Partner全負擔/非均分)
- Owner 自訂金額 + Partner 自訂金額 (only when 非均分)

Follow TransactionFormPage.tsx patterns.

**Commit after implementation:**

```bash
git add frontend/src/pages/SharedExpenseFormPage.tsx frontend/src/App.tsx
git commit -m "feat(frontend): add SharedExpenseFormPage with split calculation"
```

---

### Task 21: Implement ReceivablesPage

**Files:**
- Create: `frontend/src/pages/ReceivablesPage.tsx`
- Modify: `frontend/src/App.tsx` (add route)

Shows unsettled receivables with:
- Description, date, amount owed
- "確認收款" button → opens modal to select receive account → calls settle API

**Commit after implementation:**

```bash
git add frontend/src/pages/ReceivablesPage.tsx frontend/src/App.tsx
git commit -m "feat(frontend): add ReceivablesPage with settle functionality"
```

---

### Task 22: Implement InviteAcceptPage

**Files:**
- Create: `frontend/src/pages/InviteAcceptPage.tsx`
- Modify: `frontend/src/App.tsx` (add route)

Flow:
1. Read `:token` from URL params
2. Fetch invite info (public API)
3. Show: "{OwnerName} 邀請你加入共同帳本 {LedgerName}"
4. If not logged in → show login link
5. If logged in → show "加入" button → calls accept API → redirects to ledger detail

**Commit after implementation:**

```bash
git add frontend/src/pages/InviteAcceptPage.tsx frontend/src/App.tsx
git commit -m "feat(frontend): add InviteAcceptPage for partner joining"
```

---

### Task 23: Update Dashboard with receivables card

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

Add a "待收款項" StatCard showing total receivable amount across all shared ledgers. Uses `useSharedLedgers()` to get receivable account balances.

**Commit after implementation:**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat(frontend): add receivables stat card to Dashboard"
```

---

## Phase 8: Worker — Auto Sync Job

### Task 24: Add daily sync job to worker

**Files:**
- Modify: `backend/cmd/worker/main.go`

Add a cron job (using existing `robfig/cron` setup) that runs daily and syncs all SharedLedgers with `SyncEnabled=true`.

```go
// In worker setup
c.AddFunc("0 6 * * *", func() {
    // Find all ledgers with sync_enabled=true
    // For each, call sheetSyncService.Sync()
})
```

**Commit after implementation:**

```bash
git add backend/cmd/worker/main.go
git commit -m "feat(worker): add daily Google Sheet sync job for shared ledgers"
```

---

## Phase 9: Testing & Verification

### Task 25: Run all backend tests

```bash
cd backend && go test ./... -v
```

Fix any failures.

### Task 26: Run lint check

```bash
cd backend && golangci-lint run
```

Fix any issues.

### Task 27: Build verification

```bash
cd backend && go build ./...
cd frontend && npm run build
```

### Task 28: Update migration and verify DB schema

```bash
cd backend && go run cmd/migrate/main.go
```

Verify `shared_ledgers` and `shared_expenses` tables exist with correct columns.

### Task 29: Final commit and update TODO

Update `docs/backend/4.todo-list.md` or relevant progress tracking document.

```bash
git add -A
git commit -m "feat: complete shared ledger (共同記帳) feature implementation"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | Tasks 1-4 | Domain entities, types, repository interfaces |
| 2 | Tasks 5-7 | GORM repository implementations, migration |
| 3 | Tasks 8-9 | Business logic services (ledger, expense, split) |
| 4 | Tasks 10-12 | HTTP handlers, routes, DI wiring |
| 5 | Tasks 13-14 | Google Sheets API client, mapper, sync service |
| 6 | Task 15 | Balance logic for new transaction types |
| 7 | Tasks 16-23 | Frontend (types, hooks, 6 pages, dashboard update) |
| 8 | Task 24 | Worker auto-sync cron job |
| 9 | Tasks 25-29 | Testing, lint, build verification |
