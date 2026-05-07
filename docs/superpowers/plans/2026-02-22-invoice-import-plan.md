# Invoice Import to Transaction - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to import PENDING invoices as transactions, with automatic merchant rule matching to pre-fill fields.

**Architecture:** Frontend-driven approach. New match API returns pre-fill suggestions. Existing TransactionFormModal reused with pre-filled data. TransactionService.Create extended to atomically mark invoice as PROCESSED when invoice_id is provided.

**Tech Stack:** Go (Gin, GORM), React (TanStack Query), TypeScript

---

### Task 1: Extend TxRepos to include InvoiceRepository

We need invoice status updates to happen atomically within the same DB transaction as transaction creation + balance update.

**Files:**
- Modify: `backend/internal/domain/repository.go:116-120` (TxRepos struct)
- Modify: `backend/internal/repository/tx_manager.go:22-29` (WithTransaction)

**Step 1: Add InvoiceRepo to TxRepos**

In `backend/internal/domain/repository.go`, change `TxRepos`:

```go
// TxRepos holds transaction-scoped repository instances.
type TxRepos struct {
	TransactionRepo TransactionRepository
	AccountRepo     AccountRepository
	InvoiceRepo     InvoiceRepository
}
```

**Step 2: Wire InvoiceRepo in TxManager**

In `backend/internal/repository/tx_manager.go`, update `WithTransaction`:

```go
func (m *GormTxManager) WithTransaction(ctx context.Context, fn func(repos domain.TxRepos) error) error {
	return m.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(domain.TxRepos{
			TransactionRepo: NewTransactionRepository(tx),
			AccountRepo:     NewAccountRepository(tx),
			InvoiceRepo:     NewInvoiceRepository(tx),
		})
	})
}
```

**Step 3: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: SUCCESS (InvoiceRepo is added but not used yet — Go allows unused struct fields)

**Step 4: Commit**

```bash
git add backend/internal/domain/repository.go backend/internal/repository/tx_manager.go
git commit -m "refactor: add InvoiceRepo to TxRepos for atomic invoice+transaction operations"
```

---

### Task 2: Create InvoiceMatchService (Rule Engine)

New usecase that matches an invoice's seller_name against MerchantRules and returns the matched merchant + default category + default account.

**Files:**
- Create: `backend/internal/usecase/invoice_match_service.go`
- Create: `backend/internal/usecase/invoice_match_service_test.go`

**Step 1: Write the test**

Create `backend/internal/usecase/invoice_match_service_test.go`:

