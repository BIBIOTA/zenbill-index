# Bidirectional Google Sheet Sync Design

**Date:** 2026-02-25
**Status:** Approved

## Problem

Current sync between ZenBill and Google Sheet only supports **append-only** operations:
- New ZenBill expenses → append to Sheet
- New Sheet rows → import to ZenBill

Missing capabilities:
- Modify sync: changes on either side are not detected or propagated
- Delete sync: deletions on either side are not detected or propagated
- No stable identifier linking a ZenBill record to a specific Sheet row
- `google_sheet_row_index` is a placeholder marker, not a real row reference

## Approach: Hidden UUID Column (Column J)

Add a hidden column to Google Sheet storing the `SharedExpense.ID` (UUID). This provides a stable, unique mapping between ZenBill records and Sheet rows regardless of row insertions/deletions.

## Design

### 1. Google Sheet Schema Change

**Column Layout:**
```
A: Timestamp  B: Date  C: Category  D: Description
E: OwnerPaid  F: PartnerPaid  G: SplitMethod
H: OwnerAmount  I: PartnerAmount  J: ZenBillID (hidden)
```

Both "表單" and "分帳" tabs get Column J.

**Hidden Column Management:**
- First sync: check if Column J exists, if not, add header "ZenBillID" and hide via `UpdateDimensionProperties` API
- Column hidden with `hiddenByUser: true`

**Backward Compatibility:**
- Existing synced rows have empty Column J
- First full sync backfills UUIDs using composite key matching (`CreatedAt + Description`)

### 2. ZenBill Schema Changes

New/modified fields on `SharedExpense`:

```go
ContentHash    string     // SHA256 of expense content at last sync
SyncStatus     string     // "synced" | "modified" | "conflict" | "pending_delete"
```

Existing field semantic change:
- `google_sheet_row_index` → stores **real Sheet row number** (refreshed each sync)
- `synced_at` → renamed conceptually to "last synced at"

**ContentHash calculation:**
```
SHA256(date + category + description + ownerPaid + partnerPaid + splitMethod + ownerAmount + partnerAmount)
```

### 3. Sync Flow (Bidirectional)

#### Push Phase (ZenBill → Sheet)

1. **New records**: `source_type='zenbill' AND google_sheet_row_index IS NULL` → Append to Sheet, write UUID to Column J
2. **Modified records**: `sync_status='modified'` → Find row by UUID in Column J, update row content
3. **Deleted records**: `sync_status='pending_delete'` → Find row by UUID, delete from Sheet, then hard-delete from ZenBill

#### Pull Phase (Sheet → ZenBill)

1. Read all Sheet rows including Column J
2. Build UUID → Row Index mapping (refreshes every sync to handle row drift)
3. For each row:
   - **Column J empty** → New record from Sheet, create SharedExpense with `source_type='google_sheet'`, write UUID back to Column J
   - **Column J has UUID** → Compare ContentHash:
     - Hash matches → No change, skip
     - Hash differs → Sheet was modified:
       - ZenBill not modified (`sync_status='synced'`) → Update ZenBill from Sheet
       - ZenBill also modified (`sync_status='modified'`) → Create conflict
4. For ZenBill records with UUID not found in Sheet:
   - Sheet row was deleted:
     - ZenBill not modified → Soft-delete ZenBill record
     - ZenBill modified → Create conflict (`deleted_but_modified`)

### 4. Conflict Handling

#### Conflict Entity

```go
type SyncConflict struct {
    ID              uuid.UUID
    ExpenseID       uuid.UUID
    LedgerID        uuid.UUID
    ConflictType    string       // "both_modified" | "deleted_but_modified"
    ZenBillData     JSONB        // ZenBill snapshot
    SheetData       JSONB        // Sheet snapshot (null if deleted_but_modified from Sheet side)
    ResolvedAt      *time.Time
    Resolution      string       // "keep_zenbill" | "keep_sheet" | "manual_merge"
}
```

#### Resolution Flow

1. Detect conflict → Create `SyncConflict`, set `SharedExpense.SyncStatus = "conflict"`
2. Frontend shows warning badge on affected expenses
3. User resolves via conflict dialog (side-by-side diff):
   - Keep ZenBill → overwrite Sheet
   - Keep Sheet → overwrite ZenBill
   - Manual merge → user edits, save to both
4. **Immediately trigger sync** after resolution (not deferred to next manual sync)

### 5. API Changes

#### New Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/shared-ledgers/{id}/conflicts` | GET | List unresolved conflicts |
| `/shared-ledgers/{id}/conflicts/{conflictId}/resolve` | POST | Resolve a conflict |

**Resolve request body:**
```json
{
  "resolution": "keep_zenbill" | "keep_sheet" | "manual_merge",
  "merged_data": { ... }  // only for manual_merge
}
```

#### Modified Endpoints

`POST /shared-ledgers/{id}/sync` response adds conflict count:
```json
{ "pushed": 3, "pulled": 2, "conflicts": 1 }
```

`GET /shared-expenses` response adds `sync_status` field.

### 6. Frontend Changes

1. **SharedExpense list** — Red badge on conflicted records, conflict count in sync result toast
2. **Conflict resolution dialog** — Side-by-side diff of ZenBill vs Sheet data, three resolution buttons
3. **Sync button** — Display pushed/pulled/conflicts in result notification

### 7. Migration Strategy

1. Add `content_hash` and `sync_status` columns to `shared_expenses` table
2. Create `sync_conflicts` table
3. Set all existing records: `sync_status = 'synced'`, `content_hash = computed`
4. First sync after migration:
   - Backfill Column J UUIDs for existing rows (match by composite key)
   - Hide Column J via Sheets API
   - Rebuild `google_sheet_row_index` with real row numbers
