# Batch Defer-to-Next-Period Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to batch-mark credit card transactions as "deferred to next billing period" so ZenBill statistics match actual bank statements.

**Architecture:** Add `billing_period_deferred` boolean column to `transactions` table. Modify repository queries to exclude deferred transactions from current period and include them in next period. New batch PATCH endpoint. Frontend adds multi-select mode to account detail pages (Web + App).

**Tech Stack:** Go/Gin/GORM (backend), React/TypeScript (web), React Native/Expo (app), PostgreSQL

---

### Task 1: Add `BillingPeriodDeferred` field to Transaction domain entity

**Files:**
- Modify: `backend/internal/domain/transaction.go`

**Step 1: Add field to Transaction struct**

In `backend/internal/domain/transaction.go`, add after the `CreatedAt` field:

```go
BillingPeriodDeferred bool `gorm:"type:boolean;default:false;not null" json:"billing_period_deferred"`
```

**Step 2: Run migration to add column**

```bash
cd backend && go run cmd/migrate/main.go
```

Expected: migration succeeds, new column added to `transactions` table.

**Step 3: Verify build**

```bash
cd backend && go build ./...
```

Expected: PASS

**Step 4: Commit**

```bash
git add backend/internal/domain/transaction.go
git commit -m "feat(domain): add BillingPeriodDeferred field to Transaction entity"
```

---

### Task 2: Add `BatchUpdateDeferred` to TransactionRepository

**Files:**
- Modify: `backend/internal/domain/repository.go` (interface)
- Modify: `backend/internal/repository/transaction_repository.go` (implementation)

**Step 1: Add method to interface**

In `backend/internal/domain/repository.go`, add to `TransactionRepository` interface (before the closing `}`):

```go
BatchUpdateDeferred(ctx context.Context, userID uuid.UUID, ids []uuid.UUID, deferred bool) (int64, error)
```

**Step 2: Implement in repository**

In `backend/internal/repository/transaction_repository.go`, add:

```go
// BatchUpdateDeferred updates the billing_period_deferred flag for multiple transactions
func (r *TransactionRepositoryImpl) BatchUpdateDeferred(ctx context.Context, userID uuid.UUID, ids []uuid.UUID, deferred bool) (int64, error) {
	result := r.db.WithContext(ctx).
		Model(&domain.Transaction{}).
		Where("user_id = ? AND id IN ?", userID, ids).
		Update("billing_period_deferred", deferred)
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}
```

**Step 3: Verify build**

```bash
cd backend && go build ./...
```

Expected: PASS (if any mock implementations of TransactionRepository exist, they will fail — fix them in the next step)

**Step 4: Fix any mock implementations**

Search for mock implementations of `TransactionRepository` and add the new method stub:

```bash
cd backend && grep -rn "TransactionRepository" internal/usecase/*_test.go
```

For each mock found, add:

```go
func (m *MockTransactionRepository) BatchUpdateDeferred(ctx context.Context, userID uuid.UUID, ids []uuid.UUID, deferred bool) (int64, error) {
	args := m.Called(ctx, userID, ids, deferred)
	return args.Get(0).(int64), args.Error(1)
}
```

**Step 5: Verify build again**

```bash
cd backend && go build ./...
```

Expected: PASS

**Step 6: Commit**

```bash
git add backend/internal/domain/repository.go backend/internal/repository/transaction_repository.go
git add -u backend/internal/usecase/  # any mock fixes
git commit -m "feat(repository): add BatchUpdateDeferred for billing period deferral"
```

---

### Task 3: Modify repository queries to handle deferred transactions