```go
package usecase

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yukiota/zenbill/internal/domain"
)

// --- Mock repositories ---

type mockInvoiceRepo struct {
	invoices map[uuid.UUID]*domain.Invoice
}

func (m *mockInvoiceRepo) FindByID(_ context.Context, id uuid.UUID) (*domain.Invoice, error) {
	inv, ok := m.invoices[id]
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	return inv, nil
}

// Stub other InvoiceRepository methods (unused by this service)
func (m *mockInvoiceRepo) Create(_ context.Context, _ *domain.Invoice) error             { return nil }
func (m *mockInvoiceRepo) FindByInvoiceNumber(_ context.Context, _ uuid.UUID, _ string) (*domain.Invoice, error) { return nil, nil }
func (m *mockInvoiceRepo) FindByUserID(_ context.Context, _ uuid.UUID, _, _ int) ([]domain.Invoice, error) { return nil, nil }
func (m *mockInvoiceRepo) FindPendingByUserID(_ context.Context, _ uuid.UUID) ([]domain.Invoice, error) { return nil, nil }
func (m *mockInvoiceRepo) UpdateStatus(_ context.Context, _ uuid.UUID, _ domain.InvoiceStatus) error { return nil }
func (m *mockInvoiceRepo) Update(_ context.Context, _ *domain.Invoice) error             { return nil }
func (m *mockInvoiceRepo) Delete(_ context.Context, _ uuid.UUID) error                   { return nil }
func (m *mockInvoiceRepo) CountByUserID(_ context.Context, _ uuid.UUID, _ *domain.InvoiceFilter) (int64, error) { return 0, nil }
func (m *mockInvoiceRepo) FindByUserIDWithFilters(_ context.Context, _ uuid.UUID, _ *domain.InvoiceFilter, _, _ int) ([]domain.Invoice, error) { return nil, nil }

type mockMerchantRuleRepo struct {
	rules []domain.MerchantRule
}

func (m *mockMerchantRuleRepo) FindAllOrderedByPriority(_ context.Context, _ uuid.UUID) ([]domain.MerchantRule, error) {
	return m.rules, nil
}

// Stub other MerchantRuleRepository methods
func (m *mockMerchantRuleRepo) Create(_ context.Context, _ *domain.MerchantRule) error   { return nil }
func (m *mockMerchantRuleRepo) FindByID(_ context.Context, _ uuid.UUID) (*domain.MerchantRule, error) { return nil, nil }
func (m *mockMerchantRuleRepo) FindByMerchantID(_ context.Context, _ uuid.UUID) ([]domain.MerchantRule, error) { return nil, nil }
func (m *mockMerchantRuleRepo) FindAllByUserID(_ context.Context, _ uuid.UUID) ([]domain.MerchantRule, error) { return nil, nil }
func (m *mockMerchantRuleRepo) Update(_ context.Context, _ *domain.MerchantRule) error   { return nil }
func (m *mockMerchantRuleRepo) Delete(_ context.Context, _ uuid.UUID) error              { return nil }

// --- Tests ---

func TestInvoiceMatchService_Match_ExactMatch(t *testing.T) {
	merchantID := uuid.New()
	categoryID := uuid.New()
	accountID := uuid.New()
	invoiceID := uuid.New()
	userID := uuid.New()

	invoiceRepo := &mockInvoiceRepo{
		invoices: map[uuid.UUID]*domain.Invoice{
			invoiceID: {
				ID:         invoiceID,
				UserID:     userID,
				SellerName: "全家便利商店 敦化店",
			},
		},
	}

	ruleRepo := &mockMerchantRuleRepo{
		rules: []domain.MerchantRule{
			{
				ID:         uuid.New(),
				MerchantID: merchantID,
				Keyword:    "全家便利商店",
				MatchType:  domain.MatchTypeContains,
				Priority:   10,
				Merchant: &domain.Merchant{
					ID:                merchantID,
					UserID:            userID,
					Name:              "全家",
					DefaultCategoryID: &categoryID,
					DefaultAccountID:  &accountID,
					DefaultCategory:   &domain.Category{ID: categoryID, Name: "餐飲食品"},
					DefaultAccount:    &domain.Account{ID: accountID, Name: "台新信用卡"},
				},
			},
		},
	}

	svc := NewInvoiceMatchService(invoiceRepo, ruleRepo)
	result, err := svc.Match(context.Background(), invoiceID)

	require.NoError(t, err)
	assert.True(t, result.Matched)
	assert.Equal(t, merchantID, *result.MerchantID)
	assert.Equal(t, "全家", result.MerchantName)
	assert.Equal(t, categoryID, *result.CategoryID)
	assert.Equal(t, "餐飲食品", result.CategoryName)
	assert.Equal(t, accountID, *result.AccountID)
	assert.Equal(t, "台新信用卡", result.AccountName)
}

func TestInvoiceMatchService_Match_RegexMatch(t *testing.T) {
	merchantID := uuid.New()
	invoiceID := uuid.New()
	userID := uuid.New()

	invoiceRepo := &mockInvoiceRepo{
		invoices: map[uuid.UUID]*domain.Invoice{
			invoiceID: {
				ID:         invoiceID,
				UserID:     userID,
				SellerName: "UBER EATS - Food Delivery",
			},
		},
	}

	ruleRepo := &mockMerchantRuleRepo{
		rules: []domain.MerchantRule{
			{
				ID:         uuid.New(),
				MerchantID: merchantID,
				Keyword:    "(?i)uber\\s*eats",
				MatchType:  domain.MatchTypeRegex,
				Priority:   10,
				Merchant: &domain.Merchant{
					ID:     merchantID,
					UserID: userID,
					Name:   "Uber Eats",
				},
			},
		},
	}

	svc := NewInvoiceMatchService(invoiceRepo, ruleRepo)
	result, err := svc.Match(context.Background(), invoiceID)

	require.NoError(t, err)
	assert.True(t, result.Matched)
	assert.Equal(t, "Uber Eats", result.MerchantName)
}

func TestInvoiceMatchService_Match_NoMatch(t *testing.T) {
	invoiceID := uuid.New()
	userID := uuid.New()

	invoiceRepo := &mockInvoiceRepo{
		invoices: map[uuid.UUID]*domain.Invoice{
			invoiceID: {
				ID:         invoiceID,
				UserID:     userID,
				SellerName: "某不知名小吃店",
			},
		},
	}

	ruleRepo := &mockMerchantRuleRepo{
		rules: []domain.MerchantRule{
			{
				ID:         uuid.New(),
				MerchantID: uuid.New(),
				Keyword:    "全家",
				MatchType:  domain.MatchTypeContains,
				Priority:   10,
				Merchant:   &domain.Merchant{Name: "全家"},
			},
		},
	}

	svc := NewInvoiceMatchService(invoiceRepo, ruleRepo)
	result, err := svc.Match(context.Background(), invoiceID)

	require.NoError(t, err)
	assert.False(t, result.Matched)
	assert.Nil(t, result.MerchantID)
}

func TestInvoiceMatchService_Match_PriorityOrder(t *testing.T) {
	merchantA := uuid.New()
	merchantB := uuid.New()
	invoiceID := uuid.New()
	userID := uuid.New()

	invoiceRepo := &mockInvoiceRepo{
		invoices: map[uuid.UUID]*domain.Invoice{
			invoiceID: {
				ID:         invoiceID,
				UserID:     userID,
				SellerName: "7-ELEVEN 大安店",
			},
		},
	}

	ruleRepo := &mockMerchantRuleRepo{
		rules: []domain.MerchantRule{
			// Higher priority - should match first
			{
				MerchantID: merchantA,
				Keyword:    "7-ELEVEN",
				MatchType:  domain.MatchTypeContains,
				Priority:   20,
				Merchant:   &domain.Merchant{ID: merchantA, Name: "7-ELEVEN"},
			},
			// Lower priority
			{
				MerchantID: merchantB,
				Keyword:    "大安",
				MatchType:  domain.MatchTypeContains,
				Priority:   5,
				Merchant:   &domain.Merchant{ID: merchantB, Name: "大安商圈"},
			},
		},
	}

	svc := NewInvoiceMatchService(invoiceRepo, ruleRepo)
	result, err := svc.Match(context.Background(), invoiceID)

	require.NoError(t, err)
	assert.True(t, result.Matched)
	assert.Equal(t, "7-ELEVEN", result.MerchantName)
}
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run TestInvoiceMatchService -v`
Expected: FAIL (InvoiceMatchService not defined)

