# Per-Ledger Google Credential Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow per-ledger Service Account JSON upload via frontend, encrypted storage in DB, and per-ledger Google Sheets client creation during sync.

**Architecture:** Frontend reads JSON file → sends as string in JSON body → backend encrypts with existing AES-GCM Encryptor → stores in SharedLedger.GoogleCredentialEncrypted. Sync service decrypts and creates per-ledger Sheets client.

**Tech Stack:** React + TypeScript (frontend), Go + Gin + GORM (backend), `pkg/crypto.Encryptor` (AES-256-GCM), `google.golang.org/api/option.WithCredentialsJSON`

---

### Task 1: Add NewClientFromJSON to googlesheet client

**Files:**
- Modify: `backend/pkg/googlesheet/client.go`

**Step 1: Add the new constructor**

After the existing `NewClient` function, add:

```go
// NewClientFromJSON creates a new Google Sheets client from raw service account JSON bytes.
func NewClientFromJSON(ctx context.Context, credJSON []byte) (*Client, error) {
	svc, err := sheets.NewService(ctx, option.WithCredentialsJSON(credJSON))
	if err != nil {
		return nil, fmt.Errorf("create sheets service from JSON: %w", err)
	}
	return &Client{service: svc}, nil
}
```

**Step 2: Commit**

```bash
git add backend/pkg/googlesheet/client.go
git commit -m "feat(googlesheet): add NewClientFromJSON constructor"
```

---

### Task 2: Add GoogleCredentialEncrypted field to SharedLedger entity

**Files:**
- Modify: `backend/internal/domain/shared_ledger.go`

**Step 1: Add field to struct**

After `SyncEnabled` field, add:

```go
GoogleCredentialEncrypted []byte `gorm:"type:bytea" json:"-"`
```

Note: `json:"-"` ensures encrypted bytes are never serialized to API responses.

**Step 2: Add a helper field for API response**

Add a computed JSON field method or add to the struct:

```go
HasGoogleCredential bool `gorm:"-" json:"has_google_credential"`
```

**Step 3: Commit**

```bash
git add backend/internal/domain/shared_ledger.go
git commit -m "feat(domain): add GoogleCredentialEncrypted to SharedLedger"
```

---

### Task 3: Add HasGoogleCredential to frontend type

**Files:**
- Modify: `frontend/src/types/index.ts`

**Step 1: Add field to SharedLedger interface**

After `sync_enabled: boolean`, add:

```typescript
has_google_credential: boolean
```

**Step 2: Add credential field to UpdateSharedLedgerInput**

Add to the `UpdateSharedLedgerInput` interface:

```typescript
google_credential_json?: string
```

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(frontend): add google credential fields to types"
```

---

### Task 4: Update backend handler to accept and encrypt credential JSON

**Files:**
- Modify: `backend/internal/delivery/http/shared_ledger_handler.go`

**Step 1: Add encryptor to handler struct**

```go
import "github.com/yukiota/zenbill/pkg/crypto"
```

Add field to struct:
```go
type SharedLedgerHandler struct {
	ledgerService *usecase.SharedLedgerService
	syncService   *usecase.SheetSyncService
	encryptor     *crypto.Encryptor
	logger        *slog.Logger
}
```

Update constructor to accept `encryptor *crypto.Encryptor` and store it.

**Step 2: Add credential field to updateSharedLedgerRequest**

```go
type updateSharedLedgerRequest struct {
	Name                 *string `json:"name"`
	GoogleSheetID        *string `json:"google_sheet_id"`
	GoogleSheetGID       *string `json:"google_sheet_gid"`
	SyncEnabled          *bool   `json:"sync_enabled"`
	GoogleCredentialJSON *string `json:"google_credential_json"`
}
```

**Step 3: In UpdateLedger handler, encrypt and store credential**

After the existing field updates (GoogleSheetID, GoogleSheetGID, SyncEnabled), add:

```go
if req.GoogleCredentialJSON != nil && *req.GoogleCredentialJSON != "" {
	encrypted, err := h.encryptor.Encrypt(*req.GoogleCredentialJSON)
	if err != nil {
		h.logger.ErrorContext(ctx, "Failed to encrypt Google credential", "error", err)
		InternalServerError(c, "failed to encrypt credential")
		return
	}
	ledger.GoogleCredentialEncrypted = encrypted
}
```

**Step 4: In GetLedger and ListLedgers responses, populate HasGoogleCredential**

After fetching ledger(s), set:
```go
ledger.HasGoogleCredential = len(ledger.GoogleCredentialEncrypted) > 0
```

For ListLedgers, loop through and set for each.

**Step 5: Commit**

```bash
git add backend/internal/delivery/http/shared_ledger_handler.go
git commit -m "feat(handler): accept and encrypt Google credential JSON on update"
```

---

### Task 5: Refactor SheetSyncService to use per-ledger credentials

**Files:**
- Modify: `backend/internal/usecase/sheet_sync_service.go`

**Step 1: Replace global sheetClient with encryptor**

```go
type SheetSyncService struct {
	encryptor   *crypto.Encryptor
	expenseRepo domain.SharedExpenseRepository
	ledgerRepo  domain.SharedLedgerRepository
	logger      *slog.Logger
}

func NewSheetSyncService(
	encryptor *crypto.Encryptor,
	expenseRepo domain.SharedExpenseRepository,
	ledgerRepo domain.SharedLedgerRepository,
	logger *slog.Logger,
) *SheetSyncService {
	return &SheetSyncService{
		encryptor:   encryptor,
		expenseRepo: expenseRepo,
		ledgerRepo:  ledgerRepo,
		logger:      logger,
	}
}
```

**Step 2: Add helper to create per-ledger client**

```go
func (s *SheetSyncService) clientForLedger(ctx context.Context, ledger *domain.SharedLedger) (*googlesheet.Client, error) {
	if len(ledger.GoogleCredentialEncrypted) == 0 {
		return nil, fmt.Errorf("ledger has no Google credential configured")
	}
	credJSON, err := s.encryptor.Decrypt(ledger.GoogleCredentialEncrypted)
	if err != nil {
		return nil, fmt.Errorf("decrypt credential: %w", err)
	}
	return googlesheet.NewClientFromJSON(ctx, []byte(credJSON))
}
```

**Step 3: Update SyncToSheet and SyncFromSheet to use clientForLedger**

In `SyncToSheet`, after fetching ledger, replace `s.sheetClient` usage:
```go
client, err := s.clientForLedger(ctx, ledger)
if err != nil {
	return 0, fmt.Errorf("create sheets client: %w", err)
}
// Use client.AppendRows(...) instead of s.sheetClient.AppendRows(...)
```

Same pattern in `SyncFromSheet`: use `client.ReadSheet(...)`.

**Step 4: Commit**

```bash
git add backend/internal/usecase/sheet_sync_service.go
git commit -m "refactor(sync): use per-ledger encrypted credentials instead of global client"
```

---

### Task 6: Update main.go wiring

**Files:**
- Modify: `backend/cmd/api/main.go`

**Step 1: Remove global googlesheet.Client initialization**

Remove the block:
```go
var sheetSyncService *usecase.SheetSyncService
if cfg.Google.ServiceAccountKeyPath != "" {
	sheetClient, err := googlesheet.NewClient(...)
	...
}
```

Replace with:
```go
sheetSyncService := usecase.NewSheetSyncService(encryptor, sharedExpenseRepo, sharedLedgerRepo, logger.Get())
```

**Step 2: Update NewSharedLedgerHandler call**

Add encryptor parameter:
```go
sharedLedgerHandler := httpdelivery.NewSharedLedgerHandler(sharedLedgerService, sheetSyncService, encryptor, logger.Get())
```

**Step 3: Remove `googlesheet` import if no longer used in main.go**

**Step 4: Commit**

```bash
git add backend/cmd/api/main.go
git commit -m "refactor(main): wire per-ledger credential encryption, remove global sheet client"
```

---

### Task 7: Add file upload to frontend binding form

**Files:**
- Modify: `frontend/src/pages/SharedLedgerDetailPage.tsx`

**Step 1: Add credential file state**

In the component, after `sheetForm` state:
```typescript
const [credentialFile, setCredentialFile] = useState<string>('')
const [credentialFileName, setCredentialFileName] = useState<string>('')
```

**Step 2: Add file reader handler**

```typescript
const handleCredentialFile = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  setCredentialFileName(file.name)
  const reader = new FileReader()
  reader.onload = (ev) => {
    const content = ev.target?.result as string
    setCredentialFile(content)
  }
  reader.readAsText(file)
}
```

**Step 3: Update handleSaveSheet to include credential**

```typescript
const handleSaveSheet = () => {
  updateMutation.mutate(
    {
      google_sheet_id: sheetForm.google_sheet_id,
      google_sheet_gid: sheetForm.google_sheet_gid || undefined,
      sync_enabled: true,
      ...(credentialFile ? { google_credential_json: credentialFile } : {}),
    },
    {
      onSuccess: () => {
        setShowSheetForm(false)
        setCredentialFile('')
        setCredentialFileName('')
      },
    },
  )
}
```

**Step 4: Reset credential state in handleOpenSheetForm**

Add to `handleOpenSheetForm`:
```typescript
setCredentialFile('')
setCredentialFileName('')
```

**Step 5: Add file input to the form JSX**

After the Sheet GID input field, before the button row, add:

```tsx
<div>
  <label className="block text-xs text-[var(--text-muted)] mb-1">
    Service Account JSON Key
  </label>
  <label className="flex items-center gap-2 h-8 px-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] cursor-pointer hover:bg-[var(--bg-hover)]">
    <span className="text-[var(--text-muted)]">
      {credentialFileName || (ledger.has_google_credential ? '已上傳（重新上傳將覆蓋）' : '選擇檔案...')}
    </span>
    <input
      type="file"
      accept=".json"
      onChange={handleCredentialFile}
      className="hidden"
    />
  </label>
