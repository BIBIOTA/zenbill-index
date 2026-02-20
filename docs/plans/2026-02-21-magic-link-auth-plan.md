# Magic Link Auth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement passwordless Magic Link authentication with login-as-registration for ZenBill.

**Architecture:** Add MagicLink domain entity, SMTP mailer package, AuthService usecase, auth HTTP handler (3 endpoints), and JWT middleware. Replace all hardcoded `defaultUserID` references with middleware-injected user ID. Follows existing Clean Architecture patterns.

**Tech Stack:** Go, Gin, GORM, `github.com/golang-jwt/jwt/v5`, `net/smtp` (stdlib), `crypto/rand` (stdlib)

**Design doc:** `docs/plans/2026-02-21-magic-link-auth-design.md`

---

### Task 1: Add JWT dependency

**Files:**
- Modify: `backend/go.mod`

**Step 1: Add the golang-jwt module**

Run (from `backend/`):
```bash
cd /Users/yuki/projects/zen-bill/backend && go get github.com/golang-jwt/jwt/v5
```

**Step 2: Tidy**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go mod tidy
```

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill/backend && git add go.mod go.sum && git commit -m "chore: add golang-jwt/jwt dependency"
```

---

### Task 2: Add Auth & SMTP config

**Files:**
- Modify: `backend/internal/config/config.go`
- Modify: `backend/configs/config.yaml`

**Step 1: Add config structs and defaults**

In `backend/internal/config/config.go`, add two new config structs and wire them into the existing `Config` struct.

Add to the `Config` struct:
```go
type Config struct {
	App      AppConfig      `mapstructure:"app"`
	Database DatabaseConfig `mapstructure:"database"`
	EInvoice EInvoiceConfig `mapstructure:"einvoice"`
	Worker   WorkerConfig   `mapstructure:"worker"`
	Logger   LoggerConfig   `mapstructure:"logger"`
	Scraper  ScraperConfig  `mapstructure:"scraper"`
	Auth     AuthConfig     `mapstructure:"auth"`
	SMTP     SMTPConfig     `mapstructure:"smtp"`
}
```

Add the new structs (after `LoggerConfig`):
```go
// AuthConfig holds authentication configuration
type AuthConfig struct {
	JWTSecret           string        `mapstructure:"jwt_secret"`
	JWTExpiry           time.Duration `mapstructure:"jwt_expiry"`
	MagicLinkExpiry     time.Duration `mapstructure:"magic_link_expiry"`
	FrontendCallbackURL string        `mapstructure:"frontend_callback_url"`
}

// SMTPConfig holds email sending configuration
type SMTPConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Username string `mapstructure:"username"`
	Password string `mapstructure:"password"`
	From     string `mapstructure:"from"`
}
```

Add defaults in `setDefaults()`:
```go
// Auth defaults
v.SetDefault("auth.jwt_expiry", "168h")
v.SetDefault("auth.magic_link_expiry", "15m")
v.SetDefault("auth.frontend_callback_url", "http://localhost:3000/auth/callback")

// SMTP defaults
v.SetDefault("smtp.host", "smtp.gmail.com")
v.SetDefault("smtp.port", 587)
```

Add env bindings in `Load()` (after the existing `BindEnv` calls):
```go
// Explicitly bind auth environment variables
v.BindEnv("auth.jwt_secret", "ZENBILL_AUTH_JWT_SECRET")
v.BindEnv("auth.frontend_callback_url", "ZENBILL_AUTH_FRONTEND_CALLBACK_URL")

// Explicitly bind SMTP environment variables
v.BindEnv("smtp.host", "ZENBILL_SMTP_HOST")
v.BindEnv("smtp.port", "ZENBILL_SMTP_PORT")
v.BindEnv("smtp.username", "ZENBILL_SMTP_USERNAME")
v.BindEnv("smtp.password", "ZENBILL_SMTP_PASSWORD")
v.BindEnv("smtp.from", "ZENBILL_SMTP_FROM")
```

**Step 2: Add config.yaml entries**

Append to `backend/configs/config.yaml`:
```yaml

auth:
  jwt_secret: "change-me-in-production"
  jwt_expiry: 168h
  magic_link_expiry: 15m
  frontend_callback_url: http://localhost:3000/auth/callback

smtp:
  host: smtp.gmail.com
  port: 587
  username: ""
  password: ""
  from: "ZenBill <noreply@example.com>"
```

