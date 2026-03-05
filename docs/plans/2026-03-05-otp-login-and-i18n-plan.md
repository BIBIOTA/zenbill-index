# OTP 驗證碼登入 + 登入頁中文化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace APP magic link login with 6-digit OTP verification code; keep web magic link unchanged; localize APP login page to Chinese.

**Architecture:** Dual-mode auth — `POST /auth/login` accepts `method: "code"|"link"` to select OTP vs magic link flow. New `POST /auth/verify` endpoint for OTP verification. Existing `GET /auth/verify` for web magic link redirect stays unchanged.

**Tech Stack:** Go (Gin, GORM, testify/mock), React Native (Expo Router), PostgreSQL

---

### Task 1: Add `Method` field to MagicLink domain entity

**Files:**
- Modify: `backend/internal/domain/magic_link.go`
- Modify: `backend/internal/domain/magic_link_test.go`

**Step 1: Add Method field to MagicLink struct**

In `backend/internal/domain/magic_link.go`, add `Method` field to the struct:

```go
type MagicLink struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Email       string     `gorm:"type:varchar(255);not null;index" json:"email"`
	Token       string     `gorm:"type:varchar(255);uniqueIndex;not null" json:"-"`
	Method      string     `gorm:"type:varchar(10);not null;default:'link'" json:"-"`
	CallbackURL string     `gorm:"type:varchar(512);not null;default:''" json:"-"`
	ExpiresAt   time.Time  `gorm:"not null" json:"expires_at"`
	UsedAt      *time.Time `json:"used_at,omitempty"`
	CreatedAt   time.Time  `gorm:"autoCreateTime" json:"created_at"`
}
```

**Step 2: Run domain tests to verify nothing breaks**

Run: `cd backend && go test ./internal/domain/... -v -run MagicLink`
Expected: All existing MagicLink tests PASS (the new field has a default value)

**Step 3: Commit**

```bash
git add backend/internal/domain/magic_link.go
git commit -m "feat(domain): add Method field to MagicLink entity"
```

---

### Task 2: Add `FindByEmailAndCode` to MagicLinkRepository

**Files:**
- Modify: `backend/internal/domain/repository.go`
- Modify: `backend/internal/repository/magic_link_repository.go`

**Step 1: Add interface method**

In `backend/internal/domain/repository.go`, add to `MagicLinkRepository`:

```go
type MagicLinkRepository interface {
	Create(ctx context.Context, magicLink *MagicLink) error
	FindByToken(ctx context.Context, token string) (*MagicLink, error)
	FindByEmailAndCode(ctx context.Context, email, code string) (*MagicLink, error)
	MarkUsed(ctx context.Context, id uuid.UUID) error
}
```

**Step 2: Implement in repository**

In `backend/internal/repository/magic_link_repository.go`, add:

```go
func (r *MagicLinkRepositoryImpl) FindByEmailAndCode(ctx context.Context, email, code string) (*domain.MagicLink, error) {
	var ml domain.MagicLink
	err := r.db.WithContext(ctx).
		Where("email = ? AND token = ? AND method = 'code' AND used_at IS NULL AND expires_at > ?", email, code, time.Now()).
		Order("created_at DESC").
		First(&ml).Error
	if err != nil {
		return nil, err
	}
	return &ml, nil
}
```

**Step 3: Verify compilation**

Run: `cd backend && go build ./...`
Expected: Build succeeds (will fail because mock in test file needs updating — that's Task 3)

**Step 4: Commit**

```bash
git add backend/internal/domain/repository.go backend/internal/repository/magic_link_repository.go
git commit -m "feat(repository): add FindByEmailAndCode for OTP verification"
```

---

### Task 3: Add OTP email template

**Files:**
- Modify: `backend/pkg/mailer/mailer.go`

**Step 1: Add BuildVerificationCodeEmail function**

In `backend/pkg/mailer/mailer.go`, add after `BuildMagicLinkEmail`:

```go
func BuildVerificationCodeEmail(code string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>ZenBill 登入驗證碼</h2>
  <p>你的驗證碼為：</p>
  <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4F46E5; padding: 16px 0;">%s</p>
  <p style="color: #666; font-size: 14px;">此驗證碼將在 15 分鐘後過期。如果你沒有請求登入，請忽略此信件。</p>
</body>
</html>`, code)
}
```

**Step 2: Verify compilation**

Run: `cd backend && go build ./...`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add backend/pkg/mailer/mailer.go
git commit -m "feat(mailer): add OTP verification code email template"
```

---

