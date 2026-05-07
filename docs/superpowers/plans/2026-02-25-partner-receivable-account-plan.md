# Partner Receivable Account Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a mirror RECEIVABLE account for the partner when they join a shared ledger, and keep it in sync (opposite sign) on every shared expense operation.

**Architecture:** Add `partner_receivable_account_id` to `SharedLedger` entity. Modify `AcceptInvite` to create the account. Add a helper `updatePartnerReceivable` to centralize the mirror balance update logic, then call it from Create, Delete, Settle, SettleAll in `SharedExpenseService` and `createExpenseWithReceivable` in `SheetSyncService`.

**Tech Stack:** Go, GORM, PostgreSQL, existing Clean Architecture layers.

---

### Task 1: Add PartnerReceivableAccountID to Domain Entity

**Files:**
- Modify: `backend/internal/domain/shared_ledger.go:11-34`

**Step 1: Add fields to SharedLedger struct**

Add after `ReceivableAccountID` (line 20):

```go
PartnerReceivableAccountID *uuid.UUID `gorm:"type:uuid" json:"partner_receivable_account_id"`
```

Add after `ReceivableAccount` relationship (line 33):

```go
PartnerReceivableAccount *Account `gorm:"foreignKey:PartnerReceivableAccountID" json:"partner_receivable_account,omitempty"`
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./internal/domain/...`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add backend/internal/domain/shared_ledger.go
git commit -m "feat: add PartnerReceivableAccountID to SharedLedger domain"
```

---

### Task 2: Add Preloads in Repository

**Files:**
- Modify: `backend/internal/repository/shared_ledger_repository.go`

**Step 1: Add PartnerReceivableAccount preload to all methods that preload ReceivableAccount**

In `FindByID` (line 32), `FindByUserID` (line 46), `FindSyncEnabled` (line 76), add after each `.Preload("ReceivableAccount")`:

```go
Preload("PartnerReceivableAccount").
```

In `FindByInviteToken` (line 57), add preload for ReceivableAccount (needed by AcceptInvite to read owner balance):

```go
Preload("Owner").
Preload("ReceivableAccount").
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./internal/repository/...`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add backend/internal/repository/shared_ledger_repository.go
git commit -m "feat: add PartnerReceivableAccount preloads to repository"
```

---

### Task 3: Modify AcceptInvite to Create Partner Account

**Files:**
- Modify: `backend/internal/usecase/shared_ledger_service.go:119-152`
- Test: `backend/internal/usecase/shared_ledger_service_test.go`

**Step 1: Write the failing test**

Add a new test in `shared_ledger_service_test.go` that verifies AcceptInvite creates a RECEIVABLE account for the partner with mirror balance:

```go
func TestSharedLedgerService_AcceptInvite_CreatesPartnerReceivableAccount(t *testing.T) {
	ownerID := uuid.New()
	partnerID := uuid.New()
	acctID := uuid.New()
	expiry := time.Now().Add(24 * time.Hour)

	ownerAcct := &domain.Account{
		ID:       acctID,
		UserID:   ownerID,
		Type:     domain.AccountTypeReceivable,
		Balance:  500, // owner is owed 500
		Currency: "TWD",
	}

	ledger := &domain.SharedLedger{
		ID:                  uuid.New(),
		Name:                "Test Ledger",
		Currency:            "TWD",
		OwnerID:             ownerID,
		ReceivableAccountID: acctID,
		ReceivableAccount:   ownerAcct,
		InviteToken:         "test-token",
		InviteExpiresAt:     &expiry,
	}

	var createdAcct *domain.Account
	mockAcctRepo := &mockAccountRepository{
		CreateFunc: func(ctx context.Context, acct *domain.Account) error {
			createdAcct = acct
			return nil
		},
	}

	var updatedLedger *domain.SharedLedger
	mockLedgerRepo := &mockSharedLedgerRepository{
		FindByInviteTokenFunc: func(ctx context.Context, token string) (*domain.SharedLedger, error) {
			return ledger, nil
		},
		UpdateFunc: func(ctx context.Context, l *domain.SharedLedger) error {
			updatedLedger = l
			return nil
		},
	}

	svc := NewSharedLedgerService(mockLedgerRepo, mockAcctRepo, slog.Default())
	result, err := svc.AcceptInvite(context.Background(), "test-token", partnerID)

	require.NoError(t, err)
	require.NotNil(t, createdAcct)
	assert.Equal(t, partnerID, createdAcct.UserID)
	assert.Equal(t, domain.AccountTypeReceivable, createdAcct.Type)
	assert.Equal(t, "TWD", createdAcct.Currency)
	assert.Equal(t, float64(-500), createdAcct.Balance) // mirror of owner's +500
	assert.Contains(t, createdAcct.Name, "應收帳款")

	require.NotNil(t, updatedLedger.PartnerReceivableAccountID)
	assert.Equal(t, createdAcct.ID, *updatedLedger.PartnerReceivableAccountID)
	assert.Equal(t, &partnerID, result.PartnerID)
}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/usecase/ -run TestSharedLedgerService_AcceptInvite_CreatesPartnerReceivableAccount -v`
Expected: FAIL (AcceptInvite doesn't create account yet)

**Step 3: Implement AcceptInvite changes**

In `shared_ledger_service.go`, modify `AcceptInvite` (after the validation checks, before setting PartnerID):

```go
// Create mirror RECEIVABLE account for partner
ownerBalance := float64(0)
if ledger.ReceivableAccount != nil {
	ownerBalance = ledger.ReceivableAccount.Balance
}
partnerAcct := &domain.Account{
	ID:       uuid.New(),
	UserID:   partnerUserID,
	Name:     fmt.Sprintf("應收帳款 - %s", ledger.Name),
	Type:     domain.AccountTypeReceivable,
	Currency: ledger.Currency,
	Balance:  -ownerBalance,
}
if err := s.acctRepo.Create(ctx, partnerAcct); err != nil {
	return nil, fmt.Errorf("create partner receivable account: %w", err)
}

ledger.PartnerID = &partnerUserID
ledger.PartnerReceivableAccountID = &partnerAcct.ID
```

**Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/usecase/ -run TestSharedLedgerService_AcceptInvite -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/internal/usecase/shared_ledger_service.go backend/internal/usecase/shared_ledger_service_test.go
git commit -m "feat: create partner receivable account on invite acceptance"
```

---

### Task 4: Add Partner Balance Sync to SharedExpenseService.Create

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:122-177`
- Test: `backend/internal/usecase/shared_expense_service_test.go`

**Step 1: Write the failing test**

Add a test that verifies partner receivable balance is updated with opposite sign when creating a shared expense:

```go
func TestSharedExpenseService_Create_UpdatesPartnerReceivable(t *testing.T) {
	ownerID := uuid.New()
	partnerID := uuid.New()
	ownerAcctID := uuid.New()
	partnerAcctID := uuid.New()
	paymentAcctID := uuid.New()

	ledger := &domain.SharedLedger{
		ID:                         uuid.New(),
		OwnerID:                    ownerID,
		PartnerID:                  &partnerID,
		ReceivableAccountID:        ownerAcctID,
		PartnerReceivableAccountID: &partnerAcctID,
	}

	balanceUpdates := make(map[uuid.UUID]float64) // track all UpdateBalance calls

	mockAcctRepo := &mockAccountRepository{
		UpdateBalanceFunc: func(ctx context.Context, id uuid.UUID, amount float64) error {
			balanceUpdates[id] += amount
			return nil
		},
	}
	// ... (set up other mocks similar to existing Create tests)

	svc := NewSharedExpenseService(mockExpenseRepo, mockLedgerRepo, mockTxRepo, mockAcctRepo, nil, slog.Default())

	input := CreateSharedExpenseInput{
		Date:             time.Now(),
		Category:         "food",
		Description:      "lunch",
		PayerName:        "Owner",
		TotalAmount:      1000,
		SplitMethod:      domain.SplitMethodEqual,
		PaymentAccountID: &paymentAcctID,
	}

	_, err := svc.Create(context.Background(), ledger.ID, ownerID, input)
	require.NoError(t, err)

	// Owner receivable: +500 (partner owes owner half)
	assert.Equal(t, float64(500), balanceUpdates[ownerAcctID])
	// Partner receivable: -500 (mirror)
	assert.Equal(t, float64(-500), balanceUpdates[partnerAcctID])
}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/usecase/ -run TestSharedExpenseService_Create_UpdatesPartnerReceivable -v`
Expected: FAIL (partner balance not updated)

**Step 3: Implement partner balance sync in Create**

In `shared_expense_service.go`, inside the `run` function, after the receivable balance update (line 173), add:

```go
// Mirror: update partner receivable with opposite sign
if ledger.PartnerReceivableAccountID != nil {
	if err := repos.AccountRepo.UpdateBalance(ctx, *ledger.PartnerReceivableAccountID, -balanceDelta); err != nil {
		return fmt.Errorf("update partner receivable balance: %w", err)
	}
}
```

**Step 4: Run all Create tests to verify they pass**

Run: `cd backend && go test ./internal/usecase/ -run TestSharedExpenseService_Create -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/internal/usecase/shared_expense_service.go backend/internal/usecase/shared_expense_service_test.go
git commit -m "feat: sync partner receivable balance on expense creation"
```

---

### Task 5: Add Partner Balance Sync to SharedExpenseService.Delete

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:224-332`
- Test: `backend/internal/usecase/shared_expense_service_test.go`

**Step 1: Write the failing test**

Test that Delete reverses partner receivable balance (opposite of owner reversal):

```go
func TestSharedExpenseService_Delete_ReversesPartnerReceivable(t *testing.T) {
	// Setup ledger with PartnerReceivableAccountID
	// Create expense where owner paid, receivable was +500 on owner, -500 on partner
	// Delete should reverse: owner -500, partner +500
	// Assert balanceUpdates[partnerAcctID] == +receivableAmount
}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/usecase/ -run TestSharedExpenseService_Delete_ReversesPartnerReceivable -v`
Expected: FAIL

**Step 3: Implement partner balance sync in Delete**

In `shared_expense_service.go`, in the Delete `run` function:

After reversing the owner's receivable balance (the block at lines 237-263), add partner mirror reversal. There are two code paths:

Path 1 - Has receivable transaction (lines 237-254): After owner reversal, add:
```go
if ledger.PartnerReceivableAccountID != nil {
	if err := repos.AccountRepo.UpdateBalance(ctx, *ledger.PartnerReceivableAccountID, -reversalAmount); err != nil {
		return fmt.Errorf("reverse partner receivable balance: %w", err)
	}
}
```

Path 2 - No transaction but direct balance update (lines 255-263): After owner reversal, add:
```go
if ledger.PartnerReceivableAccountID != nil {
	if err := repos.AccountRepo.UpdateBalance(ctx, *ledger.PartnerReceivableAccountID, receivableAmount); err != nil {
		return fmt.Errorf("reverse partner receivable balance: %w", err)
	}
}
```

Also for settlement reversal (lines 280-299): when the settlement TRANSFER is reversed, also reverse the partner receivable. After `reverseBalance` call (line 291), add:
```go
if ledger.PartnerReceivableAccountID != nil {
	// Settlement reversed owner's receivable, mirror to partner
	netReceivable := expense.OwnerPaidAmount - expense.OwnerAmount
	if err := repos.AccountRepo.UpdateBalance(ctx, *ledger.PartnerReceivableAccountID, netReceivable); err != nil {
		return fmt.Errorf("reverse partner receivable settlement: %w", err)
	}
}
```

**Step 4: Run all Delete tests**

Run: `cd backend && go test ./internal/usecase/ -run TestSharedExpenseService_Delete -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/internal/usecase/shared_expense_service.go backend/internal/usecase/shared_expense_service_test.go
git commit -m "feat: sync partner receivable balance on expense deletion"
```

---

### Task 6: Add Partner Balance Sync to Settle and SettleAll

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:342-567`
- Test: `backend/internal/usecase/shared_expense_service_test.go`

**Step 1: Write failing tests**

Test that Settle and SettleAll also mirror partner receivable changes.

**Step 2: Implement partner balance sync in Settle**

In `Settle`, there are two paths:

Path 1 - With receiveAccountID (lines 372-406): After updating source/target balances, add partner mirror. The settlement zeros out the owner's receivable for this expense, so mirror:
```go
if ledger.PartnerReceivableAccountID != nil {
	// Mirror: partner receivable moves opposite to owner's
	if err := repos.AccountRepo.UpdateBalance(ctx, *ledger.PartnerReceivableAccountID, netReceivable); err != nil {
		return fmt.Errorf("update partner receivable settlement: %w", err)
	}
}
```

Path 2 - Balance-only (lines 406-413): After updating owner receivable, add:
```go
if ledger.PartnerReceivableAccountID != nil {
	if err := repos.AccountRepo.UpdateBalance(ctx, *ledger.PartnerReceivableAccountID, netReceivable); err != nil {
		return fmt.Errorf("update partner receivable settlement: %w", err)
	}
}
```

**Step 3: Implement partner balance sync in SettleAll**

Same pattern as Settle but inside the loop. After each expense's owner receivable update, add:
```go
if ledger.PartnerReceivableAccountID != nil {
	if err := repos.AccountRepo.UpdateBalance(ctx, *ledger.PartnerReceivableAccountID, netReceivable); err != nil {
		return fmt.Errorf("update partner receivable settlement: %w", err)
	}
}
```

**Step 4: Run all Settle tests**

Run: `cd backend && go test ./internal/usecase/ -run TestSharedExpenseService_Settle -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/internal/usecase/shared_expense_service.go backend/internal/usecase/shared_expense_service_test.go
git commit -m "feat: sync partner receivable balance on settlement"
```

---

### Task 7: Add Partner Balance Sync to SheetSyncService

**Files:**
- Modify: `backend/internal/usecase/sheet_sync_service.go:323-392`

**Step 1: Implement partner balance sync in createExpenseWithReceivable**

In `createExpenseWithReceivable`, after the receivable balance update (line 368), add:

```go
if ledger.PartnerReceivableAccountID != nil {
	if err := repos.AccountRepo.UpdateBalance(ctx, *ledger.PartnerReceivableAccountID, -balanceDelta); err != nil {
		return fmt.Errorf("update partner receivable balance: %w", err)
	}
}
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./internal/usecase/...`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add backend/internal/usecase/sheet_sync_service.go
git commit -m "feat: sync partner receivable balance in sheet sync"
```

---

### Task 8: SQL Migration for Existing Data

**Files:**
- Create: `backend/cmd/migrate/20260225_add_partner_receivable_accounts.sql`

**Step 1: Write the migration SQL**

This migration creates RECEIVABLE accounts for existing partners and links them:

```sql
-- Migration: Create partner receivable accounts for existing shared ledgers
-- For ledgers where partner has joined but no partner_receivable_account_id exists

DO $$
DECLARE
    rec RECORD;
    new_acct_id UUID;
    owner_balance DECIMAL(19,4);
BEGIN
    FOR rec IN
        SELECT sl.id AS ledger_id, sl.partner_id, sl.name, sl.currency, sl.receivable_account_id
        FROM shared_ledgers sl
        WHERE sl.partner_id IS NOT NULL
          AND sl.partner_receivable_account_id IS NULL
    LOOP
        -- Get owner's current receivable balance
        SELECT COALESCE(a.balance, 0) INTO owner_balance
        FROM accounts a
        WHERE a.id = rec.receivable_account_id;

        -- Create partner receivable account
        new_acct_id := gen_random_uuid();
        INSERT INTO accounts (id, user_id, name, type, currency, balance, created_at)
        VALUES (
            new_acct_id,
            rec.partner_id,
            '應收帳款 - ' || rec.name,
            'RECEIVABLE',
            rec.currency,
            -owner_balance,  -- mirror balance
            NOW()
        );

        -- Link to shared ledger
        UPDATE shared_ledgers
        SET partner_receivable_account_id = new_acct_id
        WHERE id = rec.ledger_id;

        RAISE NOTICE 'Created partner receivable account for ledger %', rec.ledger_id;
    END LOOP;
END $$;
```

**Step 2: Run GORM AutoMigrate to add the column first**

Run: `cd backend && go run cmd/migrate/main.go`
Expected: SUCCESS (GORM adds the nullable column)

**Step 3: Run the SQL migration**

Run: `docker exec -i zenbill_db psql -U zenbill -d zenbill_db < cmd/migrate/20260225_add_partner_receivable_accounts.sql`
Expected: NOTICE messages for each migrated ledger

**Step 4: Verify migration**

Run: `docker exec -i zenbill_db psql -U zenbill -d zenbill_db -c "SELECT sl.id, sl.name, sl.partner_receivable_account_id, a.balance FROM shared_ledgers sl LEFT JOIN accounts a ON a.id = sl.partner_receivable_account_id WHERE sl.partner_id IS NOT NULL;"`
Expected: All rows have partner_receivable_account_id set, balances are negation of owner's

**Step 5: Commit**

```bash
git add backend/cmd/migrate/20260225_add_partner_receivable_accounts.sql
git commit -m "feat: add migration for existing partner receivable accounts"
```

---

### Task 9: Run Full Test Suite and Verify

**Step 1: Run all backend tests**

Run: `cd backend && go test ./... -v`
Expected: ALL PASS

**Step 2: Run lint check**

Run: `cd backend && golangci-lint run`
Expected: No errors

**Step 3: Final commit if any fixes needed**
