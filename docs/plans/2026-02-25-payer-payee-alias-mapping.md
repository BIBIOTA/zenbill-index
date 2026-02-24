# Payer/Payee Alias Mapping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add owner/partner alias lists to SharedLedger so Google Sheet sync correctly maps payer/payee names in both directions.

**Architecture:** Add `OwnerAliases` and `PartnerAliases` JSONB array fields to `SharedLedger`. Update `SheetLabelToSplitMethod` to do case-insensitive contains matching against all aliases. Update `SplitMethodToSheetLabel` to use the first alias as display name. Auto-populate aliases on ledger creation.

**Tech Stack:** Go/GORM (backend), React/TypeScript (frontend), PostgreSQL JSONB

---

### Task 1: Add alias fields to SharedLedger domain entity

**Files:**
- Modify: `backend/internal/domain/shared_ledger.go:11-33`

**Step 1: Write failing tests for GetOwnerDisplayName and GetPartnerDisplayName**

Add to `backend/internal/domain/shared_ledger_test.go`:

```go
func TestSharedLedger_GetOwnerDisplayName(t *testing.T) {
	// With aliases set, returns first alias
	l := &SharedLedger{OwnerAliases: []string{"Yuki", "yukiotataitien@gmail.com"}}
	assert.Equal(t, "Yuki", l.GetOwnerDisplayName())

	// With empty aliases, falls back to Owner.Email
	l = &SharedLedger{Owner: &User{Email: "yuki@example.com"}}
	assert.Equal(t, "yuki@example.com", l.GetOwnerDisplayName())

	// Both empty, returns "Owner"
	l = &SharedLedger{}
	assert.Equal(t, "Owner", l.GetOwnerDisplayName())
}

func TestSharedLedger_GetPartnerDisplayName(t *testing.T) {
	// With aliases set, returns first alias
	l := &SharedLedger{PartnerAliases: []string{"Zumi", "Tester"}}
	assert.Equal(t, "Zumi", l.GetPartnerDisplayName())

	// With empty aliases, falls back to PartnerName
	l = &SharedLedger{PartnerName: "小美"}
	assert.Equal(t, "小美", l.GetPartnerDisplayName())

	// Both empty, returns "Partner"
	l = &SharedLedger{}
	assert.Equal(t, "Partner", l.GetPartnerDisplayName())
}
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/domain/... -run TestSharedLedger_GetOwner -v`
Expected: FAIL — `OwnerAliases` field and `GetOwnerDisplayName` method don't exist

**Step 3: Add alias fields and helper methods to SharedLedger**

In `backend/internal/domain/shared_ledger.go`, add two fields after `PartnerName` (line 17):

```go
OwnerAliases   []string `gorm:"type:jsonb;serializer:json;default:'[]'" json:"owner_aliases"`
PartnerAliases []string `gorm:"type:jsonb;serializer:json;default:'[]'" json:"partner_aliases"`
```

Add helper methods before `SharedLedgerRepository` interface:

```go
// GetOwnerDisplayName returns the primary display name for the owner.
// Priority: first alias > Owner.Email > "Owner"
func (l *SharedLedger) GetOwnerDisplayName() string {
	if len(l.OwnerAliases) > 0 && l.OwnerAliases[0] != "" {
		return l.OwnerAliases[0]
	}
	if l.Owner != nil && l.Owner.Email != "" {
		return l.Owner.Email
	}
	return "Owner"
}

// GetPartnerDisplayName returns the primary display name for the partner.
// Priority: first alias > PartnerName > "Partner"
func (l *SharedLedger) GetPartnerDisplayName() string {
	if len(l.PartnerAliases) > 0 && l.PartnerAliases[0] != "" {
		return l.PartnerAliases[0]
	}
	if l.PartnerName != "" {
		return l.PartnerName
	}
	return "Partner"
}
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./internal/domain/... -run TestSharedLedger_Get -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/internal/domain/shared_ledger.go backend/internal/domain/shared_ledger_test.go
git commit -m "feat: add owner/partner aliases fields to SharedLedger"
```

---

### Task 2: Update SheetLabelToSplitMethod to be alias-aware

**Files:**
- Modify: `backend/internal/domain/shared_expense.go:162-192`
- Modify: `backend/internal/domain/shared_expense_test.go:82-94`