**Step 3: Verify it compiles**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./internal/config/...
```
Expected: success, no errors.

**Step 4: Commit**

```bash
git add internal/config/config.go configs/config.yaml
git commit -m "feat: add auth and SMTP configuration"
```

---

### Task 3: MagicLink domain entity

**Files:**
- Create: `backend/internal/domain/magic_link.go`
- Modify: `backend/internal/domain/repository.go` (add MagicLinkRepository interface)
- Modify: `backend/internal/domain/user.go` (make PasswordHash nullable)

**Step 1: Write MagicLink entity test**

Create `backend/internal/domain/magic_link_test.go`:
```go
package domain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestMagicLink_IsExpired(t *testing.T) {
	tests := []struct {
		name      string
		expiresAt time.Time
		expected  bool
	}{
		{
			name:      "not expired",
			expiresAt: time.Now().Add(10 * time.Minute),
			expected:  false,
		},
		{
			name:      "expired",
			expiresAt: time.Now().Add(-1 * time.Minute),
			expected:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ml := MagicLink{ExpiresAt: tt.expiresAt}
			assert.Equal(t, tt.expected, ml.IsExpired())
		})
	}
}

func TestMagicLink_IsUsed(t *testing.T) {
	t.Run("unused", func(t *testing.T) {
		ml := MagicLink{UsedAt: nil}
		assert.False(t, ml.IsUsed())
	})

	t.Run("used", func(t *testing.T) {
		now := time.Now()
		ml := MagicLink{UsedAt: &now}
		assert.True(t, ml.IsUsed())
	})
}

func TestMagicLink_IsValid(t *testing.T) {
	t.Run("valid - not expired and not used", func(t *testing.T) {
		ml := MagicLink{
			ExpiresAt: time.Now().Add(10 * time.Minute),
			UsedAt:    nil,
		}
		assert.True(t, ml.IsValid())
	})

	t.Run("invalid - expired", func(t *testing.T) {
		ml := MagicLink{
			ExpiresAt: time.Now().Add(-1 * time.Minute),
			UsedAt:    nil,
		}
		assert.False(t, ml.IsValid())
	})

	t.Run("invalid - used", func(t *testing.T) {
		now := time.Now()
		ml := MagicLink{
			ExpiresAt: time.Now().Add(10 * time.Minute),
			UsedAt:    &now,
		}
		assert.False(t, ml.IsValid())
	})
}
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go test ./internal/domain/... -run TestMagicLink -v
```
Expected: FAIL — `MagicLink` type not defined.

**Step 3: Write MagicLink entity**

Create `backend/internal/domain/magic_link.go`:
```go
package domain

import (
	"time"

	"github.com/google/uuid"
)

// MagicLink represents a passwordless login token sent via email
type MagicLink struct {
	ID        uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Email     string     `gorm:"type:varchar(255);not null;index" json:"email"`
	Token     string     `gorm:"type:varchar(255);uniqueIndex;not null" json:"-"`
	ExpiresAt time.Time  `gorm:"not null" json:"expires_at"`
	UsedAt    *time.Time `json:"used_at,omitempty"`
	CreatedAt time.Time  `gorm:"autoCreateTime" json:"created_at"`
}

// TableName overrides the table name
func (MagicLink) TableName() string {
	return "magic_links"
}

// IsExpired returns true if the magic link has expired
func (m *MagicLink) IsExpired() bool {
	return time.Now().After(m.ExpiresAt)
}

// IsUsed returns true if the magic link has been used
func (m *MagicLink) IsUsed() bool {
	return m.UsedAt != nil
}

