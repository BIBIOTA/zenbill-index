# Payer/Payee Alias Mapping Design

**Date:** 2026-02-25
**Status:** Approved

## Problem

Google Sheet sync (bidirectional) cannot correctly determine payer/payee because:

1. **Sheet → ZenBill:** The "split method" column contains free-form text with various name formats (e.g., `"Zumi bears all"`, `"Tester bears all"`, `"yukiotataitien@gmail.com bears all"`). Current `SheetLabelToSplitMethod` does exact string match against `ownerName`/`partnerName`, which fails when names don't match.

2. **ZenBill → Sheet:** Writes split labels using `Owner.Email` and `PartnerName`, which may not match what users expect to see in the Sheet.

## Solution: Owner/Partner Aliases on SharedLedger

Store a list of name aliases for each party directly on the `SharedLedger` entity.

### Data Model Changes

Add two JSONB columns to `shared_ledgers` table:

```sql
ALTER TABLE shared_ledgers ADD COLUMN owner_aliases JSONB NOT NULL DEFAULT '[]';
ALTER TABLE shared_ledgers ADD COLUMN partner_aliases JSONB NOT NULL DEFAULT '[]';
```

```go
// domain/shared_ledger.go
type SharedLedger struct {
    // ... existing fields ...
    OwnerAliases   pq.StringArray `json:"owner_aliases" gorm:"type:jsonb;default:'[]'"`
    PartnerAliases pq.StringArray `json:"partner_aliases" gorm:"type:jsonb;default:'[]'"`
}
```

**Example values:**
- `OwnerAliases`: `["Yuki", "yukiotataitien@gmail.com"]`
- `PartnerAliases`: `["Zumi", "Tester"]`

**Auto-initialization:** When creating a ledger, auto-populate:
- `OwnerAliases` with `Owner.Email`
- `PartnerAliases` with `PartnerName`

### Matching Logic Changes

#### `SheetLabelToSplitMethod` → alias-aware

Current: exact match `"由 {ownerName} 全部負擔"`

New: iterate all aliases (case-insensitive, contains match):
```
"Zumi bears all" → "Zumi" found in PartnerAliases → FULL_PARTNER
"yukiotataitien@gmail.com bears all" → found in OwnerAliases → FULL_OWNER
"均分" or "Equal split" → keyword match → EQUAL
"非均分" or "Custom split" → keyword match → CUSTOM
```

The matching function signature changes:
```go
// Before
func SheetLabelToSplitMethod(label, ownerName, partnerName string) SplitMethod

// After
func SheetLabelToSplitMethod(label string, ownerAliases, partnerAliases []string) SplitMethod
```

#### PayerName determination

Keep current logic (payment column determines who paid), but set PayerName to `aliases[0]` (primary display name) instead of raw ownerName/partnerName.

#### SplitMethodToSheetLabel

Use `aliases[0]` as the display name when writing to Sheet:
```go
// Before
func SplitMethodToSheetLabel(method SplitMethod, ownerName, partnerName string) string

// After - uses first alias as display name
func SplitMethodToSheetLabel(method SplitMethod, ownerAliases, partnerAliases []string) string
```

### Keyword-Based Equal/Custom Detection

Add keyword lists for language-agnostic matching:

```go
var equalKeywords = []string{"均分", "equal", "平分", "各半"}
var customKeywords = []string{"非均分", "custom", "自訂"}
```

### Bidirectional Sync Impact

| Direction | Current | After |
|-----------|---------|-------|
| ZenBill → Sheet | Uses `Owner.Email` / `PartnerName` | Uses `OwnerAliases[0]` / `PartnerAliases[0]` |
| Sheet → ZenBill | Exact match fails → defaults to EQUAL | Iterates aliases with contains match → correct |

### Frontend Changes

Add "Alias Management" section in Shared Ledger settings page:
- Display Owner / Partner alias lists
- Add / remove aliases
- First alias = "Sheet display name" (used when writing to Sheet)

### API Changes

**Update SharedLedger API** to accept `owner_aliases` / `partner_aliases`:
- `PUT /api/v1/shared-ledgers/:id` — update aliases
- `GET /api/v1/shared-ledgers/:id` — return aliases in response

### Files to Modify

**Backend:**
1. `internal/domain/shared_ledger.go` — add alias fields to entity
2. `internal/domain/shared_expense.go` — update `SheetLabelToSplitMethod` / `SplitMethodToSheetLabel` signatures
3. `pkg/googlesheet/mapper.go` — update `RowToExpenseInput` / `ExpenseToRow` to use aliases
4. `internal/usecase/sheet_sync_service.go` — pass aliases instead of single names
5. `internal/usecase/shared_ledger_service.go` — auto-populate aliases on create
6. `internal/delivery/http/shared_ledger_handler.go` — handle alias fields in API
7. DB migration — add columns

**Frontend:**
8. `frontend/src/types/index.ts` — add alias fields to SharedLedger type
9. `frontend/src/pages/SharedLedgerSettingsPage.tsx` (or equivalent) — alias management UI
10. `frontend/src/hooks/useSharedLedgers.ts` — update mutations

### Migration Strategy

For existing ledgers, run a migration that initializes:
- `owner_aliases = [owner.email]`
- `partner_aliases = [partner_name]`
