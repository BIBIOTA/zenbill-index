# Multi-User Invoice Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable each user to bind their own e-invoice carrier credentials, with per-user invoice syncing via API trigger and daily background scheduling.

**Architecture:** Extend Clean Architecture with new `EInvoiceCredential` domain entity, AES-256-GCM encryption service for credential storage, sync queue for serial Playwright execution, and per-user browser session isolation. Fix the `Invoice.InvoiceNumber` unique constraint to be per-user.

**Tech Stack:** Go 1.22+, GORM, Gin, AES-256-GCM (crypto/aes + crypto/cipher), playwright-go, robfig/cron

---

### Task 1: Domain Entity — EInvoiceCredential

**Files:**
- Create: `backend/internal/domain/einvoice_credential.go`

**Step 1: Create the entity file**

```go
package domain

import (
	"time"

	"github.com/google/uuid"
)

// SyncStatus represents the sync state of a user's e-invoice credential
type SyncStatus string

const (
	SyncStatusIdle    SyncStatus = "idle"
	SyncStatusSyncing SyncStatus = "syncing"
	SyncStatusError   SyncStatus = "error"
)

// EInvoiceCredential stores a user's encrypted e-invoice platform credentials
type EInvoiceCredential struct {
	ID           uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID       uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex" json:"user_id"`
	PhoneBarcode []byte     `gorm:"type:bytea;not null" json:"-"` // AES-GCM encrypted
	VerifyCode   []byte     `gorm:"type:bytea;not null" json:"-"` // AES-GCM encrypted
	KeyID        string     `gorm:"type:varchar(50);not null" json:"key_id"`
	LastSyncedAt *time.Time `gorm:"type:timestamptz" json:"last_synced_at"`
	SyncStatus   SyncStatus `gorm:"type:varchar(20);not null;default:'idle'" json:"sync_status"`
	SyncError    *string    `gorm:"type:text" json:"sync_error,omitempty"`
	CreatedAt    time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"autoUpdateTime" json:"updated_at"`

	// Relationships
	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// TableName overrides the table name
func (EInvoiceCredential) TableName() string {
	return "user_einvoice_credentials"
}

// IsSyncing returns true if currently syncing
func (c *EInvoiceCredential) IsSyncing() bool {
	return c.SyncStatus == SyncStatusSyncing
}

// IsIdle returns true if idle
func (c *EInvoiceCredential) IsIdle() bool {
	return c.SyncStatus == SyncStatusIdle
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && gofmt -e internal/domain/einvoice_credential.go`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/internal/domain/einvoice_credential.go
git commit -m "feat: add EInvoiceCredential domain entity"
```

---

### Task 2: Repository Interface — EInvoiceCredentialRepository

**Files:**
- Modify: `backend/internal/domain/repository.go`

**Step 1: Add the interface to repository.go**

Append after the `CategoryRepository` interface (before the closing of the file):

```go
// EInvoiceCredentialRepository defines the interface for e-invoice credential data access
type EInvoiceCredentialRepository interface {
	Create(ctx context.Context, cred *EInvoiceCredential) error
	FindByUserID(ctx context.Context, userID uuid.UUID) (*EInvoiceCredential, error)
	Update(ctx context.Context, cred *EInvoiceCredential) error
	Delete(ctx context.Context, userID uuid.UUID) error
	FindAllActive(ctx context.Context) ([]EInvoiceCredential, error)
	UpdateSyncStatus(ctx context.Context, userID uuid.UUID, status SyncStatus, syncErr *string) error
	UpdateLastSyncedAt(ctx context.Context, userID uuid.UUID, t time.Time) error
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && gofmt -e internal/domain/repository.go`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/internal/domain/repository.go
git commit -m "feat: add EInvoiceCredentialRepository interface"
```

---

### Task 3: Repository Implementation — EInvoiceCredentialRepository

**Files:**
- Create: `backend/internal/repository/einvoice_credential_repository.go`

**Step 1: Create the repository implementation**

```go
package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
)

// EInvoiceCredentialRepositoryImpl implements domain.EInvoiceCredentialRepository using GORM
type EInvoiceCredentialRepositoryImpl struct {
	db *gorm.DB
}

// NewEInvoiceCredentialRepository creates a new e-invoice credential repository
func NewEInvoiceCredentialRepository(db *gorm.DB) domain.EInvoiceCredentialRepository {
	return &EInvoiceCredentialRepositoryImpl{db: db}
}

// Create creates a new credential record
func (r *EInvoiceCredentialRepositoryImpl) Create(ctx context.Context, cred *domain.EInvoiceCredential) error {
	return r.db.WithContext(ctx).Create(cred).Error
}

// FindByUserID finds a credential by user ID
func (r *EInvoiceCredentialRepositoryImpl) FindByUserID(ctx context.Context, userID uuid.UUID) (*domain.EInvoiceCredential, error) {
	var cred domain.EInvoiceCredential
	err := r.db.WithContext(ctx).First(&cred, "user_id = ?", userID).Error
	if err != nil {
		return nil, err
	}
	return &cred, nil
}

// Update updates a credential record
func (r *EInvoiceCredentialRepositoryImpl) Update(ctx context.Context, cred *domain.EInvoiceCredential) error {
	return r.db.WithContext(ctx).Save(cred).Error
}

// Delete deletes a credential by user ID
func (r *EInvoiceCredentialRepositoryImpl) Delete(ctx context.Context, userID uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&domain.EInvoiceCredential{}, "user_id = ?", userID).Error
}

// FindAllActive returns all credentials that are not currently syncing (for worker scheduling)
func (r *EInvoiceCredentialRepositoryImpl) FindAllActive(ctx context.Context) ([]domain.EInvoiceCredential, error) {
	var creds []domain.EInvoiceCredential
	err := r.db.WithContext(ctx).Where("sync_status != ?", domain.SyncStatusSyncing).Find(&creds).Error
	if err != nil {
		return nil, err
	}
	return creds, nil
}

// UpdateSyncStatus updates the sync status and optional error message
func (r *EInvoiceCredentialRepositoryImpl) UpdateSyncStatus(ctx context.Context, userID uuid.UUID, status domain.SyncStatus, syncErr *string) error {
	updates := map[string]interface{}{
		"sync_status": status,
		"sync_error":  syncErr,
	}
	return r.db.WithContext(ctx).Model(&domain.EInvoiceCredential{}).Where("user_id = ?", userID).Updates(updates).Error
}

// UpdateLastSyncedAt updates the last synced timestamp
func (r *EInvoiceCredentialRepositoryImpl) UpdateLastSyncedAt(ctx context.Context, userID uuid.UUID, t time.Time) error {
	return r.db.WithContext(ctx).Model(&domain.EInvoiceCredential{}).Where("user_id = ?", userID).Update("last_synced_at", t).Error
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && gofmt -e internal/repository/einvoice_credential_repository.go`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/internal/repository/einvoice_credential_repository.go
git commit -m "feat: add EInvoiceCredentialRepository GORM implementation"
```

---

### Task 4: Credential Encryption Service

**Files:**
- Create: `backend/pkg/crypto/encryptor.go`

**Step 1: Create the encryption service**

```go
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
)