// IsValid returns true if the magic link is not expired and not used
func (m *MagicLink) IsValid() bool {
	return !m.IsExpired() && !m.IsUsed()
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go test ./internal/domain/... -run TestMagicLink -v
```
Expected: PASS

**Step 5: Update User entity — make PasswordHash nullable**

In `backend/internal/domain/user.go`, change the `PasswordHash` GORM tag from `not null` to allow null (Magic Link users have no password):

```go
// Before:
PasswordHash string    `gorm:"type:varchar(255);not null" json:"-"`

// After:
PasswordHash string    `gorm:"type:varchar(255)" json:"-"`
```

**Step 6: Add MagicLinkRepository interface**

In `backend/internal/domain/repository.go`, add after the `UserRepository` interface:

```go
// MagicLinkRepository defines the interface for magic link data access
type MagicLinkRepository interface {
	Create(ctx context.Context, magicLink *MagicLink) error
	FindByToken(ctx context.Context, token string) (*MagicLink, error)
	MarkUsed(ctx context.Context, id uuid.UUID) error
}
```

**Step 7: Verify compilation**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./internal/domain/...
```
Expected: success.

**Step 8: Commit**

```bash
git add internal/domain/magic_link.go internal/domain/magic_link_test.go internal/domain/repository.go internal/domain/user.go
git commit -m "feat: add MagicLink entity, repository interface, make PasswordHash nullable"
```

---

### Task 4: MagicLink repository (GORM)

**Files:**
- Create: `backend/internal/repository/magic_link_repository.go`

**Step 1: Write the repository**

Create `backend/internal/repository/magic_link_repository.go`:
```go
package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
)

// MagicLinkRepositoryImpl implements domain.MagicLinkRepository using GORM
type MagicLinkRepositoryImpl struct {
	db *gorm.DB
}

// NewMagicLinkRepository creates a new magic link repository
func NewMagicLinkRepository(db *gorm.DB) domain.MagicLinkRepository {
	return &MagicLinkRepositoryImpl{db: db}
}

// Create creates a new magic link
func (r *MagicLinkRepositoryImpl) Create(ctx context.Context, magicLink *domain.MagicLink) error {
	return r.db.WithContext(ctx).Create(magicLink).Error
}

// FindByToken finds a magic link by its token
func (r *MagicLinkRepositoryImpl) FindByToken(ctx context.Context, token string) (*domain.MagicLink, error) {
	var ml domain.MagicLink
	err := r.db.WithContext(ctx).Where("token = ?", token).First(&ml).Error
	if err != nil {
		return nil, err
	}
	return &ml, nil
}

// MarkUsed marks a magic link as used
func (r *MagicLinkRepositoryImpl) MarkUsed(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&domain.MagicLink{}).Where("id = ?", id).Update("used_at", now).Error
}
```

**Step 2: Verify compilation**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./internal/repository/...
```
Expected: success.

**Step 3: Commit**

```bash
git add internal/repository/magic_link_repository.go
git commit -m "feat: add MagicLink GORM repository"
```

---

### Task 5: Add MagicLink to database migration

**Files:**
- Modify: `backend/cmd/migrate/main.go`

**Step 1: Add MagicLink to migration models list**

In `backend/cmd/migrate/main.go`, add `&domain.MagicLink{}` to the `models` slice (after `&domain.User{}`):

```go
models := []interface{}{
	&domain.User{},
	&domain.MagicLink{}, // ← add this line
	&domain.Category{},
	&domain.Bank{},
	// ... rest unchanged
}
```

Also add to the `dropAllTables` models slice (before `&domain.User{}`):
```go
models := []interface{}{
	&domain.Transaction{},
	&domain.Invoice{},
	&domain.MerchantRule{},
	&domain.Merchant{},
	&domain.Account{},
	&domain.Bank{},
	&domain.Category{},
	&domain.MagicLink{}, // ← add this line
	&domain.User{},
}
```

**Step 2: Verify compilation**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./cmd/migrate/...
```
Expected: success.

**Step 3: Commit**

```bash
git add cmd/migrate/main.go
git commit -m "feat: add MagicLink to database migration"
```

---

### Task 6: SMTP mailer package

**Files:**
- Create: `backend/pkg/mailer/mailer.go`
- Create: `backend/pkg/mailer/mailer_test.go`

**Step 1: Write mailer test**

Create `backend/pkg/mailer/mailer_test.go`:
```go
package mailer

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestBuildMagicLinkEmail(t *testing.T) {
	body := BuildMagicLinkEmail("https://example.com/verify?token=abc123")
	assert.Contains(t, body, "https://example.com/verify?token=abc123")
	assert.Contains(t, body, "ZenBill")
}

func TestNewMailer(t *testing.T) {
	m := New(Config{
		Host:     "smtp.example.com",
		Port:     587,
		Username: "user",
		Password: "pass",
		From:     "test@example.com",
	})
	assert.NotNil(t, m)
	assert.Equal(t, "smtp.example.com", m.config.Host)
}
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go test ./pkg/mailer/... -v
```
Expected: FAIL — package doesn't exist yet.

**Step 3: Write mailer implementation**

Create `backend/pkg/mailer/mailer.go`:
```go
package mailer

import (
	"fmt"
	"net/smtp"
)

// Config holds SMTP configuration
type Config struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

// Mailer sends emails via SMTP
type Mailer struct {
	config Config
}

// New creates a new Mailer
func New(cfg Config) *Mailer {
	return &Mailer{config: cfg}
}

// Send sends an email to the given recipient
func (m *Mailer) Send(to, subject, body string) error {
	addr := fmt.Sprintf("%s:%d", m.config.Host, m.config.Port)
	auth := smtp.PlainAuth("", m.config.Username, m.config.Password, m.config.Host)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n%s",
		m.config.From, to, subject, body)

	return smtp.SendMail(addr, auth, m.config.From, []string{to}, []byte(msg))
}

// BuildMagicLinkEmail builds the HTML body for a magic link email
func BuildMagicLinkEmail(magicLinkURL string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>ZenBill 登入</h2>
  <p>請點擊以下連結登入你的帳號：</p>
  <p><a href="%s" style="display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">點擊登入</a></p>
  <p style="color: #666; font-size: 14px;">此連結將在 15 分鐘後過期。如果你沒有請求登入，請忽略此信件。</p>
  <p style="color: #999; font-size: 12px;">連結：%s</p>
</body>
</html>`, magicLinkURL, magicLinkURL)
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go test ./pkg/mailer/... -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add pkg/mailer/
git commit -m "feat: add SMTP mailer package"
```

---

### Task 7: AuthService usecase

**Files:**
- Create: `backend/internal/usecase/auth_service.go`
- Create: `backend/internal/usecase/auth_service_test.go`

**Step 1: Write AuthService test**

Create `backend/internal/usecase/auth_service_test.go`:
```go
package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
)