The billing cycle query flows through `FindByAccountIDAndDateRange` (used by both `ListByAccountWithBalanceInDateRange` and the handler's count query). We need to:
- Exclude deferred transactions from their original period
- Include deferred transactions from the **previous** period in the current period

**Files:**
- Modify: `backend/internal/repository/transaction_repository.go`
- Modify: `backend/internal/domain/repository.go` (add new method)

**Step 1: Add `FindByAccountIDAndDateRangeWithDeferred` to interface**

In `backend/internal/domain/repository.go`, add to `TransactionRepository`:

```go
// FindByAccountIDAndDateRangeWithDeferred returns transactions for a billing cycle,
// excluding deferred transactions and including deferred transactions from the previous period.
FindByAccountIDAndDateRangeWithDeferred(ctx context.Context, accountID uuid.UUID, startDate, endDate time.Time, prevStartDate, prevEndDate time.Time) ([]Transaction, error)
```

**Step 2: Implement in repository**

In `backend/internal/repository/transaction_repository.go`, add:

```go
// FindByAccountIDAndDateRangeWithDeferred returns transactions for a billing cycle:
// 1. Transactions in [startDate, endDate] that are NOT deferred
// 2. Transactions in [prevStartDate, prevEndDate] that ARE deferred (carried over from previous period)
func (r *TransactionRepositoryImpl) FindByAccountIDAndDateRangeWithDeferred(
	ctx context.Context,
	accountID uuid.UUID,
	startDate, endDate time.Time,
	prevStartDate, prevEndDate time.Time,
) ([]domain.Transaction, error) {
	var transactions []domain.Transaction
	err := r.db.WithContext(ctx).
		Where(
			"(account_id = ? OR target_account_id = ?) AND ("+
				"(occurred_at >= ? AND occurred_at <= ? AND billing_period_deferred = false) OR "+
				"(occurred_at >= ? AND occurred_at <= ? AND billing_period_deferred = true)"+
				")",
			accountID, accountID,
			startDate, endDate,
			prevStartDate, prevEndDate,
		).
		Order("occurred_at DESC").
		Find(&transactions).Error
	if err != nil {
		return nil, err
	}
	return transactions, nil
}
```

**Step 3: Fix mock implementations**

Add stub to all mocks:

```go
func (m *MockTransactionRepository) FindByAccountIDAndDateRangeWithDeferred(ctx context.Context, accountID uuid.UUID, startDate, endDate time.Time, prevStartDate, prevEndDate time.Time) ([]domain.Transaction, error) {
	args := m.Called(ctx, accountID, startDate, endDate, prevStartDate, prevEndDate)
	return args.Get(0).([]domain.Transaction), args.Error(1)
}
```

**Step 4: Verify build**

```bash
cd backend && go build ./...
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/internal/domain/repository.go backend/internal/repository/transaction_repository.go
git add -u backend/internal/usecase/
git commit -m "feat(repository): add FindByAccountIDAndDateRangeWithDeferred for billing cycle queries"
```

---

### Task 4: Add `ListByAccountWithBalanceInDateRangeWithDeferred` to TransactionService

**Files:**
- Modify: `backend/internal/usecase/transaction_service.go`

**Step 1: Add new service method**

Add a new method that mirrors `ListByAccountWithBalanceInDateRange` but uses the deferred-aware query:

```go
// ListByAccountWithBalanceInDateRangeWithDeferred returns transactions for a billing cycle
// with running balance, handling deferred transactions.
func (s *TransactionService) ListByAccountWithBalanceInDateRangeWithDeferred(
	ctx context.Context,
	accountID uuid.UUID,
	accountBalance float64,
	startDate, endDate time.Time,
	prevStartDate, prevEndDate time.Time,
	limit, offset int,
) ([]TransactionWithBalance, error) {
	allTxs, err := s.txRepo.FindByAccountIDAndDateRangeWithDeferred(ctx, accountID, startDate, endDate, prevStartDate, prevEndDate)
	if err != nil {
		return nil, fmt.Errorf("find transactions in date range with deferred: %w", err)
	}

	sumAfter, err := s.txRepo.SumEffectiveAmountAfterDate(ctx, accountID, endDate)
	if err != nil {
		return nil, fmt.Errorf("sum transactions after date range: %w", err)
	}

	balanceAtEnd := accountBalance - sumAfter

	sumBeforePage := 0.0
	for i := 0; i < offset && i < len(allTxs); i++ {
		sumBeforePage += effectiveAmount(&allTxs[i], accountID)
	}

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

	result := make([]TransactionWithBalance, len(pageTxs))
	runBal := balanceAtEnd - sumBeforePage
	for i, tx := range pageTxs {
		result[i] = TransactionWithBalance{
			Transaction:    tx,
			RunningBalance: runBal,
		}
		runBal -= effectiveAmount(&tx, accountID)
	}

	return result, nil
}
```

**Step 2: Verify build**

```bash
cd backend && go build ./...
```

Expected: PASS

**Step 3: Commit**

```bash
git add backend/internal/usecase/transaction_service.go
git commit -m "feat(usecase): add ListByAccountWithBalanceInDateRangeWithDeferred"
```

---

### Task 5: Add batch-defer API endpoint

**Files:**
- Modify: `backend/internal/delivery/http/transaction_handler.go`

**Step 1: Add request struct**

Add near the other request structs in the file:

```go
// batchDeferRequest is the request body for batch deferring transactions to next billing period
type batchDeferRequest struct {
	TransactionIDs []string `json:"transaction_ids" binding:"required,min=1"`
	Deferred       bool     `json:"deferred"`
}
```

**Step 2: Add handler method**

```go
// BatchDeferTransactions handles batch deferring transactions to next billing period
func (h *TransactionHandler) BatchDeferTransactions(c *gin.Context) {
	userID := getUserID(c)

	var req batchDeferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	ids := make([]uuid.UUID, 0, len(req.TransactionIDs))
	for _, idStr := range req.TransactionIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			BadRequest(c, fmt.Sprintf("invalid transaction ID: %s", idStr))
			return
		}
		ids = append(ids, id)
	}

	count, err := h.txRepo.BatchUpdateDeferred(c.Request.Context(), userID, ids, req.Deferred)
	if err != nil {
		h.logger.ErrorContext(c.Request.Context(), "Failed to batch update deferred status", "error", err)
		InternalServerError(c, "failed to update transactions")
		return
	}

	Success(c, gin.H{"updated_count": count})
}
```

**Step 3: Register route**

In `RegisterRoutes`, add inside the `transactions` group:

```go
transactions.PATCH("/batch-defer", h.BatchDeferTransactions)
```

**Step 4: Verify build**

```bash
cd backend && go build ./...
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/internal/delivery/http/transaction_handler.go
git commit -m "feat(api): add PATCH /transactions/batch-defer endpoint"
```

---

### Task 6: Update ListTransactions handler to support deferred queries

The handler needs to accept `prev_start_date` and `prev_end_date` query params and use the deferred-aware query when they're provided.

**Files:**
- Modify: `backend/internal/delivery/http/transaction_handler.go`

**Step 1: Update the account+date-range branch in ListTransactions**

Find the section in `ListTransactions` that handles `accountIDStr != "" && startDateStr != "" && endDateStr != ""` (around line 140-185). Add parsing for `prev_start_date` and `prev_end_date`, and branch to the deferred-aware method when they're present:

After parsing `startDate` and `endDate`, add:

```go
prevStartDateStr := c.Query("prev_start_date")
prevEndDateStr := c.Query("prev_end_date")
```

Then replace the call to `ListByAccountWithBalanceInDateRange` with:

```go
var txWithBalance []usecase.TransactionWithBalance
var txErr error

if prevStartDateStr != "" && prevEndDateStr != "" {
	prevStartDate, pErr := time.Parse("2006-01-02", prevStartDateStr)
	if pErr != nil {
		BadRequest(c, "invalid prev_start_date format, expected YYYY-MM-DD")
		return
	}
	prevEndDate, pErr := time.Parse("2006-01-02", prevEndDateStr)
	if pErr != nil {
		BadRequest(c, "invalid prev_end_date format, expected YYYY-MM-DD")
		return
	}
	prevEndOfDay := time.Date(prevEndDate.Year(), prevEndDate.Month(), prevEndDate.Day(), 23, 59, 59, 999999999, prevEndDate.Location())

	txWithBalance, txErr = h.txService.ListByAccountWithBalanceInDateRangeWithDeferred(
		ctx, accountID, account.Balance, startDate, endOfDay, prevStartDate, prevEndOfDay, pageSize, offset,
	)
} else {
	txWithBalance, txErr = h.txService.ListByAccountWithBalanceInDateRange(
		ctx, accountID, account.Balance, startDate, endOfDay, pageSize, offset,
	)
}
```

Similarly update the count query to use `FindByAccountIDAndDateRangeWithDeferred` when prev dates are provided:

```go
var allTxs []domain.Transaction
var countErr error
if prevStartDateStr != "" && prevEndDateStr != "" {
	prevStartDate, _ := time.Parse("2006-01-02", prevStartDateStr)
	prevEndDate, _ := time.Parse("2006-01-02", prevEndDateStr)
	prevEndOfDay := time.Date(prevEndDate.Year(), prevEndDate.Month(), prevEndDate.Day(), 23, 59, 59, 999999999, prevEndDate.Location())
	allTxs, countErr = h.txRepo.FindByAccountIDAndDateRangeWithDeferred(ctx, accountID, startDate, endOfDay, prevStartDate, prevEndOfDay)
} else {
	allTxs, countErr = h.txRepo.FindByAccountIDAndDateRange(ctx, accountID, startDate, endOfDay)
}
```

**Step 2: Verify build**

```bash
cd backend && go build ./...
```

Expected: PASS

**Step 3: Commit**

```bash
git add backend/internal/delivery/http/transaction_handler.go
git commit -m "feat(api): support deferred transaction filtering in ListTransactions"
```

---

### Task 7: Add `billing_period_deferred` to shared TypeScript types

**Files:**
- Modify: `packages/shared/src/types/index.ts`

**Step 1: Add field to Transaction interface**

Find the `Transaction` interface and add:

```typescript
billing_period_deferred: boolean
```

**Step 2: Commit**

```bash
git add packages/shared/src/types/index.ts
git commit -m "feat(shared): add billing_period_deferred to Transaction type"
```

---

### Task 8: Add `useBatchDeferTransactions` hook

**Files:**
- Modify: `packages/shared/src/hooks/useTransactions.ts`

**Step 1: Add mutation hook**

```typescript
export function useBatchDeferTransactions() {
  const client = useApiClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ transactionIds, deferred }: { transactionIds: string[]; deferred: boolean }) => {
      return client.patch<{ updated_count: number }>('/transactions/batch-defer', {
        transaction_ids: transactionIds,
        deferred,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
```

**Step 2: Commit**

```bash
git add packages/shared/src/hooks/useTransactions.ts
git commit -m "feat(shared): add useBatchDeferTransactions mutation hook"
```

---

### Task 9: Add `getPreviousBillingCycle` utility

**Files:**
- Modify: `packages/shared/src/utils/billingCycle.ts`

**Step 1: Add helper function**

```typescript
/**
 * Returns the previous billing cycle relative to the given cycle offset.
 */
export function getPreviousBillingCycle(closingDay: number, offset: number = 0): BillingCycle {
  return getBillingCycle(closingDay, offset - 1)
}
```

**Step 2: Commit**

```bash
git add packages/shared/src/utils/billingCycle.ts
git commit -m "feat(shared): add getPreviousBillingCycle utility"
```

---

### Task 10: Web — Add multi-select mode to AccountDetailPage

**Files:**
- Modify: `frontend/src/pages/AccountDetailPage.tsx`

**Step 1: Add state variables**

Add these state variables near existing state declarations:

```typescript
const [selectMode, setSelectMode] = useState(false)
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
```

**Step 2: Import the hook and utility**

```typescript
import { useBatchDeferTransactions } from '@zenbill/shared'
import { getPreviousBillingCycle } from '@zenbill/shared/utils/billingCycle'
```

And initialize:

```typescript
const batchDefer = useBatchDeferTransactions()
```

**Step 3: Update the transaction query to include prev period dates**

Where the billing cycle query is constructed, compute previous cycle and add `prev_start_date`/`prev_end_date` to the query filters:

```typescript
const prevCycle = cycle ? getPreviousBillingCycle(account.closing_day!, cycleOffset) : null
```

Add to the `useTransactions` filter (when cycle is active):

```typescript
prev_start_date: prevCycle?.startDate,
prev_end_date: prevCycle?.endDate,
```

**Step 4: Add "選取" button in the header area (only for credit card billing cycle view)**

Next to the existing "繳卡費" button area, add:

```tsx
{cycle && (
  <button
    onClick={() => {
      setSelectMode(!selectMode)
      setSelectedIds(new Set())
    }}
    className="text-sm text-zinc-400 hover:text-zinc-200"
  >
    {selectMode ? '取消' : '選取'}
  </button>
)}
```

**Step 5: Add checkboxes to transaction rows**

In the transaction list rendering, add a checkbox before each transaction row when in select mode:

```tsx
{selectMode && (
  <input
    type="checkbox"
    checked={selectedIds.has(t.id)}
    onChange={() => {
      const next = new Set(selectedIds)
      if (next.has(t.id)) next.delete(t.id)
      else next.add(t.id)
      setSelectedIds(next)
    }}
    className="mr-3 accent-amber-500"
  />
)}
```

**Step 6: Add floating action bar at bottom**

When in select mode and items are selected, show a fixed bottom bar:

```tsx
{selectMode && selectedIds.size > 0 && (
  <div className="fixed bottom-0 left-0 right-0 bg-zinc-800 border-t border-zinc-700 p-4 flex items-center justify-between z-50">
    <span className="text-sm text-zinc-300">已選取 {selectedIds.size} 筆</span>
    <button
      onClick={async () => {
        await batchDefer.mutateAsync({
          transactionIds: Array.from(selectedIds),
          deferred: true,
        })
        setSelectMode(false)
        setSelectedIds(new Set())
      }}
      disabled={batchDefer.isPending}
      className="bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-medium"
    >
      {batchDefer.isPending ? '處理中...' : '移至下期'}
    </button>
  </div>
)}
```

**Step 7: Add "從上期移入" badge for deferred transactions**

In the transaction row, show a badge when `t.billing_period_deferred === true`:

```tsx
{t.billing_period_deferred && (
  <span
    className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded cursor-pointer hover:bg-amber-500/30"
    onClick={(e) => {
      e.stopPropagation()
      if (confirm('確定要退回原期嗎？')) {
        batchDefer.mutate({ transactionIds: [t.id], deferred: false })
      }
    }}
  >
    從上期移入
  </span>
)}
```

**Step 8: Verify the web frontend builds**

```bash
cd frontend && npm run build
```

Expected: PASS

**Step 9: Commit**

```bash
git add frontend/src/pages/AccountDetailPage.tsx
git commit -m "feat(web): add batch defer-to-next-period UI for credit card billing"
```

---

### Task 11: App — Add multi-select mode to account detail screen

**Files:**
- Modify: `app/app/accounts/[id].tsx`

**Step 1: Add state variables**

```typescript
const [selectMode, setSelectMode] = useState(false)
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
```

**Step 2: Import hook and utility**

```typescript
import { useBatchDeferTransactions } from '@zenbill/shared'
import { getPreviousBillingCycle } from '@zenbill/shared/utils/billingCycle'
```

Initialize:

```typescript
const batchDefer = useBatchDeferTransactions()
```

**Step 3: Update transaction query with prev period dates**

Same logic as web — compute `prevCycle` and pass `prev_start_date`/`prev_end_date` to the query.

**Step 4: Add "選取" button**

Add a pressable text button near the billing cycle header:

```tsx
{cycle && (
  <Pressable onPress={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}>
    <Text style={{ color: selectMode ? '#f59e0b' : '#a1a1aa', fontSize: 14 }}>
      {selectMode ? '取消' : '選取'}
    </Text>
  </Pressable>
)}
```

**Step 5: Add checkboxes to transaction rows**

Wrap each transaction row; in select mode, add a checkbox (use a simple Pressable toggle or `@expo/vector-icons` Checkbox):

```tsx
{selectMode && (
  <Pressable
    onPress={() => {
      const next = new Set(selectedIds)
      if (next.has(t.id)) next.delete(t.id)
      else next.add(t.id)
      setSelectedIds(next)
    }}
    style={{ marginRight: 12, justifyContent: 'center' }}
  >
    <View style={{
      width: 20, height: 20, borderRadius: 4,
      borderWidth: 2, borderColor: selectedIds.has(t.id) ? '#f59e0b' : '#71717a',
      backgroundColor: selectedIds.has(t.id) ? '#f59e0b' : 'transparent',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {selectedIds.has(t.id) && (
        <Text style={{ color: '#000', fontSize: 12, fontWeight: 'bold' }}>✓</Text>
      )}
    </View>
  </Pressable>
)}
```

**Step 6: Add floating action bar**

When items selected, show a bottom bar:

```tsx
{selectMode && selectedIds.size > 0 && (
  <View style={{
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#27272a', borderTopWidth: 1, borderTopColor: '#3f3f46',
    padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  }}>
    <Text style={{ color: '#d4d4d8', fontSize: 14 }}>已選取 {selectedIds.size} 筆</Text>
    <Pressable
      onPress={async () => {
        await batchDefer.mutateAsync({ transactionIds: Array.from(selectedIds), deferred: true })
        setSelectMode(false)
        setSelectedIds(new Set())
      }}
      disabled={batchDefer.isPending}
      style={{ backgroundColor: '#f59e0b', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
    >
      <Text style={{ color: '#000', fontSize: 14, fontWeight: '600' }}>
        {batchDefer.isPending ? '處理中...' : '移至下期'}
      </Text>
    </Pressable>
  </View>
)}
```

**Step 7: Add "從上期移入" badge**

In the transaction row, add a badge when deferred:

```tsx
{t.billing_period_deferred && (
  <Pressable
    onPress={() => {
      Alert.alert('退回原期', '確定要將此筆交易退回原期嗎？', [
        { text: '取消', style: 'cancel' },
        { text: '確定', onPress: () => batchDefer.mutate({ transactionIds: [t.id], deferred: false }) },
      ])
    }}
  >
    <Text style={{
      fontSize: 11, color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.15)',
      paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden',
    }}>
      從上期移入
    </Text>
  </Pressable>
)}
```

**Step 8: Verify app builds**

```bash
cd app && npx expo export --platform ios 2>&1 | head -5
```

Expected: No TypeScript errors

**Step 9: Commit**

```bash
git add app/app/accounts/[id].tsx
git commit -m "feat(app): add batch defer-to-next-period UI for credit card billing"
```

---

### Task 12: Backend tests

**Files:**
- Modify or create: `backend/internal/repository/transaction_repository_test.go` (if exists)
- Modify or create: `backend/internal/delivery/http/transaction_handler_test.go` (if exists)

**Step 1: Write test for BatchUpdateDeferred repository method**

```go
func TestBatchUpdateDeferred(t *testing.T) {
	// Setup: create test user, account, and 3 transactions
	// Act: call BatchUpdateDeferred with 2 of the 3 IDs, deferred=true
	// Assert: 2 rows affected, those 2 have deferred=true, the 3rd is still false
}
```

**Step 2: Write test for FindByAccountIDAndDateRangeWithDeferred**

```go
func TestFindByAccountIDAndDateRangeWithDeferred(t *testing.T) {
	// Setup: create transactions in current period (some deferred, some not)
	//        and transactions in previous period (some deferred, some not)
	// Act: call FindByAccountIDAndDateRangeWithDeferred
	// Assert: returns current period non-deferred + previous period deferred only
}
```

**Step 3: Write test for BatchDeferTransactions handler**

```go
func TestBatchDeferTransactions(t *testing.T) {
	// Test: valid request returns 200 with updated_count
	// Test: empty transaction_ids returns 400
	// Test: invalid UUID returns 400
}
```

**Step 4: Run all tests**

```bash
cd backend && go test ./... -v
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add -u backend/
git commit -m "test: add tests for batch defer-to-next-period feature"
```

---

### Task 13: Run lint and final verification

**Step 1: Run linter**

```bash
cd backend && golangci-lint run
```

Expected: PASS (fix any issues)

**Step 2: Run all backend tests**

```bash
cd backend && go test ./... -v
```

Expected: ALL PASS

**Step 3: Verify frontend builds**

```bash
cd frontend && npm run build
```

Expected: PASS

**Step 4: Final commit (if any fixes)**

```bash
git add -A && git commit -m "fix: address lint and build issues for batch-defer feature"
```