**Step 1: Write failing tests for alias-aware matching**

Replace existing `TestSplitMethodToSheetLabel` and `TestSheetLabelToSplitMethod` tests and add new ones in `backend/internal/domain/shared_expense_test.go`:

```go
func TestSplitMethodToSheetLabel_WithAliases(t *testing.T) {
	ownerAliases := []string{"Yuki"}
	partnerAliases := []string{"Zumi"}
	assert.Equal(t, "均分", SplitMethodToSheetLabel(SplitMethodEqual, ownerAliases, partnerAliases))
	assert.Equal(t, "由 Yuki 全部負擔", SplitMethodToSheetLabel(SplitMethodFullOwner, ownerAliases, partnerAliases))
	assert.Equal(t, "由 Zumi 全部負擔", SplitMethodToSheetLabel(SplitMethodFullPartner, ownerAliases, partnerAliases))
	assert.Equal(t, "非均分(次頁填金額)", SplitMethodToSheetLabel(SplitMethodCustom, ownerAliases, partnerAliases))
}

func TestSplitMethodToSheetLabel_EmptyAliases(t *testing.T) {
	// Empty aliases should use fallback
	assert.Equal(t, "由 Owner 全部負擔", SplitMethodToSheetLabel(SplitMethodFullOwner, nil, nil))
	assert.Equal(t, "由 Partner 全部負擔", SplitMethodToSheetLabel(SplitMethodFullPartner, nil, nil))
}

func TestSheetLabelToSplitMethod_WithAliases(t *testing.T) {
	ownerAliases := []string{"Yuki", "yukiotataitien@gmail.com"}
	partnerAliases := []string{"Zumi", "Tester"}

	// Chinese exact matches
	assert.Equal(t, SplitMethodEqual, SheetLabelToSplitMethod("均分", ownerAliases, partnerAliases))
	assert.Equal(t, SplitMethodFullOwner, SheetLabelToSplitMethod("由 Yuki 全部負擔", ownerAliases, partnerAliases))
	assert.Equal(t, SplitMethodFullPartner, SheetLabelToSplitMethod("由 Zumi 全部負擔", ownerAliases, partnerAliases))
	assert.Equal(t, SplitMethodCustom, SheetLabelToSplitMethod("非均分(次頁填金額)", ownerAliases, partnerAliases))

	// English keyword matches
	assert.Equal(t, SplitMethodEqual, SheetLabelToSplitMethod("Equal split", ownerAliases, partnerAliases))

	// Alias contains matching (case-insensitive)
	assert.Equal(t, SplitMethodFullPartner, SheetLabelToSplitMethod("Zumi bears all", ownerAliases, partnerAliases))
	assert.Equal(t, SplitMethodFullPartner, SheetLabelToSplitMethod("Tester bears all", ownerAliases, partnerAliases))
	assert.Equal(t, SplitMethodFullOwner, SheetLabelToSplitMethod("yukiotataitien@gmail.com bears all", ownerAliases, partnerAliases))

	// Custom keywords
	assert.Equal(t, SplitMethodCustom, SheetLabelToSplitMethod("Custom split", ownerAliases, partnerAliases))

	// Unknown → default EQUAL
	assert.Equal(t, SplitMethodEqual, SheetLabelToSplitMethod("something unknown", ownerAliases, partnerAliases))
}
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/domain/... -run TestSplitMethod -v`
Expected: FAIL — function signatures changed

**Step 3: Update the functions**

In `backend/internal/domain/shared_expense.go`, replace `SplitMethodToSheetLabel` and `SheetLabelToSplitMethod` (lines 162-192):

