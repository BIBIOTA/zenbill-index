# Sync Progress Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show real-time invoice sync progress via a top-of-page banner on InvoicesPage, polling backend every 3 seconds.

**Architecture:** Add `sync_progress` JSONB column to `einvoice_credentials`. Backend updates it after each invoice is processed. Frontend polls `GET /einvoice/credentials` with conditional `refetchInterval` and renders a status banner.

**Tech Stack:** Go/GORM (backend), React/TanStack Query (frontend), PostgreSQL JSONB

---

### Task 1: Add SyncProgress to Domain Entity

**Files:**
- Modify: `backend/internal/domain/einvoice_credential.go`

**Step 1: Add SyncProgress struct and field**

Add to `backend/internal/domain/einvoice_credential.go`:

```go
import "encoding/json"

// SyncProgress tracks real-time invoice sync counts
type SyncProgress struct {
	NewInvoices     int `json:"new"`
	SkippedInvoices int `json:"skipped"`
	FailedInvoices  int `json:"failed"`
}
```

Add field to `EInvoiceCredential` struct (after `SyncError`):

```go
SyncProgress *SyncProgress `gorm:"type:jsonb;serializer:json" json:"sync_progress,omitempty"`
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./internal/domain/...`
Expected: success (no errors)

**Step 3: Commit**

```bash
git add backend/internal/domain/einvoice_credential.go
git commit -m "feat: add SyncProgress struct to EInvoiceCredential domain entity"
```

---

### Task 2: Add UpdateSyncProgress to Repository

**Files:**
- Modify: `backend/internal/domain/repository.go` (interface)
- Modify: `backend/internal/repository/einvoice_credential_repository.go` (implementation)

**Step 1: Add method to interface**

In `backend/internal/domain/repository.go`, add to `EInvoiceCredentialRepository`:

```go
UpdateSyncProgress(ctx context.Context, userID uuid.UUID, progress *SyncProgress) error
```

**Step 2: Implement in repository**

In `backend/internal/repository/einvoice_credential_repository.go`, add:

```go
// UpdateSyncProgress updates the sync progress JSONB field
func (r *EInvoiceCredentialRepositoryImpl) UpdateSyncProgress(ctx context.Context, userID uuid.UUID, progress *domain.SyncProgress) error {
	var value interface{}
	if progress != nil {
		data, err := json.Marshal(progress)
		if err != nil {
			return fmt.Errorf("marshal sync progress: %w", err)
		}
		value = string(data)
	}
	return r.db.WithContext(ctx).
		Model(&domain.EInvoiceCredential{}).
		Where("user_id = ?", userID).
		Update("sync_progress", value).Error
}
```

Add imports: `"encoding/json"`, `"fmt"`.

**Step 3: Verify it compiles**

Run: `cd backend && go build ./...`
Expected: success

**Step 4: Commit**

```bash
git add backend/internal/domain/repository.go backend/internal/repository/einvoice_credential_repository.go
git commit -m "feat: add UpdateSyncProgress to credential repository"
```

---

### Task 3: Integrate Progress Updates into InvoiceSyncService

**Files:**
- Modify: `backend/internal/usecase/invoice_sync_service.go`

**Step 1: Initialize progress at sync start**

In `SyncInvoices()`, after the `UpdateSyncStatus(ctx, userID, SyncStatusSyncing, nil)` call (line ~94), add:

```go
// Initialize sync progress
progress := &domain.SyncProgress{}
if err := s.credRepo.UpdateSyncProgress(ctx, userID, progress); err != nil {
    s.logger.WarnContext(ctx, "failed to init sync progress", "error", err)
}
```

**Step 2: Update progress after each invoice in the processing loop**

In `SyncInvoices()`, in the `for _, inv := range invoices` loop (line ~142), after `processInvoice` and the error handling, add progress update:

Replace the loop body:

```go
for _, inv := range invoices {
    if err := s.processInvoice(ctx, userID, inv, m); err != nil {
        s.logger.ErrorContext(ctx, "處理發票失敗",
            "invoice_number", inv.InvoiceNumber,
            "error", err,
        )
        m.AddError(fmt.Sprintf("invoice %s: %v", inv.InvoiceNumber, err))
    }

    // Update sync progress in DB for frontend polling
    progress := &domain.SyncProgress{
        NewInvoices:     m.NewInvoices,
        SkippedInvoices: m.SkippedInvoices,
        FailedInvoices:  m.FailedInvoices,
    }
    if updateErr := s.credRepo.UpdateSyncProgress(ctx, userID, progress); updateErr != nil {
        s.logger.WarnContext(ctx, "failed to update sync progress", "error", updateErr)
    }
}
```

**Step 3: Clear progress on sync end**

In `SyncInvoices()`, right before `UpdateSyncStatus(ctx, userID, SyncStatusIdle, nil)` (line ~157), add:

```go
// Clear sync progress
_ = s.credRepo.UpdateSyncProgress(ctx, userID, nil)
```

Also clear progress in all error paths. In each place where `UpdateSyncStatus(ctx, userID, SyncStatusError, &syncErr)` is called, add immediately before it:

```go
_ = s.credRepo.UpdateSyncProgress(ctx, userID, nil)
```

**Step 4: Verify it compiles**

Run: `cd backend && go build ./...`
Expected: success

**Step 5: Commit**

```bash
git add backend/internal/usecase/invoice_sync_service.go
git commit -m "feat: update sync progress in DB during invoice sync loop"
```

---

### Task 4: Add sync_progress to Credential Handler Response

**Files:**
- Modify: `backend/internal/delivery/http/credential_handler.go`

**Step 1: Add sync_progress to GetStatus response**

In `credential_handler.go`, in the `GetStatus` method, add `sync_progress` to the `gin.H` response map (line ~89-96):

```go
Data: gin.H{
    "bound":          true,
    "last_synced_at": cred.LastSyncedAt,
    "sync_status":    cred.SyncStatus,
    "sync_error":     cred.SyncError,
    "sync_progress":  cred.SyncProgress,
    "created_at":     cred.CreatedAt,
    "updated_at":     cred.UpdatedAt,
},
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./...`
Expected: success

**Step 3: Commit**

```bash
git add backend/internal/delivery/http/credential_handler.go
git commit -m "feat: include sync_progress in credential status API response"
```

---

### Task 5: Run DB Migration

**Step 1: Run the migrate command to add the new column**

```bash
cd backend && docker exec -it zenbill_api /app/migrate
```

Or locally:

```bash
cd backend && go run cmd/migrate/main.go
```

GORM AutoMigrate will add the `sync_progress` JSONB column automatically since the `EInvoiceCredential` struct now has the field.

**Step 2: Verify column exists**

Check via pgAdmin or:

```bash
docker exec -it zenbill_db psql -U zenbill -d zenbill_db -c "\d user_einvoice_credentials"
```

Expected: `sync_progress` column of type `jsonb` should appear.

**Step 3: Commit** (no code changes, migration is auto)

---

### Task 6: Add SyncProgress Type and useSyncStatus Hook to Frontend

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/hooks/useInvoices.ts`

**Step 1: Add SyncProgress type**

In `frontend/src/types/index.ts`, update the `EInvoiceCredentialStatus` interface:

```typescript
export interface SyncProgress {
  new: number
  skipped: number
  failed: number
}

export interface EInvoiceCredentialStatus {
  bound: boolean
  last_synced_at: string | null
  sync_status: string | null
  sync_error: string | null
  sync_progress: SyncProgress | null
}
```

**Step 2: Add useSyncStatus hook**

In `frontend/src/hooks/useInvoices.ts`, add:

```typescript
import type { Invoice, PaginatedResponse, ApiResponse, InvoiceMatchResult, EInvoiceCredentialStatus } from '@/types'

export function useSyncStatus() {
  return useQuery({
    queryKey: ['einvoice-credential-status'],
    queryFn: () => api.get<ApiResponse<EInvoiceCredentialStatus>>('/einvoice/credentials'),
    select: (res) => res.data,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.sync_status
      return status === 'syncing' ? 3000 : false
    },
  })
}
```

**Step 3: Update useSyncInvoices to also invalidate credential status**

```typescript
export function useSyncInvoices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<ApiResponse<null>>('/invoices/sync', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['einvoice-credential-status'] })
    },
  })
}
```

**Step 4: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: success

**Step 5: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/hooks/useInvoices.ts
git commit -m "feat: add useSyncStatus hook with conditional polling"
```

---

### Task 7: Add SyncBanner to InvoicesPage

**Files:**
- Modify: `frontend/src/pages/InvoicesPage.tsx`

**Step 1: Import useSyncStatus and add banner state**

At top of `InvoicesPage.tsx`, add to imports:

```typescript
import { useSyncStatus } from '@/hooks/useInvoices'
```

Inside the component, add after the existing hooks:

```typescript
const syncStatus = useSyncStatus()
const credStatus = syncStatus.data
const [showComplete, setShowComplete] = useState(false)
const [lastResult, setLastResult] = useState<{ new: number; skipped: number; failed: number } | null>(null)
```

**Step 2: Add effect to detect sync completion**

