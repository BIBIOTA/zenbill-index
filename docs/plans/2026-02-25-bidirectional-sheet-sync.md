# Bidirectional Google Sheet Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable full CRUD sync between ZenBill SharedExpense and Google Sheet, with conflict detection and resolution.

**Architecture:** Add a hidden Column J (ZenBillID) to Google Sheet for stable UUID mapping. Use content hashing to detect modifications on both sides. Conflicts are stored in a new `sync_conflicts` table and resolved via dedicated API + UI.

**Tech Stack:** Go 1.22+, GORM, Google Sheets API v4, React + TypeScript frontend

**Design doc:** `docs/plans/2026-02-25-bidirectional-sheet-sync-design.md`

---

## Task 1: Add `content_hash` and `sync_status` to SharedExpense Domain

**Files:**
- Modify: `backend/internal/domain/shared_expense.go` (lines 37-67 struct, lines 243-256 repo interface)
- Modify: `backend/internal/domain/shared_expense_test.go`

**Step 1: Add fields to SharedExpense struct**

In `shared_expense.go`, add two fields to the `SharedExpense` struct (after `SourceType`):

```go
ContentHash string     `json:"content_hash" gorm:"type:varchar(64)"`
SyncStatus  string     `json:"sync_status" gorm:"type:varchar(20);default:'synced'"`
```

**Step 2: Add ContentHash computation method**

Add after `ReceivableAmount()`:

```go
import "crypto/sha256"

func (e *SharedExpense) ComputeContentHash() string {
	data := fmt.Sprintf("%s|%s|%s|%.2f|%.2f|%s|%.2f|%.2f",
		e.Date.Format("2006-01-02"),
		e.Category,
		e.Description,
		e.OwnerPaidAmount,
		e.PartnerPaidAmount,
		string(e.SplitMethod),
		e.OwnerAmount,
		e.PartnerAmount,
	)
	hash := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%x", hash)
}
```

**Step 3: Add SyncStatus constants**

```go
const (
	SyncStatusSynced       = "synced"
	SyncStatusModified     = "modified"
	SyncStatusConflict     = "conflict"
	SyncStatusPendingDelete = "pending_delete"
)
```

**Step 4: Add repository methods to interface**

Add to `SharedExpenseRepository` interface:

```go
FindModifiedByLedgerID(ctx context.Context, ledgerID uuid.UUID) ([]*SharedExpense, error)
FindPendingDeleteByLedgerID(ctx context.Context, ledgerID uuid.UUID) ([]*SharedExpense, error)
FindSyncedByLedgerID(ctx context.Context, ledgerID uuid.UUID) ([]*SharedExpense, error)
HardDelete(ctx context.Context, id uuid.UUID) error
```

**Step 5: Write tests for ComputeContentHash**

In `shared_expense_test.go`, add:

```go
func TestComputeContentHash(t *testing.T) {
	e := &SharedExpense{
		Date:             time.Date(2026, 2, 25, 0, 0, 0, 0, time.UTC),
		Category:         "food",
		Description:      "午餐",
		OwnerPaidAmount:  100,
		PartnerPaidAmount: 0,
		SplitMethod:      SplitMethodEqual,
		OwnerAmount:      50,
		PartnerAmount:    50,
	}

	hash1 := e.ComputeContentHash()
	assert.Len(t, hash1, 64) // SHA256 hex length

	// Same data = same hash
	hash2 := e.ComputeContentHash()
	assert.Equal(t, hash1, hash2)

	// Different data = different hash
	e.Description = "晚餐"
	hash3 := e.ComputeContentHash()
	assert.NotEqual(t, hash1, hash3)
}
```

**Step 6: Run tests**

```bash
cd backend && go test ./internal/domain/... -v -run TestComputeContentHash
```

**Step 7: Commit**

```bash
git add backend/internal/domain/shared_expense.go backend/internal/domain/shared_expense_test.go
git commit -m "feat: add content_hash and sync_status to SharedExpense domain"
```

---

## Task 2: Add SyncConflict Domain Entity

**Files:**
- Create: `backend/internal/domain/sync_conflict.go`
- Create: `backend/internal/domain/sync_conflict_test.go`

**Step 1: Create SyncConflict entity**

Create `backend/internal/domain/sync_conflict.go`:

```go
package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

const (
	ConflictTypeBothModified       = "both_modified"
	ConflictTypeDeletedButModified = "deleted_but_modified"

	ResolutionKeepZenBill = "keep_zenbill"
	ResolutionKeepSheet   = "keep_sheet"
	ResolutionManualMerge = "manual_merge"
)

type SyncConflict struct {
	ID           uuid.UUID      `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ExpenseID    uuid.UUID      `json:"expense_id" gorm:"type:uuid;not null;index"`
	LedgerID     uuid.UUID      `json:"ledger_id" gorm:"type:uuid;not null;index"`
	ConflictType string         `json:"conflict_type" gorm:"type:varchar(30);not null"`
	ZenBillData  datatypes.JSON `json:"zenbill_data" gorm:"type:jsonb"`
	SheetData    datatypes.JSON `json:"sheet_data" gorm:"type:jsonb"`
	ResolvedAt   *time.Time     `json:"resolved_at"`
	Resolution   string         `json:"resolution" gorm:"type:varchar(20)"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

func (c *SyncConflict) IsResolved() bool {
	return c.ResolvedAt != nil
}

type SyncConflictRepository interface {
	Create(ctx context.Context, conflict *SyncConflict) error
	FindByID(ctx context.Context, id uuid.UUID) (*SyncConflict, error)
	FindUnresolvedByLedgerID(ctx context.Context, ledgerID uuid.UUID) ([]*SyncConflict, error)
	Update(ctx context.Context, conflict *SyncConflict) error
}
```

**Step 2: Write basic test**

Create `backend/internal/domain/sync_conflict_test.go`:

```go
package domain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestSyncConflict_IsResolved(t *testing.T) {
	c := &SyncConflict{}
	assert.False(t, c.IsResolved())

	now := time.Now()
	c.ResolvedAt = &now
	assert.True(t, c.IsResolved())
}
```

**Step 3: Run tests**

```bash
cd backend && go test ./internal/domain/... -v -run TestSyncConflict
```

**Step 4: Commit**

```bash
git add backend/internal/domain/sync_conflict.go backend/internal/domain/sync_conflict_test.go
git commit -m "feat: add SyncConflict domain entity"
```

---

## Task 3: Implement Repository Layer