// Encryptor provides AES-256-GCM encryption/decryption for sensitive credentials
type Encryptor struct {
	key   []byte // 32 bytes for AES-256
	keyID string
}

// NewEncryptor creates a new Encryptor from a base64-encoded 32-byte key
func NewEncryptor(base64Key string, keyID string) (*Encryptor, error) {
	key, err := base64.StdEncoding.DecodeString(base64Key)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 key: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("key must be 32 bytes for AES-256, got %d", len(key))
	}
	return &Encryptor{key: key, keyID: keyID}, nil
}

// KeyID returns the key version identifier
func (e *Encryptor) KeyID() string {
	return e.keyID
}

// Encrypt encrypts plaintext using AES-256-GCM. Returns nonce prepended to ciphertext.
func (e *Encryptor) Encrypt(plaintext string) ([]byte, error) {
	block, err := aes.NewCipher(e.key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("generate nonce: %w", err)
	}

	// nonce is prepended to the ciphertext
	return gcm.Seal(nonce, nonce, []byte(plaintext), nil), nil
}

// Decrypt decrypts ciphertext (with prepended nonce) using AES-256-GCM.
func (e *Encryptor) Decrypt(ciphertext []byte) (string, error) {
	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ct := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}

	return string(plaintext), nil
}
```

**Step 2: Write tests for the encryptor**

Create: `backend/pkg/crypto/encryptor_test.go`

```go
package crypto

import (
	"encoding/base64"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func generateTestKey() string {
	// 32 random bytes encoded as base64
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	return base64.StdEncoding.EncodeToString(key)
}

func TestEncryptor_NewEncryptor_ValidKey(t *testing.T) {
	enc, err := NewEncryptor(generateTestKey(), "v1")
	require.NoError(t, err)
	assert.Equal(t, "v1", enc.KeyID())
}

func TestEncryptor_NewEncryptor_InvalidBase64(t *testing.T) {
	_, err := NewEncryptor("not-valid-base64!!!", "v1")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid base64 key")
}

func TestEncryptor_NewEncryptor_WrongKeyLength(t *testing.T) {
	shortKey := base64.StdEncoding.EncodeToString([]byte("tooshort"))
	_, err := NewEncryptor(shortKey, "v1")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "key must be 32 bytes")
}

func TestEncryptor_EncryptDecrypt_RoundTrip(t *testing.T) {
	enc, err := NewEncryptor(generateTestKey(), "v1")
	require.NoError(t, err)

	original := "0912345678"
	ciphertext, err := enc.Encrypt(original)
	require.NoError(t, err)
	assert.NotEqual(t, []byte(original), ciphertext)

	decrypted, err := enc.Decrypt(ciphertext)
	require.NoError(t, err)
	assert.Equal(t, original, decrypted)
}

func TestEncryptor_EncryptDecrypt_DifferentCiphertexts(t *testing.T) {
	enc, err := NewEncryptor(generateTestKey(), "v1")
	require.NoError(t, err)

	ct1, _ := enc.Encrypt("same-value")
	ct2, _ := enc.Encrypt("same-value")

	// Different nonces should produce different ciphertexts
	assert.NotEqual(t, ct1, ct2)

	// But both should decrypt to the same value
	d1, _ := enc.Decrypt(ct1)
	d2, _ := enc.Decrypt(ct2)
	assert.Equal(t, d1, d2)
}

func TestEncryptor_Decrypt_TamperedCiphertext(t *testing.T) {
	enc, err := NewEncryptor(generateTestKey(), "v1")
	require.NoError(t, err)

	ct, _ := enc.Encrypt("secret")
	ct[len(ct)-1] ^= 0xff // flip last byte

	_, err = enc.Decrypt(ct)
	assert.Error(t, err)
}

func TestEncryptor_Decrypt_TooShort(t *testing.T) {
	enc, err := NewEncryptor(generateTestKey(), "v1")
	require.NoError(t, err)

	_, err = enc.Decrypt([]byte("short"))
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "ciphertext too short")
}
```

**Step 3: Run tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./pkg/crypto/... -v`
Expected: All 6 tests PASS

**Step 4: Commit**

```bash
git add backend/pkg/crypto/
git commit -m "feat: add AES-256-GCM credential encryption service with tests"
```

---

### Task 5: Fix Invoice Unique Constraint

**Files:**
- Modify: `backend/internal/domain/invoice.go`
- Modify: `backend/internal/domain/repository.go`
- Modify: `backend/internal/repository/invoice_repository.go` (if FindByInvoiceNumber needs userID)
- Modify: `backend/internal/usecase/invoice_sync_service.go` (use user-scoped lookup)

**Step 1: Change Invoice entity — replace global uniqueIndex with composite**

In `backend/internal/domain/invoice.go`, change:

```go
InvoiceNumber string `gorm:"type:varchar(20);uniqueIndex;not null" json:"invoice_number"`
```

to:

```go
InvoiceNumber string `gorm:"type:varchar(20);not null;index:idx_invoices_user_invoice_number,unique,composite:user_invoice" json:"invoice_number"`
```

Also update the `UserID` field to participate in the composite index:

```go
UserID uuid.UUID `gorm:"type:uuid;not null;index;index:idx_invoices_user_invoice_number,unique,composite:user_invoice" json:"user_id"`
```