// --- Mock Repositories ---

type MockUserRepo struct {
	mock.Mock
}

func (m *MockUserRepo) Create(ctx context.Context, user *domain.User) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}
func (m *MockUserRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.User), args.Error(1)
}
func (m *MockUserRepo) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	args := m.Called(ctx, email)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.User), args.Error(1)
}
func (m *MockUserRepo) Update(ctx context.Context, user *domain.User) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}
func (m *MockUserRepo) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

type MockMagicLinkRepo struct {
	mock.Mock
}

func (m *MockMagicLinkRepo) Create(ctx context.Context, ml *domain.MagicLink) error {
	args := m.Called(ctx, ml)
	return args.Error(0)
}
func (m *MockMagicLinkRepo) FindByToken(ctx context.Context, token string) (*domain.MagicLink, error) {
	args := m.Called(ctx, token)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.MagicLink), args.Error(1)
}
func (m *MockMagicLinkRepo) MarkUsed(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

type MockMailSender struct {
	mock.Mock
}

func (m *MockMailSender) Send(to, subject, body string) error {
	args := m.Called(to, subject, body)
	return args.Error(0)
}

// --- Tests ---

func TestAuthService_RequestLogin(t *testing.T) {
	ctx := context.Background()
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)

	svc := NewAuthService(userRepo, mlRepo, mailSender, AuthServiceConfig{
		JWTSecret:       "test-secret",
		JWTExpiry:       time.Hour,
		MagicLinkExpiry: 15 * time.Minute,
		BaseURL:         "http://localhost:8090",
	})

	mlRepo.On("Create", ctx, mock.AnythingOfType("*domain.MagicLink")).Return(nil)
	mailSender.On("Send", "test@example.com", mock.Anything, mock.Anything).Return(nil)

	err := svc.RequestLogin(ctx, "test@example.com")
	assert.NoError(t, err)
	mlRepo.AssertCalled(t, "Create", ctx, mock.AnythingOfType("*domain.MagicLink"))
	mailSender.AssertCalled(t, "Send", "test@example.com", mock.Anything, mock.Anything)
}

func TestAuthService_VerifyToken_ExistingUser(t *testing.T) {
	ctx := context.Background()
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)

	svc := NewAuthService(userRepo, mlRepo, mailSender, AuthServiceConfig{
		JWTSecret:       "test-secret",
		JWTExpiry:       time.Hour,
		MagicLinkExpiry: 15 * time.Minute,
		BaseURL:         "http://localhost:8090",
	})

	mlID := uuid.New()
	existingUser := &domain.User{ID: uuid.New(), Email: "test@example.com"}

	mlRepo.On("FindByToken", ctx, "valid-token").Return(&domain.MagicLink{
		ID:        mlID,
		Email:     "test@example.com",
		Token:     "valid-token",
		ExpiresAt: time.Now().Add(10 * time.Minute),
		UsedAt:    nil,
	}, nil)
	mlRepo.On("MarkUsed", ctx, mlID).Return(nil)
	userRepo.On("FindByEmail", ctx, "test@example.com").Return(existingUser, nil)

	jwt, err := svc.VerifyToken(ctx, "valid-token")
	assert.NoError(t, err)
	assert.NotEmpty(t, jwt)
}

func TestAuthService_VerifyToken_NewUser(t *testing.T) {
	ctx := context.Background()
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)

	svc := NewAuthService(userRepo, mlRepo, mailSender, AuthServiceConfig{
		JWTSecret:       "test-secret",
		JWTExpiry:       time.Hour,
		MagicLinkExpiry: 15 * time.Minute,
		BaseURL:         "http://localhost:8090",
	})

	mlID := uuid.New()

	mlRepo.On("FindByToken", ctx, "new-user-token").Return(&domain.MagicLink{
		ID:        mlID,
		Email:     "new@example.com",
		Token:     "new-user-token",
		ExpiresAt: time.Now().Add(10 * time.Minute),
		UsedAt:    nil,
	}, nil)
	mlRepo.On("MarkUsed", ctx, mlID).Return(nil)
	userRepo.On("FindByEmail", ctx, "new@example.com").Return(nil, gorm.ErrRecordNotFound)
	userRepo.On("Create", ctx, mock.AnythingOfType("*domain.User")).Return(nil)

	jwt, err := svc.VerifyToken(ctx, "new-user-token")
	assert.NoError(t, err)
	assert.NotEmpty(t, jwt)
	userRepo.AssertCalled(t, "Create", ctx, mock.AnythingOfType("*domain.User"))
}