</div>
```

**Step 6: Update the bound status display**

Change the bound status section to show credential status:
```tsx
) : ledger.google_sheet_id ? (
  <div className="space-y-1">
    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
      <span className="truncate">已綁定: {ledger.google_sheet_gid || 'Sheet1'}</span>
    </div>
    {ledger.has_google_credential && (
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>憑證已設定</span>
      </div>
    )}
  </div>
```

**Step 7: Commit**

```bash
git add frontend/src/pages/SharedLedgerDetailPage.tsx
git commit -m "feat(frontend): add Service Account JSON file upload to binding form"
```

---

### Task 8: Auto-migrate and build verification

**Step 1: Run GORM auto-migrate**

GORM auto-migrates on startup, so the new `GoogleCredentialEncrypted` column will be added automatically. No manual migration needed.

**Step 2: Verify backend builds**

```bash
cd backend && go build ./...
```

**Step 3: Verify frontend builds**

```bash
cd frontend && npx tsc --noEmit
```

**Step 4: Commit any fixes if needed**

---

## Task Summary

| Task | Description | Layer |
|------|-------------|-------|
| 1 | Add `NewClientFromJSON` to googlesheet client | Backend pkg |
| 2 | Add `GoogleCredentialEncrypted` to SharedLedger entity | Backend domain |
| 3 | Add credential fields to frontend types | Frontend |
| 4 | Handler: accept & encrypt credential JSON | Backend delivery |
| 5 | Refactor SheetSyncService to per-ledger credentials | Backend usecase |
| 6 | Update main.go wiring | Backend cmd |
| 7 | Frontend file upload UI | Frontend |
| 8 | Build verification | QA |
