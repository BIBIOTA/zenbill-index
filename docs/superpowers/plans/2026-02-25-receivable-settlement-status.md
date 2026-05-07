# Receivable Settlement Status Display - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show settlement status (settled/unsettled + date) on each transaction in a RECEIVABLE account's transaction list.

**Architecture:** Add a `SettledAt` field to `TransactionWithBalance` that gets populated via LEFT JOIN to `shared_expenses` when the queried account is RECEIVABLE type. Frontend `TransactionRow` renders a badge when `settled_at` is present.

**Tech Stack:** Go/GORM (backend), React/TypeScript (frontend)

---

### Task 1: Add SettledAt to TransactionWithBalance

**Files:**
- Modify: `backend/internal/usecase/transaction_service.go:251-255`

**Step 1: Add SettledAt field to TransactionWithBalance**

In `transaction_service.go`, update the struct:

```go
// TransactionWithBalance wraps a transaction with its running balance.
type TransactionWithBalance struct {
	domain.Transaction
	RunningBalance float64    `json:"running_balance"`
	SettledAt      *time.Time `json:"settled_at"`
}
```

**Step 2: Verify build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: PASS (field added, no consumers use it yet)

**Step 3: Commit**

```bash
git add backend/internal/usecase/transaction_service.go
git commit -m "feat: add SettledAt field to TransactionWithBalance"
```

---

### Task 2: Add repository method to fetch settlement status

**Files:**
- Modify: `backend/internal/domain/shared_expense.go` (repository interface)
- Modify: `backend/internal/repository/shared_expense_repository.go`

**Step 1: Add interface method to SharedExpenseRepository**

In `backend/internal/domain/shared_expense.go`, add to the `SharedExpenseRepository` interface:

```go
// FindSettledAtByReceivableTransactionIDs returns a map of transaction ID -> settled_at
// for shared expenses linked to the given receivable transaction IDs.
FindSettledAtByReceivableTransactionIDs(ctx context.Context, txIDs []uuid.UUID) (map[uuid.UUID]time.Time, error)
```

**Step 2: Implement in repository**

In `backend/internal/repository/shared_expense_repository.go`, add:

```go
// FindSettledAtByReceivableTransactionIDs returns a map of transaction ID -> settled_at
func (r *SharedExpenseRepositoryImpl) FindSettledAtByReceivableTransactionIDs(ctx context.Context, txIDs []uuid.UUID) (map[uuid.UUID]time.Time, error) {
	if len(txIDs) == 0 {
		return make(map[uuid.UUID]time.Time), nil
	}

	type row struct {
		ReceivableTransactionID uuid.UUID  `gorm:"column:receivable_transaction_id"`
		SettledAt               *time.Time `gorm:"column:settled_at"`
	}

	var rows []row
	err := r.db.WithContext(ctx).
		Model(&domain.SharedExpense{}).
		Select("receivable_transaction_id, settled_at").
		Where("receivable_transaction_id IN ? AND settled_at IS NOT NULL", txIDs).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}

	result := make(map[uuid.UUID]time.Time, len(rows))
	for _, r := range rows {
		if r.SettledAt != nil {
			result[r.ReceivableTransactionID] = *r.SettledAt
		}
	}
	return result, nil
}
```

**Step 3: Verify build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: PASS

**Step 4: Commit**

```bash
git add backend/internal/domain/shared_expense.go backend/internal/repository/shared_expense_repository.go
git commit -m "feat: add FindSettledAtByReceivableTransactionIDs to SharedExpenseRepository"
```

---

### Task 3: Populate SettledAt in TransactionService

**Files:**
- Modify: `backend/internal/usecase/transaction_service.go`

The `TransactionService` needs access to `SharedExpenseRepository` and `AccountRepository` to:
1. Check if the queried account is RECEIVABLE type
2. If so, look up settlement status for each transaction

**Step 1: Add dependencies to TransactionService**

In `transaction_service.go`, update the struct and constructor. Find the existing `TransactionService` struct definition and add:

```go
type TransactionService struct {
	txRepo       domain.TransactionRepository
	acctRepo     domain.AccountRepository
	sharedExpRepo domain.SharedExpenseRepository
}
```

Update `NewTransactionService` to accept the new dependencies. Check the existing constructor signature and add the new params.

**Step 2: Add helper method to populate SettledAt**

```go
// populateSettledAt fills SettledAt for transactions belonging to a RECEIVABLE account.
func (s *TransactionService) populateSettledAt(ctx context.Context, accountID uuid.UUID, results []TransactionWithBalance) error {
	if s.sharedExpRepo == nil || s.acctRepo == nil {
		return nil
	}

	account, err := s.acctRepo.FindByID(ctx, accountID)
	if err != nil || account.Type != domain.AccountTypeReceivable {
		return nil // not a receivable account, skip
	}

	txIDs := make([]uuid.UUID, 0, len(results))
	for _, r := range results {
		txIDs = append(txIDs, r.Transaction.ID)
	}

	settledMap, err := s.sharedExpRepo.FindSettledAtByReceivableTransactionIDs(ctx, txIDs)
	if err != nil {
		return fmt.Errorf("find settlement status: %w", err)
	}

	for i := range results {
		if settledAt, ok := settledMap[results[i].Transaction.ID]; ok {
			t := settledAt
			results[i].SettledAt = &t
		}
	}
	return nil
}
```

**Step 3: Call populateSettledAt in ListByAccountWithBalance**

After the running balance loop (around line 300), before `return result, nil`:

```go
	if err := s.populateSettledAt(ctx, accountID, result); err != nil {
		return nil, err
	}

	return result, nil
```

**Step 4: Call populateSettledAt in ListByAccountWithBalanceInDateRange**

Same pattern — after the running balance loop, before the return.

**Step 5: Check AccountTypeReceivable exists in domain**

Verify `domain.AccountTypeReceivable` constant exists. If not, check what the constant name is (likely `AccountTypeReceivable = "RECEIVABLE"`).

Run: `grep -n "AccountType" backend/internal/domain/account.go | head -20`

**Step 6: Update all callers of NewTransactionService**

Find all places where `NewTransactionService` is called (likely `cmd/api/main.go`) and pass the new dependencies.

Run: `grep -rn "NewTransactionService" backend/`

**Step 7: Verify build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: PASS

**Step 8: Commit**

```bash
git add backend/internal/usecase/transaction_service.go backend/cmd/
git commit -m "feat: populate SettledAt for RECEIVABLE account transactions"
```

---

### Task 4: Add settled_at to frontend Transaction type and TransactionRow

**Files:**
- Modify: `frontend/src/types/index.ts:43-61`
- Modify: `frontend/src/components/transactions/TransactionRow.tsx`

**Step 1: Add settled_at to Transaction interface**

In `frontend/src/types/index.ts`, add to the `Transaction` interface (after `running_balance`):

```typescript
  settled_at?: string | null
```

**Step 2: Update TransactionRow to show settlement badge**

In `frontend/src/components/transactions/TransactionRow.tsx`, after the date line (line 28), add a conditional badge:

```tsx
{tx.settled_at && (
  <span className="text-[10px] text-emerald-400/70">
    ✓ 已結清 {new Date(tx.settled_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
  </span>
)}
```

Also add a subtle opacity change to the row when settled. Update the outer div's className:

```tsx
<div className={`flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0 group ${tx.settled_at ? 'opacity-60' : ''}`}>
```

**Step 3: Verify frontend builds**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/components/transactions/TransactionRow.tsx
git commit -m "feat: show settlement status badge on receivable transactions"
```

---

### Task 5: Manual verification

**Step 1: Start backend and frontend**

Run backend and frontend dev servers.

**Step 2: Navigate to a RECEIVABLE account**

Go to Accounts page → click on a RECEIVABLE account → verify:
- Unsettled transactions show normally (no badge, full opacity)
- Settled transactions show "✓ 已結清 M/D" and slightly dimmed
- Non-RECEIVABLE accounts are completely unaffected

**Step 3: Final commit if any adjustments needed**