**Step 3: Write the implementation**

Create `backend/internal/usecase/invoice_match_service.go`:

```go
package usecase

import (
	"context"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
)

// MatchResult represents the result of matching an invoice against merchant rules.
type MatchResult struct {
	Matched      bool       `json:"matched"`
	MerchantID   *uuid.UUID `json:"merchant_id,omitempty"`
	MerchantName string     `json:"merchant_name,omitempty"`
	CategoryID   *uuid.UUID `json:"category_id,omitempty"`
	CategoryName string     `json:"category_name,omitempty"`
	AccountID    *uuid.UUID `json:"account_id,omitempty"`
	AccountName  string     `json:"account_name,omitempty"`
}

// InvoiceMatchService matches invoices to merchants using the rule engine.
type InvoiceMatchService struct {
	invoiceRepo domain.InvoiceRepository
	ruleRepo    domain.MerchantRuleRepository
}

// NewInvoiceMatchService creates a new InvoiceMatchService.
func NewInvoiceMatchService(
	invoiceRepo domain.InvoiceRepository,
	ruleRepo domain.MerchantRuleRepository,
) *InvoiceMatchService {
	return &InvoiceMatchService{
		invoiceRepo: invoiceRepo,
		ruleRepo:    ruleRepo,
	}
}

// Match finds the best merchant rule match for an invoice's seller_name.
// Rules are pre-sorted by priority (highest first) from the repository.
func (s *InvoiceMatchService) Match(ctx context.Context, invoiceID uuid.UUID) (*MatchResult, error) {
	invoice, err := s.invoiceRepo.FindByID(ctx, invoiceID)
	if err != nil {
		return nil, err
	}

	rules, err := s.ruleRepo.FindAllOrderedByPriority(ctx, invoice.UserID)
	if err != nil {
		return nil, err
	}

	for _, rule := range rules {
		if matchRule(rule, invoice.SellerName) {
			result := &MatchResult{
				Matched:      true,
				MerchantID:   &rule.MerchantID,
				MerchantName: rule.Merchant.Name,
			}
			if rule.Merchant.DefaultCategoryID != nil && rule.Merchant.DefaultCategory != nil {
				result.CategoryID = rule.Merchant.DefaultCategoryID
				result.CategoryName = rule.Merchant.DefaultCategory.Name
			}
			if rule.Merchant.DefaultAccountID != nil && rule.Merchant.DefaultAccount != nil {
				result.AccountID = rule.Merchant.DefaultAccountID
				result.AccountName = rule.Merchant.DefaultAccount.Name
			}
			return result, nil
		}
	}

	return &MatchResult{Matched: false}, nil
}

// matchRule checks if a seller name matches a rule.
func matchRule(rule domain.MerchantRule, sellerName string) bool {
	switch rule.MatchType {
	case domain.MatchTypeExact:
		return strings.EqualFold(sellerName, rule.Keyword)
	case domain.MatchTypeContains:
		return strings.Contains(
			strings.ToLower(sellerName),
			strings.ToLower(rule.Keyword),
		)
	case domain.MatchTypeRegex:
		re, err := regexp.Compile(rule.Keyword)
		if err != nil {
			return false
		}
		return re.MatchString(sellerName)
	default:
		return false
	}
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run TestInvoiceMatchService -v`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add backend/internal/usecase/invoice_match_service.go backend/internal/usecase/invoice_match_service_test.go
git commit -m "feat: add InvoiceMatchService with rule engine matching"
```

---

### Task 3: Modify TransactionService.Create to auto-mark invoice PROCESSED

When a transaction is created with an `invoice_id`, atomically update the invoice status to PROCESSED within the same DB transaction.

**Files:**
- Modify: `backend/internal/usecase/transaction_service.go:39-66` (Create method)

**Step 1: Add invoiceRepo field and modify constructor**

Add `invoiceRepo` to `TransactionService` and update the constructor:

```go
type TransactionService struct {
	txRepo      domain.TransactionRepository
	acctRepo    domain.AccountRepository
	invoiceRepo domain.InvoiceRepository
	txMgr       domain.TxManager
	logger      *slog.Logger
}