**Files:**
- Modify: `backend/internal/repository/shared_expense_repository.go` (add new methods)
- Create: `backend/internal/repository/sync_conflict_repository.go`

**Step 1: Add new methods to SharedExpenseRepositoryImpl**

In `shared_expense_repository.go`, add after existing methods:

```go
func (r *SharedExpenseRepositoryImpl) FindModifiedByLedgerID(ctx context.Context, ledgerID uuid.UUID) ([]*domain.SharedExpense, error) {
	var expenses []*domain.SharedExpense
	err := r.db.WithContext(ctx).
		Where("ledger_id = ? AND sync_status = ?", ledgerID, domain.SyncStatusModified).
		Find(&expenses).Error
	return expenses, err
}

func (r *SharedExpenseRepositoryImpl) FindPendingDeleteByLedgerID(ctx context.Context, ledgerID uuid.UUID) ([]*domain.SharedExpense, error) {
	var expenses []*domain.SharedExpense
	err := r.db.WithContext(ctx).
		Where("ledger_id = ? AND sync_status = ?", ledgerID, domain.SyncStatusPendingDelete).
		Find(&expenses).Error
	return expenses, err
}

func (r *SharedExpenseRepositoryImpl) FindSyncedByLedgerID(ctx context.Context, ledgerID uuid.UUID) ([]*domain.SharedExpense, error) {
	var expenses []*domain.SharedExpense
	err := r.db.WithContext(ctx).
		Where("ledger_id = ? AND google_sheet_row_index IS NOT NULL", ledgerID).
		Find(&expenses).Error
	return expenses, err
}

func (r *SharedExpenseRepositoryImpl) HardDelete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Unscoped().Where("id = ?", id).Delete(&domain.SharedExpense{}).Error
}
```

**Step 2: Create SyncConflictRepositoryImpl**

Create `backend/internal/repository/sync_conflict_repository.go`:

```go
package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
)

type SyncConflictRepositoryImpl struct {
	db *gorm.DB
}

func NewSyncConflictRepository(db *gorm.DB) domain.SyncConflictRepository {
	return &SyncConflictRepositoryImpl{db: db}
}

func (r *SyncConflictRepositoryImpl) Create(ctx context.Context, conflict *domain.SyncConflict) error {
	return r.db.WithContext(ctx).Create(conflict).Error
}

func (r *SyncConflictRepositoryImpl) FindByID(ctx context.Context, id uuid.UUID) (*domain.SyncConflict, error) {
	var conflict domain.SyncConflict
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&conflict).Error
	return &conflict, err
}

func (r *SyncConflictRepositoryImpl) FindUnresolvedByLedgerID(ctx context.Context, ledgerID uuid.UUID) ([]*domain.SyncConflict, error) {
	var conflicts []*domain.SyncConflict
	err := r.db.WithContext(ctx).
		Where("ledger_id = ? AND resolved_at IS NULL", ledgerID).
		Order("created_at DESC").
		Find(&conflicts).Error
	return conflicts, err
}

func (r *SyncConflictRepositoryImpl) Update(ctx context.Context, conflict *domain.SyncConflict) error {
	return r.db.WithContext(ctx).Save(conflict).Error
}
```

**Step 3: Run build check**

```bash
cd backend && go build ./...
```

**Step 4: Commit**

```bash
git add backend/internal/repository/shared_expense_repository.go backend/internal/repository/sync_conflict_repository.go
git commit -m "feat: add sync-related repository methods and SyncConflict repo"
```

---

## Task 4: Add Database Migration

**Files:**
- Modify: `backend/cmd/migrate/main.go` (add SyncConflict to AutoMigrate)

**Step 1: Add SyncConflict to AutoMigrate list**

In `backend/cmd/migrate/main.go`, add `&domain.SyncConflict{}` after `&domain.SharedExpense{}` in the AutoMigrate call (around line 65):

```go
&domain.SharedExpense{},
&domain.SyncConflict{},  // NEW
```

Also add to `dropAllTables` in reverse order (SyncConflict before SharedExpense).

**Step 2: Run migration locally**

```bash
cd backend && go run cmd/migrate/main.go
```

Verify: `shared_expenses` table has `content_hash` and `sync_status` columns; `sync_conflicts` table exists.

**Step 3: Commit**

```bash
git add backend/cmd/migrate/main.go
git commit -m "feat: add SyncConflict table and new SharedExpense columns to migration"
```

---

## Task 5: Extend Google Sheet Client with Column Management

**Files:**
- Modify: `backend/pkg/googlesheet/client.go`

**Step 1: Add HideColumn method**

Add to `client.go`:

```go
import "google.golang.org/api/sheets/v4"

// GetSheetID returns the internal sheetId for a given tab name (needed for dimension APIs).
func (c *Client) GetSheetID(ctx context.Context, spreadsheetID, tabName string) (int64, error) {
	resp, err := c.service.Spreadsheets.Get(spreadsheetID).Context(ctx).Do()
	if err != nil {
		return 0, fmt.Errorf("get spreadsheet: %w", err)
	}
	for _, sheet := range resp.Sheets {
		if sheet.Properties.Title == tabName {
			return sheet.Properties.SheetId, nil
		}
	}
	return 0, fmt.Errorf("tab %q not found", tabName)
}

// HideColumn hides a column by its 0-based index.
func (c *Client) HideColumn(ctx context.Context, spreadsheetID string, sheetID int64, colIndex int64) error {
	req := &sheets.BatchUpdateSpreadsheetRequest{
		Requests: []*sheets.Request{
			{
				UpdateDimensionProperties: &sheets.UpdateDimensionPropertiesRequest{
					Properties: &sheets.DimensionProperties{
						HiddenByUser: true,
					},
					Range: &sheets.DimensionRange{
						SheetId:    sheetID,
						Dimension:  "COLUMNS",
						StartIndex: colIndex,
						EndIndex:   colIndex + 1,
					},
					Fields: "hiddenByUser",
				},
			},
		},
	}
	_, err := c.service.Spreadsheets.BatchUpdate(spreadsheetID, req).Context(ctx).Do()
	return err
}

// DeleteRows deletes rows by their 0-based indices. Indices must be sorted descending to avoid shifting.
func (c *Client) DeleteRows(ctx context.Context, spreadsheetID string, sheetID int64, rowIndices []int) error {
	var requests []*sheets.Request
	// Must delete from bottom to top to avoid index shifting
	for _, idx := range rowIndices {
		requests = append(requests, &sheets.Request{
			DeleteDimension: &sheets.DeleteDimensionRequest{
				Range: &sheets.DimensionRange{
					SheetId:    sheetID,
					Dimension:  "ROWS",
					StartIndex: int64(idx),
					EndIndex:   int64(idx + 1),
				},
			},
		})
	}
	if len(requests) == 0 {
		return nil
	}
	_, err := c.service.Spreadsheets.BatchUpdate(spreadsheetID, &sheets.BatchUpdateSpreadsheetRequest{
		Requests: requests,
	}).Context(ctx).Do()
	return err
}
```