**Step 2: Update InvoiceRepository interface — FindByInvoiceNumber needs userID**

In `backend/internal/domain/repository.go`, change:

```go
FindByInvoiceNumber(ctx context.Context, invoiceNumber string) (*Invoice, error)
```

to:

```go
FindByInvoiceNumber(ctx context.Context, userID uuid.UUID, invoiceNumber string) (*Invoice, error)
```

**Step 3: Update repository implementation**

In `backend/internal/repository/invoice_repository.go`, update the `FindByInvoiceNumber` method to filter by both `user_id` and `invoice_number`:

```go
func (r *InvoiceRepositoryImpl) FindByInvoiceNumber(ctx context.Context, userID uuid.UUID, invoiceNumber string) (*Invoice, error) {
	var invoice domain.Invoice
	err := r.db.WithContext(ctx).First(&invoice, "user_id = ? AND invoice_number = ?", userID, invoiceNumber).Error
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}
```

**Step 4: Update InvoiceSyncService to pass userID**

In `backend/internal/usecase/invoice_sync_service.go`, in the `processInvoice` method, change:

```go
existing, err := s.invoiceRepo.FindByInvoiceNumber(ctx, inv.InvoiceNumber)
```

to:

```go
existing, err := s.invoiceRepo.FindByInvoiceNumber(ctx, userID, inv.InvoiceNumber)
```

**Step 5: Update any other callers of FindByInvoiceNumber**

Search the codebase for other calls to `FindByInvoiceNumber` and update them to pass userID. Check handlers and tests.

**Step 6: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Build succeeds (or use `gofmt -e` if CGO not available)

**Step 7: Run existing tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/domain/... -v`
Expected: All tests pass

**Step 8: Commit**

```bash
git add backend/internal/domain/invoice.go backend/internal/domain/repository.go backend/internal/repository/invoice_repository.go backend/internal/usecase/invoice_sync_service.go
git commit -m "fix: change Invoice unique constraint to per-user composite (user_id, invoice_number)"
```

---

### Task 6: Credential Service (Usecase Layer)

**Files:**
- Create: `backend/internal/usecase/credential_service.go`

**Step 1: Create the credential service**

```go
package usecase

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"github.com/yukiota/zenbill/pkg/crypto"
)

// CredentialService manages e-invoice credential CRUD with encryption
type CredentialService struct {
	credRepo  domain.EInvoiceCredentialRepository
	encryptor *crypto.Encryptor
	logger    *slog.Logger
}

// NewCredentialService creates a new credential service
func NewCredentialService(
	credRepo domain.EInvoiceCredentialRepository,
	encryptor *crypto.Encryptor,
	logger *slog.Logger,
) *CredentialService {
	if logger == nil {
		logger = slog.Default()
	}
	return &CredentialService{
		credRepo:  credRepo,
		encryptor: encryptor,
		logger:    logger,
	}
}

// BindCredentials creates or updates a user's e-invoice credentials
func (s *CredentialService) BindCredentials(ctx context.Context, userID uuid.UUID, phoneBarcode, verifyCode string) error {
	// Encrypt credentials
	encPhone, err := s.encryptor.Encrypt(phoneBarcode)
	if err != nil {
		return fmt.Errorf("encrypt phone barcode: %w", err)
	}

	encVerify, err := s.encryptor.Encrypt(verifyCode)
	if err != nil {
		return fmt.Errorf("encrypt verify code: %w", err)
	}

	// Check if credential already exists
	existing, err := s.credRepo.FindByUserID(ctx, userID)
	if err == nil && existing != nil {
		// Update existing
		existing.PhoneBarcode = encPhone
		existing.VerifyCode = encVerify
		existing.KeyID = s.encryptor.KeyID()
		if err := s.credRepo.Update(ctx, existing); err != nil {
			return fmt.Errorf("update credentials: %w", err)
		}
		s.logger.InfoContext(ctx, "credentials updated", "user_id", userID)
		return nil
	}

	// Create new
	cred := &domain.EInvoiceCredential{
		UserID:       userID,
		PhoneBarcode: encPhone,
		VerifyCode:   encVerify,
		KeyID:        s.encryptor.KeyID(),
		SyncStatus:   domain.SyncStatusIdle,
	}

	if err := s.credRepo.Create(ctx, cred); err != nil {
		return fmt.Errorf("create credentials: %w", err)
	}

	s.logger.InfoContext(ctx, "credentials bound", "user_id", userID)
	return nil
}

// GetStatus returns the credential binding status (no plaintext)
func (s *CredentialService) GetStatus(ctx context.Context, userID uuid.UUID) (*domain.EInvoiceCredential, error) {
	cred, err := s.credRepo.FindByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	// Clear encrypted fields before returning
	cred.PhoneBarcode = nil
	cred.VerifyCode = nil
	return cred, nil
}

// Unbind deletes a user's e-invoice credentials
func (s *CredentialService) Unbind(ctx context.Context, userID uuid.UUID) error {
	if err := s.credRepo.Delete(ctx, userID); err != nil {
		return fmt.Errorf("delete credentials: %w", err)
	}
	s.logger.InfoContext(ctx, "credentials unbound", "user_id", userID)
	return nil
}

