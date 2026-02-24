# Fix Shared Expense Direction Bugs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修正「對方付錢」時應收帳款餘額方向錯誤、待收款頁面金額顯示錯誤、份額標籤未考慮觀看者角色等問題。

**Architecture:** 後端修正 Create() 在 partner 付錢時的應收帳款交易方向（從 +INCOME 改為 -EXPENSE）；前端修正 ReceivablesPage 根據付款人顯示正確金額與方向標籤；DetailPage 根據 isOwner 翻轉份額顯示。

**Tech Stack:** Go (testify/mock), React (TypeScript), TanStack Query

---

## Bug Summary

| # | Bug | Root Cause | Fix Location |
|---|-----|-----------|--------------|
| 1 | 對方付錢時應收帳款餘額方向錯 | Create() 永遠用 +INCOME | `shared_expense_service.go:129-147` |
| 2 | 待收款頁面金額顯示錯 | 永遠顯示 partner_amount | `ReceivablesPage.tsx:89,35` |
| 3 | 我的/對方份額標籤反了 | 未考慮 partner 身份 | `SharedLedgerDetailPage.tsx:465-474` |
| 4 | 待收/待付沒區分 | 所有項目都當待收款 | `ReceivablesPage.tsx` |

---

## Task 1: Fix backend Create() receivable direction

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:129-147`
- Test: `backend/internal/usecase/shared_expense_service_test.go`

### Step 1: Update existing test to verify current (buggy) behavior

Read the existing test `TestSharedExpenseService_Create_EqualSplit` in `backend/internal/usecase/shared_expense_service_test.go`. It tests owner-pays scenario. There should also be a test for partner-pays or we need to write one.

Check: Does a test exist for partner-pays Create? If yes, update it. If no, write it.

### Step 2: Write failing test for partner-pays receivable direction

Add test `TestSharedExpenseService_Create_PartnerPays_ReceivableDirection` to `backend/internal/usecase/shared_expense_service_test.go`:

```go
func TestSharedExpenseService_Create_PartnerPays_ReceivableDirection(t *testing.T) {
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestSharedExpenseService(expenseRepo, ledgerRepo, txRepo, acctRepo)

	ownerID := uuid.New()
	partnerID := uuid.New()
	ledgerID := uuid.New()
	receivableAcctID := uuid.New()
	paymentAcctID := uuid.New()

	ledger := &domain.SharedLedger{
		ID:                   ledgerID,
		OwnerID:              ownerID,
		PartnerID:            &partnerID,
		ReceivableAccountID:  receivableAcctID,
	}

	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)

	// Partner pays 1000, equal split => owner owes 500
	// Expense transaction: -1000 from payment account
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeExpense &&
			tx.Amount == 1000.0 &&
			tx.AccountID == paymentAcctID
	})).Return(nil).Once()
	acctRepo.On("UpdateBalance", mock.Anything, paymentAcctID, -1000.0).Return(nil).Once()

	// Receivable transaction: should be EXPENSE type, -500 on receivable account
	// (owner owes partner, so receivable balance should DECREASE)
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeExpense &&
			tx.Amount == 500.0 &&
			tx.AccountID == receivableAcctID
	})).Return(nil).Once()
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, -500.0).Return(nil).Once()

	expenseRepo.On("Create", mock.Anything, mock.Anything).Return(nil)

	input := CreateSharedExpenseInput{
		Date:             time.Now(),
		Category:         "food",
		Description:      "午餐",
		PayerName:        "Partner",
		TotalAmount:      1000.0,
		SplitMethod:      domain.SplitMethodEqual,
		PaymentAccountID: &paymentAcctID,
	}

	expense, err := svc.Create(context.Background(), ledgerID, partnerID, input)
	assert.NoError(t, err)
	assert.NotNil(t, expense)
	assert.Equal(t, 500.0, expense.OwnerAmount)
	assert.Equal(t, 500.0, expense.PartnerAmount)
	assert.Equal(t, 0.0, expense.OwnerPaidAmount)
	assert.Equal(t, 1000.0, expense.PartnerPaidAmount)

	txRepo.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
}
```

### Step 3: Run test to verify it fails

```bash
cd backend && go test ./internal/usecase/ -run TestSharedExpenseService_Create_PartnerPays_ReceivableDirection -v
```

Expected: FAIL — mock expects EXPENSE type and -500 balance update, but current code creates INCOME and +500.

### Step 4: Fix Create() receivable direction

Modify `backend/internal/usecase/shared_expense_service.go` lines 129-147:

```go
	// 2. Create receivable transaction for the advance portion
	if receivableAmount > 0 {
		var txType domain.TransactionType
		var balanceDelta float64
		var notePrefix string

		if isOwnerPayer {
			// Owner paid → partner owes owner → receivable balance increases
			txType = domain.TransactionTypeIncome
			balanceDelta = receivableAmount
			notePrefix = "代墊"
		} else {
			// Partner paid → owner owes partner → receivable balance decreases
			txType = domain.TransactionTypeExpense
			balanceDelta = -receivableAmount
			notePrefix = "對方代墊"
		}

		receivableTx := &domain.Transaction{
			ID:         uuid.New(),
			UserID:     userID,
			AccountID:  ledger.ReceivableAccountID,
			Type:       txType,
			Amount:     receivableAmount,
			OccurredAt: input.Date,
			Note:       fmt.Sprintf("%s: %s", notePrefix, input.Description),
		}
		if err := repos.TransactionRepo.Create(ctx, receivableTx); err != nil {
			return fmt.Errorf("create receivable transaction: %w", err)
		}
		if err := repos.AccountRepo.UpdateBalance(ctx, ledger.ReceivableAccountID, balanceDelta); err != nil {
			return fmt.Errorf("update receivable account balance: %w", err)
		}
		expense.ReceivableTransactionID = &receivableTx.ID
	}