**Step 2: Run build check**

```bash
cd backend && go build ./pkg/googlesheet/...
```

**Step 3: Commit**

```bash
git add backend/pkg/googlesheet/client.go
git commit -m "feat: add HideColumn, DeleteRows, GetSheetID to Google Sheet client"
```

---

## Task 6: Update Mapper for Column J (ZenBillID)

**Files:**
- Modify: `backend/pkg/googlesheet/mapper.go`

**Step 1: Update ExpenseToRow to include Column J**

In `mapper.go`, modify `ExpenseToRow` to append UUID as 10th element:

```go
// ExpenseToRow converts a SharedExpense to a sheet row (10 columns: A-J).
func ExpenseToRow(e *domain.SharedExpense, ownerAliases, partnerAliases []string) []interface{} {
	// ... existing 9-column logic unchanged ...
	row := []interface{}{
		// ... existing A-I columns ...
	}
	// Column J: ZenBillID
	row = append(row, e.ID.String())
	return row
}
```

**Step 2: Update RowToExpenseInput to read Column J**

Add a return value for the ZenBill UUID found in column J:

```go
// RowToExpenseInput parses a sheet row into a SharedExpense.
// Returns the expense and the ZenBillID from Column J (empty string if not present).
func RowToExpenseInput(row []interface{}, ownerAliases, partnerAliases []string) (*domain.SharedExpense, string, error) {
	// ... existing parsing logic for cols 0-8 ...

	// Column J: ZenBillID (optional)
	var zenBillID string
	if len(row) > 9 {
		if id, ok := row[9].(string); ok {
			zenBillID = id
		}
	}

	return expense, zenBillID, nil
}
```

**Step 3: Update sheetColRange constant**

In `sheet_sync_service.go`, change:

```go
sheetColRange = "A:J"  // was "A:I"
```

**Step 4: Run build check**

```bash
cd backend && go build ./...
```

**Step 5: Commit**

```bash
git add backend/pkg/googlesheet/mapper.go backend/internal/usecase/sheet_sync_service.go
git commit -m "feat: extend mapper and column range for Column J (ZenBillID)"
```

---

## Task 7: Rewrite SyncToSheet for Bidirectional Push

**Files:**
- Modify: `backend/internal/usecase/sheet_sync_service.go` (SyncToSheet method, lines 60-143)

**Step 1: Add helper to build UUID→Row mapping from Sheet data**

Add a private method to SheetSyncService:

```go
// buildSheetMapping reads all rows from the form tab and returns a map of ZenBillID → row index (1-based sheet row number).
func (s *SheetSyncService) buildSheetMapping(ctx context.Context, client *googlesheet.Client, spreadsheetID string) (map[string]int, error) {
	rows, err := client.ReadSheet(ctx, spreadsheetID, sheetTabForm+"!A:J")
	if err != nil {
		return nil, fmt.Errorf("read sheet for mapping: %w", err)
	}
	mapping := make(map[string]int)
	for i, row := range rows {
		if i < 2 { // skip empty row 1 and header row 2
			continue
		}
		if len(row) > 9 {
			if id, ok := row[9].(string); ok && id != "" {
				mapping[id] = i + 1 // convert 0-based index to 1-based sheet row
			}
		}
	}
	return mapping, nil
}
```

**Step 2: Rewrite SyncToSheet**

Replace the existing `SyncToSheet` method with the new version that handles new, modified, and deleted records:

```go
func (s *SheetSyncService) SyncToSheet(ctx context.Context, ledgerID uuid.UUID) (int, error) {
	ledger, err := s.ledgerRepo.FindByID(ctx, ledgerID)
	if err != nil {
		return 0, fmt.Errorf("find ledger: %w", err)
	}
	if ledger.GoogleSheetID == "" {
		return 0, fmt.Errorf("google sheet not configured")
	}

	client, err := s.clientForLedger(ctx, ledger)
	if err != nil {
		return 0, fmt.Errorf("create sheets client: %w", err)
	}

	count := 0

	// 1. Push NEW records (same as before)
	unsynced, err := s.expenseRepo.FindUnsyncedByLedgerID(ctx, ledgerID)
	if err != nil {
		return 0, fmt.Errorf("find unsynced: %w", err)
	}
	if len(unsynced) > 0 {
		var rows [][]interface{}
		for _, e := range unsynced {
			rows = append(rows, googlesheet.ExpenseToRow(e, ledger.OwnerAliases, ledger.PartnerAliases))
		}
		if err := client.AppendRows(ctx, ledger.GoogleSheetID, sheetTabForm+"!A:J", rows); err != nil {
			return 0, fmt.Errorf("append to form tab: %w", err)
		}
		// Also append to split tab
		lastRow, err := client.GetLastDataRow(ctx, ledger.GoogleSheetID, sheetTabSplit+"!A:A")
		if err != nil {
			s.logger.Warn("failed to get last row of split tab", "error", err)
		} else {
			startRow := lastRow + 1
			if startRow < 4 {
				startRow = 4
			}
			writeRange := fmt.Sprintf("%s!A%d:J%d", sheetTabSplit, startRow, startRow+len(rows)-1)
			if err := client.UpdateRows(ctx, ledger.GoogleSheetID, writeRange, rows, false); err != nil {
				s.logger.Warn("failed to write split tab", "error", err)
			}
		}
		now := time.Now()
		for _, e := range unsynced {
			e.SyncedAt = &now
			e.ContentHash = e.ComputeContentHash()
			e.SyncStatus = domain.SyncStatusSynced
			// Row index will be refreshed on next pull
			idx := 1
			e.GoogleSheetRowIndex = &idx
			if err := s.expenseRepo.Update(ctx, e); err != nil {
				s.logger.Error("failed to mark expense synced", "id", e.ID, "error", err)
			}
		}
		count += len(unsynced)
	}

	// 2. Push MODIFIED records
	modified, err := s.expenseRepo.FindModifiedByLedgerID(ctx, ledgerID)
	if err != nil {
		return count, fmt.Errorf("find modified: %w", err)
	}
	if len(modified) > 0 {
		mapping, err := s.buildSheetMapping(ctx, client, ledger.GoogleSheetID)
		if err != nil {
			return count, fmt.Errorf("build mapping: %w", err)
		}
		for _, e := range modified {
			rowNum, ok := mapping[e.ID.String()]
			if !ok {
				s.logger.Warn("modified expense not found in sheet", "id", e.ID)
				continue
			}
			row := googlesheet.ExpenseToRow(e, ledger.OwnerAliases, ledger.PartnerAliases)
			writeRange := fmt.Sprintf("%s!A%d:J%d", sheetTabForm, rowNum, rowNum)
			if err := client.UpdateRows(ctx, ledger.GoogleSheetID, writeRange, [][]interface{}{row}, false); err != nil {
				s.logger.Error("failed to update sheet row", "id", e.ID, "row", rowNum, "error", err)
				continue
			}
			now := time.Now()
			e.SyncedAt = &now
			e.ContentHash = e.ComputeContentHash()
			e.SyncStatus = domain.SyncStatusSynced
			e.GoogleSheetRowIndex = &rowNum
			if err := s.expenseRepo.Update(ctx, e); err != nil {
				s.logger.Error("failed to update expense after push", "id", e.ID, "error", err)
			}
			count++
		}
	}

	// 3. Push DELETES
	pendingDelete, err := s.expenseRepo.FindPendingDeleteByLedgerID(ctx, ledgerID)
	if err != nil {
		return count, fmt.Errorf("find pending delete: %w", err)
	}
	if len(pendingDelete) > 0 {
		mapping, err := s.buildSheetMapping(ctx, client, ledger.GoogleSheetID)
		if err != nil {
			return count, fmt.Errorf("build mapping for delete: %w", err)
		}
		tabName := sheetTabForm
		sheetID, err := client.GetSheetID(ctx, ledger.GoogleSheetID, tabName)
		if err != nil {
			return count, fmt.Errorf("get sheet id: %w", err)
		}
		// Collect row indices in descending order for deletion
		var rowIndices []int
		var expensesToHardDelete []*domain.SharedExpense
		for _, e := range pendingDelete {
			rowNum, ok := mapping[e.ID.String()]
			if !ok {
				s.logger.Warn("deleted expense not found in sheet, hard-deleting locally", "id", e.ID)
				expensesToHardDelete = append(expensesToHardDelete, e)
				continue
			}
			rowIndices = append(rowIndices, rowNum-1) // convert 1-based to 0-based for API
			expensesToHardDelete = append(expensesToHardDelete, e)
		}
		// Sort descending to avoid index shifting
		sort.Sort(sort.Reverse(sort.IntSlice(rowIndices)))
		if len(rowIndices) > 0 {
			if err := client.DeleteRows(ctx, ledger.GoogleSheetID, sheetID, rowIndices); err != nil {
				s.logger.Error("failed to delete sheet rows", "error", err)
			}
		}
		for _, e := range expensesToHardDelete {
			if err := s.expenseRepo.HardDelete(ctx, e.ID); err != nil {
				s.logger.Error("failed to hard-delete expense", "id", e.ID, "error", err)
			}
			count++
		}
	}

	return count, nil
}
```

**Step 3: Run build check**

```bash
cd backend && go build ./internal/usecase/...
```

**Step 4: Commit**

```bash
git add backend/internal/usecase/sheet_sync_service.go
git commit -m "feat: rewrite SyncToSheet for new/modified/deleted push"
```

---

## Task 8: Rewrite SyncFromSheet for Bidirectional Pull

**Files:**
- Modify: `backend/internal/usecase/sheet_sync_service.go` (SyncFromSheet method, lines 148-225)

**Step 1: Add SyncConflict dependencies to SheetSyncService**

Add `conflictRepo` to the struct:

```go
type SheetSyncService struct {
	encryptor    *crypto.Encryptor
	expenseRepo  domain.SharedExpenseRepository
	ledgerRepo   domain.SharedLedgerRepository
	conflictRepo domain.SyncConflictRepository
	logger       *slog.Logger
}
```

Update `NewSheetSyncService` to accept the new dependency.

**Step 2: Add helper to create conflict records**

```go
func (s *SheetSyncService) createConflict(ctx context.Context, expense *domain.SharedExpense, sheetExpense *domain.SharedExpense, conflictType string) error {
	zenbillJSON, _ := json.Marshal(expense)
	var sheetJSON []byte
	if sheetExpense != nil {
		sheetJSON, _ = json.Marshal(sheetExpense)
	}
	conflict := &domain.SyncConflict{
		ExpenseID:    expense.ID,
		LedgerID:     expense.LedgerID,
		ConflictType: conflictType,
		ZenBillData:  datatypes.JSON(zenbillJSON),
		SheetData:    datatypes.JSON(sheetJSON),
	}
	expense.SyncStatus = domain.SyncStatusConflict
	if err := s.expenseRepo.Update(ctx, expense); err != nil {
		return fmt.Errorf("update expense status: %w", err)
	}
	return s.conflictRepo.Create(ctx, conflict)
}
```

**Step 3: Rewrite SyncFromSheet**

Replace the existing method. The new version:
1. Reads all Sheet rows (A:J)
2. Builds UUID→row mapping from Column J
3. For rows without UUID: creates new expense, writes UUID back to Sheet
4. For rows with UUID: compares content hash, detects modifications/conflicts
5. For ZenBill records not in Sheet: detects deletions/conflicts