func TestAuthService_VerifyToken_Expired(t *testing.T) {
	ctx := context.Background()
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)

	svc := NewAuthService(userRepo, mlRepo, mailSender, AuthServiceConfig{
		JWTSecret:       "test-secret",
		JWTExpiry:       time.Hour,
		MagicLinkExpiry: 15 * time.Minute,
		BaseURL:         "http://localhost:8090",
	})

	mlRepo.On("FindByToken", ctx, "expired-token").Return(&domain.MagicLink{
		ID:        uuid.New(),
		Email:     "test@example.com",
		Token:     "expired-token",
		ExpiresAt: time.Now().Add(-1 * time.Minute),
		UsedAt:    nil,
	}, nil)

	jwt, err := svc.VerifyToken(ctx, "expired-token")
	assert.Error(t, err)
	assert.Empty(t, jwt)
	assert.Equal(t, ErrMagicLinkExpired, err)
}

func TestAuthService_VerifyToken_AlreadyUsed(t *testing.T) {
	ctx := context.Background()
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)

	svc := NewAuthService(userRepo, mlRepo, mailSender, AuthServiceConfig{
		JWTSecret:       "test-secret",
		JWTExpiry:       time.Hour,
		MagicLinkExpiry: 15 * time.Minute,
		BaseURL:         "http://localhost:8090",
	})

	usedAt := time.Now().Add(-5 * time.Minute)
	mlRepo.On("FindByToken", ctx, "used-token").Return(&domain.MagicLink{
		ID:        uuid.New(),
		Email:     "test@example.com",
		Token:     "used-token",
		ExpiresAt: time.Now().Add(10 * time.Minute),
		UsedAt:    &usedAt,
	}, nil)

	jwt, err := svc.VerifyToken(ctx, "used-token")
	assert.Error(t, err)
	assert.Empty(t, jwt)
	assert.Equal(t, ErrMagicLinkUsed, err)
}

func TestAuthService_ParseToken(t *testing.T) {
	ctx := context.Background()
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)

	svc := NewAuthService(userRepo, mlRepo, mailSender, AuthServiceConfig{
		JWTSecret:       "test-secret",
		JWTExpiry:       time.Hour,
		MagicLinkExpiry: 15 * time.Minute,
		BaseURL:         "http://localhost:8090",
	})

	// Generate a valid JWT first
	userID := uuid.New()
	tokenStr, err := svc.generateJWT(userID, "test@example.com")
	assert.NoError(t, err)

	// Parse it back
	claims, err := svc.ParseJWT(tokenStr)
	assert.NoError(t, err)
	assert.Equal(t, userID.String(), claims.Subject)
	assert.Equal(t, "test@example.com", claims.Email)

	// Invalid token
	_, err = svc.ParseJWT("invalid-token")
	assert.Error(t, err)

	_ = ctx // suppress unused
}
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/... -run TestAuthService -v
```
Expected: FAIL — `AuthService` not defined.

**Step 3: Write AuthService implementation**

Create `backend/internal/usecase/auth_service.go`:
```go
package usecase

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"github.com/yukiota/zenbill/pkg/mailer"
	"gorm.io/gorm"
)

var (
	ErrMagicLinkExpired  = errors.New("magic link has expired")
	ErrMagicLinkUsed     = errors.New("magic link has already been used")
	ErrMagicLinkNotFound = errors.New("magic link not found")
)

// MailSender is the interface for sending emails (for testability)
type MailSender interface {
	Send(to, subject, body string) error
}

// AuthServiceConfig holds configuration for the auth service
type AuthServiceConfig struct {
	JWTSecret       string
	JWTExpiry       time.Duration
	MagicLinkExpiry time.Duration
	BaseURL         string // API base URL for magic link (e.g. http://localhost:8090)
}

// JWTClaims represents the custom JWT claims
type JWTClaims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

// AuthService handles authentication logic
type AuthService struct {
	userRepo      domain.UserRepository
	magicLinkRepo domain.MagicLinkRepository
	mailSender    MailSender
	config        AuthServiceConfig
}

