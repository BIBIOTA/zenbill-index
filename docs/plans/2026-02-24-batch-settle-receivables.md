# Batch Settle Receivables Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "一次結清" (settle all) functionality to settle all pending receivables in a shared ledger at once.

**Architecture:** New `SettleAll()` method on `SharedExpenseService` processes all unsettled receivables in a single DB transaction. New HTTP endpoint `POST /shared-ledgers/{id}/receivables/settle-all`. Frontend adds button + modal to `ReceivablesPage`.

**Tech Stack:** Go (Gin, GORM, testify/mock), React (TanStack Query), TypeScript

---

### Task 1: Backend — Add `SettleAll` usecase method

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go` (after `Settle` method, ~line 284)

**Step 1: Add `SettleAllResult` struct and `SettleAll` method**

Add after `Settle()` method (line 284):

```go
// SettleAllResult holds the result of a batch settle operation.
type SettleAllResult struct {
	SettledCount int     `json:"settled_count"`
	TotalAmount  float64 `json:"total_amount"`
}

// SettleAll settles all unsettled receivables for a ledger in a single transaction.
func (s *SharedExpenseService) SettleAll(ctx context.Context, ledgerID, userID, receiveAccountID uuid.UUID) (*SettleAllResult, error) {
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

			settleTx := &domain.Transaction{
				ID:         uuid.New(),
				UserID:     ledger.OwnerID,
				AccountID:  receiveAccountID,
				Type:       domain.TransactionTypeSettlement,
				Amount:     amount,
				OccurredAt: now,
				Note:       fmt.Sprintf("結算: %s", exp.Description),
			}
			if err := repos.TransactionRepo.Create(ctx, settleTx); err != nil {
				return fmt.Errorf("create settlement transaction: %w", err)
			}

			if err := repos.AccountRepo.UpdateBalance(ctx, receiveAccountID, amount); err != nil {
				return fmt.Errorf("update receive account balance: %w", err)
			}

			if err := repos.AccountRepo.UpdateBalance(ctx, ledger.ReceivableAccountID, -amount); err != nil {
				return fmt.Errorf("update receivable account balance: %w", err)
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
	)
	return result, nil
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/usecase/...`
Expected: SUCCESS (no errors)

---

### Task 2: Backend — Add unit test for `SettleAll`

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service_test.go`

**Step 1: Add test for `SettleAll` success case**

Append to the test file:

```go
func TestSharedExpenseService_SettleAll(t *testing.T) {
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
		ID:                  ledgerID,
		OwnerID:             ownerID,
		ReceivableAccountID: receivableAcctID,
	}

	exp1 := domain.SharedExpense{
		ID:            uuid.New(),
		LedgerID:      ledgerID,
		TotalAmount:   1000.0,
		SplitMethod:   domain.SplitMethodEqual,
		OwnerAmount:   500.0,
		PartnerAmount: 500.0,
		PayerUserID:   &ownerID,
		Description:   "Dinner",
	}
	exp2 := domain.SharedExpense{
		ID:            uuid.New(),
		LedgerID:      ledgerID,
		TotalAmount:   600.0,
		SplitMethod:   domain.SplitMethodEqual,
		OwnerAmount:   300.0,
		PartnerAmount: 300.0,
		PayerUserID:   &ownerID,
		Description:   "Lunch",
	}

	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)
	expenseRepo.On("FindUnsettledByLedgerID", mock.Anything, ledgerID).Return([]domain.SharedExpense{exp1, exp2}, nil)

	// Expect 2 SETTLEMENT transactions
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeSettlement && tx.AccountID == receiveAcctID
	})).Return(nil).Times(2)

	// Expect receive account balance increased twice (500 + 300)
	acctRepo.On("UpdateBalance", mock.Anything, receiveAcctID, 500.0).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, receiveAcctID, 300.0).Return(nil)

	// Expect receivable account balance decreased twice
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -500.0).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -300.0).Return(nil)

	// Expect both expenses marked as settled
	expenseRepo.On("Update", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.SettledAt != nil
	})).Return(nil).Times(2)

	result, err := svc.SettleAll(context.Background(), ledgerID, ownerID, receiveAcctID)

	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, 2, result.SettledCount)
	assert.Equal(t, 800.0, result.TotalAmount)
	txRepo.AssertExpectations(t)
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
		ID:                  ledgerID,
		OwnerID:             ownerID,
		ReceivableAccountID: uuid.New(),
	}

	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)
	expenseRepo.On("FindUnsettledByLedgerID", mock.Anything, ledgerID).Return([]domain.SharedExpense{}, nil)

	result, err := svc.SettleAll(context.Background(), ledgerID, ownerID, uuid.New())

	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "no unsettled receivables")
}
```

**Step 2: Run tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/... -run TestSharedExpenseService_SettleAll -v`
Expected: PASS (2 tests)

**Step 3: Run all existing tests to check for regressions**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/... -v`
Expected: ALL PASS

---

### Task 3: Backend — Add HTTP handler and route

**Files:**
- Modify: `backend/internal/delivery/http/shared_expense_handler.go`

**Step 1: Add `SettleAllReceivables` handler**

Add before `GetSummary` method (before line 401):

```go
// SettleAllReceivables godoc
// @Summary      一次結清所有待收款項
// @Description  結算共同帳本中所有未結算的待收款項
// @Tags         共同支出
// @Accept       json
// @Produce      json
// @Param        id    path      string                    true  "帳本 ID (UUID)"
// @Param        body  body      settleReceivableRequest   true  "收款帳戶"
// @Success      200   {object}  Response{data=usecase.SettleAllResult}
// @Failure      400   {object}  Response
// @Failure      403   {object}  Response
// @Failure      404   {object}  Response
// @Failure      500   {object}  Response
// @Router       /shared-ledgers/{id}/receivables/settle-all [post]
func (h *SharedExpenseHandler) SettleAllReceivables(c *gin.Context) {
	ctx := c.Request.Context()

	_, userID, ok := h.getLedgerAndVerifyMembership(c)
	if !ok {
		return
	}

	ledgerID, _ := uuid.Parse(c.Param("id"))

	var req settleReceivableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	receiveAccountID, err := uuid.Parse(req.ReceiveAccountID)
	if err != nil {
		BadRequest(c, "invalid receive_account_id")
		return
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

**Step 2: Register the route**

In `RegisterRoutes` method (~line 434), add the new route **before** the `/:eid/settle` route (order matters for Gin routing):

Change:
```go
		ledgers.GET("/:id/receivables", h.ListReceivables)
		ledgers.POST("/:id/receivables/:eid/settle", h.SettleReceivable)
```

To:
```go
		ledgers.GET("/:id/receivables", h.ListReceivables)
		ledgers.POST("/:id/receivables/settle-all", h.SettleAllReceivables)
		ledgers.POST("/:id/receivables/:eid/settle", h.SettleReceivable)
```

**Step 3: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: SUCCESS

**Step 4: Commit backend changes**

```bash
cd /Users/yuki/projects/zen-bill/backend
git add internal/usecase/shared_expense_service.go internal/usecase/shared_expense_service_test.go internal/delivery/http/shared_expense_handler.go
git commit -m "feat(backend): add batch settle-all receivables endpoint"
```

---

### Task 4: Frontend — Add `useSettleAllReceivables` hook

**Files:**
- Modify: `frontend/src/hooks/useSharedLedgers.ts` (after `useSettleReceivable`, ~line 163)

**Step 1: Add the hook**

Add after `useSettleReceivable`:

```typescript
export function useSettleAllReceivables(ledgerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ receive_account_id }: { receive_account_id: string }) =>
      api.post<ApiResponse<{ settled_count: number; total_amount: number }>>(
        `/shared-ledgers/${ledgerId}/receivables/settle-all`,
        { receive_account_id },
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

---

### Task 5: Frontend — Add "一次結清" button and modal to ReceivablesPage

**Files:**
- Modify: `frontend/src/pages/ReceivablesPage.tsx`

**Step 1: Update imports and hooks**

Change import line:
```typescript
import { useSharedLedger, useReceivables, useSettleReceivable } from '@/hooks/useSharedLedgers'
```
To:
```typescript
import { useSharedLedger, useReceivables, useSettleReceivable, useSettleAllReceivables } from '@/hooks/useSharedLedgers'
```

**Step 2: Add state and hook for settle-all**

After the existing `settleMutation` line (line 15), add:

```typescript
  const settleAllMutation = useSettleAllReceivables(ledgerId!)

  const [showSettleAll, setShowSettleAll] = useState(false)
  const [settleAllAccountId, setSettleAllAccountId] = useState<string | undefined>()
```

**Step 3: Add `handleSettleAll` function**

After the existing `handleSettle` function, add:

```typescript
  const totalReceivable = (receivables ?? []).reduce((sum, exp) => sum + exp.partner_amount, 0)

  const handleSettleAll = async () => {
    if (!settleAllAccountId) return
    await settleAllMutation.mutateAsync({ receive_account_id: settleAllAccountId })
    setShowSettleAll(false)
    setSettleAllAccountId(undefined)
  }
```

**Step 4: Add "一次結清" button next to the title**

Replace the title `<div>` block (lines 40-46):

```tsx
        <div className="flex-1">
          <h1 className="text-lg font-bold">待收款項</h1>
          {ledger && (
            <p className="text-xs text-[var(--text-muted)]">{ledger.name}</p>
          )}
        </div>
        {receivables && receivables.length > 0 && (
          <button
            onClick={() => { setShowSettleAll(true); setSettleAllAccountId(undefined) }}
            className="h-7 px-3 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition-colors"
          >
            一次結清
          </button>
        )}
```

**Step 5: Add the settle-all modal**

After the existing settle modal closing `)}` (after line 125), add:

```tsx
      {/* Settle-all modal */}
      {showSettleAll && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSettleAll(false)} />
          <div className="relative w-full max-w-md mx-4 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">一次結清全部</h2>
              <button onClick={() => setShowSettleAll(false)} className="p-1 rounded-lg hover:bg-[var(--bg-hover)]">
                <X className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg bg-[var(--bg-hover)] p-3">
                <p className="text-xs text-[var(--text-muted)]">待結清金額</p>
                <p className="text-lg font-bold text-violet-400">${totalReceivable.toLocaleString()}</p>
                <p className="text-xs text-[var(--text-muted)]">共 {receivables?.length ?? 0} 筆</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">收款帳戶</label>
                <SearchableSelect
                  value={settleAllAccountId}
                  options={accountOptions}
                  placeholder="選擇收款帳戶"
                  onChange={(id) => setSettleAllAccountId(id)}
                  allowClear={false}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettleAll(false)}
                  className="h-8 px-3 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  取消
                </button>
                <button
                  onClick={handleSettleAll}
                  disabled={!settleAllAccountId || settleAllMutation.isPending}
                  className="h-8 px-3 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {settleAllMutation.isPending ? '處理中...' : '確認結清全部'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
```

**Step 6: Verify frontend compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit`
Expected: SUCCESS (no type errors)

**Step 7: Commit frontend changes**

```bash
cd /Users/yuki/projects/zen-bill
git add frontend/src/hooks/useSharedLedgers.ts frontend/src/pages/ReceivablesPage.tsx
git commit -m "feat(frontend): add batch settle-all receivables button and modal"
```

---

### Task 6: Manual verification

**Step 1: Start backend and frontend dev servers**

Verify both are running and the app works.

**Step 2: Test the flow**

1. Navigate to a shared ledger with pending receivables
2. Click「待收款項」
3. Verify the「一次結清」button appears next to the title
4. Click it → modal should show total amount, count, and account selector
5. Select an account → click「確認結清全部」
6. All receivables should disappear, account balances should update

**Step 3: Test edge cases**

- Page with no receivables: button should not appear
- Single receivable: both single settle and settle-all should work