```

### Step 5: Run test to verify it passes

```bash
cd backend && go test ./internal/usecase/ -run TestSharedExpenseService_Create_PartnerPays_ReceivableDirection -v
```

Expected: PASS

### Step 6: Update existing owner-pays test to explicitly assert INCOME type

Ensure the existing `TestSharedExpenseService_Create_EqualSplit` test explicitly checks for `TransactionTypeIncome` on the receivable transaction (may already do so). If not, add:

```go
txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
	return tx.Type == domain.TransactionTypeIncome &&
		tx.Amount == 500.0 &&
		tx.AccountID == receivableAcctID
})).Return(nil).Once()
acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, 500.0).Return(nil).Once()
```

### Step 7: Run all shared expense tests

```bash
cd backend && go test ./internal/usecase/ -run TestSharedExpenseService -v
```

Expected: ALL PASS

### Step 8: Commit

```bash
cd backend && git add internal/usecase/shared_expense_service.go internal/usecase/shared_expense_service_test.go
git commit -m "fix: correct receivable balance direction when partner pays

When partner pays, receivable account balance should decrease (owner owes partner),
not increase. Changed transaction type from INCOME to EXPENSE and balance delta
from positive to negative for partner-pays scenario."
```

---

## Task 2: Fix backend Delete() reversal for partner-paid expenses

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:206-227`
- Test: `backend/internal/usecase/shared_expense_service_test.go`

The Delete() method at line 212 reverses the receivable transaction by doing `-receivableTx.Amount`. After Task 1, the balance was stored as negative for partner-pays. The reversal uses `receivableTx.Amount` (always positive) with a `-` prefix, which would add the wrong sign.

Actually, the reversal logic at line 212 is: `UpdateBalance(ctx, receivableTx.AccountID, -receivableTx.Amount)`. The `receivableTx.Amount` field is always the absolute value (500). So:
- Owner pays: create did +500, delete does -500 ✓
- Partner pays (after fix): create did -500, but `receivableTx.Amount` is still 500 (positive), so delete does -500 → makes it -1000 ✗

We need to fix Delete() to also consider direction.

### Step 1: Write failing test for Delete partner-paid expense

