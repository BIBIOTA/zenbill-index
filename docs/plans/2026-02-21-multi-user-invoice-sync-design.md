# Multi-User Invoice Sync Design

## Date: 2026-02-21

## Problem

ZenBill's invoice sync currently supports only a single user:
- E-invoice credentials (phone barcode + verify code) stored in global config
- Browser session is shared globally (`sessions/browser_state.json`)
- `manual_sync` hardcodes a user UUID
- `InvoiceNumber` has a global unique constraint (should be per-user)

The auth system (magic link) and all API handlers already support multi-user via JWT + `userID` scoping, but the invoice sync pipeline does not.

## Requirements

- Each user binds their own e-invoice carrier (phone barcode + verify code)
- Support manual trigger (API) + daily background scheduling (Worker)
- Credentials encrypted with AES-256-GCM in database
- Playwright browser instances run serially (one user at a time, queue-based)

## Design

### 1. New Table: `user_einvoice_credentials`

```sql
CREATE TABLE user_einvoice_credentials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    phone_barcode   BYTEA NOT NULL,         -- AES-GCM encrypted
    verify_code     BYTEA NOT NULL,         -- AES-GCM encrypted
    key_id          VARCHAR(50) NOT NULL,    -- encryption key version
    last_synced_at  TIMESTAMP WITH TIME ZONE,
    sync_status     VARCHAR(20) NOT NULL DEFAULT 'idle',  -- idle/syncing/error
    sync_error      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

### 2. Fix Invoice Unique Constraint

```sql
-- Drop global unique index on invoice_number
-- Create composite unique index
CREATE UNIQUE INDEX idx_invoices_user_invoice_number ON invoices(user_id, invoice_number);
```

### 3. Domain Layer Changes

**New entity: `EInvoiceCredential`**

```go
type EInvoiceCredential struct {
    ID            uuid.UUID
    UserID        uuid.UUID
    PhoneBarcode  string    // decrypted in memory only
    VerifyCode    string    // decrypted in memory only
    KeyID         string
    LastSyncedAt  *time.Time
    SyncStatus    string    // "idle", "syncing", "error"
    SyncError     *string
    CreatedAt     time.Time
    UpdatedAt     time.Time
}
```

**New repository interface: `EInvoiceCredentialRepository`**

```go
type EInvoiceCredentialRepository interface {
    Create(ctx context.Context, cred *EInvoiceCredential) error
    FindByUserID(ctx context.Context, userID uuid.UUID) (*EInvoiceCredential, error)
    Update(ctx context.Context, cred *EInvoiceCredential) error
    Delete(ctx context.Context, userID uuid.UUID) error
    FindAllActive(ctx context.Context) ([]EInvoiceCredential, error) // for worker scheduling
    UpdateSyncStatus(ctx context.Context, userID uuid.UUID, status string, syncErr *string) error
}
```

### 4. Encryption Service

```go
type CredentialEncryptor struct {
    key   []byte  // 32 bytes for AES-256
    keyID string
}

func (e *CredentialEncryptor) Encrypt(plaintext string) ([]byte, error)
func (e *CredentialEncryptor) Decrypt(ciphertext []byte) (string, error)
```

- Key from env: `ZENBILL_CREDENTIAL_ENCRYPTION_KEY` (base64-encoded 32-byte key)
- Key ID stored per-credential for future key rotation
- AES-256-GCM with random nonce prepended to ciphertext

### 5. InvoiceSyncService Changes

```go
// Before
type InvoiceSyncService struct {
    invoiceRepo domain.InvoiceRepository
    scraper     einvoice.Scraper
    credentials *Credentials  // global!
}

// After
type InvoiceSyncService struct {
    invoiceRepo domain.InvoiceRepository
    credRepo    domain.EInvoiceCredentialRepository
    encryptor   *CredentialEncryptor
    scraperFactory func(sessionDir string) einvoice.Scraper
}

func (s *InvoiceSyncService) SyncInvoices(ctx context.Context, userID uuid.UUID, startDate, endDate time.Time) (*SyncResult, error) {
    // 1. Load and decrypt credentials from DB
    // 2. Set sync_status = "syncing"
    // 3. Create scraper with per-user session dir: sessions/{userID}/
    // 4. Execute sync
    // 5. Update last_synced_at, sync_status
}
```

### 6. Sync Queue

```go
type SyncQueue struct {
    jobs chan SyncJob
}

type SyncJob struct {
    UserID    uuid.UUID
    StartDate time.Time
    EndDate   time.Time
    DoneCh    chan SyncResult  // optional, for API-triggered syncs
}
```

- Single worker goroutine consumes from queue
- API trigger: enqueue job, return 202 Accepted + job ID
- Worker schedule: iterate all users with credentials, enqueue each

### 7. New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/einvoice/credentials` | Bind/update carrier credentials |
| `GET` | `/api/v1/einvoice/credentials` | Get binding status (no plaintext) |
| `DELETE` | `/api/v1/einvoice/credentials` | Unbind carrier |
| `POST` | `/api/v1/sync/invoices` | Manual trigger sync (returns 202) |
| `GET` | `/api/v1/sync/status` | Get sync status |

### 8. Browser Session Isolation

```
sessions/
├── {user-id-1}/
│   └── browser_state.json
├── {user-id-2}/
│   └── browser_state.json
```

Each user gets an isolated Playwright session directory. The scraper factory creates a new scraper instance pointing to the user-specific session path.

### 9. Worker Scheduling

```go
// In cmd/worker/main.go
func dailySyncJob(syncService *InvoiceSyncService, credRepo domain.EInvoiceCredentialRepository, queue *SyncQueue) {
    creds, _ := credRepo.FindAllActive(ctx)
    for _, cred := range creds {
        queue.Enqueue(SyncJob{
            UserID:    cred.UserID,
            StartDate: time.Now().AddDate(0, 0, -7),
            EndDate:   time.Now(),
        })
    }
}
```

### 10. Config Changes

```yaml
# Remove global einvoice credentials from config
# einvoice:
#   phone_number: "..."    # REMOVED
#   verify_code: "..."     # REMOVED

# Add encryption key (env var preferred)
# ZENBILL_CREDENTIAL_ENCRYPTION_KEY=base64-encoded-32-byte-key
```

## Migration Strategy

1. Create `user_einvoice_credentials` table
2. Migrate existing global credentials to first user's record (if applicable)
3. Drop global unique index on `invoices.invoice_number`
4. Create composite unique index on `(user_id, invoice_number)`
5. Remove global credential config from `config.yaml`

## Security Considerations

- Credentials encrypted at rest with AES-256-GCM
- Decrypted only in memory during sync execution
- API never returns plaintext credentials
- Per-user session isolation prevents cross-user data leakage
- Encryption key rotation supported via `key_id` field