// DecryptCredentials loads and decrypts a user's credentials (for sync use)
func (s *CredentialService) DecryptCredentials(ctx context.Context, userID uuid.UUID) (phoneBarcode, verifyCode string, err error) {
	cred, err := s.credRepo.FindByUserID(ctx, userID)
	if err != nil {
		return "", "", fmt.Errorf("find credentials: %w", err)
	}

	phoneBarcode, err = s.encryptor.Decrypt(cred.PhoneBarcode)
	if err != nil {
		return "", "", fmt.Errorf("decrypt phone barcode: %w", err)
	}

	verifyCode, err = s.encryptor.Decrypt(cred.VerifyCode)
	if err != nil {
		return "", "", fmt.Errorf("decrypt verify code: %w", err)
	}

	return phoneBarcode, verifyCode, nil
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && gofmt -e internal/usecase/credential_service.go`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/internal/usecase/credential_service.go
git commit -m "feat: add CredentialService for encrypted e-invoice credential management"
```

---

### Task 7: Sync Queue

**Files:**
- Create: `backend/internal/usecase/sync_queue.go`

**Step 1: Create the sync queue**

```go
package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
)

// SyncJob represents a pending invoice sync request
type SyncJob struct {
	UserID    uuid.UUID
	StartDate time.Time
	EndDate   time.Time
	DoneCh   chan error // optional: non-nil for API-triggered syncs that want to await completion
}

// SyncQueue manages serial execution of invoice sync jobs
type SyncQueue struct {
	jobs   chan SyncJob
	logger *slog.Logger
	wg     sync.WaitGroup
	cancel context.CancelFunc
}

// NewSyncQueue creates and starts a sync queue with the given buffer size
func NewSyncQueue(bufferSize int, logger *slog.Logger) *SyncQueue {
	if logger == nil {
		logger = slog.Default()
	}
	return &SyncQueue{
		jobs:   make(chan SyncJob, bufferSize),
		logger: logger,
	}
}

// SyncExecutor is called by the queue worker to execute a sync job
type SyncExecutor func(ctx context.Context, userID uuid.UUID, startDate, endDate time.Time) error

// Start begins the queue worker goroutine
func (q *SyncQueue) Start(ctx context.Context, executor SyncExecutor) {
	ctx, q.cancel = context.WithCancel(ctx)
	q.wg.Add(1)
	go func() {
		defer q.wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			case job, ok := <-q.jobs:
				if !ok {
					return
				}
				q.logger.Info("processing sync job",
					"user_id", job.UserID,
					"start_date", job.StartDate.Format("2006-01-02"),
					"end_date", job.EndDate.Format("2006-01-02"),
				)
				err := executor(ctx, job.UserID, job.StartDate, job.EndDate)
				if err != nil {
					q.logger.Error("sync job failed",
						"user_id", job.UserID,
						"error", err,
					)
				} else {
					q.logger.Info("sync job completed", "user_id", job.UserID)
				}
				if job.DoneCh != nil {
					job.DoneCh <- err
					close(job.DoneCh)
				}
			}
		}
	}()
}

// Enqueue adds a sync job to the queue. Returns error if queue is full.
func (q *SyncQueue) Enqueue(job SyncJob) error {
	select {
	case q.jobs <- job:
		q.logger.Info("sync job enqueued", "user_id", job.UserID)
		return nil
	default:
		return fmt.Errorf("sync queue is full")
	}
}

// Stop gracefully stops the queue worker
func (q *SyncQueue) Stop() {
	if q.cancel != nil {
		q.cancel()
	}
	q.wg.Wait()
}
```

**Step 2: Write tests**

Create: `backend/internal/usecase/sync_queue_test.go`

```go
package usecase

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSyncQueue_EnqueueAndProcess(t *testing.T) {
	q := NewSyncQueue(10, nil)

	processed := make(chan uuid.UUID, 1)
	executor := func(ctx context.Context, userID uuid.UUID, start, end time.Time) error {
		processed <- userID
		return nil
	}

	ctx := context.Background()
	q.Start(ctx, executor)
	defer q.Stop()

	userID := uuid.New()
	doneCh := make(chan error, 1)
	err := q.Enqueue(SyncJob{
		UserID:    userID,
		StartDate: time.Now().AddDate(0, 0, -7),
		EndDate:   time.Now(),
		DoneCh:    doneCh,
	})
	require.NoError(t, err)

	// Wait for result
	select {
	case err := <-doneCh:
		assert.NoError(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for sync job")
	}

	select {
	case id := <-processed:
		assert.Equal(t, userID, id)
	default:
		t.Fatal("job was not processed")
	}
}

func TestSyncQueue_ExecutorError(t *testing.T) {
	q := NewSyncQueue(10, nil)

	executor := func(ctx context.Context, userID uuid.UUID, start, end time.Time) error {
		return fmt.Errorf("scraper failed")
	}

	ctx := context.Background()
	q.Start(ctx, executor)
	defer q.Stop()

	doneCh := make(chan error, 1)
	err := q.Enqueue(SyncJob{
		UserID: uuid.New(),
		DoneCh: doneCh,
	})
	require.NoError(t, err)

	select {
	case err := <-doneCh:
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "scraper failed")
	case <-time.After(5 * time.Second):
		t.Fatal("timed out")
	}
}

func TestSyncQueue_FullQueue(t *testing.T) {
	q := NewSyncQueue(1, nil)
	// Don't start the worker — fill the buffer
	_ = q.Enqueue(SyncJob{UserID: uuid.New()})
	err := q.Enqueue(SyncJob{UserID: uuid.New()})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sync queue is full")
}
```

**Step 3: Run tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run TestSyncQueue -v`
Expected: All 3 tests PASS

**Step 4: Commit**

```bash
git add backend/internal/usecase/sync_queue.go backend/internal/usecase/sync_queue_test.go
git commit -m "feat: add SyncQueue for serial invoice sync job execution"
```

---

### Task 8: Refactor InvoiceSyncService for Multi-User

**Files:**
- Modify: `backend/internal/usecase/invoice_sync_service.go`

This task modifies InvoiceSyncService to:
1. Accept a scraper factory instead of a single scraper (per-user session dirs)
2. Load credentials from DB via CredentialService
3. Update sync status in DB

**Step 1: Define ScraperFactory type and update InvoiceSyncService struct**

Replace the `InvoiceSyncService` struct and constructor:

```go
// ScraperFactory creates a Scraper with a user-specific session directory
type ScraperFactory func(sessionDir string) (einvoice.Scraper, error)

// InvoiceSyncService 負責同步電子發票資料
type InvoiceSyncService struct {
	invoiceRepo    domain.InvoiceRepository
	credRepo       domain.EInvoiceCredentialRepository
	credService    *CredentialService
	scraperFactory ScraperFactory
	scraperConfig  *einvoice.ScraperConfig
	logger         *slog.Logger
}

// NewInvoiceSyncService 建立新的發票同步服務
func NewInvoiceSyncService(
	invoiceRepo domain.InvoiceRepository,
	credRepo domain.EInvoiceCredentialRepository,
	credService *CredentialService,
	scraperFactory ScraperFactory,
	scraperConfig *einvoice.ScraperConfig,
	logger *slog.Logger,
) *InvoiceSyncService {
	if logger == nil {
		logger = slog.Default()
	}
	return &InvoiceSyncService{
		invoiceRepo:    invoiceRepo,
		credRepo:       credRepo,
		credService:    credService,
		scraperFactory: scraperFactory,
		scraperConfig:  scraperConfig,
		logger:         logger,
	}
}
```

**Step 2: Rewrite SyncInvoices to be per-user**

```go
func (s *InvoiceSyncService) SyncInvoices(
	ctx context.Context,
	userID uuid.UUID,
	startDate, endDate time.Time,
) (*SyncResult, error) {
	m := metrics.NewSyncMetrics()

	s.logger.InfoContext(ctx, "開始同步發票",
		"user_id", userID,
		"start_date", startDate.Format("2006-01-02"),
		"end_date", endDate.Format("2006-01-02"),
	)

	// 1. Update sync status to "syncing"
	if err := s.credRepo.UpdateSyncStatus(ctx, userID, domain.SyncStatusSyncing, nil); err != nil {
		return nil, fmt.Errorf("update sync status: %w", err)
	}

	// Ensure we reset status on exit
	defer func() {
		// Status will be set to idle or error by the end of this function
	}()

	// 2. Decrypt user credentials
	phone, verifyCode, err := s.credService.DecryptCredentials(ctx, userID)
	if err != nil {
		syncErr := err.Error()
		_ = s.credRepo.UpdateSyncStatus(ctx, userID, domain.SyncStatusError, &syncErr)
		return nil, fmt.Errorf("decrypt credentials: %w", err)
	}

	// 3. Create per-user scraper with isolated session
	sessionDir := fmt.Sprintf("%s/%s", s.scraperConfig.SessionDir, userID.String())
	scraper, err := s.scraperFactory(sessionDir)
	if err != nil {
		syncErr := err.Error()
		_ = s.credRepo.UpdateSyncStatus(ctx, userID, domain.SyncStatusError, &syncErr)
		return nil, fmt.Errorf("create scraper: %w", err)
	}
	defer scraper.Close()

	// 4. Load session or login
	if loadErr := scraper.LoadSession(); loadErr != nil || !scraper.IsSessionValid(ctx) {
		s.logger.InfoContext(ctx, "session invalid, logging in", "user_id", userID)
		if loginErr := scraper.Login(ctx, phone, verifyCode); loginErr != nil {
			syncErr := loginErr.Error()
			_ = s.credRepo.UpdateSyncStatus(ctx, userID, domain.SyncStatusError, &syncErr)
			return nil, fmt.Errorf("login failed: %w", loginErr)
		}
	}

	// 5. Fetch invoices
	invoices, err := scraper.GetAllInvoices(ctx, startDate, endDate)
	if err != nil {
		syncErr := err.Error()
		_ = s.credRepo.UpdateSyncStatus(ctx, userID, domain.SyncStatusError, &syncErr)
		return nil, fmt.Errorf("failed to fetch invoices: %w", err)
	}

	s.logger.InfoContext(ctx, "發票資料取得完成", "total", len(invoices))

	// 6. Process each invoice
	for _, inv := range invoices {
		if err := s.processInvoice(ctx, userID, inv, m); err != nil {
			s.logger.ErrorContext(ctx, "處理發票失敗",
				"invoice_number", inv.InvoiceNumber,
				"error", err,
			)
			m.AddError(fmt.Sprintf("invoice %s: %v", inv.InvoiceNumber, err))
		}
	}

	// 7. Finalize
	m.RecordEnd()
	s.logger.InfoContext(ctx, "發票同步完成", m.ToLogFields()...)

	// 8. Update sync status to idle + last_synced_at
	_ = s.credRepo.UpdateSyncStatus(ctx, userID, domain.SyncStatusIdle, nil)
	_ = s.credRepo.UpdateLastSyncedAt(ctx, userID, time.Now())

	result := &SyncResult{
		TotalFetched: m.TotalInvoices,
		NewInvoices:  m.NewInvoices,
		Duplicates:   m.SkippedInvoices,
		ErrorCount:   m.FailedInvoices,
		Duration:     m.Duration,
		Errors:       make([]SyncError, 0, len(m.ErrorMessages)),
	}

	for _, errMsg := range m.ErrorMessages {
		parts := strings.SplitN(errMsg, ": ", 2)
		invoiceNum := ""
		errorText := errMsg
		if len(parts) == 2 {
			invoiceNum = strings.TrimPrefix(parts[0], "invoice ")
			errorText = parts[1]
		}
		result.Errors = append(result.Errors, SyncError{
			InvoiceNumber: invoiceNum,
			Error:         errorText,
		})
	}

	return result, nil
}
```

**Step 3: Remove SetCredentials, Login, LoginWithCaptcha, IsSessionValid, ClearSession, Close methods**

These are no longer needed — the scraper is created per-sync, and credentials come from DB.

Remove these methods:
- `SetCredentials`
- `Login`
- `LoginWithCaptcha`
- `IsSessionValid`
- `ClearSession`
- `Close`

Also remove the `Credentials` struct and the `credentials` field.

**Step 4: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && gofmt -e internal/usecase/invoice_sync_service.go`
Expected: No errors

**Step 5: Commit**

```bash
git add backend/internal/usecase/invoice_sync_service.go
git commit -m "refactor: InvoiceSyncService to support per-user credentials and scraper isolation"
```

---

### Task 9: Credential API Handler

**Files:**
- Create: `backend/internal/delivery/http/credential_handler.go`

**Step 1: Create the handler**

```go
package http

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/yukiota/zenbill/internal/usecase"
	"gorm.io/gorm"
)

// CredentialHandler handles e-invoice credential endpoints
type CredentialHandler struct {
	credService *usecase.CredentialService
	logger      *slog.Logger
}

// NewCredentialHandler creates a new credential handler
func NewCredentialHandler(credService *usecase.CredentialService, logger *slog.Logger) *CredentialHandler {
	return &CredentialHandler{
		credService: credService,
		logger:      logger,
	}
}

// BindRequest represents the credential binding request
type BindRequest struct {
	PhoneBarcode string `json:"phone_barcode" binding:"required"` // 手機條碼 e.g. /ABC1234
	VerifyCode   string `json:"verify_code" binding:"required"`   // 驗證碼
}

// Bind godoc
// @Summary      綁定電子發票載具
// @Description  綁定或更新使用者的電子發票載具憑證（手機條碼 + 驗證碼）
// @Tags         電子發票
// @Accept       json
// @Produce      json
// @Param        body  body      BindRequest  true  "載具憑證"
// @Success      200   {object}  Response
// @Failure      400   {object}  Response
// @Failure      500   {object}  Response
// @Router       /einvoice/credentials [post]
func (h *CredentialHandler) Bind(c *gin.Context) {
	userID := getUserID(c)

	var req BindRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	if err := h.credService.BindCredentials(c.Request.Context(), userID, req.PhoneBarcode, req.VerifyCode); err != nil {
		h.logger.ErrorContext(c.Request.Context(), "bind credentials failed", "error", err)
		InternalServerError(c, "failed to bind credentials")
		return
	}

	SuccessWithMessage(c, "credentials bound successfully", nil)
}

// GetStatus godoc
// @Summary      查詢載具綁定狀態
// @Description  查詢使用者的電子發票載具綁定狀態（不回傳明文憑證）
// @Tags         電子發票
// @Produce      json
// @Success      200  {object}  Response
// @Failure      404  {object}  Response
// @Router       /einvoice/credentials [get]
func (h *CredentialHandler) GetStatus(c *gin.Context) {
	userID := getUserID(c)

	cred, err := h.credService.GetStatus(c.Request.Context(), userID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, Response{
				Code:    200,
				Message: "no credentials bound",
				Data:    gin.H{"bound": false},
			})
			return
		}
		InternalServerError(c, "failed to get credential status")
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "ok",
		Data: gin.H{
			"bound":          true,
			"last_synced_at": cred.LastSyncedAt,
			"sync_status":    cred.SyncStatus,
			"sync_error":     cred.SyncError,
			"created_at":     cred.CreatedAt,
			"updated_at":     cred.UpdatedAt,
		},
	})
}

// Unbind godoc
// @Summary      解除載具綁定
// @Description  刪除使用者的電子發票載具憑證
// @Tags         電子發票
// @Produce      json
// @Success      200  {object}  Response
// @Failure      500  {object}  Response
// @Router       /einvoice/credentials [delete]
func (h *CredentialHandler) Unbind(c *gin.Context) {
	userID := getUserID(c)

	if err := h.credService.Unbind(c.Request.Context(), userID); err != nil {
		h.logger.ErrorContext(c.Request.Context(), "unbind credentials failed", "error", err)
		InternalServerError(c, "failed to unbind credentials")
		return
	}

	SuccessWithMessage(c, "credentials unbound successfully", nil)
}

// RegisterRoutes registers credential routes
func (h *CredentialHandler) RegisterRoutes(r *gin.RouterGroup) {
	creds := r.Group("/einvoice/credentials")
	{
		creds.POST("", h.Bind)
		creds.GET("", h.GetStatus)
		creds.DELETE("", h.Unbind)
	}
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && gofmt -e internal/delivery/http/credential_handler.go`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/internal/delivery/http/credential_handler.go
git commit -m "feat: add credential API handler (bind/status/unbind)"
```

---

### Task 10: Sync Trigger API Handler

**Files:**
- Modify: `backend/internal/delivery/http/invoice_handler.go`

**Step 1: Update InvoiceHandler to use SyncQueue**

Update the struct and constructor to accept a `*SyncQueue`:

```go
type InvoiceHandler struct {
	invoiceRepo domain.InvoiceRepository
	syncQueue   *usecase.SyncQueue
	logger      *slog.Logger
}

func NewInvoiceHandler(
	invoiceRepo domain.InvoiceRepository,
	syncQueue *usecase.SyncQueue,
	logger *slog.Logger,
) *InvoiceHandler {
	return &InvoiceHandler{
		invoiceRepo: invoiceRepo,
		syncQueue:   syncQueue,
		logger:      logger,
	}
}
```

**Step 2: Rewrite TriggerSync to enqueue a job**

```go
func (h *InvoiceHandler) TriggerSync(c *gin.Context) {
	userID := getUserID(c)

	var req SyncRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	startDate, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		BadRequest(c, "invalid start_date format, expected YYYY-MM-DD")
		return
	}

	endDate, err := time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		BadRequest(c, "invalid end_date format, expected YYYY-MM-DD")
		return
	}

	if endDate.Before(startDate) {
		BadRequest(c, "end_date must be after start_date")
		return
	}

	// Enqueue sync job
	err = h.syncQueue.Enqueue(usecase.SyncJob{
		UserID:    userID,
		StartDate: startDate,
		EndDate:   endDate,
	})
	if err != nil {
		InternalServerError(c, "sync queue is full, please try again later")
		return
	}

	c.JSON(202, Response{
		Code:    202,
		Message: "sync job enqueued",
	})
}
```

**Step 3: Remove the Login handler from InvoiceHandler**

Remove the `Login` method and the `LoginRequest` struct — login to the e-invoice platform is now handled internally by the sync service using stored credentials.

**Step 4: Update RegisterRoutes — remove `/auth/login` route**

```go
func (h *InvoiceHandler) RegisterRoutes(r *gin.RouterGroup) {
	invoices := r.Group("/invoices")
	{
		invoices.GET("", h.ListInvoices)
		invoices.POST("/sync", h.TriggerSync)
		invoices.PATCH("/:id/status", h.UpdateInvoiceStatus)
	}
}
```

**Step 5: Add sync status endpoint**

```go
// SyncStatus godoc
// @Summary      查詢同步狀態
// @Description  查詢使用者的發票同步狀態
// @Tags         發票
// @Produce      json
// @Success      200  {object}  Response
// @Router       /sync/status [get]
```

This is already covered by `CredentialHandler.GetStatus` — no separate endpoint needed.

**Step 6: Commit**

```bash
git add backend/internal/delivery/http/invoice_handler.go
git commit -m "refactor: InvoiceHandler to use SyncQueue, remove e-invoice login endpoint"
```

---

### Task 11: Update Config — Add Encryption Key

**Files:**
- Modify: `backend/internal/config/config.go`

**Step 1: Add CredentialConfig**

Add to the Config struct:

```go
Credential CredentialConfig `mapstructure:"credential"`
```

Add the new config struct:

```go
// CredentialConfig holds credential encryption configuration
type CredentialConfig struct {
	EncryptionKey string `mapstructure:"encryption_key"` // base64-encoded 32-byte AES key
	KeyID         string `mapstructure:"key_id"`
}
```

**Step 2: Bind environment variables**

Add to the `Load` function:

```go
v.BindEnv("credential.encryption_key", "ZENBILL_CREDENTIAL_ENCRYPTION_KEY")
v.BindEnv("credential.key_id", "ZENBILL_CREDENTIAL_KEY_ID")
```

**Step 3: Set defaults**

Add to `setDefaults`:

```go
v.SetDefault("credential.key_id", "v1")
```

**Step 4: Commit**

```bash
git add backend/internal/config/config.go
git commit -m "feat: add credential encryption config"
```

---

### Task 12: Update Migration

**Files:**
- Modify: `backend/cmd/migrate/main.go`

**Step 1: Add EInvoiceCredential to migration models**

In the `models` slice, add `&domain.EInvoiceCredential{}` after `&domain.MagicLink{}` (it depends on User):

```go
models := []interface{}{
	&domain.User{},
	&domain.MagicLink{},
	&domain.EInvoiceCredential{}, // NEW
	&domain.Category{},
	&domain.Bank{},
	&domain.Account{},
	&domain.Merchant{},
	&domain.MerchantRule{},
	&domain.Invoice{},
	&domain.Transaction{},
}
```

Also add to `dropAllTables` (before User):

```go
&domain.EInvoiceCredential{},
```

**Step 2: Commit**

```bash
git add backend/cmd/migrate/main.go
git commit -m "feat: add EInvoiceCredential to database migration"
```

---

### Task 13: Wire Everything in API Server

**Files:**
- Modify: `backend/cmd/api/main.go`

**Step 1: Replace single scraper with scraper factory**

Remove the current scraper initialization block (lines 71-95). Replace with:

```go
// Scraper factory — creates per-user Playwright instances
scraperFactory := func(sessionDir string) (einvoice.Scraper, error) {
	sc := &einvoice.ScraperConfig{
		Debug:              cfg.App.Debug,
		Headless:           cfg.Scraper.Headless,
		Timeout:            int(cfg.Scraper.Timeout.Milliseconds()),
		CloudflareWaitTime: 10,
		BrowserStatePath:   sessionDir + "/browser_state.json",
		OCREnabled:         true,
		SlowMo:             0,
	}
	s, err := einvoice.NewScraper(sc)
	if err != nil {
		return nil, err
	}
	_ = s.LoadSession()
	return s, nil
}
```

**Step 2: Initialize encryption and credential services**

```go
// Initialize encryption
encryptor, err := crypto.NewEncryptor(cfg.Credential.EncryptionKey, cfg.Credential.KeyID)
if err != nil {
	log.Fatalf("Failed to initialize encryptor: %v", err)
}