```typescript
import { useState, useEffect, useRef } from 'react'

// Track previous sync_status to detect transitions
const prevSyncStatusRef = useRef<string | null>(null)

useEffect(() => {
  const prev = prevSyncStatusRef.current
  const curr = credStatus?.sync_status ?? null

  if (prev === 'syncing' && curr !== 'syncing') {
    // Sync just finished — show completion banner
    if (curr === 'idle') {
      setLastResult(credStatus?.sync_progress ?? lastResult)
      setShowComplete(true)
      const timer = setTimeout(() => setShowComplete(false), 5000)
      // Refresh invoice list
      return () => clearTimeout(timer)
    }
  }

  prevSyncStatusRef.current = curr
}, [credStatus?.sync_status])
```

Note: The progress will be `null` when sync completes (since we clear it). We need to capture the last known progress before it's cleared. Better approach: capture from the polling data before it transitions.

Revised approach — track last known progress:

```typescript
const prevSyncStatusRef = useRef<string | null>(null)
const lastProgressRef = useRef<{ new: number; skipped: number; failed: number } | null>(null)
const [completionResult, setCompletionResult] = useState<{ new: number; skipped: number; failed: number } | null>(null)

// Always track the latest progress while syncing
useEffect(() => {
  if (credStatus?.sync_status === 'syncing' && credStatus?.sync_progress) {
    lastProgressRef.current = credStatus.sync_progress
  }
}, [credStatus?.sync_status, credStatus?.sync_progress])

// Detect sync completion
useEffect(() => {
  const prev = prevSyncStatusRef.current
  const curr = credStatus?.sync_status ?? null

  if (prev === 'syncing' && curr === 'idle') {
    setCompletionResult(lastProgressRef.current)
    lastProgressRef.current = null
    const timer = setTimeout(() => setCompletionResult(null), 5000)
    return () => clearTimeout(timer)
  }

  prevSyncStatusRef.current = curr
}, [credStatus?.sync_status])
```

**Step 3: Add the banner JSX**

Insert right after the `<h1>` header div (before the Filters section), inside the `space-y-4` container:

```tsx
{/* Sync Progress Banner */}
{credStatus?.sync_status === 'syncing' && (
  <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-xs">
    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--color-accent)]" />
    <span>
      同步中...
      {credStatus.sync_progress && (
        <span className="ml-1 text-[var(--text-secondary)]">
          已新增 {credStatus.sync_progress.new} 張
          {credStatus.sync_progress.skipped > 0 && `，略過 ${credStatus.sync_progress.skipped} 張`}
          {credStatus.sync_progress.failed > 0 && `，失敗 ${credStatus.sync_progress.failed} 張`}
        </span>
      )}
    </span>
  </div>
)}

{credStatus?.sync_status === 'error' && (
  <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
    <span>同步失敗：{credStatus.sync_error || '未知錯誤'}</span>
  </div>
)}

{completionResult && (
  <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
    <span>
      同步完成！新增 {completionResult.new} 張
      {completionResult.skipped > 0 && `，略過 ${completionResult.skipped} 張`}
      {completionResult.failed > 0 && `，失敗 ${completionResult.failed} 張`}
    </span>
  </div>
)}
```

**Step 4: Verify frontend compiles and renders**

Run: `cd frontend && npx tsc --noEmit`
Expected: success

Visually verify in browser: Navigate to Invoices page, click sync, confirm banner appears.

**Step 5: Commit**

```bash
git add frontend/src/pages/InvoicesPage.tsx
git commit -m "feat: add sync progress banner to InvoicesPage"
```

---

### Task 8: Fix Mock Implementations (if any tests use mocked credential repo)

**Files:**
- Search: `backend/internal/usecase/*_test.go` and `backend/internal/delivery/http/*_test.go`

**Step 1: Find files that mock EInvoiceCredentialRepository**

Run: `grep -rn "UpdateSyncStatus\|EInvoiceCredentialRepository" backend/internal/ --include="*_test.go"`

If any test files define mock structs implementing `EInvoiceCredentialRepository`, add the new `UpdateSyncProgress` method to them:

```go
func (m *MockCredentialRepo) UpdateSyncProgress(ctx context.Context, userID uuid.UUID, progress *domain.SyncProgress) error {
	return nil
}
```

**Step 2: Verify all tests pass**

Run: `cd backend && go test ./... -v -count=1`
Expected: all tests pass

**Step 3: Commit (if changes needed)**

```bash
git add -A
git commit -m "fix: add UpdateSyncProgress to mock credential repositories"
```

---

### Task 9: Final Verification

**Step 1: Run backend lint**

Run: `cd backend && golangci-lint run`
Expected: no errors

**Step 2: Run backend tests**

Run: `cd backend && go test ./... -v`
Expected: all pass

**Step 3: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

**Step 4: Manual E2E test**

1. Open InvoicesPage in browser
2. Click "同步發票"
3. Verify: Blue banner appears with "同步中..."
4. Verify: Numbers update as invoices are processed
5. Verify: Banner turns green "同步完成！" for ~5 seconds then disappears
6. Verify: Invoice list refreshes with new data
