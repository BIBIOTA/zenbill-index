# Dev 環境跳過 Email 驗證 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Dev 環境登入時輸入 email 後直接取得 JWT，跳過 magic link 寄信流程。

**Architecture:** 在 `AuthService` 新增 `DevLogin` method，dev mode 時由 handler 呼叫此 method 直接回傳 JWT。前端檢查 response 中是否有 token 欄位來決定是否直接登入。

**Tech Stack:** Go/Gin (backend), React/TypeScript (frontend), testify (tests)

---

### Task 1: Add DevLogin method to AuthService

**Files:**
- Modify: `backend/internal/usecase/auth_service.go:29-36` (AuthServiceConfig)
- Modify: `backend/internal/usecase/auth_service.go` (add method)
- Test: `backend/internal/usecase/auth_service_test.go`

**Step 1: Write failing tests**

Add to `backend/internal/usecase/auth_service_test.go`:

```go
func newTestAuthServiceDevMode(userRepo *MockUserRepo, mlRepo *MockMagicLinkRepo, mailSender *MockMailSender) *AuthService {
	return NewAuthService(userRepo, mlRepo, mailSender, AuthServiceConfig{
		JWTSecret:           "test-secret-key-for-unit-tests",
		JWTExpiry:           24 * time.Hour,
		MagicLinkExpiry:     15 * time.Minute,
		BaseURL:             "https://zenbill.example.com",
		FrontendCallbackURL: "https://zenbill.example.com/auth/callback",
		DevMode:             true,
	})
}

func TestAuthService_DevLogin_ExistingUser(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := newTestAuthServiceDevMode(userRepo, mlRepo, mailSender)

	ctx := context.Background()
	userID := uuid.New()
	email := "dev@example.com"

	userRepo.On("FindByEmail", ctx, email).Return(&domain.User{
		ID:    userID,
		Email: email,
	}, nil)

	jwtStr, err := svc.DevLogin(ctx, email)

	require.NoError(t, err)
	assert.NotEmpty(t, jwtStr)

	claims, err := svc.ParseJWT(jwtStr)
	require.NoError(t, err)
	assert.Equal(t, email, claims.Email)
	assert.Equal(t, userID.String(), claims.Subject)

	// Should NOT send any email or create magic link
	mailSender.AssertNotCalled(t, "Send")
	mlRepo.AssertNotCalled(t, "Create")
}

func TestAuthService_DevLogin_NewUser(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := newTestAuthServiceDevMode(userRepo, mlRepo, mailSender)

	ctx := context.Background()
	email := "newdev@example.com"

	userRepo.On("FindByEmail", ctx, email).Return(nil, gorm.ErrRecordNotFound)
	userRepo.On("Create", ctx, mock.AnythingOfType("*domain.User")).Return(nil)

	jwtStr, err := svc.DevLogin(ctx, email)

	require.NoError(t, err)
	assert.NotEmpty(t, jwtStr)

	claims, err := svc.ParseJWT(jwtStr)
	require.NoError(t, err)
	assert.Equal(t, email, claims.Email)

	userRepo.AssertCalled(t, "Create", ctx, mock.AnythingOfType("*domain.User"))
}
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run "TestAuthService_DevLogin" -v`
Expected: FAIL — `DevLogin` method does not exist

**Step 3: Implement DevLogin**

In `backend/internal/usecase/auth_service.go`:

1. Add `DevMode bool` to `AuthServiceConfig`:

```go
type AuthServiceConfig struct {
	JWTSecret           string
	JWTExpiry           time.Duration
	MagicLinkExpiry     time.Duration
	BaseURL             string
	FrontendCallbackURL string
	DevMode             bool
}
```

2. Add `DevLogin` method after `RequestLogin`:

```go
// DevLogin skips magic link email and directly returns a JWT for the given email.
// Only for development use — creates the user if they don't exist.
func (s *AuthService) DevLogin(ctx context.Context, email string) (string, error) {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			user = &domain.User{Email: email}
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

// IsDevMode returns whether the service is running in development mode
func (s *AuthService) IsDevMode() bool {
	return s.config.DevMode
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run "TestAuthService_DevLogin" -v`
Expected: PASS (2 tests)

Also run existing tests to confirm no regressions:

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run "TestAuthService_" -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
cd /Users/yuki/projects/zen-bill/backend
git add internal/usecase/auth_service.go internal/usecase/auth_service_test.go
git commit -m "feat(auth): add DevLogin method for dev environment"
```

---

### Task 2: Update AuthHandler to use DevLogin in dev mode

**Files:**
- Modify: `backend/internal/delivery/http/auth_handler.go`

**Step 1: Update Login handler**

Replace the `Login` method in `backend/internal/delivery/http/auth_handler.go`:

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

	// Production: send magic link email
	origin := c.GetHeader("Origin")
	if err := h.authService.RequestLogin(c.Request.Context(), req.Email, origin); err != nil {
		h.logger.Error("failed to send magic link", "email", req.Email, "error", err)
	}

	SuccessWithMessage(c, "登入連結已寄出，請查看信箱", nil)
}
```

**Step 2: Verify build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Build succeeds

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill/backend
git add internal/delivery/http/auth_handler.go
git commit -m "feat(auth): handler returns JWT directly in dev mode"
```

---

### Task 3: Wire DevMode in cmd/api/main.go

**Files:**
- Modify: `backend/cmd/api/main.go:108-114`

**Step 1: Add DevMode to AuthServiceConfig initialization**

In `backend/cmd/api/main.go`, change the `authService` creation (~line 108):

```go
	authService := usecase.NewAuthService(userRepo, magicLinkRepo, mailSender, usecase.AuthServiceConfig{
		JWTSecret:           cfg.Auth.JWTSecret,
		JWTExpiry:           cfg.Auth.JWTExpiry,
		MagicLinkExpiry:     cfg.Auth.MagicLinkExpiry,
		BaseURL:             cfg.Auth.APIBaseURL,
		FrontendCallbackURL: cfg.Auth.FrontendCallbackURL,
		DevMode:             cfg.App.Env != "production",
	})
```

**Step 2: Verify build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: Build succeeds

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill/backend
git add cmd/api/main.go
git commit -m "feat(auth): wire DevMode from app.env config"
```

---

### Task 4: Update frontend LoginPage to handle token response

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`

**Step 1: Update LoginPage to check for token in response**

Replace the `handleSubmit` function and add imports in `frontend/src/pages/LoginPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { ApiResponse, User } from '@/types'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post<ApiResponse<{ token?: string }>>('/auth/login', { email })
      const token = res.data?.token
      if (token) {
        // Dev mode: got JWT directly, store and fetch user info
        localStorage.setItem('token', token)
        const me = await api.get<ApiResponse<User>>('/auth/me')
        setAuth(token, me.data)
        navigate('/', { replace: true })
      } else {
        // Production: magic link sent
        setSent(true)
      }
    } catch {
      setError('發送失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  // ... rest of JSX unchanged
```

Note: Only the `<script>` section changes. The JSX template remains identical.

**Step 2: Verify frontend builds**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat(auth): handle direct JWT login in dev mode"
```

---

### Task 5: Manual E2E verification

**Step 1: Start dev environment**

Run both backend and frontend in dev mode and verify:
1. Go to login page
2. Enter any email
3. Should be logged in immediately without checking email

**Step 2: Verify production path is unaffected**

Confirm that when `ZENBILL_APP_ENV=production`, the login still sends magic link email (code review — the `if` branch only fires when `DevMode` is true).

**Step 3: Final commit (all tasks together if not already committed)**

```bash
cd /Users/yuki/projects/zen-bill
git add -A
git commit -m "feat(auth): skip email verification in dev environment

Dev mode (app.env != production) returns JWT directly on login,
skipping magic link email. Production flow unchanged."
```