```go
// SplitMethodToSheetLabel converts SplitMethod to Google Sheet label.
// Uses the first alias as display name; falls back to "Owner"/"Partner".
func SplitMethodToSheetLabel(method SplitMethod, ownerAliases, partnerAliases []string) string {
	ownerName := "Owner"
	if len(ownerAliases) > 0 && ownerAliases[0] != "" {
		ownerName = ownerAliases[0]
	}
	partnerName := "Partner"
	if len(partnerAliases) > 0 && partnerAliases[0] != "" {
		partnerName = partnerAliases[0]
	}
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

// equalKeywords matches "equal split" labels across languages.
var equalKeywords = []string{"均分", "equal", "平分", "各半"}

// customKeywords matches "custom split" labels across languages.
var customKeywords = []string{"非均分", "custom", "自訂"}

// SheetLabelToSplitMethod converts a Google Sheet label to SplitMethod.
// Uses alias-aware matching: first checks keywords, then checks if the label
// contains any owner/partner alias (case-insensitive).
func SheetLabelToSplitMethod(label string, ownerAliases, partnerAliases []string) SplitMethod {
	lower := strings.ToLower(label)

	// Keyword matching for equal/custom
	for _, kw := range equalKeywords {
		if strings.Contains(lower, strings.ToLower(kw)) {
			return SplitMethodEqual
		}
	}
	for _, kw := range customKeywords {
		if strings.Contains(lower, strings.ToLower(kw)) {
			return SplitMethodCustom
		}
	}

	// Alias-based matching for full-owner/full-partner.
	// Check longer aliases first to avoid partial false positives.
	if containsAnyAlias(lower, ownerAliases) {
		return SplitMethodFullOwner
	}
	if containsAnyAlias(lower, partnerAliases) {
		return SplitMethodFullPartner
	}

	return SplitMethodEqual
}

// containsAnyAlias checks if text contains any of the given aliases (case-insensitive).
func containsAnyAlias(lowerText string, aliases []string) bool {
	for _, alias := range aliases {
		if alias != "" && strings.Contains(lowerText, strings.ToLower(alias)) {
			return true
		}
	}
	return false
}
```

Also add `"strings"` to the imports at the top of the file.

**Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./internal/domain/... -run TestSplitMethod -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/internal/domain/shared_expense.go backend/internal/domain/shared_expense_test.go
git commit -m "feat: make SheetLabelToSplitMethod alias-aware with keyword matching"
```

---

### Task 3: Update mapper.go to use alias arrays

**Files:**
- Modify: `backend/pkg/googlesheet/mapper.go:14-83`

**Step 1: Write failing tests**

Create `backend/pkg/googlesheet/mapper_test.go`:

```go
package googlesheet

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/yukiota/zenbill/internal/domain"
)

func TestExpenseToRow_UsesAliases(t *testing.T) {
	e := &domain.SharedExpense{
		SplitMethod:     domain.SplitMethodFullOwner,
		OwnerPaidAmount: 500,
		TotalAmount:     500,
	}
	ownerAliases := []string{"Yuki"}
	partnerAliases := []string{"Zumi"}
	row := ExpenseToRow(e, ownerAliases, partnerAliases)
	assert.Equal(t, "由 Yuki 全部負擔", row[6])
}

func TestRowToExpenseInput_AliasMatching(t *testing.T) {
	// Row with "Zumi bears all" in split method column
	row := []interface{}{
		"2026/2/23 下午 10:55:23", // timestamp
		"2/23",                    // date
		"飲食 🍽️",                 // category
		"Dinner",                  // description
		float64(500),              // owner_paid
		"",                        // partner_paid
		"Zumi bears all",          // split method
	}
	ownerAliases := []string{"Yuki"}
	partnerAliases := []string{"Zumi", "Tester"}

	expense, err := RowToExpenseInput(row, ownerAliases, partnerAliases)
	assert.NoError(t, err)
	assert.Equal(t, domain.SplitMethodFullPartner, expense.SplitMethod)
	assert.Equal(t, "Yuki", expense.PayerName) // owner paid, so PayerName = first owner alias
}