// Initialize credential repository and service
credRepo := repository.NewEInvoiceCredentialRepository(db)
credService := usecase.NewCredentialService(credRepo, encryptor, logger.Get())
```

**Step 3: Update sync service initialization**

```go
syncService := usecase.NewInvoiceSyncService(
	invoiceRepo, credRepo, credService, scraperFactory,
	&einvoice.ScraperConfig{SessionDir: cfg.Scraper.SessionDir},
	logger.Get(),
)
```

**Step 4: Initialize sync queue**

```go
syncQueue := usecase.NewSyncQueue(100, logger.Get())
syncQueue.Start(context.Background(), syncService.SyncInvoices)
defer syncQueue.Stop()
```

**Step 5: Update invoice handler**

```go
invoiceHandler := httpdelivery.NewInvoiceHandler(invoiceRepo, syncQueue, logger.Get())
```

**Step 6: Add credential handler**

```go
credHandler := httpdelivery.NewCredentialHandler(credService, logger.Get())
```

Register routes:

```go
protected.Use(middleware.JWTAuth(authService))
{
	// ... existing routes ...
	credHandler.RegisterRoutes(protected)
}
```

**Step 7: Add necessary imports**

```go
"context"
"github.com/yukiota/zenbill/pkg/crypto"
```

**Step 8: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./cmd/api/...` (or `gofmt -e`)