func NewTransactionService(
	txRepo domain.TransactionRepository,
	acctRepo domain.AccountRepository,
	invoiceRepo domain.InvoiceRepository,
	txMgr domain.TxManager,
	logger *slog.Logger,
) *TransactionService {
	return &TransactionService{
		txRepo:      txRepo,
		acctRepo:    acctRepo,
		invoiceRepo: invoiceRepo,
		txMgr:       txMgr,
		logger:      logger,
	}
}
```

**Step 2: Modify Create to handle invoice_id**

Replace the `Create` method:

```go
func (s *TransactionService) Create(ctx context.Context, tx *domain.Transaction) error {
	run := func(repos domain.TxRepos) error {
		if err := repos.TransactionRepo.Create(ctx, tx); err != nil {
			return fmt.Errorf("create transaction: %w", err)
		}
		if err := applyBalance(ctx, repos.AccountRepo, tx); err != nil {
			return err
		}
		// Atomically mark invoice as PROCESSED when linked
		if tx.InvoiceID != nil && repos.InvoiceRepo != nil {
			if err := repos.InvoiceRepo.UpdateStatus(ctx, *tx.InvoiceID, domain.InvoiceStatusProcessed); err != nil {
				return fmt.Errorf("update invoice status: %w", err)
			}
		}
		return nil
	}

	var err error
	if s.txMgr != nil {
		err = s.txMgr.WithTransaction(ctx, run)
	} else {
		err = run(domain.TxRepos{
			TransactionRepo: s.txRepo,
			AccountRepo:     s.acctRepo,
			InvoiceRepo:     s.invoiceRepo,
		})
	}

	if err != nil {
		return err
	}

	s.logger.Info("transaction created",
		slog.String("id", tx.ID.String()),
		slog.String("type", string(tx.Type)),
		slog.Float64("amount", tx.Amount),
	)
	return nil
}
```

**Step 3: Update Delete and Update methods to use TxRepos pattern consistently**

The `Delete` and `Update` methods currently destructure `repos.TransactionRepo` and `repos.AccountRepo` individually. Update them to accept `domain.TxRepos` consistently (they don't need InvoiceRepo, so no functional change — just consistent signature for the `run` closure):

In `Delete`, change the `run` closure:
```go
run := func(repos domain.TxRepos) error {
    if err := reverseBalance(ctx, repos.AccountRepo, tx); err != nil {
        return fmt.Errorf("reverse balance: %w", err)
    }
    return repos.TransactionRepo.Delete(ctx, id)
}
```

In `Update`, change the `run` closure:
```go
run := func(repos domain.TxRepos) error {
    if err := reverseBalance(ctx, repos.AccountRepo, oldTx); err != nil {
        return fmt.Errorf("reverse old balance: %w", err)
    }
    if err := repos.TransactionRepo.Update(ctx, newTx); err != nil {
        return fmt.Errorf("update transaction: %w", err)
    }
    return applyBalance(ctx, repos.AccountRepo, newTx)
}
```

And for both, update the non-txMgr fallback to pass `TxRepos`:
```go
if s.txMgr != nil {
    err = s.txMgr.WithTransaction(ctx, run)
} else {
    err = run(domain.TxRepos{
        TransactionRepo: s.txRepo,
        AccountRepo:     s.acctRepo,
        InvoiceRepo:     s.invoiceRepo,
    })
}
```

**Step 4: Update constructor call in main.go**

In `backend/cmd/api/main.go`, add `invoiceRepo` to the TransactionService constructor:

```go
txService := usecase.NewTransactionService(txRepo, accountRepo, invoiceRepo, txMgr, logger.Get())
```

**Step 5: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: SUCCESS

**Step 6: Run existing tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/... -v`
Expected: All existing tests still pass (may need to update test mock constructors to include invoiceRepo)