func TestRowToExpenseInput_PartnerPaid(t *testing.T) {
	row := []interface{}{
		"2026/2/23 下午 10:59:30",
		"2/23",
		"交通 🚗",
		"Ticket",
		"",           // owner didn't pay
		float64(300), // partner paid
		"Equal split",
	}
	ownerAliases := []string{"Yuki"}
	partnerAliases := []string{"Zumi"}

	expense, err := RowToExpenseInput(row, ownerAliases, partnerAliases)
	assert.NoError(t, err)
	assert.Equal(t, domain.SplitMethodEqual, expense.SplitMethod)
	assert.Equal(t, "Zumi", expense.PayerName) // partner paid
}
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./pkg/googlesheet/... -v`
Expected: FAIL — function signatures changed

**Step 3: Update mapper functions**

In `backend/pkg/googlesheet/mapper.go`, change both function signatures:

```go
// ExpenseToRow converts a SharedExpense to a Google Sheet row (9 columns).
func ExpenseToRow(e *domain.SharedExpense, ownerAliases, partnerAliases []string) []interface{} {
	row := make([]interface{}, 9)
	row[0] = e.CreatedAt.Format("2006/1/2 下午 3:04:05")
	row[1] = fmt.Sprintf("%d/%d", e.Date.Month(), e.Date.Day())
	row[2] = domain.CategoryToSheetLabel(e.Category)
	row[3] = e.Description
	if e.OwnerPaidAmount > 0 {
		row[4] = e.OwnerPaidAmount
	} else {
		row[4] = ""
	}
	if e.PartnerPaidAmount > 0 {
		row[5] = e.PartnerPaidAmount
	} else {
		row[5] = ""
	}
	row[6] = domain.SplitMethodToSheetLabel(e.SplitMethod, ownerAliases, partnerAliases)
	if e.SplitMethod == domain.SplitMethodCustom {
		row[7] = e.OwnerAmount
		row[8] = e.PartnerAmount
	} else {
		row[7] = ""
		row[8] = ""
	}
	return row
}

// RowToExpenseInput parses a Google Sheet row into a SharedExpense.
func RowToExpenseInput(row []interface{}, ownerAliases, partnerAliases []string) (*domain.SharedExpense, error) {
	if len(row) < 7 {
		return nil, fmt.Errorf("row too short: %d columns", len(row))
	}
	expense := &domain.SharedExpense{SourceType: "google_sheet"}

	if ts, ok := row[0].(string); ok && ts != "" {
		if t, err := ParseSheetTimestamp(ts); err == nil {
			expense.CreatedAt = t
		}
	}
	if dateStr, ok := row[1].(string); ok && dateStr != "" {
		expense.Date = parseMMDD(dateStr)
	} else {
		expense.Date = time.Now()
	}
	if cat, ok := row[2].(string); ok {
		expense.Category = domain.SheetLabelToCategory(cat)
	}
	if desc, ok := row[3].(string); ok {
		expense.Description = desc
	}
	expense.OwnerPaidAmount = parseAmount(row[4])
	expense.PartnerPaidAmount = parseAmount(row[5])
	expense.TotalAmount = expense.OwnerPaidAmount + expense.PartnerPaidAmount
	if method, ok := row[6].(string); ok {
		expense.SplitMethod = domain.SheetLabelToSplitMethod(method, ownerAliases, partnerAliases)
	}

	// Determine payer name from who paid, using first alias as display name
	ownerName := "Owner"
	if len(ownerAliases) > 0 && ownerAliases[0] != "" {
		ownerName = ownerAliases[0]
	}
	partnerName := "Partner"
	if len(partnerAliases) > 0 && partnerAliases[0] != "" {
		partnerName = partnerAliases[0]
	}
	if expense.OwnerPaidAmount > 0 {
		expense.PayerName = ownerName
	} else {
		expense.PayerName = partnerName
	}

	if expense.SplitMethod == domain.SplitMethodCustom && len(row) >= 9 {
		expense.OwnerAmount = parseAmount(row[7])
		expense.PartnerAmount = parseAmount(row[8])
	} else {
		expense.CalculateSplit()
	}
	return expense, nil
}
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./pkg/googlesheet/... -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/pkg/googlesheet/mapper.go backend/pkg/googlesheet/mapper_test.go
git commit -m "feat: update mapper to use alias arrays for payer/payee resolution"
```

---

### Task 4: Update SheetSyncService to pass aliases

**Files:**
- Modify: `backend/internal/usecase/sheet_sync_service.go:60-137,142-221`

**Step 1: Update SyncToSheet to use aliases**

In `backend/internal/usecase/sheet_sync_service.go`, replace the ownerName/partnerName resolution in `SyncToSheet` (lines 82-86):

```go
	// Use alias arrays for name resolution
	ownerAliases := ledger.OwnerAliases
	partnerAliases := ledger.PartnerAliases
	// Fallback: if no aliases configured, use email/partner_name
	if len(ownerAliases) == 0 {
		name := "Owner"
		if ledger.Owner != nil {
			name = ledger.Owner.Email
		}
		ownerAliases = []string{name}
	}
	if len(partnerAliases) == 0 {
		partnerAliases = []string{ledger.PartnerName}
	}

	rows := make([][]interface{}, len(unsynced))
	for i := range unsynced {
		rows[i] = googlesheet.ExpenseToRow(&unsynced[i], ownerAliases, partnerAliases)
	}