```go
func (s *SheetSyncService) SyncFromSheet(ctx context.Context, ledgerID uuid.UUID) (pulled int, conflicts int, err error) {
	ledger, err := s.ledgerRepo.FindByID(ctx, ledgerID)
	if err != nil {
		return 0, 0, fmt.Errorf("find ledger: %w", err)
	}
	if ledger.GoogleSheetID == "" {
		return 0, 0, fmt.Errorf("google sheet not configured")
	}

	client, err := s.clientForLedger(ctx, ledger)
	if err != nil {
		return 0, 0, fmt.Errorf("create sheets client: %w", err)
	}

	// Read all sheet rows including Column J
	rows, err := client.ReadSheet(ctx, ledger.GoogleSheetID, sheetTabForm+"!A:J")
	if err != nil {
		return 0, 0, fmt.Errorf("read sheet: %w", err)
	}

	// Load all synced expenses for comparison
	syncedExpenses, err := s.expenseRepo.FindSyncedByLedgerID(ctx, ledgerID)
	if err != nil {
		return 0, 0, fmt.Errorf("find synced expenses: %w", err)
	}
	expenseByID := make(map[string]*domain.SharedExpense)
	for _, e := range syncedExpenses {
		expenseByID[e.ID.String()] = e
	}

	// Also load all expenses (including soft-deleted) for dedup
	allExpenses, err := s.expenseRepo.FindAllByLedgerID(ctx, ledgerID)
	if err != nil {
		return 0, 0, fmt.Errorf("find all expenses: %w", err)
	}
	existingKeys := make(map[string]bool)
	for _, e := range allExpenses {
		key := e.CreatedAt.Format(time.RFC3339) + "|" + e.Description
		existingKeys[key] = true
	}

	// Track which synced expense IDs appear in the sheet
	sheetExpenseIDs := make(map[string]bool)

	// Process each row
	var newRowUUIDs []struct{ row int; id string }
	for i, row := range rows {
		if i < 2 { // skip empty row 1 and header row 2
			continue
		}
		sheetRowNum := i + 1 // 1-based

		expense, zenBillID, parseErr := googlesheet.RowToExpenseInput(row, ledger.OwnerAliases, ledger.PartnerAliases)
		if parseErr != nil {
			s.logger.Warn("failed to parse sheet row", "row", sheetRowNum, "error", parseErr)
			continue
		}

		if zenBillID == "" {
			// NEW row from Sheet — check dedup
			key := expense.CreatedAt.Format(time.RFC3339) + "|" + expense.Description
			if existingKeys[key] {
				continue
			}

			expense.LedgerID = ledgerID
			expense.SourceType = "google_sheet"
			expense.SyncStatus = domain.SyncStatusSynced
			expense.GoogleSheetRowIndex = &sheetRowNum
			now := time.Now()
			expense.SyncedAt = &now
			if err := s.expenseRepo.Create(ctx, expense); err != nil {
				s.logger.Error("failed to create expense from sheet", "row", sheetRowNum, "error", err)
				continue
			}
			expense.ContentHash = expense.ComputeContentHash()
			s.expenseRepo.Update(ctx, expense)

			// Queue UUID write-back to Sheet
			newRowUUIDs = append(newRowUUIDs, struct{ row int; id string }{row: sheetRowNum, id: expense.ID.String()})
			pulled++
		} else {
			// EXISTING row — check for modifications
			sheetExpenseIDs[zenBillID] = true
			existing, ok := expenseByID[zenBillID]
			if !ok {
				s.logger.Warn("sheet has UUID not found in ZenBill (may be deleted locally)", "uuid", zenBillID)
				continue
			}

			// Compute sheet content hash
			sheetHash := expense.ComputeContentHash()
			if sheetHash == existing.ContentHash {
				// No change — update row index in case it drifted
				existing.GoogleSheetRowIndex = &sheetRowNum
				s.expenseRepo.Update(ctx, existing)
				continue
			}

			// Sheet was modified
			if existing.SyncStatus == domain.SyncStatusModified || existing.SyncStatus == domain.SyncStatusConflict {
				// Both sides modified → conflict
				if err := s.createConflict(ctx, existing, expense, domain.ConflictTypeBothModified); err != nil {
					s.logger.Error("failed to create conflict", "id", zenBillID, "error", err)
				}
				conflicts++
			} else {
				// Only sheet modified → update ZenBill
				existing.Date = expense.Date
				existing.Category = expense.Category
				existing.Description = expense.Description
				existing.OwnerPaidAmount = expense.OwnerPaidAmount
				existing.PartnerPaidAmount = expense.PartnerPaidAmount
				existing.SplitMethod = expense.SplitMethod
				existing.OwnerAmount = expense.OwnerAmount
				existing.PartnerAmount = expense.PartnerAmount
				existing.PayerName = expense.PayerName
				existing.TotalAmount = expense.OwnerPaidAmount + expense.PartnerPaidAmount
				existing.ContentHash = sheetHash
				existing.GoogleSheetRowIndex = &sheetRowNum
				now := time.Now()
				existing.SyncedAt = &now
				if err := s.expenseRepo.Update(ctx, existing); err != nil {
					s.logger.Error("failed to update expense from sheet", "id", zenBillID, "error", err)
				}
				pulled++
			}
		}
	}

	// Write back UUIDs for new rows
	for _, item := range newRowUUIDs {
		writeRange := fmt.Sprintf("%s!J%d", sheetTabForm, item.row)
		if err := client.UpdateRows(ctx, ledger.GoogleSheetID, writeRange, [][]interface{}{{item.id}}, true); err != nil {
			s.logger.Error("failed to write UUID to sheet", "row", item.row, "error", err)
		}
	}

	// Detect deletions: synced expenses not found in sheet
	for id, existing := range expenseByID {
		if sheetExpenseIDs[id] {
			continue
		}
		// This expense was in sheet before but now missing → deleted from sheet
		if existing.SyncStatus == domain.SyncStatusModified {
			// ZenBill modified but sheet deleted → conflict
			if err := s.createConflict(ctx, existing, nil, domain.ConflictTypeDeletedButModified); err != nil {
				s.logger.Error("failed to create delete conflict", "id", id, "error", err)
			}
			conflicts++
		} else {
			// Sheet deleted, ZenBill not modified → soft-delete
			if err := s.expenseRepo.Delete(ctx, existing.ID); err != nil {
				s.logger.Error("failed to soft-delete expense", "id", id, "error", err)
			}
			pulled++
		}
	}

	return pulled, conflicts, nil
}
```

**Step 4: Update Sync() method return signature**

```go
func (s *SheetSyncService) Sync(ctx context.Context, ledgerID uuid.UUID) (pushed, pulled, conflicts int, err error) {
	pushed, err = s.SyncToSheet(ctx, ledgerID)
	if err != nil {
		s.logger.Error("sync to sheet failed", "ledgerID", ledgerID, "error", err)
	}
	pulled, conflicts, err = s.SyncFromSheet(ctx, ledgerID)
	if err != nil {
		s.logger.Error("sync from sheet failed", "ledgerID", ledgerID, "error", err)
	}
	return
}
```

**Step 5: Run build check**

```bash
cd backend && go build ./...
```

**Step 6: Commit**

```bash
git add backend/internal/usecase/sheet_sync_service.go
git commit -m "feat: rewrite SyncFromSheet with modification/deletion/conflict detection"
```

---

## Task 9: Add Hidden Column Setup Logic

**Files:**
- Modify: `backend/internal/usecase/sheet_sync_service.go`

**Step 1: Add ensureColumnJ helper**

This method checks if Column J header exists and hides it if needed:

```go
// ensureColumnJ checks if Column J has the "ZenBillID" header and sets it up if missing.
func (s *SheetSyncService) ensureColumnJ(ctx context.Context, client *googlesheet.Client, ledger *domain.SharedLedger) error {
	// Read header row (row 2 in 表單)
	headerRange := sheetTabForm + "!A2:J2"
	rows, err := client.ReadSheet(ctx, ledger.GoogleSheetID, headerRange)
	if err != nil {
		return fmt.Errorf("read header: %w", err)
	}

	needsSetup := true
	if len(rows) > 0 && len(rows[0]) > 9 {
		if header, ok := rows[0][9].(string); ok && header == "ZenBillID" {
			needsSetup = false
		}
	}

	if needsSetup {
		// Write header
		if err := client.UpdateRows(ctx, ledger.GoogleSheetID, sheetTabForm+"!J2", [][]interface{}{{"ZenBillID"}}, true); err != nil {
			return fmt.Errorf("write header: %w", err)
		}

		// Hide column J (index 9)
		sheetID, err := client.GetSheetID(ctx, ledger.GoogleSheetID, sheetTabForm)
		if err != nil {
			return fmt.Errorf("get sheet id: %w", err)
		}
		if err := client.HideColumn(ctx, ledger.GoogleSheetID, sheetID, 9); err != nil {
			s.logger.Warn("failed to hide column J", "error", err)
			// Non-fatal: column works even if visible
		}
	}

	return nil
}
```

**Step 2: Call ensureColumnJ at the start of Sync()**

```go
func (s *SheetSyncService) Sync(ctx context.Context, ledgerID uuid.UUID) (pushed, pulled, conflicts int, err error) {
	ledger, err := s.ledgerRepo.FindByID(ctx, ledgerID)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("find ledger: %w", err)
	}
	client, err := s.clientForLedger(ctx, ledger)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("create client: %w", err)
	}
	if err := s.ensureColumnJ(ctx, client, ledger); err != nil {
		s.logger.Warn("failed to ensure column J", "error", err)
	}

	pushed, err = s.SyncToSheet(ctx, ledgerID)
	// ... rest unchanged ...
}
```

**Step 3: Add backfill logic for legacy rows**

Add a `backfillLegacyUUIDs` method that runs once to fill Column J for existing synced rows using composite key matching. Call this from `ensureColumnJ` when `needsSetup` is true.

```go
func (s *SheetSyncService) backfillLegacyUUIDs(ctx context.Context, client *googlesheet.Client, ledger *domain.SharedLedger) error {
	rows, err := client.ReadSheet(ctx, ledger.GoogleSheetID, sheetTabForm+"!A:J")
	if err != nil {
		return err
	}

	allExpenses, err := s.expenseRepo.FindAllByLedgerID(ctx, ledger.LedgerID)
	if err != nil {
		return err
	}
	// Build lookup by composite key
	byKey := make(map[string]*domain.SharedExpense)
	for _, e := range allExpenses {
		key := e.CreatedAt.Format(time.RFC3339) + "|" + e.Description
		byKey[key] = e
	}

	for i, row := range rows {
		if i < 2 {
			continue
		}
		// Skip if already has UUID
		if len(row) > 9 {
			if id, ok := row[9].(string); ok && id != "" {
				continue
			}
		}
		// Try to match by parsing the row
		expense, _, parseErr := googlesheet.RowToExpenseInput(row, ledger.OwnerAliases, ledger.PartnerAliases)
		if parseErr != nil {
			continue
		}
		key := expense.CreatedAt.Format(time.RFC3339) + "|" + expense.Description
		if matched, ok := byKey[key]; ok {
			sheetRowNum := i + 1
			writeRange := fmt.Sprintf("%s!J%d", sheetTabForm, sheetRowNum)
			if err := client.UpdateRows(ctx, ledger.GoogleSheetID, writeRange, [][]interface{}{{matched.ID.String()}}, true); err != nil {
				s.logger.Warn("failed to backfill UUID", "row", sheetRowNum, "error", err)
			}
			matched.ContentHash = matched.ComputeContentHash()
			matched.SyncStatus = domain.SyncStatusSynced
			matched.GoogleSheetRowIndex = &sheetRowNum
			s.expenseRepo.Update(ctx, matched)
		}
	}
	return nil
}
```

**Step 4: Run build check**

```bash
cd backend && go build ./...
```

**Step 5: Commit**

```bash
git add backend/internal/usecase/sheet_sync_service.go
git commit -m "feat: add hidden Column J setup and legacy UUID backfill"
```

---

## Task 10: Conflict Resolution Service

**Files:**
- Create: `backend/internal/usecase/conflict_resolution_service.go`

**Step 1: Create the service**