**Step 9: Commit**

```bash
git add backend/cmd/api/main.go
git commit -m "feat: wire multi-user sync in API server"
```

---

### Task 14: Update Worker for Multi-User

**Files:**
- Modify: `backend/cmd/worker/main.go`

**Step 1: Replace hardcoded user ID with multi-user loop**

Update the sync job to iterate all users with credentials:

```go
// Initialize credential components
encryptor, err := crypto.NewEncryptor(cfg.Credential.EncryptionKey, cfg.Credential.KeyID)
if err != nil {
	log.Fatalf("Failed to initialize encryptor: %v", err)
}
credRepo := repository.NewEInvoiceCredentialRepository(db)
credService := usecase.NewCredentialService(credRepo, encryptor, logger.Get())

// Scraper factory
scraperFactory := func(sessionDir string) (einvoice.Scraper, error) {
	sc := &einvoice.ScraperConfig{
		Debug:              cfg.App.Debug,
		Headless:           cfg.Scraper.Headless,
		Timeout:            int(cfg.Scraper.Timeout.Milliseconds()),
		CloudflareWaitTime: 10,
		BrowserStatePath:   sessionDir + "/browser_state.json",
		OCREnabled:         true,
		SlowMo:             0,
	}
	s, err := einvoice.NewScraper(sc)
	if err != nil {
		return nil, err
	}
	_ = s.LoadSession()
	return s, nil
}

syncService := usecase.NewInvoiceSyncService(
	invoiceRepo, credRepo, credService, scraperFactory,
	&einvoice.ScraperConfig{SessionDir: cfg.Scraper.SessionDir},
	logger.Get(),
)
```