```go
func TestSharedExpenseService_Delete_PartnerPaid(t *testing.T) {
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestSharedExpenseService(expenseRepo, ledgerRepo, txRepo, acctRepo)

	ownerID := uuid.New()
	partnerID := uuid.New()
	ledgerID := uuid.New()
	receivableAcctID := uuid.New()
	expenseID := uuid.New()
	receivableTxID := uuid.New()

	ledger := &domain.SharedLedger{
		ID:                  ledgerID,
		OwnerID:             ownerID,
		PartnerID:           &partnerID,
		ReceivableAccountID: receivableAcctID,
	}

	expense := &domain.SharedExpense{
		ID:                      expenseID,
		LedgerID:                ledgerID,
		TotalAmount:             1000.0,
		SplitMethod:             domain.SplitMethodEqual,
		OwnerAmount:             500.0,
		PartnerAmount:           500.0,
		PayerUserID:             &partnerID, // Partner paid
		OwnerPaidAmount:         0,
		PartnerPaidAmount:       1000.0,
		ReceivableTransactionID: &receivableTxID,
	}

	receivableTx := &domain.Transaction{
		ID:        receivableTxID,
		AccountID: receivableAcctID,
		Type:      domain.TransactionTypeExpense, // After Task 1 fix
		Amount:    500.0,
	}

	expenseRepo.On("FindByID", mock.Anything, expenseID).Return(expense, nil)
	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)

	// Reverse receivable: balance was -500 from create, so reversal should be +500
	txRepo.On("FindByID", mock.Anything, receivableTxID).Return(receivableTx, nil)
	acctRepo.On("UpdateBalance", mock.Anything, receivableAcctID, 500.0).Return(nil).Once()
	txRepo.On("Delete", mock.Anything, receivableTxID).Return(nil)

	expenseRepo.On("Delete", mock.Anything, expenseID).Return(nil)

	err := svc.Delete(context.Background(), expenseID)
	assert.NoError(t, err)
	acctRepo.AssertExpectations(t)
}
```

### Step 2: Run test to verify it fails

```bash
cd backend && go test ./internal/usecase/ -run TestSharedExpenseService_Delete_PartnerPaid -v
```

Expected: FAIL — current code does `-receivableTx.Amount` = -500, but mock expects +500.

### Step 3: Fix Delete() reversal logic

Modify `backend/internal/usecase/shared_expense_service.go` lines 207-217. Replace:

```go
if expense.ReceivableTransactionID != nil {
	receivableTx, err := repos.TransactionRepo.FindByID(ctx, *expense.ReceivableTransactionID)
	if err != nil {
		return fmt.Errorf("find receivable transaction: %w", err)
	}
	if err := repos.AccountRepo.UpdateBalance(ctx, receivableTx.AccountID, -receivableTx.Amount); err != nil {
		return fmt.Errorf("reverse receivable balance: %w", err)
	}
```

With:

```go
if expense.ReceivableTransactionID != nil {
	receivableTx, err := repos.TransactionRepo.FindByID(ctx, *expense.ReceivableTransactionID)
	if err != nil {
		return fmt.Errorf("find receivable transaction: %w", err)
	}
	// Reverse the balance change: INCOME was +amount, EXPENSE was -amount
	var reversalAmount float64
	if receivableTx.Type == domain.TransactionTypeIncome {
		reversalAmount = -receivableTx.Amount // was +, so reverse to -
	} else {
		reversalAmount = receivableTx.Amount // was -, so reverse to +
	}
	if err := repos.AccountRepo.UpdateBalance(ctx, receivableTx.AccountID, reversalAmount); err != nil {
		return fmt.Errorf("reverse receivable balance: %w", err)
	}
```

### Step 4: Run test to verify it passes

```bash
cd backend && go test ./internal/usecase/ -run TestSharedExpenseService_Delete -v
```

Expected: ALL PASS

### Step 5: Commit

```bash
cd backend && git add internal/usecase/shared_expense_service.go internal/usecase/shared_expense_service_test.go
git commit -m "fix: correct Delete() reversal for partner-paid receivable transactions

Reversal now checks transaction type to determine sign: INCOME reverses
as negative, EXPENSE reverses as positive."
```

---