```go
package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
)

type ConflictResolutionService struct {
	conflictRepo domain.SyncConflictRepository
	expenseRepo  domain.SharedExpenseRepository
	syncService  *SheetSyncService
	logger       *slog.Logger
}

func NewConflictResolutionService(
	conflictRepo domain.SyncConflictRepository,
	expenseRepo domain.SharedExpenseRepository,
	syncService *SheetSyncService,
	logger *slog.Logger,
) *ConflictResolutionService {
	return &ConflictResolutionService{
		conflictRepo: conflictRepo,
		expenseRepo:  expenseRepo,
		syncService:  syncService,
		logger:       logger,
	}
}

func (s *ConflictResolutionService) ListUnresolved(ctx context.Context, ledgerID uuid.UUID) ([]*domain.SyncConflict, error) {
	return s.conflictRepo.FindUnresolvedByLedgerID(ctx, ledgerID)
}

type ResolveInput struct {
	Resolution string
	MergedData *domain.SharedExpense // only for manual_merge
}

func (s *ConflictResolutionService) Resolve(ctx context.Context, conflictID uuid.UUID, input ResolveInput) error {
	conflict, err := s.conflictRepo.FindByID(ctx, conflictID)
	if err != nil {
		return fmt.Errorf("find conflict: %w", err)
	}
	if conflict.IsResolved() {
		return fmt.Errorf("conflict already resolved")
	}

	expense, err := s.expenseRepo.FindByID(ctx, conflict.ExpenseID)
	if err != nil {
		return fmt.Errorf("find expense: %w", err)
	}

	switch input.Resolution {
	case domain.ResolutionKeepZenBill:
		// Mark as modified so next push overwrites sheet
		expense.SyncStatus = domain.SyncStatusModified
		if err := s.expenseRepo.Update(ctx, expense); err != nil {
			return fmt.Errorf("update expense: %w", err)
		}

	case domain.ResolutionKeepSheet:
		// Apply sheet data to expense
		var sheetExpense domain.SharedExpense
		if err := json.Unmarshal(conflict.SheetData, &sheetExpense); err != nil {
			return fmt.Errorf("unmarshal sheet data: %w", err)
		}
		expense.Date = sheetExpense.Date
		expense.Category = sheetExpense.Category
		expense.Description = sheetExpense.Description
		expense.OwnerPaidAmount = sheetExpense.OwnerPaidAmount
		expense.PartnerPaidAmount = sheetExpense.PartnerPaidAmount
		expense.SplitMethod = sheetExpense.SplitMethod
		expense.OwnerAmount = sheetExpense.OwnerAmount
		expense.PartnerAmount = sheetExpense.PartnerAmount
		expense.PayerName = sheetExpense.PayerName
		expense.TotalAmount = sheetExpense.OwnerPaidAmount + sheetExpense.PartnerPaidAmount
		expense.ContentHash = expense.ComputeContentHash()
		expense.SyncStatus = domain.SyncStatusSynced
		now := time.Now()
		expense.SyncedAt = &now
		if err := s.expenseRepo.Update(ctx, expense); err != nil {
			return fmt.Errorf("update expense: %w", err)
		}

	case domain.ResolutionManualMerge:
		if input.MergedData == nil {
			return fmt.Errorf("merged_data required for manual_merge")
		}
		expense.Date = input.MergedData.Date
		expense.Category = input.MergedData.Category
		expense.Description = input.MergedData.Description
		expense.OwnerPaidAmount = input.MergedData.OwnerPaidAmount
		expense.PartnerPaidAmount = input.MergedData.PartnerPaidAmount
		expense.SplitMethod = input.MergedData.SplitMethod
		expense.OwnerAmount = input.MergedData.OwnerAmount
		expense.PartnerAmount = input.MergedData.PartnerAmount
		expense.PayerName = input.MergedData.PayerName
		expense.TotalAmount = input.MergedData.OwnerPaidAmount + input.MergedData.PartnerPaidAmount
		expense.SyncStatus = domain.SyncStatusModified // will push to sheet
		if err := s.expenseRepo.Update(ctx, expense); err != nil {
			return fmt.Errorf("update expense: %w", err)
		}

	default:
		return fmt.Errorf("unknown resolution: %s", input.Resolution)
	}

	// Mark conflict as resolved
	now := time.Now()
	conflict.ResolvedAt = &now
	conflict.Resolution = input.Resolution
	if err := s.conflictRepo.Update(ctx, conflict); err != nil {
		return fmt.Errorf("update conflict: %w", err)
	}

	// Immediately trigger sync
	pushed, pulled, conflicts, syncErr := s.syncService.Sync(ctx, expense.LedgerID)
	if syncErr != nil {
		s.logger.Error("post-resolution sync failed", "error", syncErr)
	} else {
		s.logger.Info("post-resolution sync completed", "pushed", pushed, "pulled", pulled, "conflicts", conflicts)
	}

	return nil
}
```

**Step 2: Run build check**

```bash
cd backend && go build ./...
```

**Step 3: Commit**

```bash
git add backend/internal/usecase/conflict_resolution_service.go
git commit -m "feat: add ConflictResolutionService with immediate post-resolution sync"
```

---

## Task 11: Update HTTP Handler for Conflicts API

**Files:**
- Modify: `backend/internal/delivery/http/shared_ledger_handler.go`

**Step 1: Add conflict resolution service to handler**

Add `conflictService` field to `SharedLedgerHandler` and update constructor.

**Step 2: Update SyncSheet handler response**

Change the sync response to include `conflicts` count:

```go
c.JSON(http.StatusOK, gin.H{
	"pushed":    pushed,
	"pulled":    pulled,
	"conflicts": conflicts,
})
```

**Step 3: Add ListConflicts handler**

```go
func (h *SharedLedgerHandler) ListConflicts(c *gin.Context) {
	ledgerID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ledger id"})
		return
	}

	// Member check (same as GetLedger)
	userID := c.GetString("user_id")
	ledger, err := h.ledgerService.GetByID(c.Request.Context(), ledgerID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ledger not found"})
		return
	}
	uid, _ := uuid.Parse(userID)
	if !ledger.IsMember(uid) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member"})
		return
	}

	conflicts, err := h.conflictService.ListUnresolved(c.Request.Context(), ledgerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, conflicts)
}
```

**Step 4: Add ResolveConflict handler**

```go
type resolveConflictRequest struct {
	Resolution string                `json:"resolution" binding:"required"`
	MergedData *domain.SharedExpense `json:"merged_data"`
}

func (h *SharedLedgerHandler) ResolveConflict(c *gin.Context) {
	ledgerID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ledger id"})
		return
	}
	conflictID, err := uuid.Parse(c.Param("conflictId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conflict id"})
		return
	}

	// Member check
	userID := c.GetString("user_id")
	ledger, err := h.ledgerService.GetByID(c.Request.Context(), ledgerID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ledger not found"})
		return
	}
	uid, _ := uuid.Parse(userID)
	if !ledger.IsMember(uid) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member"})
		return
	}

	var req resolveConflictRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	input := usecase.ResolveInput{
		Resolution: req.Resolution,
		MergedData: req.MergedData,
	}
	if err := h.conflictService.Resolve(c.Request.Context(), conflictID, input); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "resolved"})
}
```

**Step 5: Register routes**

Add to `RegisterRoutes`:

```go
ledgers.GET("/:id/conflicts", h.ListConflicts)
ledgers.POST("/:id/conflicts/:conflictId/resolve", h.ResolveConflict)
```

**Step 6: Run build check**

```bash
cd backend && go build ./...
```

**Step 7: Commit**

```bash
git add backend/internal/delivery/http/shared_ledger_handler.go
git commit -m "feat: add conflict list and resolve API endpoints"
```

---

## Task 12: Update Dependency Injection

**Files:**
- Modify: `backend/cmd/api/main.go` (wire up new repositories and services)

**Step 1: Add SyncConflictRepository and ConflictResolutionService to DI**

In `main.go`, add:

```go
syncConflictRepo := repository.NewSyncConflictRepository(db)
sheetSyncService := usecase.NewSheetSyncService(encryptor, sharedExpenseRepo, sharedLedgerRepo, syncConflictRepo, logger)
conflictService := usecase.NewConflictResolutionService(syncConflictRepo, sharedExpenseRepo, sheetSyncService, logger)
```