Update the sync cron job:

```go
scheduler.AddFunc(cfg.Worker.SyncSchedule, func() {
	ctx := context.Background()
	logger.Info("invoice sync job started")

	creds, err := credRepo.FindAllActive(ctx)
	if err != nil {
		logger.Error("failed to find active credentials", "error", err)
		return
	}

	logger.Info("found users to sync", "count", len(creds))

	syncDaysBack := cfg.Worker.SyncDaysBack
	if syncDaysBack == 0 {
		syncDaysBack = 7
	}
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -syncDaysBack)

	for _, cred := range creds {
		logger.Info("syncing user", "user_id", cred.UserID)
		result, err := syncService.SyncInvoices(ctx, cred.UserID, startDate, endDate)
		if err != nil {
			logger.Error("sync failed for user", "user_id", cred.UserID, "error", err)
			continue
		}
		logger.Info("sync completed for user",
			"user_id", cred.UserID,
			"new_invoices", result.NewInvoices,
			"duplicates", result.Duplicates,
		)
	}

	logger.Info("invoice sync job completed")
})
```

Remove the single-scraper initialization and `defer scraper.Close()`.

**Step 2: Commit**

```bash
git add backend/cmd/worker/main.go
git commit -m "refactor: worker to sync all users with credentials"
```