## Task 3: Fix backend Settle() balance-only direction for partner-paid

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:344-356`
- Test: `backend/internal/usecase/shared_expense_service_test.go`

Current balance-only settle when partner paid (line 351-353) does `+amount`, but after Task 1 the create stored `-amount`. Settlement should reverse it back toward zero, so it should also do `+amount`. **Wait** — let's trace the full flow:

- Create (partner pays): receivable balance -= 500 (after Task 1 fix)
- Settle (balance-only, partner paid): should bring balance back toward 0, so += 500

Current code at line 353 does `+amount` which is correct! The comment just says `(it was negative)` which matches.

However, for **with-account** settle (lines 316-319), when partner paid:
```go
sourceAcct = *receiveAccountID              // personal account
targetAcct = ledger.ReceivableAccountID     // receivable account
```
Source gets -amount, target gets +amount. This brings receivable from -500 back to 0. Correct!

So Settle() is already correct for the post-fix state. But we should verify with tests.

### Step 1: Verify existing settle tests pass after Task 1 & 2 changes

```bash
cd backend && go test ./internal/usecase/ -run TestSharedExpenseService_Settle -v
```

Check the existing tests for `Settle_PartnerPaid_WithAccount` and `Settle_PartnerPaid_BalanceOnly`.
If they pass, no changes needed. If they fail, update the mock expectations.

### Step 2: Run all usecase tests

```bash
cd backend && go test ./internal/usecase/ -v
```

Expected: ALL PASS. If any settle test fails, fix the mock expectations to match the new Create behavior.

### Step 3: Commit (if changes were needed)

```bash
cd backend && git add internal/usecase/shared_expense_service_test.go
git commit -m "test: update settle test expectations for new receivable direction"
```

---

## Task 4: Fix frontend ReceivablesPage — correct amount and direction

**Files:**
- Modify: `frontend/src/pages/ReceivablesPage.tsx`

### Step 1: Read the current ReceivablesPage

Read `frontend/src/pages/ReceivablesPage.tsx` to confirm current state.

### Step 2: Add isOwner logic and compute correct receivable amounts

The page needs to know: for each expense, what is the actual receivable amount and direction?

- If `owner` paid (payer_user_id === ledger.owner_id): receivable = partner_amount (partner owes me)
- If `partner` paid: receivable = owner_amount (I owe partner)

For direction:
- Owner viewing, owner paid → 「待收」(to receive from partner)
- Owner viewing, partner paid → 「待付」(to pay partner)
- Partner viewing, owner paid → 「待付」(to pay owner)
- Partner viewing, partner paid → 「待收」(to receive from owner)

Simplified: `isMyPayment = (isOwner && payer == owner) || (!isOwner && payer == partner)`
- isMyPayment → 「待收」
- !isMyPayment → 「待付」

Replace the full component with these changes:

```tsx
// After line 14 (useAccounts import), add:
import { useAuthStore } from '@/stores/auth'

// After line 14 (inside component), add:
const user = useAuthStore((s) => s.user)
const isOwner = ledger?.owner_id === user?.id

// Helper to compute receivable amount for each expense
const getReceivableAmount = (exp: SharedExpense) => {
  const isOwnerPayer = exp.payer_user_id === ledger?.owner_id
  return isOwnerPayer ? exp.partner_amount : exp.owner_amount
}

// Helper to determine if current user is the payer
const isMyPayment = (exp: SharedExpense) => {
  const isOwnerPayer = exp.payer_user_id === ledger?.owner_id
  return isOwner ? isOwnerPayer : !isOwnerPayer
}
```

Replace line 35:
```tsx
const totalReceivable = (receivables ?? []).reduce((sum, exp) => {
  const amount = getReceivableAmount(exp)
  return sum + (isMyPayment(exp) ? amount : -amount)
}, 0)
```

Replace line 88-90 (amount display per item):
```tsx
<div className="text-right shrink-0">
  <p className={`text-sm font-bold tabular-nums ${isMyPayment(exp) ? 'text-violet-400' : 'text-amber-400'}`}>
    {isMyPayment(exp) ? '+' : '-'}${getReceivableAmount(exp).toLocaleString()}
  </p>
  <p className="text-[11px] text-[var(--text-muted)]">
    {isMyPayment(exp) ? '待收' : '待付'}
  </p>
</div>
```

Replace line 53 page title:
```tsx
<h1 className="text-lg font-bold">待收付款項</h1>
```

Replace line 161-162 (settle-all modal amount display):
```tsx
<p className="text-xs text-[var(--text-muted)]">淨額</p>
<p className={`text-lg font-bold ${totalReceivable >= 0 ? 'text-violet-400' : 'text-amber-400'}`}>
  {totalReceivable >= 0 ? '+' : ''}${totalReceivable.toLocaleString()}