### Task 4: Add OTP login to AuthService

**Files:**
- Modify: `backend/internal/usecase/auth_service.go`
- Modify: `backend/internal/usecase/auth_service_test.go`

**Step 1: Update mock in test file**

In `backend/internal/usecase/auth_service_test.go`, add to `MockMagicLinkRepo`:

```go
func (m *MockMagicLinkRepo) FindByEmailAndCode(ctx context.Context, email, code string) (*domain.MagicLink, error) {
	args := m.Called(ctx, email, code)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.MagicLink), args.Error(1)
}
```

**Step 2: Write failing test for RequestLoginWithCode**

In `backend/internal/usecase/auth_service_test.go`, add:

```go
func TestAuthService_RequestLoginWithCode(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := newTestAuthService(userRepo, mlRepo, mailSender)

	ctx := context.Background()
	email := "user@example.com"

	mlRepo.On("Create", ctx, mock.AnythingOfType("*domain.MagicLink")).Return(nil).Run(func(args mock.Arguments) {
		ml := args.Get(1).(*domain.MagicLink)
		assert.Equal(t, "code", ml.Method)
		assert.Len(t, ml.Token, 6)
		// Verify it's a 6-digit number
		_, err := fmt.Sscanf(ml.Token, "%d", new(int))
		assert.NoError(t, err)
	})
	mailSender.On("Send", email, "ZenBill 登入驗證碼", mock.AnythingOfType("string")).Return(nil)

	err := svc.RequestLoginWithCode(ctx, email)

	require.NoError(t, err)
	mlRepo.AssertCalled(t, "Create", ctx, mock.AnythingOfType("*domain.MagicLink"))
	mailSender.AssertCalled(t, "Send", email, "ZenBill 登入驗證碼", mock.AnythingOfType("string"))
}
```

**Step 3: Run test to verify it fails**

Run: `cd backend && go test ./internal/usecase/... -v -run TestAuthService_RequestLoginWithCode`
Expected: FAIL — `RequestLoginWithCode` not defined

**Step 4: Implement RequestLoginWithCode**

In `backend/internal/usecase/auth_service.go`, add:

```go
// RequestLoginWithCode creates a 6-digit verification code and sends it via email.
func (s *AuthService) RequestLoginWithCode(ctx context.Context, email string) error {
	code, err := generateOTP()
	if err != nil {
		return fmt.Errorf("failed to generate OTP: %w", err)
	}

	ml := &domain.MagicLink{
		Email:     email,
		Token:     code,
		Method:    "code",
		ExpiresAt: time.Now().Add(s.config.MagicLinkExpiry),
	}
	if err := s.magicLinkRepo.Create(ctx, ml); err != nil {
		return fmt.Errorf("failed to create magic link: %w", err)
	}

	body := mailer.BuildVerificationCodeEmail(code)
	if err := s.mailSender.Send(email, "ZenBill 登入驗證碼", body); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}

// generateOTP generates a cryptographically random 6-digit code (100000-999999).
func generateOTP() (string, error) {
	max := big.NewInt(900000)
	n, err := cryptorand.Int(cryptorand.Reader, max)
	if err != nil {
		return "", err
	}
	code := n.Int64() + 100000
	return fmt.Sprintf("%06d", code), nil
}
```

Also update imports — add `cryptorand "crypto/rand"` (aliased since `crypto/rand` is already used) and `"math/big"`. Actually, the existing code uses `"crypto/rand"` with `rand.Read`. Replace imports:

```go
import (
	"context"
	cryptorand "crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"github.com/yukiota/zenbill/pkg/mailer"
	"gorm.io/gorm"
)
```

And update the existing `RequestLogin` to use `cryptorand.Read(tokenBytes)` instead of `rand.Read(tokenBytes)`.

**Step 5: Run test to verify it passes**

Run: `cd backend && go test ./internal/usecase/... -v -run TestAuthService_RequestLoginWithCode`
Expected: PASS

**Step 6: Write failing test for VerifyCode**

In `backend/internal/usecase/auth_service_test.go`, add:

```go
func TestAuthService_VerifyCode_Success(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := newTestAuthService(userRepo, mlRepo, mailSender)

	ctx := context.Background()
	email := "user@example.com"
	code := "482917"
	mlID := uuid.New()
	userID := uuid.New()

	ml := &domain.MagicLink{
		ID:        mlID,
		Email:     email,
		Token:     code,
		Method:    "code",
		ExpiresAt: time.Now().Add(10 * time.Minute),
	}

	mlRepo.On("FindByEmailAndCode", ctx, email, code).Return(ml, nil)
	mlRepo.On("MarkUsed", ctx, mlID).Return(nil)
	userRepo.On("FindByEmail", ctx, email).Return(&domain.User{ID: userID, Email: email}, nil)

	jwtStr, err := svc.VerifyCode(ctx, email, code)

	require.NoError(t, err)
	assert.NotEmpty(t, jwtStr)

	claims, err := svc.ParseJWT(jwtStr)
	require.NoError(t, err)
	assert.Equal(t, email, claims.Email)
	assert.Equal(t, userID.String(), claims.Subject)
}

func TestAuthService_VerifyCode_InvalidCode(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := newTestAuthService(userRepo, mlRepo, mailSender)

	ctx := context.Background()

	mlRepo.On("FindByEmailAndCode", ctx, "user@example.com", "000000").Return(nil, gorm.ErrRecordNotFound)

	jwtStr, err := svc.VerifyCode(ctx, "user@example.com", "000000")

	assert.Empty(t, jwtStr)
	assert.ErrorIs(t, err, ErrInvalidCode)
}
```

**Step 7: Run test to verify it fails**

Run: `cd backend && go test ./internal/usecase/... -v -run TestAuthService_VerifyCode`
Expected: FAIL — `VerifyCode` not defined

**Step 8: Implement VerifyCode**

In `backend/internal/usecase/auth_service.go`, add error var:

```go
var (
	ErrMagicLinkExpired  = errors.New("magic link has expired")
	ErrMagicLinkUsed     = errors.New("magic link has already been used")
	ErrMagicLinkNotFound = errors.New("magic link not found")
	ErrInvalidCode       = errors.New("invalid verification code")
)
```

Add method:

```go
// VerifyCode verifies an email + OTP code and returns a JWT.
func (s *AuthService) VerifyCode(ctx context.Context, email, code string) (string, error) {
	ml, err := s.magicLinkRepo.FindByEmailAndCode(ctx, email, code)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", ErrInvalidCode
		}
		return "", fmt.Errorf("failed to find magic link: %w", err)
	}

	if err := s.magicLinkRepo.MarkUsed(ctx, ml.ID); err != nil {
		return "", fmt.Errorf("failed to mark magic link as used: %w", err)
	}

	user, err := s.userRepo.FindByEmail(ctx, ml.Email)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			user = &domain.User{Email: ml.Email}
			if err := s.userRepo.Create(ctx, user); err != nil {
				return "", fmt.Errorf("failed to create user: %w", err)
			}
		} else {
			return "", fmt.Errorf("failed to find user: %w", err)
		}
	}

	jwtStr, err := s.generateJWT(user.ID, user.Email)
	if err != nil {
		return "", fmt.Errorf("failed to generate JWT: %w", err)
	}

	return jwtStr, nil
}
```

**Step 9: Run all auth tests**

Run: `cd backend && go test ./internal/usecase/... -v -run TestAuthService`
Expected: ALL PASS

**Step 10: Commit**

```bash
git add backend/internal/usecase/auth_service.go backend/internal/usecase/auth_service_test.go
git commit -m "feat(usecase): add OTP login (RequestLoginWithCode, VerifyCode)"
```

---

### Task 5: Add POST /auth/verify endpoint to handler

**Files:**
- Modify: `backend/internal/delivery/http/auth_handler.go`

**Step 1: Update AuthLoginRequest and add VerifyCodeRequest**

In `backend/internal/delivery/http/auth_handler.go`:

```go
type AuthLoginRequest struct {
	Email  string `json:"email" binding:"required,email"`
	Method string `json:"method"` // "link" (default) or "code"
}

type AuthVerifyCodeRequest struct {
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required,len=6"`
}
```

**Step 2: Update Login handler to support method**

Replace the existing `Login` function:

```go
func (h *AuthHandler) Login(c *gin.Context) {
	var req AuthLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "請提供有效的 Email 地址")
		return
	}

	// Dev mode: skip email, return JWT directly
	if h.authService.IsDevMode() {
		jwtStr, err := h.authService.DevLogin(c.Request.Context(), req.Email)
		if err != nil {
			h.logger.Error("dev login failed", "email", req.Email, "error", err)
			InternalServerError(c, "登入失敗")
			return
		}
		Success(c, gin.H{"token": jwtStr})
		return
	}

	if req.Method == "code" {
		// OTP mode: send verification code
		if err := h.authService.RequestLoginWithCode(c.Request.Context(), req.Email); err != nil {
			h.logger.Error("failed to send verification code", "email", req.Email, "error", err)
		}
		SuccessWithMessage(c, "驗證碼已寄出，請查看信箱", nil)
		return
	}

	// Default: magic link mode
	origin := c.GetHeader("Origin")
	if err := h.authService.RequestLogin(c.Request.Context(), req.Email, origin); err != nil {
		h.logger.Error("failed to send magic link", "email", req.Email, "error", err)
	}
	SuccessWithMessage(c, "登入連結已寄出，請查看信箱", nil)
}
```

**Step 3: Add VerifyCode handler**

```go
func (h *AuthHandler) VerifyCode(c *gin.Context) {
	var req AuthVerifyCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "請提供 Email 和 6 位數驗證碼")
		return
	}

	jwtStr, err := h.authService.VerifyCode(c.Request.Context(), req.Email, req.Code)
	if err != nil {
		h.logger.Warn("code verification failed", "email", req.Email, "error", err)
		Unauthorized(c, "驗證碼錯誤或已過期")
		return
	}

	Success(c, gin.H{"token": jwtStr})
}
```

**Step 4: Register the new route**

Update `RegisterPublicRoutes`:

```go
func (h *AuthHandler) RegisterPublicRoutes(r *gin.RouterGroup) {
	auth := r.Group("/auth")
	{
		auth.POST("/login", h.Login)
		auth.GET("/verify", h.Verify)
		auth.POST("/verify", h.VerifyCode)
	}
}
```

**Step 5: Verify compilation**

Run: `cd backend && go build ./...`
Expected: Build succeeds

**Step 6: Run all tests**

Run: `cd backend && go test ./... -v -count=1 2>&1 | tail -30`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add backend/internal/delivery/http/auth_handler.go
git commit -m "feat(api): add POST /auth/verify for OTP code verification"
```

---

### Task 6: Run database migration

**Step 1: Run migration to add Method column**

The GORM AutoMigrate in `cmd/migrate/main.go` already includes `&domain.MagicLink{}`, so running the migration will add the new `method` column automatically.

Run: `cd backend && docker exec -it zenbill_api /app/migrate` (or equivalent local migration)

If running locally:
```bash
cd backend && go run cmd/migrate/main.go
```

Expected: `✅ Migrated: *domain.MagicLink` — adds `method` column with default `'link'`

**Step 2: Commit** (no code changes, just note migration was run)

---

### Task 7: Localize APP login page to Chinese + add OTP input UI

**Files:**
- Modify: `app/app/(auth)/login.tsx`
- Delete: `app/app/(auth)/callback.tsx`

**Step 1: Rewrite login.tsx with Chinese text and OTP verification UI**

Replace the entire content of `app/app/(auth)/login.tsx`:

```tsx
import { useState, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { getApiClient } from '@zenbill/shared'
import type { ApiResponse, User } from '@zenbill/shared'
import { useAuthStore } from '../../lib/auth'
import { Colors, Spacing } from '../../constants/theme'

type Stage = 'email' | 'code' | 'verifying'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<Stage>('email')
  const [loading, setLoading] = useState(false)
  const codeInputRef = useRef<TextInput>(null)

  const handleSendCode = async () => {
    if (!email.trim()) return
    setLoading(true)
    try {
      const api = getApiClient()
      const res = await api.post<ApiResponse<{ token: string }>>('/auth/login', {
        email: email.trim(),
        method: 'code',
      })

      // Dev mode: backend returns token directly
      if (res.data?.token) {
        useAuthStore.getState().setAuth(res.data.token, { id: '', email: email.trim() })
        try {
          const meRes = await api.get<ApiResponse<User>>('/auth/me')
          if (meRes.data) {
            useAuthStore.getState().setUser(meRes.data)
          }
        } catch {}
        router.replace('/(tabs)')
        return
      }

      setStage('code')
      setTimeout(() => codeInputRef.current?.focus(), 300)
    } catch (err) {
      Alert.alert('錯誤', err instanceof Error ? err.message : '登入失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (code.length !== 6) return
    setStage('verifying')
    try {
      const api = getApiClient()
      const res = await api.post<ApiResponse<{ token: string }>>('/auth/verify', {
        email: email.trim(),
        code,
      })

      if (!res.data?.token) {
        Alert.alert('錯誤', '驗證失敗，請重試')
        setStage('code')
        return
      }

      useAuthStore.getState().setAuth(res.data.token, { id: '', email: email.trim() })
      try {
        const meRes = await api.get<ApiResponse<User>>('/auth/me')
        if (meRes.data) {
          useAuthStore.getState().setUser(meRes.data)
        }
      } catch {}
      router.replace('/(tabs)')
    } catch (err) {
      Alert.alert('錯誤', '驗證碼錯誤或已過期')
      setStage('code')
      setCode('')
    }
  }

  // Stage: verifying
  if (stage === 'verifying') {
    return (
      <SafeAreaView style={styles.flex1}>
        <View style={styles.container}>
          <Text style={styles.titleLarge}>登入中...</Text>
        </View>
      </SafeAreaView>
    )
  }

  // Stage: enter verification code
  if (stage === 'code') {
    return (
      <SafeAreaView style={styles.flex1}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex1}
        >
          <View style={styles.container}>
            <Text style={styles.titleLarge}>請查看信箱</Text>
            <Text style={styles.subtextCenter}>
              驗證碼已寄至 {email}{'\n'}請輸入信件中的 6 位數驗證碼
            </Text>
            <TextInput
              ref={codeInputRef}
              style={[styles.input, styles.codeInput]}
              placeholder="000000"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={(text) => {
                setCode(text)
                if (text.length === 6) {
                  // Auto-submit when 6 digits entered
                  setTimeout(() => handleVerifyCode(), 100)
                }
              }}
              testID="login_code_input"
            />
            <TouchableOpacity
              style={[styles.primaryButton, code.length !== 6 && styles.primaryButtonDisabled]}
              onPress={handleVerifyCode}
              disabled={code.length !== 6}
              testID="login_verify_button"
            >
              <Text style={styles.primaryButtonText}>驗證</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => { setStage('email'); setCode('') }}
              testID="login_change_email_link"
            >
              <Text style={styles.linkText}>使用其他 Email</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // Stage: enter email
  return (
    <SafeAreaView style={styles.flex1}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex1}
      >
        <View style={styles.container}>
          <Text style={styles.appTitle}>ZenBill</Text>
          <Text style={styles.subtitle}>使用 Email 登入</Text>
          <TextInput
            style={styles.input}
            placeholder="你的電子信箱"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            testID="login_email_input"
          />
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleSendCode}
            disabled={loading}
            testID="login_submit_button"
          >
            <Text style={styles.primaryButtonText}>
              {loading ? '發送中...' : '發送驗證碼'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
  },
  appTitle: {
    fontSize: 30,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  titleLarge: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 16,
    marginBottom: Spacing.xl,
  },
  subtextCenter: {
    color: Colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    marginBottom: Spacing.md,
    backgroundColor: Colors.background,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 8,
    fontWeight: '600',
  },
  primaryButton: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  linkButton: {
    marginTop: Spacing.xl,
  },
  linkText: {
    color: Colors.primary,
    fontSize: 16,
  },
})
```

**Step 2: Delete callback.tsx**

Delete `app/app/(auth)/callback.tsx` — the APP no longer needs deep link callback.

**Step 3: Verify the app compiles**

Run: `cd app && npx expo export --platform ios --dev 2>&1 | tail -5` (or `npx tsc --noEmit`)
Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add app/app/\(auth\)/login.tsx
git rm app/app/\(auth\)/callback.tsx
git commit -m "feat(app): OTP verification code login with Chinese localization"
```

---

### Task 8: Final verification

**Step 1: Run all backend tests**

Run: `cd backend && go test ./... -v -count=1 2>&1 | tail -30`
Expected: ALL PASS

**Step 2: Run lint**

Run: `cd backend && golangci-lint run`
Expected: No issues

**Step 3: Verify frontend compiles**

Run: `cd app && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit any final fixes if needed**

---

## Summary of Changes

| Layer | File | Change |
|-------|------|--------|
| Domain | `internal/domain/magic_link.go` | Add `Method` field |
| Domain | `internal/domain/repository.go` | Add `FindByEmailAndCode` to interface |
| Repository | `internal/repository/magic_link_repository.go` | Implement `FindByEmailAndCode` |
| Mailer | `pkg/mailer/mailer.go` | Add `BuildVerificationCodeEmail` |
| Usecase | `internal/usecase/auth_service.go` | Add `RequestLoginWithCode`, `VerifyCode`, `generateOTP` |
| Usecase | `internal/usecase/auth_service_test.go` | Add tests + update mock |
| Handler | `internal/delivery/http/auth_handler.go` | Update Login, add VerifyCode, register POST /auth/verify |
| APP | `app/(auth)/login.tsx` | Rewrite: 3-stage OTP UI + Chinese text |
| APP | `app/(auth)/callback.tsx` | DELETE |