---

### Task 15: Update Manual Sync

**Files:**
- Modify: `backend/cmd/manual_sync/main.go`

**Step 1: Accept user email as CLI parameter**

Replace the hardcoded UUID with:

```go
var days int
var email string
flag.IntVar(&days, "days", 7, "sync last N days")
flag.StringVar(&email, "email", "", "user email to sync (required)")
flag.Parse()

if email == "" {
	log.Fatal("--email is required")
}

// Look up user by email
user, err := userRepo.FindByEmail(context.Background(), email)
if err != nil {
	log.Fatalf("User not found: %v", err)
}
userID := user.ID
```

Also update to use the new InvoiceSyncService constructor (with credRepo, credService, scraperFactory).

**Step 2: Commit**

```bash
git add backend/cmd/manual_sync/main.go
git commit -m "refactor: manual_sync to accept --email instead of hardcoded user ID"
```

---

### Task 16: Update Existing Tests

**Files:**
- Modify: `backend/internal/usecase/invoice_sync_service_test.go`
- Modify: any other test files that call `FindByInvoiceNumber` or `NewInvoiceSyncService`

**Step 1: Update mock for FindByInvoiceNumber**

Update `MockInvoiceRepository.FindByInvoiceNumber` to accept `userID`:

```go
func (m *MockInvoiceRepository) FindByInvoiceNumber(ctx context.Context, userID uuid.UUID, invoiceNumber string) (*domain.Invoice, error) {
	args := m.Called(ctx, userID, invoiceNumber)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Invoice), args.Error(1)
}
```

**Step 2: Add mocks for new dependencies**

Add `MockEInvoiceCredentialRepository` and mock `CredentialService` as needed.

**Step 3: Update test setup to use new constructor**

Update all tests creating `InvoiceSyncService` to use the new signature.

**Step 4: Run all tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./... -v`
Expected: All tests pass

**Step 5: Commit**

```bash
git add backend/internal/usecase/
git commit -m "test: update tests for multi-user invoice sync refactor"
```

---

### Task 17: Run Migration and Integration Verification

**Step 1: Ensure Docker DB is running**

Run: `cd /Users/yuki/projects/zen-bill/backend && docker-compose up -d db`

**Step 2: Run migration**

Run: `cd /Users/yuki/projects/zen-bill/backend && ZENBILL_DATABASE_HOST=localhost go run cmd/migrate/main.go`
Expected: `Migrated: *domain.EInvoiceCredential` appears in output

**Step 3: Verify the table was created**

Run: `docker exec -it zenbill_db psql -U zenbill -d zenbill_db -c "\d user_einvoice_credentials"`
Expected: Table with correct columns shown

**Step 4: Verify Invoice composite unique index**

Run: `docker exec -it zenbill_db psql -U zenbill -d zenbill_db -c "\di idx_invoices_user_invoice_number"`
Expected: Composite unique index shown

**Step 5: Run full test suite**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./... -v`
Expected: All tests pass

**Step 6: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: integration verification - migration and tests pass"
```

---

### Task 18: Update .env.example

**Files:**
- Modify: `backend/.env.example` (or create if doesn't exist)

**Step 1: Add new environment variables**

```bash
# Credential Encryption (generate with: openssl rand -base64 32)
ZENBILL_CREDENTIAL_ENCRYPTION_KEY=your-base64-encoded-32-byte-key-here
ZENBILL_CREDENTIAL_KEY_ID=v1
```

**Step 2: Commit**

```bash
git add backend/.env.example
git commit -m "docs: add credential encryption env vars to .env.example"
```

---

## Summary of Changes

| Layer | File | Action |
|-------|------|--------|
| Domain | `domain/einvoice_credential.go` | **Create** — new entity |
| Domain | `domain/repository.go` | **Modify** — add EInvoiceCredentialRepository interface |
| Domain | `domain/invoice.go` | **Modify** — composite unique index |
| Repository | `repository/einvoice_credential_repository.go` | **Create** — GORM implementation |
| Repository | `repository/invoice_repository.go` | **Modify** — FindByInvoiceNumber takes userID |
| Usecase | `usecase/credential_service.go` | **Create** — encrypt/decrypt CRUD |
| Usecase | `usecase/sync_queue.go` | **Create** — serial job queue |
| Usecase | `usecase/invoice_sync_service.go` | **Modify** — per-user scraper + credentials |
| Delivery | `delivery/http/credential_handler.go` | **Create** — bind/status/unbind APIs |
| Delivery | `delivery/http/invoice_handler.go` | **Modify** — use SyncQueue |
| Pkg | `pkg/crypto/encryptor.go` | **Create** — AES-256-GCM |
| Config | `config/config.go` | **Modify** — add CredentialConfig |
| Cmd | `cmd/api/main.go` | **Modify** — wire everything |
| Cmd | `cmd/worker/main.go` | **Modify** — multi-user scheduling |
| Cmd | `cmd/manual_sync/main.go` | **Modify** — accept --email |
| Cmd | `cmd/migrate/main.go` | **Modify** — add EInvoiceCredential |