</p>
```

### Step 3: Verify in browser

Open the shared ledger detail page, navigate to receivables. Check:
- Expenses where I paid show violet color with "待收"
- Expenses where partner paid show amber color with "待付"
- Total shows net amount with correct sign

### Step 4: Commit

```bash
cd frontend && git add src/pages/ReceivablesPage.tsx
git commit -m "fix: show correct receivable amount and direction based on payer

- Compute receivable amount from owner_amount or partner_amount based on who paid
- Show direction labels (待收/待付) and color coding (violet/amber)
- Calculate net total instead of summing partner_amount
- Rename page title to 待收付款項"
```

---

## Task 5: Fix frontend SharedLedgerDetailPage — swap labels for partner

**Files:**
- Modify: `frontend/src/pages/SharedLedgerDetailPage.tsx`

### Step 1: Read the current component

Confirm the `isOwner` variable already exists (line 67).

### Step 2: Fix summary cards (lines 457-482)

Replace the summary cards section:

```tsx
{/* Summary cards */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
  <StatCard
    title="總支出"
    value={`$${(summary?.total_expenses ?? 0).toLocaleString()}`}
    icon={DollarSign}
    accent="#ef4444"
  />
  <StatCard
    title="我的份額"
    value={`$${((isOwner ? summary?.owner_share : summary?.partner_share) ?? 0).toLocaleString()}`}
    icon={PieChart}
    accent="#6366f1"
  />
  <StatCard
    title="對方份額"
    value={`$${((isOwner ? summary?.partner_share : summary?.owner_share) ?? 0).toLocaleString()}`}
    icon={Users}
    accent="#f59e0b"
  />
  <StatCard
    title="待收付"
    value={`$${((isOwner ? (summary?.receivable_balance ?? 0) : -(summary?.receivable_balance ?? 0))).toLocaleString()}`}
    icon={Wallet}
    accent="#8b5cf6"
  />
</div>
```

Key changes:
- 我的份額: `isOwner ? owner_share : partner_share`
- 對方份額: `isOwner ? partner_share : owner_share`
- 待收付: partner 看到的 receivable_balance 符號要反轉（正=partner 欠 owner，partner 看到是「我欠」所以要取負）

### Step 3: Fix expense list share display (line 518-520)

Replace:
```tsx
<p className="text-[11px] text-[var(--text-muted)] tabular-nums">
  我 ${(isOwner ? exp.owner_amount : exp.partner_amount).toLocaleString()} / 對方 ${(isOwner ? exp.partner_amount : exp.owner_amount).toLocaleString()}
</p>
```

### Step 4: Fix "待收款" button label (line 208)

```tsx
<Wallet className="w-3.5 h-3.5" /> 待收付款
```

### Step 5: Verify in browser

If possible, log in as both owner and partner to verify the labels are correct.

### Step 6: Commit

```bash
cd frontend && git add src/pages/SharedLedgerDetailPage.tsx
git commit -m "fix: swap share labels and receivable sign for partner viewer

- My share shows partner_share when logged in as partner
- Partner share shows owner_share when logged in as partner
- Receivable balance sign flipped for partner perspective
- Expense list share labels also role-aware"
```

---

## Task 6: Run full test suite and verify

### Step 1: Run backend tests

```bash
cd backend && go test ./internal/domain/... ./internal/usecase/... -v
```

Expected: ALL PASS

### Step 2: Run frontend type check

```bash
cd frontend && npx tsc --noEmit
```

Expected: No type errors

### Step 3: Run lint

```bash
cd backend && golangci-lint run ./internal/usecase/...
```

Expected: No lint issues

### Step 4: Final commit (if any lint/type fixes needed)

```bash
git add -A && git commit -m "chore: fix lint and type issues"
```

---

## Data Migration Note

**Important:** If there are existing expenses in the database where the partner paid, their receivable account balances are already wrong (inflated by 2x the owner_amount for each partner-paid expense). A migration or manual fix may be needed:

For each unsettled expense where partner paid:
- Current receivable balance impact: +ownerAmount (wrong)
- Correct receivable balance impact: -ownerAmount
- Delta to fix: -2 * ownerAmount

This can be done via a SQL script or a one-time fix command. Consider adding this as a follow-up task if there's existing production data.