// NewAuthService creates a new AuthService
func NewAuthService(
	userRepo domain.UserRepository,
	magicLinkRepo domain.MagicLinkRepository,
	mailSender MailSender,
	config AuthServiceConfig,
) *AuthService {
	return &AuthService{
		userRepo:      userRepo,
		magicLinkRepo: magicLinkRepo,
		mailSender:    mailSender,
		config:        config,
	}
}

// RequestLogin creates a magic link and sends it via email
func (s *AuthService) RequestLogin(ctx context.Context, email string) error {
	// Generate secure random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return fmt.Errorf("failed to generate token: %w", err)
	}
	token := hex.EncodeToString(tokenBytes)

	// Create magic link record
	ml := &domain.MagicLink{
		Email:     email,
		Token:     token,
		ExpiresAt: time.Now().Add(s.config.MagicLinkExpiry),
	}
	if err := s.magicLinkRepo.Create(ctx, ml); err != nil {
		return fmt.Errorf("failed to create magic link: %w", err)
	}

	// Build magic link URL and send email
	magicLinkURL := fmt.Sprintf("%s/api/v1/auth/verify?token=%s", s.config.BaseURL, token)
	body := mailer.BuildMagicLinkEmail(magicLinkURL)

	if err := s.mailSender.Send(email, "ZenBill 登入連結", body); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}

// VerifyToken verifies a magic link token and returns a JWT
func (s *AuthService) VerifyToken(ctx context.Context, token string) (string, error) {
	// Find magic link
	ml, err := s.magicLinkRepo.FindByToken(ctx, token)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", ErrMagicLinkNotFound
		}
		return "", fmt.Errorf("failed to find magic link: %w", err)
	}

	// Validate
	if ml.IsExpired() {
		return "", ErrMagicLinkExpired
	}
	if ml.IsUsed() {
		return "", ErrMagicLinkUsed
	}

	// Mark as used
	if err := s.magicLinkRepo.MarkUsed(ctx, ml.ID); err != nil {
		return "", fmt.Errorf("failed to mark magic link as used: %w", err)
	}

	// Find or create user
	user, err := s.userRepo.FindByEmail(ctx, ml.Email)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Auto-register
			user = &domain.User{Email: ml.Email}
			if err := s.userRepo.Create(ctx, user); err != nil {
				return "", fmt.Errorf("failed to create user: %w", err)
			}
		} else {
			return "", fmt.Errorf("failed to find user: %w", err)
		}
	}

	// Generate JWT
	jwtStr, err := s.generateJWT(user.ID, user.Email)
	if err != nil {
		return "", fmt.Errorf("failed to generate JWT: %w", err)
	}

	return jwtStr, nil
}

// ParseJWT parses and validates a JWT token string
func (s *AuthService) ParseJWT(tokenStr string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.config.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*JWTClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}

// generateJWT creates a signed JWT for the given user
func (s *AuthService) generateJWT(userID uuid.UUID, email string) (string, error) {
	claims := JWTClaims{
		Email: email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.config.JWTExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.config.JWTSecret))
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/... -run TestAuthService -v
```
Expected: ALL PASS

**Step 5: Commit**

```bash
git add internal/usecase/auth_service.go internal/usecase/auth_service_test.go
git commit -m "feat: add AuthService with magic link and JWT logic"
```

---

### Task 8: JWT auth middleware

**Files:**
- Create: `backend/internal/delivery/http/middleware/auth.go`
- Create: `backend/internal/delivery/http/middleware/auth_test.go`

**Step 1: Write middleware test**

Create `backend/internal/delivery/http/middleware/auth_test.go`:
```go
package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/yukiota/zenbill/internal/usecase"
)

func generateTestJWT(secret string, userID uuid.UUID, email string, expiry time.Duration) string {
	claims := usecase.JWTClaims{
		Email: email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	str, _ := token.SignedString([]byte(secret))
	return str
}

func setupRouter(secret string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	authSvc := usecase.NewAuthService(nil, nil, nil, usecase.AuthServiceConfig{
		JWTSecret: secret,
		JWTExpiry: time.Hour,
	})

	r.Use(JWTAuth(authSvc))
	r.GET("/test", func(c *gin.Context) {
		userID := c.MustGet("userID").(uuid.UUID)
		email := c.MustGet("email").(string)
		c.JSON(200, gin.H{"user_id": userID.String(), "email": email})
	})
	return r
}

func TestJWTAuth_ValidToken(t *testing.T) {
	secret := "test-secret"
	userID := uuid.New()
	token := generateTestJWT(secret, userID, "test@example.com", time.Hour)

	r := setupRouter(secret)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)
	assert.Contains(t, w.Body.String(), userID.String())
}

func TestJWTAuth_MissingHeader(t *testing.T) {
	r := setupRouter("test-secret")
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, 401, w.Code)
}