```

**Step 2: Update SyncFromSheet similarly**

Replace the ownerName/partnerName resolution in `SyncFromSheet` (lines 173-177) with the same alias resolution pattern, and update the `RowToExpenseInput` call:

```go
	ownerAliases := ledger.OwnerAliases
	partnerAliases := ledger.PartnerAliases
	if len(ownerAliases) == 0 {
		name := "Owner"
		if ledger.Owner != nil {
			name = ledger.Owner.Email
		}
		ownerAliases = []string{name}
	}
	if len(partnerAliases) == 0 {
		partnerAliases = []string{ledger.PartnerName}
	}

	imported := 0
	for i := 2; i < len(sheetRows); i++ {
		row := sheetRows[i]
		expense, err := googlesheet.RowToExpenseInput(row, ownerAliases, partnerAliases)
```

**Step 3: Extract alias resolution to a helper**

To avoid duplication, add a private helper:

```go
// resolveAliases returns the alias arrays for a ledger, with fallbacks.
func (s *SheetSyncService) resolveAliases(ledger *domain.SharedLedger) (ownerAliases, partnerAliases []string) {
	ownerAliases = ledger.OwnerAliases
	partnerAliases = ledger.PartnerAliases
	if len(ownerAliases) == 0 {
		name := "Owner"
		if ledger.Owner != nil {
			name = ledger.Owner.Email
		}
		ownerAliases = []string{name}
	}
	if len(partnerAliases) == 0 {
		partnerAliases = []string{ledger.PartnerName}
	}
	return
}
```

Then both methods call: `ownerAliases, partnerAliases := s.resolveAliases(ledger)`

**Step 4: Verify build compiles**

Run: `cd backend && go build ./...`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add backend/internal/usecase/sheet_sync_service.go
git commit -m "feat: pass alias arrays through sheet sync service"
```

---

### Task 5: Update SharedLedgerService.Create to auto-populate aliases

**Files:**
- Modify: `backend/internal/usecase/shared_ledger_service.go:33-70`

**Step 1: No separate test needed** — this is covered by integration testing. The domain helper tests already verify the behavior.

**Step 2: Update Create method**

In `backend/internal/usecase/shared_ledger_service.go`, the `Create` method (line 34) — keep signature the same but auto-populate aliases after creating the ledger:

After `ledger` is created (before `s.ledgerRepo.Create`), add:

```go
	// Auto-populate aliases from initial names
	ledger.PartnerAliases = []string{partnerName}
```

Note: We can't populate `OwnerAliases` here because we don't have the owner's email at this point (only `ownerID`). The owner alias will be populated when the user sets it from the UI, or the `resolveAliases` fallback in sync service handles it.

**Step 3: Verify build compiles**

Run: `cd backend && go build ./...`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add backend/internal/usecase/shared_ledger_service.go
git commit -m "feat: auto-populate partner aliases on ledger creation"
```

---

### Task 6: Update HTTP handler to support alias fields

**Files:**
- Modify: `backend/internal/delivery/http/shared_ledger_handler.go:38-54,67-95,172-229,337-362`

**Step 1: Update request structs**

In `backend/internal/delivery/http/shared_ledger_handler.go`:

Add `OwnerAliases` and `PartnerAliases` to `updateSharedLedgerRequest`:

```go
type updateSharedLedgerRequest struct {
	Name                 *string  `json:"name"`
	OwnerAliases         []string `json:"owner_aliases"`
	PartnerAliases       []string `json:"partner_aliases"`
	GoogleSheetID        *string  `json:"google_sheet_id"`
	GoogleSheetGID       *string  `json:"google_sheet_gid"`
	SyncEnabled          *bool    `json:"sync_enabled"`
	GoogleCredentialJSON *string  `json:"google_credential_json"`
}
```

**Step 2: Update UpdateLedger handler**

Add alias handling after `req.Name` check (after line 200):

```go
	if req.OwnerAliases != nil {
		ledger.OwnerAliases = req.OwnerAliases
	}
	if req.PartnerAliases != nil {
		ledger.PartnerAliases = req.PartnerAliases
	}
```

**Step 3: Update GetInviteInfo handler**

Replace lines 347-350:

```go
	info := inviteInfoResponse{
		LedgerName:  ledger.Name,
		OwnerName:   ledger.GetOwnerDisplayName(),
		PartnerName: ledger.GetPartnerDisplayName(),
		Currency:    ledger.Currency,
		IsValid:     ledger.IsInviteValid(),
		HasPartner:  ledger.IsPartnerJoined(),
	}
```

**Step 4: Verify build compiles**

Run: `cd backend && go build ./...`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add backend/internal/delivery/http/shared_ledger_handler.go
git commit -m "feat: add alias fields to shared ledger API"
```

---

### Task 7: Run migration (GORM AutoMigrate)

Since the project uses GORM AutoMigrate, the new JSONB fields will be added automatically when the migrate tool runs.

**Step 1: Run migration**

Run: `cd backend && go run cmd/migrate/main.go`
Expected: SUCCESS — `shared_ledgers` table gets `owner_aliases` and `partner_aliases` columns

**Step 2: Verify all backend tests pass**

Run: `cd backend && go test ./internal/domain/... ./pkg/googlesheet/... -v`
Expected: ALL PASS

**Step 3: Commit** (no code changes needed — migration is automatic)

---

### Task 8: Update frontend types

**Files:**
- Modify: `frontend/src/types/index.ts:233-266`

**Step 1: Add alias fields to SharedLedger interface**

In `frontend/src/types/index.ts`, add after `partner_name` (line 239):

```typescript
  owner_aliases: string[]
  partner_aliases: string[]
```

Add to `UpdateSharedLedgerInput` (after line 261):

```typescript
  owner_aliases?: string[]
  partner_aliases?: string[]
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npx tsc --noEmit`
Expected: SUCCESS (or check for type errors)

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add alias fields to frontend SharedLedger types"
```

---

### Task 9: Add alias management UI to SharedLedgerDetailPage

**Files:**
- Modify: `frontend/src/pages/SharedLedgerDetailPage.tsx`

**Step 1: Add alias editing to the existing Google Sheet settings area**

This is a UI-only change. Add an "Alias Settings" section inside the Google Sheet binding card (or as a separate card). The section should:

1. Show owner aliases as editable tag/chip list
2. Show partner aliases as editable tag/chip list
3. Allow adding new aliases (text input + add button)
4. Allow removing aliases (click X on chip)
5. Save via `updateMutation.mutate({ owner_aliases: [...], partner_aliases: [...] })`

Add state for alias editing near the top of the component (after line 54):

```typescript
const [showAliasForm, setShowAliasForm] = useState(false)
const [aliasForm, setAliasForm] = useState<{ owner: string[]; partner: string[] }>({
  owner: [],
  partner: [],
})
const [newOwnerAlias, setNewOwnerAlias] = useState('')
const [newPartnerAlias, setNewPartnerAlias] = useState('')
```

Add an alias settings card after the Google Sheet binding section (after line 311). The card should:
- Only show for `isOwner`
- Display current aliases from `ledger.owner_aliases` and `ledger.partner_aliases`
- Toggle to edit mode with `showAliasForm`
- In edit mode, show chip lists with add/remove capability
- Save button calls `updateMutation.mutate({ owner_aliases: aliasForm.owner, partner_aliases: aliasForm.partner })`

**Implementation guidance** — keep it simple, inline in the same file:

```tsx
{/* Alias Settings */}
{isOwner && (
  <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-4">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-semibold">名稱對照 (Google Sheet)</h3>
      </div>
      {!showAliasForm && (
        <button
          onClick={() => {
            setAliasForm({
              owner: ledger.owner_aliases?.length ? [...ledger.owner_aliases] : [],
              partner: ledger.partner_aliases?.length ? [...ledger.partner_aliases] : [],
            })
            setShowAliasForm(true)
          }}
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <Settings className="w-3 h-3" /> 編輯
        </button>
      )}
    </div>

    {showAliasForm ? (
      <div className="space-y-3">
        {/* Owner aliases */}
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">
            我的名稱（第一個為 Sheet 顯示名）
          </label>
          <div className="flex flex-wrap gap-1 mb-1">
            {aliasForm.owner.map((alias, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-xs">
                {alias}
                <button onClick={() => setAliasForm(f => ({ ...f, owner: f.owner.filter((_, j) => j !== i) }))} className="hover:text-red-400">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              value={newOwnerAlias}
              onChange={(e) => setNewOwnerAlias(e.target.value)}
              placeholder="新增別名..."
              className="flex-1 h-7 px-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newOwnerAlias.trim()) {
                  e.preventDefault()
                  setAliasForm(f => ({ ...f, owner: [...f.owner, newOwnerAlias.trim()] }))
                  setNewOwnerAlias('')
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (newOwnerAlias.trim()) {
                  setAliasForm(f => ({ ...f, owner: [...f.owner, newOwnerAlias.trim()] }))
                  setNewOwnerAlias('')
                }
              }}
              className="h-7 px-2 text-xs rounded-lg bg-[var(--bg-hover)]"
            >+</button>
          </div>
        </div>
        {/* Partner aliases — same pattern */}
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">
            對方名稱（第一個為 Sheet 顯示名）
          </label>
          <div className="flex flex-wrap gap-1 mb-1">
            {aliasForm.partner.map((alias, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs">
                {alias}
                <button onClick={() => setAliasForm(f => ({ ...f, partner: f.partner.filter((_, j) => j !== i) }))} className="hover:text-red-400">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              value={newPartnerAlias}
              onChange={(e) => setNewPartnerAlias(e.target.value)}
              placeholder="新增別名..."
              className="flex-1 h-7 px-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newPartnerAlias.trim()) {
                  e.preventDefault()
                  setAliasForm(f => ({ ...f, partner: [...f.partner, newPartnerAlias.trim()] }))
                  setNewPartnerAlias('')
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (newPartnerAlias.trim()) {
                  setAliasForm(f => ({ ...f, partner: [...f.partner, newPartnerAlias.trim()] }))
                  setNewPartnerAlias('')
                }
              }}
              className="h-7 px-2 text-xs rounded-lg bg-[var(--bg-hover)]"
            >+</button>
          </div>
        </div>
        {/* Save/Cancel */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              updateMutation.mutate(
                { owner_aliases: aliasForm.owner, partner_aliases: aliasForm.partner },
                { onSuccess: () => setShowAliasForm(false) },
              )
            }}
            disabled={updateMutation.isPending}
            className="flex items-center gap-1 h-7 px-3 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
          >
            <Check className="w-3 h-3" />
            {updateMutation.isPending ? '儲存中...' : '儲存'}
          </button>
          <button
            onClick={() => setShowAliasForm(false)}
            className="flex items-center gap-1 h-7 px-3 rounded-lg bg-[var(--bg-hover)] text-xs"
          >
            <X className="w-3 h-3" /> 取消
          </button>
        </div>
      </div>
    ) : (
      <div className="space-y-1 text-xs text-[var(--text-muted)]">
        <p>我: {ledger.owner_aliases?.length ? ledger.owner_aliases.join(', ') : '(未設定)'}</p>
        <p>對方: {ledger.partner_aliases?.length ? ledger.partner_aliases.join(', ') : ledger.partner_name}</p>
      </div>
    )}
  </div>
)}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npx tsc --noEmit`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add frontend/src/pages/SharedLedgerDetailPage.tsx
git commit -m "feat: add alias management UI to shared ledger detail page"
```

---

### Task 10: Final verification and cleanup

**Step 1: Run all backend tests**

Run: `cd backend && go test ./... -v`
Expected: ALL PASS

**Step 2: Run lint**

Run: `cd backend && golangci-lint run`
Expected: No new issues

**Step 3: Run frontend build**

Run: `cd frontend && npm run build`
Expected: SUCCESS

**Step 4: Manual testing checklist**

- [ ] Create a new shared ledger → verify `partner_aliases` auto-populated
- [ ] Edit aliases from detail page → verify save works
- [ ] Sync from Google Sheet with varied name formats → verify correct split method detection
- [ ] Sync to Google Sheet → verify first alias used in label
- [ ] Existing ledgers with no aliases → verify fallback behavior works

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete payer/payee alias mapping for Google Sheet sync"
```