**Step 7: Commit**

```bash
git add backend/internal/usecase/transaction_service.go backend/cmd/api/main.go
git commit -m "feat: auto-mark invoice PROCESSED on transaction creation"
```

---

### Task 4: Add Match endpoint to InvoiceHandler

Add the `POST /invoices/{id}/match` endpoint.

**Files:**
- Modify: `backend/internal/delivery/http/invoice_handler.go`
- Modify: `backend/cmd/api/main.go` (wire InvoiceMatchService)

**Step 1: Add matchService to InvoiceHandler**

Update the `InvoiceHandler` struct and constructor:

```go
type InvoiceHandler struct {
	invoiceRepo  domain.InvoiceRepository
	matchService *usecase.InvoiceMatchService
	syncQueue    *usecase.SyncQueue
	logger       *slog.Logger
}

func NewInvoiceHandler(
	invoiceRepo domain.InvoiceRepository,
	matchService *usecase.InvoiceMatchService,
	syncQueue *usecase.SyncQueue,
	logger *slog.Logger,
) *InvoiceHandler {
	return &InvoiceHandler{
		invoiceRepo:  invoiceRepo,
		matchService: matchService,
		syncQueue:    syncQueue,
		logger:       logger,
	}
}
```

**Step 2: Add MatchInvoice handler**

Add to `invoice_handler.go`:

```go
// MatchInvoice godoc
// @Summary      匹配發票商家規則
// @Description  根據發票的 seller_name 匹配 MerchantRule，回傳建議的商家、分類、帳戶
// @Tags         發票
// @Produce      json
// @Param        id  path  string  true  "發票 ID (UUID)"
// @Success      200  {object}  Response{data=usecase.MatchResult}
// @Failure      400  {object}  Response
// @Failure      404  {object}  Response
// @Failure      500  {object}  Response
// @Router       /invoices/{id}/match [post]
func (h *InvoiceHandler) MatchInvoice(c *gin.Context) {
	idStr := c.Param("id")
	invoiceID, err := uuid.Parse(idStr)
	if err != nil {
		BadRequest(c, "invalid invoice ID")
		return
	}

	result, err := h.matchService.Match(c.Request.Context(), invoiceID)
	if err != nil {
		h.logger.ErrorContext(c.Request.Context(), "Failed to match invoice",
			"invoice_id", invoiceID,
			"error", err,
		)
		NotFound(c, "invoice not found")
		return
	}

	Success(c, result)
}
```