func TestJWTAuth_InvalidToken(t *testing.T) {
	r := setupRouter("test-secret")
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	r.ServeHTTP(w, req)

	assert.Equal(t, 401, w.Code)
}

func TestJWTAuth_ExpiredToken(t *testing.T) {
	secret := "test-secret"
	token := generateTestJWT(secret, uuid.New(), "test@example.com", -time.Hour)

	r := setupRouter(secret)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	assert.Equal(t, 401, w.Code)
}
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go test ./internal/delivery/http/middleware/... -v
```
Expected: FAIL — package doesn't exist.

**Step 3: Write middleware implementation**

Create `backend/internal/delivery/http/middleware/auth.go`:
```go
package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/usecase"
)

// JWTAuth returns a Gin middleware that validates JWT tokens from the Authorization header.
// On success, it sets "userID" (uuid.UUID) and "email" (string) in the Gin context.
func JWTAuth(authService *usecase.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "missing authorization header"})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenStr == authHeader {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "invalid authorization format"})
			return
		}

		claims, err := authService.ParseJWT(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "invalid or expired token"})
			return
		}

		userID, err := uuid.Parse(claims.Subject)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "invalid user ID in token"})
			return
		}

		c.Set("userID", userID)
		c.Set("email", claims.Email)
		c.Next()
	}
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go test ./internal/delivery/http/middleware/... -v
```
Expected: ALL PASS

**Step 5: Commit**

```bash
git add internal/delivery/http/middleware/
git commit -m "feat: add JWT auth middleware"
```

---

### Task 9: Auth HTTP handler

**Files:**
- Create: `backend/internal/delivery/http/auth_handler.go`

**Step 1: Write auth handler**

Create `backend/internal/delivery/http/auth_handler.go`:
```go
package http

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/usecase"
)

// AuthHandler handles authentication HTTP endpoints
type AuthHandler struct {
	authService         *usecase.AuthService
	frontendCallbackURL string
	logger              *slog.Logger
}

// NewAuthHandler creates a new AuthHandler
func NewAuthHandler(authService *usecase.AuthService, frontendCallbackURL string, logger *slog.Logger) *AuthHandler {
	return &AuthHandler{
		authService:         authService,
		frontendCallbackURL: frontendCallbackURL,
		logger:              logger,
	}
}

// LoginRequest represents the login request body
type AuthLoginRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// Login handles POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req AuthLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "請提供有效的 Email 地址")
		return
	}

	if err := h.authService.RequestLogin(c.Request.Context(), req.Email); err != nil {
		h.logger.Error("failed to send magic link", "email", req.Email, "error", err)
		// Always return success to prevent email enumeration
	}

	// Always return the same response regardless of whether the email exists
	SuccessWithMessage(c, "登入連結已寄出，請查看信箱", nil)
}

// Verify handles GET /api/v1/auth/verify?token=xxx
func (h *AuthHandler) Verify(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.Redirect(http.StatusFound, h.frontendCallbackURL+"?error=missing_token")
		return
	}

	jwtStr, err := h.authService.VerifyToken(c.Request.Context(), token)
	if err != nil {
		h.logger.Warn("magic link verification failed", "error", err)
		c.Redirect(http.StatusFound, h.frontendCallbackURL+"?error=invalid_token")
		return
	}

	c.Redirect(http.StatusFound, h.frontendCallbackURL+"?token="+jwtStr)
}

// Me handles GET /api/v1/auth/me
func (h *AuthHandler) Me(c *gin.Context) {
	userID := c.MustGet("userID").(uuid.UUID)
	email := c.MustGet("email").(string)

	Success(c, gin.H{
		"id":    userID,
		"email": email,
	})
}

// RegisterRoutes registers auth routes on the given router group.
// Note: /auth/login and /auth/verify are public; /auth/me requires JWT middleware.
func (h *AuthHandler) RegisterPublicRoutes(r *gin.RouterGroup) {
	auth := r.Group("/auth")
	{
		auth.POST("/login", h.Login)
		auth.GET("/verify", h.Verify)
	}
}

// RegisterProtectedRoutes registers auth routes that require JWT middleware.
func (h *AuthHandler) RegisterProtectedRoutes(r *gin.RouterGroup) {
	auth := r.Group("/auth")
	{
		auth.GET("/me", h.Me)
	}
}
```

**Step 2: Verify compilation**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./internal/delivery/http/...
```
Expected: success.

**Step 3: Commit**

```bash
git add internal/delivery/http/auth_handler.go
git commit -m "feat: add auth HTTP handler (login, verify, me)"
```

---

### Task 10: Wire everything in main.go and replace defaultUserID