Update the `SharedLedgerHandler` constructor call to pass `conflictService`.

**Step 2: Run build check**

```bash
cd backend && go build ./cmd/api/...
```

**Step 3: Commit**

```bash
git add backend/cmd/api/main.go
git commit -m "feat: wire up SyncConflict repo and ConflictResolution service in DI"
```

---

## Task 13: Update Frontend Types

**Files:**
- Modify: `frontend/src/types/index.ts`

**Step 1: Add sync_status to SharedExpense interface**

```typescript
export interface SharedExpense {
  // ... existing fields ...
  sync_status: string  // 'synced' | 'modified' | 'conflict' | 'pending_delete'
  content_hash: string
}
```

**Step 2: Add SyncConflict interface**

```typescript
export interface SyncConflict {
  id: string
  expense_id: string
  ledger_id: string
  conflict_type: 'both_modified' | 'deleted_but_modified'
  zenbill_data: SharedExpense
  sheet_data: SharedExpense | null
  resolved_at: string | null
  resolution: string | null
  created_at: string
  updated_at: string
}

export interface ResolveConflictInput {
  resolution: 'keep_zenbill' | 'keep_sheet' | 'manual_merge'
  merged_data?: CreateSharedExpenseInput
}

export interface SyncResult {
  pushed: number
  pulled: number
  conflicts: number
}
```

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add SyncConflict and SyncResult types to frontend"
```

---

## Task 14: Update Frontend Hooks

**Files:**
- Modify: `frontend/src/hooks/useSharedLedgers.ts`

**Step 1: Update useSyncSheet return type**

Update the sync mutation to return `SyncResult`:

```typescript
export function useSyncSheet(ledgerId: string) {
  const queryClient = useQueryClient()
  return useMutation<SyncResult, Error>({
    mutationFn: async () => {
      const res = await api.post(`/shared-ledgers/${ledgerId}/sync`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-expenses', ledgerId] })
    },
  })
}
```

**Step 2: Add conflict hooks**

```typescript
export function useConflicts(ledgerId: string) {
  return useQuery<SyncConflict[]>({
    queryKey: ['sync-conflicts', ledgerId],
    queryFn: async () => {
      const res = await api.get(`/shared-ledgers/${ledgerId}/conflicts`)
      return res.data
    },
  })
}

export function useResolveConflict(ledgerId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { conflictId: string; input: ResolveConflictInput }>({
    mutationFn: async ({ conflictId, input }) => {
      await api.post(`/shared-ledgers/${ledgerId}/conflicts/${conflictId}/resolve`, input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-conflicts', ledgerId] })
      queryClient.invalidateQueries({ queryKey: ['shared-expenses', ledgerId] })
    },
  })
}
```

**Step 3: Commit**

```bash
git add frontend/src/hooks/useSharedLedgers.ts
git commit -m "feat: add conflict hooks and update sync result type"
```

---

## Task 15: Add Conflict Badge to SharedExpense List

**Files:**
- Modify: `frontend/src/pages/SharedLedgerDetailPage.tsx` (or whichever page shows expense list)

**Step 1: Show conflict count after sync**

Update the sync button's onSuccess handler to display conflicts:

```typescript
const syncMutation = useSyncSheet(ledgerId)

const handleSync = async () => {
  const result = await syncMutation.mutateAsync()
  if (result.conflicts > 0) {
    toast.warning(`同步完成：推送 ${result.pushed}，拉取 ${result.pulled}，衝突 ${result.conflicts}`)
  } else {
    toast.success(`同步完成：推送 ${result.pushed}，拉取 ${result.pulled}`)
  }
}
```

**Step 2: Show conflict badge on expense rows**

For each expense in the list, check `sync_status === 'conflict'` and display a warning indicator.

**Step 3: Commit**

```bash
git add frontend/src/pages/SharedLedgerDetailPage.tsx
git commit -m "feat: show conflict badge and sync result in expense list"
```

---

## Task 16: Build Conflict Resolution Dialog

**Files:**
- Create: `frontend/src/components/ConflictResolutionDialog.tsx`
- Modify: `frontend/src/pages/SharedLedgerDetailPage.tsx` (integrate dialog)

**Step 1: Create ConflictResolutionDialog component**

Build a dialog that:
- Lists unresolved conflicts for the ledger
- Shows side-by-side comparison (ZenBill data vs Sheet data)
- Provides three resolution buttons: Keep ZenBill, Keep Sheet, Manual Merge
- For manual merge: opens an edit form pre-filled with ZenBill data
- Calls `useResolveConflict` mutation on resolve

**Step 2: Integrate into SharedLedgerDetailPage**

Add a "衝突" button/section that opens the dialog when conflicts exist.

**Step 3: Commit**

```bash
git add frontend/src/components/ConflictResolutionDialog.tsx frontend/src/pages/SharedLedgerDetailPage.tsx
git commit -m "feat: add conflict resolution dialog with side-by-side diff"
```

---

## Task 17: Integration Test — Full Sync Cycle

**Files:**
- Create: `backend/internal/usecase/sheet_sync_service_test.go` (or extend existing)

**Step 1: Write test for full bidirectional sync cycle**

Test scenario:
1. Create expenses in ZenBill → SyncToSheet → verify Sheet has data with UUID
2. Modify expense in ZenBill → set sync_status=modified → SyncToSheet → verify Sheet updated
3. Create row in Sheet without UUID → SyncFromSheet → verify ZenBill created + UUID backfilled
4. Modify row in Sheet → SyncFromSheet → verify ZenBill updated
5. Modify both sides → Sync → verify conflict created
6. Delete row in Sheet → SyncFromSheet → verify ZenBill soft-deleted

This test requires mocking the Google Sheets client. Create a mock `googlesheet.Client` that stores rows in memory.

**Step 2: Run tests**

```bash
cd backend && go test ./internal/usecase/... -v -run TestBidirectionalSync
```

**Step 3: Commit**

```bash
git add backend/internal/usecase/sheet_sync_service_test.go
git commit -m "test: add integration test for bidirectional sync cycle"
```

---

## Task 18: Final Verification

**Step 1: Run all backend tests**

```bash
cd backend && go test ./... -v
```

**Step 2: Run lint check**

```bash
cd backend && golangci-lint run
```

**Step 3: Build check**

```bash
cd backend && go build ./...
```

**Step 4: Run frontend build**

```bash
cd frontend && npm run build
```

**Step 5: Commit any fixes, then final commit**

```bash
git add -A
git commit -m "chore: final cleanup for bidirectional sheet sync"
```