**Step 3: Register the route**

In the `RegisterRoutes` method, add:

```go
func (h *InvoiceHandler) RegisterRoutes(r *gin.RouterGroup) {
	invoices := r.Group("/invoices")
	{
		invoices.GET("", h.ListInvoices)
		invoices.POST("/sync", h.TriggerSync)
		invoices.PATCH("/:id/status", h.UpdateInvoiceStatus)
		invoices.POST("/:id/match", h.MatchInvoice)
	}
}
```

**Step 4: Wire up in main.go**

In `backend/cmd/api/main.go`, add:

```go
// After merchant rule repo initialization, add:
ruleRepo := repository.NewMerchantRuleRepository(db)

// Create match service
matchService := usecase.NewInvoiceMatchService(invoiceRepo, ruleRepo)

// Update invoice handler constructor:
invoiceHandler := httpdelivery.NewInvoiceHandler(invoiceRepo, matchService, syncQueue, logger.Get())
```

**Step 5: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: SUCCESS

**Step 6: Commit**

```bash
git add backend/internal/delivery/http/invoice_handler.go backend/cmd/api/main.go
git commit -m "feat: add POST /invoices/:id/match endpoint for rule matching"
```

---

### Task 5: Add useMatchInvoice hook (Frontend)

**Files:**
- Modify: `frontend/src/hooks/useInvoices.ts`
- Modify: `frontend/src/types/index.ts`

**Step 1: Add MatchResult type**

In `frontend/src/types/index.ts`, add after the Invoice types:

```typescript
export interface InvoiceMatchResult {
  matched: boolean
  merchant_id?: string
  merchant_name?: string
  category_id?: string
  category_name?: string
  account_id?: string
  account_name?: string
}
```

**Step 2: Add useMatchInvoice hook**

In `frontend/src/hooks/useInvoices.ts`, add:

```typescript
import type { Invoice, PaginatedResponse, ApiResponse, InvoiceMatchResult } from '@/types'

export function useMatchInvoice() {
  return useMutation({
    mutationFn: (invoiceId: string) =>
      api.post<ApiResponse<InvoiceMatchResult>>(`/invoices/${invoiceId}/match`, {}),
  })
}
```

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/hooks/useInvoices.ts
git commit -m "feat: add InvoiceMatchResult type and useMatchInvoice hook"
```

---

### Task 6: Add invoiceId and defaultValues support to TransactionFormModal

**Files:**
- Modify: `frontend/src/components/transactions/TransactionFormModal.tsx`

**Step 1: Extend Props interface**

Change the `Props` interface:

```typescript
interface Props {
  open: boolean
  editingTransaction?: Transaction
  defaultAccountId?: string
  defaultValues?: Partial<FormData>
  invoiceId?: string
  onClose: () => void
}
```

**Step 2: Update component signature and form initialization**

Update the component to accept new props and use `defaultValues` for initial form state:

```typescript
export default function TransactionFormModal({ open, editingTransaction, defaultAccountId, defaultValues, invoiceId, onClose }: Props) {
```

Update the `useEffect` that resets form on open:

```typescript
useEffect(() => {
  if (open) {
    if (editingTransaction) {
      setForm(txToForm(editingTransaction))
    } else {
      setForm({ ...makeEmptyForm(defaultAccountId), ...defaultValues })
    }
  }
}, [open, editingTransaction, defaultAccountId, defaultValues])
```

**Step 3: Include invoiceId in submission**

Update `handleSubmit`:

```typescript
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault()
  const { amountStr: _, ...payload } = form
  const data = {
    ...payload,
    occurred_at: new Date(payload.occurred_at).toISOString(),
    ...(invoiceId ? { invoice_id: invoiceId } : {}),
  }

  if (isEditing) {
    updateTx.mutate({ id: editingTransaction.id, ...data }, { onSuccess: onClose })
  } else {
    createTx.mutate(data, { onSuccess: onClose })
  }
}
```

**Step 4: Commit**

```bash
git add frontend/src/components/transactions/TransactionFormModal.tsx
git commit -m "feat: add defaultValues and invoiceId props to TransactionFormModal"
```

---

### Task 7: Add Import button to InvoicesPage

Wire everything together: "匯入" button on PENDING invoices → match API → open TransactionFormModal with pre-filled data.

**Files:**
- Modify: `frontend/src/pages/InvoicesPage.tsx`

**Step 1: Add imports and state**

Add imports at the top:

```typescript
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw, ChevronDown, ChevronRight, ChevronLeft, ArrowDownToLine } from 'lucide-react'
import { useInvoices, useSyncInvoices, useUpdateInvoiceStatus, useMatchInvoice } from '@/hooks/useInvoices'
import type { Invoice } from '@/types'
import TransactionFormModal from '@/components/transactions/TransactionFormModal'
```

Add state inside the component:

```typescript
const matchInvoice = useMatchInvoice()
const [importTarget, setImportTarget] = useState<{ invoice: Invoice; defaultValues: Record<string, unknown> } | null>(null)
```

**Step 2: Add handleImport function**

```typescript
const handleImport = async (inv: Invoice) => {
  try {
    const res = await matchInvoice.mutateAsync(inv.id)
    const match = res.data
    setImportTarget({
      invoice: inv,
      defaultValues: {
        type: 'EXPENSE' as const,
        amount: inv.total_amount,
        amountStr: String(inv.total_amount),
        occurred_at: new Date(inv.invoice_date).toISOString().slice(0, 10),
        note: inv.invoice_number,
        ...(match.merchant_id ? { merchant_id: match.merchant_id } : {}),
        ...(match.category_id ? { category_id: match.category_id } : {}),
        ...(match.account_id ? { account_id: match.account_id } : {}),
      },
    })
  } catch {
    // Match failed, open with just invoice data
    setImportTarget({
      invoice: inv,
      defaultValues: {
        type: 'EXPENSE' as const,
        amount: inv.total_amount,
        amountStr: String(inv.total_amount),
        occurred_at: new Date(inv.invoice_date).toISOString().slice(0, 10),
        note: inv.invoice_number,
      },
    })
  }
}
```

**Step 3: Add "匯入" button next to status dropdown**

In the invoice row, between the amount and the status dropdown, add an import button for PENDING invoices:

```tsx
<div className="text-right shrink-0 flex items-center gap-2">
  {inv.status === 'PENDING' && (
    <button
      onClick={(e) => { e.stopPropagation(); handleImport(inv) }}
      disabled={matchInvoice.isPending}
      className="h-6 px-2 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-[10px] font-medium hover:bg-[var(--color-accent)]/20 disabled:opacity-50"
    >
      <ArrowDownToLine className="w-3 h-3 inline mr-0.5" />
      匯入
    </button>
  )}
  <div>
    <p className="text-sm font-semibold tabular-nums">${inv.total_amount.toLocaleString()}</p>
    <select ... >
      ...
    </select>
  </div>
</div>
```

**Step 4: Add TransactionFormModal at the bottom**

Before the closing `</div>` of the page:

```tsx
<TransactionFormModal
  open={!!importTarget}
  defaultValues={importTarget?.defaultValues}
  invoiceId={importTarget?.invoice.id}
  onClose={() => setImportTarget(null)}
/>
```

**Step 5: Invalidate invoices after import**

Update the `useCreateTransaction` hook in `useTransactions.ts` to also invalidate invoices:

```typescript
export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      api.post<ApiResponse<Transaction>>('/transactions', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
```

**Step 6: Commit**

```bash
git add frontend/src/pages/InvoicesPage.tsx frontend/src/hooks/useTransactions.ts
git commit -m "feat: add invoice import button with rule matching to InvoicesPage"
```

---

### Task 8: End-to-end verification

**Step 1: Build backend**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: SUCCESS

**Step 2: Run backend tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/... -v`
Expected: All tests pass

**Step 3: Build frontend**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npm run build`
Expected: SUCCESS with no TypeScript errors

**Step 4: Lint check**

Run: `cd /Users/yuki/projects/zen-bill/backend && golangci-lint run ./...`
Expected: No critical issues

**Step 5: Verify the full flow manually (optional)**

1. Start backend: `cd backend && go run cmd/api/main.go`
2. Start frontend: `cd frontend && npm run dev`
3. Navigate to Invoices page
4. Find a PENDING invoice, click "匯入"
5. Verify TransactionFormModal opens with pre-filled data
6. Submit → verify transaction created and invoice status changes to PROCESSED

**Step 6: Final commit if any fixes needed**