**Files:**
- Modify: `backend/cmd/api/main.go` (wire auth components, add middleware)
- Modify: `backend/internal/delivery/http/common.go` (replace defaultUserID with helper)

**Step 1: Update common.go — replace defaultUserID with getUserID helper**

Replace the entire content of `backend/internal/delivery/http/common.go`:
```go
package http

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// getUserID extracts the authenticated user's ID from the Gin context.
// Must be used within routes protected by the JWT auth middleware.
func getUserID(c *gin.Context) uuid.UUID {
	return c.MustGet("userID").(uuid.UUID)
}
```

**Step 2: Replace all `defaultUserID` references in handlers**

In every handler file, replace `userID := defaultUserID` with `userID := getUserID(c)`:

Files to modify (10 occurrences across 5 files):
- `backend/internal/delivery/http/merchant_handler.go` (lines 46, 62)
- `backend/internal/delivery/http/category_handler.go` (lines 64, 120)
- `backend/internal/delivery/http/invoice_handler.go` (lines 72, 193)
- `backend/internal/delivery/http/transaction_handler.go` (lines 77, 158)
- `backend/internal/delivery/http/account_handler.go` (lines 65, 81)

In each file, find and replace:
```go
// Before:
userID := defaultUserID

// After:
userID := getUserID(c)
```

Also remove the `"github.com/google/uuid"` import from handlers that only used it for `defaultUserID` (check each file — some may use `uuid` elsewhere like for parsing path params).

**Step 3: Wire auth in cmd/api/main.go**

Add these changes to `backend/cmd/api/main.go`:

Add imports:
```go
"github.com/yukiota/zenbill/internal/delivery/http/middleware"
"github.com/yukiota/zenbill/internal/usecase"
"github.com/yukiota/zenbill/pkg/mailer"
```

After repository initialization (around line 55), add:
```go
// Initialize auth components
userRepo := repository.NewUserRepository(db)
magicLinkRepo := repository.NewMagicLinkRepository(db)

mailSender := mailer.New(mailer.Config{
	Host:     cfg.SMTP.Host,
	Port:     cfg.SMTP.Port,
	Username: cfg.SMTP.Username,
	Password: cfg.SMTP.Password,
	From:     cfg.SMTP.From,
})

authService := usecase.NewAuthService(userRepo, magicLinkRepo, mailSender, usecase.AuthServiceConfig{
	JWTSecret:       cfg.Auth.JWTSecret,
	JWTExpiry:       cfg.Auth.JWTExpiry,
	MagicLinkExpiry: cfg.Auth.MagicLinkExpiry,
	BaseURL:         fmt.Sprintf("http://localhost:%d", cfg.App.Port),
})

authHandler := httpdelivery.NewAuthHandler(authService, cfg.Auth.FrontendCallbackURL, logger.Get())
```

Restructure the router section to separate public and protected routes:
```go
// API v1 routes
v1 := router.Group("/api/v1")

// Public routes (no auth required)
authHandler.RegisterPublicRoutes(v1)

// Protected routes (JWT required)
protected := v1.Group("")
protected.Use(middleware.JWTAuth(authService))
{
	authHandler.RegisterProtectedRoutes(protected)

	// Register existing routes (now protected)
	invoiceHandler.RegisterRoutes(protected)
	bankHandler.RegisterRoutes(protected)
	accountHandler.RegisterRoutes(protected)
	txHandler.RegisterRoutes(protected)
	categoryHandler.RegisterRoutes(protected)
	merchantHandler.RegisterRoutes(protected)
	exchangeRateHandler.RegisterRoutes(protected)
}
```

**Step 4: Verify compilation**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./...
```
Expected: success.

**Step 5: Run all tests**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go test ./internal/domain/... ./internal/usecase/... ./internal/delivery/http/middleware/... -v
```
Expected: ALL PASS

**Step 6: Commit**

```bash
git add internal/delivery/http/common.go internal/delivery/http/merchant_handler.go internal/delivery/http/category_handler.go internal/delivery/http/invoice_handler.go internal/delivery/http/transaction_handler.go internal/delivery/http/account_handler.go cmd/api/main.go
git commit -m "feat: wire auth into API server, replace defaultUserID with JWT middleware"
```

---

### Task 11: Final integration verification

**Step 1: Run all tests**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go test ./... -v -count=1
```
Expected: ALL PASS (some tests may require DB — domain and usecase tests must pass).

**Step 2: Run lint**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && golangci-lint run
```
Expected: No errors (warnings acceptable).

**Step 3: Verify build**

Run:
```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./...
```
Expected: success.

**Step 4: Commit any fixes if needed**

If lint/test fixes were needed:
```bash
git add -A && git commit -m "fix: address lint and test issues"
```
