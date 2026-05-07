# Refresh Token Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add access + refresh token architecture to extend login sessions to 14 days with sliding window.

**Architecture:** Replace the single JWT with a two-token system. Access token (15m) for API auth, refresh token (14 days) for silent re-authentication. Both are stateless signed JWTs. The refresh endpoint issues a new pair each time (sliding window). Frontend intercepts 401s and auto-refreshes.

**Tech Stack:** Go (golang-jwt/v5), Gin, TypeScript, Zustand, Expo SecureStore

---

### Task 1: Add TokenType to JWTClaims and update generateJWT

**Files:**
- Modify: `backend/internal/usecase/auth_service.go:41-45` (JWTClaims struct)
- Modify: `backend/internal/usecase/auth_service.go:32-39` (AuthServiceConfig struct)
- Modify: `backend/internal/usecase/auth_service.go:274-286` (generateJWT method)

**Step 1: Write the failing test**

Add to `backend/internal/usecase/auth_service_test.go`:

```go
func TestGenerateTokenPair_ContainsTokenType(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := NewAuthService(userRepo, mlRepo, mailSender, AuthServiceConfig{
		JWTSecret:           "test-secret-key-for-unit-tests",
		JWTExpiry:           15 * time.Minute,
		RefreshTokenExpiry:  14 * 24 * time.Hour,
		MagicLinkExpiry:     15 * time.Minute,
		BaseURL:             "https://zenbill.example.com",
		FrontendCallbackURL: "https://zenbill.example.com/auth/callback",
	})

	userID := uuid.New()
	accessToken, refreshToken, err := svc.GenerateTokenPair(userID, "test@example.com")
	require.NoError(t, err)
	assert.NotEmpty(t, accessToken)
	assert.NotEmpty(t, refreshToken)

	// Verify access token claims
	accessClaims, err := svc.ParseJWT(accessToken)
	require.NoError(t, err)
	assert.Equal(t, "access", accessClaims.TokenType)
	assert.Equal(t, "test@example.com", accessClaims.Email)

	// Verify refresh token claims
	refreshClaims, err := svc.ParseJWT(refreshToken)
	require.NoError(t, err)
	assert.Equal(t, "refresh", refreshClaims.TokenType)
	assert.Equal(t, "test@example.com", refreshClaims.Email)

	// Verify different expiry times
	accessExp := accessClaims.ExpiresAt.Time
	refreshExp := refreshClaims.ExpiresAt.Time
	assert.True(t, refreshExp.After(accessExp), "refresh token should expire after access token")
}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/usecase/ -run TestGenerateTokenPair_ContainsTokenType -v`
Expected: FAIL — `RefreshTokenExpiry` field doesn't exist, `GenerateTokenPair` method doesn't exist

**Step 3: Write minimal implementation**

In `backend/internal/usecase/auth_service.go`:

1. Add `TokenType` to `JWTClaims`:
```go
type JWTClaims struct {
	Email     string `json:"email"`
	TokenType string `json:"token_type,omitempty"`
	jwt.RegisteredClaims
}
```

2. Add `RefreshTokenExpiry` to `AuthServiceConfig`:
```go
type AuthServiceConfig struct {
	JWTSecret           string
	JWTExpiry           time.Duration
	RefreshTokenExpiry  time.Duration
	MagicLinkExpiry     time.Duration
	BaseURL             string
	FrontendCallbackURL string
	DevMode             bool
}
```

3. Add `GenerateTokenPair` method (keep existing `generateJWT` for backward compat during transition):
```go
func (s *AuthService) GenerateTokenPair(userID uuid.UUID, email string) (accessToken, refreshToken string, err error) {
	accessToken, err = s.generateTokenWithType(userID, email, "access", s.config.JWTExpiry)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate access token: %w", err)
	}

	refreshToken, err = s.generateTokenWithType(userID, email, "refresh", s.config.RefreshTokenExpiry)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate refresh token: %w", err)
	}

	return accessToken, refreshToken, nil
}

func (s *AuthService) generateTokenWithType(userID uuid.UUID, email, tokenType string, expiry time.Duration) (string, error) {
	claims := JWTClaims{
		Email:     email,
		TokenType: tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.config.JWTSecret))
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/usecase/ -run TestGenerateTokenPair_ContainsTokenType -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/internal/usecase/auth_service.go backend/internal/usecase/auth_service_test.go
git commit -m "feat(auth): add TokenType to JWTClaims and GenerateTokenPair method"
```

---

### Task 2: Add RefreshToken method to AuthService

**Files:**
- Modify: `backend/internal/usecase/auth_service.go`
- Modify: `backend/internal/usecase/auth_service_test.go`

**Step 1: Write the failing tests**

Add to `backend/internal/usecase/auth_service_test.go`:

```go
var ErrInvalidRefreshToken = errors.New("invalid refresh token") // import at top if needed

func TestAuthService_RefreshToken_Success(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := NewAuthService(userRepo, mlRepo, mailSender, AuthServiceConfig{
		JWTSecret:          "test-secret-key-for-unit-tests",
		JWTExpiry:          15 * time.Minute,
		RefreshTokenExpiry: 14 * 24 * time.Hour,
		MagicLinkExpiry:    15 * time.Minute,
	})

	userID := uuid.New()
	_, oldRefresh, err := svc.GenerateTokenPair(userID, "test@example.com")
	require.NoError(t, err)

	newAccess, newRefresh, err := svc.RefreshToken(oldRefresh)
	require.NoError(t, err)
	assert.NotEmpty(t, newAccess)
	assert.NotEmpty(t, newRefresh)

	// New access token should be valid
	claims, err := svc.ParseJWT(newAccess)
	require.NoError(t, err)
	assert.Equal(t, "access", claims.TokenType)
	assert.Equal(t, userID.String(), claims.Subject)
}

func TestAuthService_RefreshToken_RejectsAccessToken(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := NewAuthService(userRepo, mlRepo, mailSender, AuthServiceConfig{
		JWTSecret:          "test-secret-key-for-unit-tests",
		JWTExpiry:          15 * time.Minute,
		RefreshTokenExpiry: 14 * 24 * time.Hour,
		MagicLinkExpiry:    15 * time.Minute,
	})

	userID := uuid.New()
	accessToken, _, err := svc.GenerateTokenPair(userID, "test@example.com")
	require.NoError(t, err)

	// Using an access token as refresh token should fail
	_, _, err = svc.RefreshToken(accessToken)
	assert.Error(t, err)
}

func TestAuthService_RefreshToken_RejectsExpiredToken(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := NewAuthService(userRepo, mlRepo, mailSender, AuthServiceConfig{
		JWTSecret:          "test-secret-key-for-unit-tests",
		JWTExpiry:          15 * time.Minute,
		RefreshTokenExpiry: 14 * 24 * time.Hour,
		MagicLinkExpiry:    15 * time.Minute,
	})

	// Generate a refresh token that's already expired
	expiredToken, err := svc.generateTokenWithType(uuid.New(), "test@example.com", "refresh", -time.Hour)
	require.NoError(t, err)

	_, _, err = svc.RefreshToken(expiredToken)
	assert.Error(t, err)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/usecase/ -run TestAuthService_RefreshToken -v`
Expected: FAIL — `RefreshToken` method doesn't exist

**Step 3: Write minimal implementation**

Add to `backend/internal/usecase/auth_service.go`:

```go
var ErrInvalidRefreshToken = errors.New("invalid or expired refresh token")

// RefreshToken validates a refresh token and returns a new access + refresh token pair.
func (s *AuthService) RefreshToken(refreshTokenStr string) (string, string, error) {
	claims, err := s.ParseJWT(refreshTokenStr)
	if err != nil {
		return "", "", ErrInvalidRefreshToken
	}

	if claims.TokenType != "refresh" {
		return "", "", ErrInvalidRefreshToken
	}

	userID, err := uuid.Parse(claims.Subject)
	if err != nil {
		return "", "", ErrInvalidRefreshToken
	}

	return s.GenerateTokenPair(userID, claims.Email)
}
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./internal/usecase/ -run TestAuthService_RefreshToken -v`
Expected: PASS (all 3 tests)

**Step 5: Commit**

```bash
git add backend/internal/usecase/auth_service.go backend/internal/usecase/auth_service_test.go
git commit -m "feat(auth): add RefreshToken method with type validation"
```

---

### Task 3: Update login endpoints to return token pair

**Files:**
- Modify: `backend/internal/usecase/auth_service.go` (DevLogin, VerifyToken, VerifyCode)
- Modify: `backend/internal/usecase/auth_service_test.go` (update existing tests)
- Modify: `backend/internal/delivery/http/auth_handler.go`

**Step 1: Update AuthService methods to return token pairs**

Change method signatures:
- `DevLogin` → returns `(accessToken, refreshToken string, err error)`
- `VerifyToken` → returns `(accessToken, refreshToken, callbackURL string, err error)`
- `VerifyCode` → returns `(accessToken, refreshToken string, err error)`

In each method, replace `s.generateJWT(user.ID, user.Email)` with `s.GenerateTokenPair(user.ID, user.Email)`.

**Step 2: Update existing tests**

Update all test assertions to expect two tokens. For example, `TestAuthService_VerifyToken_ExistingUser`:

```go
accessToken, refreshToken, callbackURL, err := svc.VerifyToken(ctx, token)
require.NoError(t, err)
assert.NotEmpty(t, accessToken)
assert.NotEmpty(t, refreshToken)

claims, err := svc.ParseJWT(accessToken)
require.NoError(t, err)
assert.Equal(t, "access", claims.TokenType)
```

Similar updates for:
- `TestAuthService_VerifyToken_NewUser`
- `TestAuthService_VerifyToken_Expired` (only returns err, but signature changes)
- `TestAuthService_VerifyToken_AlreadyUsed`
- `TestAuthService_DevLogin_ExistingUser`
- `TestAuthService_DevLogin_NewUser`
- `TestAuthService_VerifyCode_Success`
- `TestAuthService_VerifyCode_InvalidCode`
- `TestAuthService_ParseToken` (update `generateJWT` → `generateTokenWithType` if needed)

**Step 3: Update auth_handler.go**

Update handler responses to include both tokens:

```go
// In Login (dev mode):
Success(c, gin.H{"token": accessToken, "refresh_token": refreshToken})

// In VerifyCode:
Success(c, gin.H{"token": accessToken, "refresh_token": refreshToken})

// In Verify (magic link redirect):
c.Redirect(http.StatusFound, callbackURL+"?token="+accessToken+"&refresh_token="+refreshToken)
```

**Step 4: Run all auth tests**

Run: `cd backend && go test ./internal/usecase/ -run TestAuthService -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/internal/usecase/auth_service.go backend/internal/usecase/auth_service_test.go backend/internal/delivery/http/auth_handler.go
git commit -m "feat(auth): update login endpoints to return access + refresh token pair"
```

---

### Task 4: Add POST /auth/refresh endpoint

**Files:**
- Modify: `backend/internal/delivery/http/auth_handler.go`

**Step 1: Add RefreshHandler and route**

```go
type AuthRefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	var req AuthRefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "請提供 refresh token")
		return
	}

	accessToken, refreshToken, err := h.authService.RefreshToken(req.RefreshToken)
	if err != nil {
		h.logger.Warn("refresh token failed", "error", err)
		Unauthorized(c, "refresh token 無效或已過期")
		return
	}

	Success(c, gin.H{"token": accessToken, "refresh_token": refreshToken})
}
```

Add to `RegisterPublicRoutes`:
```go
auth.POST("/refresh", h.Refresh)
```

**Step 2: Run build to verify compilation**

Run: `cd backend && go build ./...`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add backend/internal/delivery/http/auth_handler.go
git commit -m "feat(auth): add POST /auth/refresh endpoint"
```

---

### Task 5: Update auth middleware to check token type

**Files:**
- Modify: `backend/internal/delivery/http/middleware/auth.go`
- Modify: `backend/internal/delivery/http/middleware/auth_test.go`

**Step 1: Write the failing test**

Add to `backend/internal/delivery/http/middleware/auth_test.go`:

```go
func TestJWTAuth_RejectsRefreshToken(t *testing.T) {
	secret := "test-secret"
	userID := uuid.New()

	// Generate a token with type "refresh"
	claims := usecase.JWTClaims{
		Email:     "test@example.com",
		TokenType: "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, _ := token.SignedString([]byte(secret))

	r := setupRouter(secret)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	r.ServeHTTP(w, req)

	assert.Equal(t, 401, w.Code)
}

func TestJWTAuth_AcceptsLegacyTokenWithoutType(t *testing.T) {
	secret := "test-secret"
	userID := uuid.New()
	// generateTestJWT creates tokens without TokenType — simulates old tokens
	token := generateTestJWT(secret, userID, "test@example.com", time.Hour)

	r := setupRouter(secret)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/delivery/http/middleware/ -run TestJWTAuth_Rejects -v`
Expected: FAIL — middleware doesn't check TokenType yet

**Step 3: Update middleware**

In `backend/internal/delivery/http/middleware/auth.go`, after parsing claims add:

```go
// Reject refresh tokens used as access tokens.
// Allow empty TokenType for backward compatibility with old JWTs.
if claims.TokenType == "refresh" {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "invalid token type"})
	return
}
```

**Step 4: Run all middleware tests**

Run: `cd backend && go test ./internal/delivery/http/middleware/ -v`
Expected: ALL PASS (including existing tests + 2 new ones)

**Step 5: Commit**

```bash
git add backend/internal/delivery/http/middleware/auth.go backend/internal/delivery/http/middleware/auth_test.go
git commit -m "feat(auth): middleware rejects refresh tokens, allows legacy tokens"
```

---

### Task 6: Update config defaults

**Files:**
- Modify: `backend/internal/config/config.go:91-97` (AuthConfig struct)
- Modify: `backend/internal/config/config.go:267-268` (defaults)
- Modify: `backend/cmd/api/main.go:108-115` (AuthServiceConfig wiring)

**Step 1: Update AuthConfig**

```go
type AuthConfig struct {
	JWTSecret           string        `mapstructure:"jwt_secret"`
	JWTExpiry           time.Duration `mapstructure:"jwt_expiry"`
	RefreshTokenExpiry  time.Duration `mapstructure:"refresh_token_expiry"`
	MagicLinkExpiry     time.Duration `mapstructure:"magic_link_expiry"`
	FrontendCallbackURL string        `mapstructure:"frontend_callback_url"`
	APIBaseURL          string        `mapstructure:"api_base_url"`
}
```

**Step 2: Update defaults**

```go
v.SetDefault("auth.jwt_expiry", "15m")
v.SetDefault("auth.refresh_token_expiry", "336h")
v.SetDefault("auth.magic_link_expiry", "15m")
```

**Step 3: Update main.go wiring**

```go
authService := usecase.NewAuthService(userRepo, magicLinkRepo, mailSender, usecase.AuthServiceConfig{
	JWTSecret:           cfg.Auth.JWTSecret,
	JWTExpiry:           cfg.Auth.JWTExpiry,
	RefreshTokenExpiry:  cfg.Auth.RefreshTokenExpiry,
	MagicLinkExpiry:     cfg.Auth.MagicLinkExpiry,
	BaseURL:             cfg.Auth.APIBaseURL,
	FrontendCallbackURL: cfg.Auth.FrontendCallbackURL,
	DevMode:             cfg.App.Env != "production",
})
```

**Step 4: Run build**

Run: `cd backend && go build ./...`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add backend/internal/config/config.go backend/cmd/api/main.go
git commit -m "feat(auth): update config defaults to 15m access + 14d refresh"
```

---

### Task 7: Update TokenStorage interface and implementations

**Files:**
- Modify: `packages/shared/src/api/client.ts` (TokenStorage interface)
- Modify: `frontend/src/lib/storage.ts` (web implementation)
- Modify: `app/lib/storage.ts` (app implementation)

**Step 1: Update TokenStorage interface**

In `packages/shared/src/api/client.ts`:

```typescript
export interface TokenStorage {
  getToken(): Promise<string | null>
  setToken(token: string): Promise<void>
  removeToken(): Promise<void>
  getRefreshToken(): Promise<string | null>
  setRefreshToken(token: string): Promise<void>
  removeRefreshToken(): Promise<void>
}
```

**Step 2: Update web storage**

In `frontend/src/lib/storage.ts`:

```typescript
import type { TokenStorage } from '@zenbill/shared'

export const webTokenStorage: TokenStorage = {
  getToken: async () => localStorage.getItem('token'),
  setToken: async (token) => { localStorage.setItem('token', token) },
  removeToken: async () => { localStorage.removeItem('token') },
  getRefreshToken: async () => localStorage.getItem('refresh_token'),
  setRefreshToken: async (token) => { localStorage.setItem('refresh_token', token) },
  removeRefreshToken: async () => { localStorage.removeItem('refresh_token') },
}
```

**Step 3: Update app storage**

In `app/lib/storage.ts`:

```typescript
import * as SecureStore from 'expo-secure-store'
import type { TokenStorage } from '@zenbill/shared'

const TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'auth_refresh_token'

export const appTokenStorage: TokenStorage = {
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  setToken: (token) => SecureStore.setItemAsync(TOKEN_KEY, token),
  removeToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  setRefreshToken: (token) => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token),
  removeRefreshToken: () => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
}
```

**Step 4: Commit**

```bash
git add packages/shared/src/api/client.ts frontend/src/lib/storage.ts app/lib/storage.ts
git commit -m "feat(auth): add refresh token to TokenStorage interface and implementations"
```

---

### Task 8: Update auth store to handle token pairs

**Files:**
- Modify: `packages/shared/src/stores/auth.ts`
- Modify: `frontend/src/stores/auth.ts`
- Modify: `app/lib/auth.ts`

**Step 1: Update shared auth store**

In `packages/shared/src/stores/auth.ts`:

```typescript
import { create } from 'zustand'
import type { User } from '../types/index.ts'
import type { TokenStorage } from '../api/client.ts'

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  setAuth: (token: string, refreshToken: string, user: User) => void
  setTokens: (token: string, refreshToken: string) => void
  setUser: (user: User) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export type AuthStore = ReturnType<typeof createAuthStore>

export function createAuthStore(storage: TokenStorage) {
  return create<AuthState>((set, get) => ({
    token: null,
    refreshToken: null,
    user: null,
    setAuth: (token, refreshToken, user) => {
      storage.setToken(token)
      storage.setRefreshToken(refreshToken)
      set({ token, refreshToken, user })
    },
    setTokens: (token, refreshToken) => {
      storage.setToken(token)
      storage.setRefreshToken(refreshToken)
      set({ token, refreshToken })
    },
    setUser: (user) => set({ user }),
    logout: () => {
      storage.removeToken()
      storage.removeRefreshToken()
      set({ token: null, refreshToken: null, user: null })
    },
    isAuthenticated: () => !!get().token,
  }))
}
```

**Step 2: Update web auth store init**

In `frontend/src/stores/auth.ts`:

```typescript
import { createAuthStore } from '@zenbill/shared'
import { webTokenStorage } from '@/lib/storage.ts'

export const useAuthStore = createAuthStore(webTokenStorage)

// Initialize tokens from localStorage synchronously for Web
const token = localStorage.getItem('token')
const refreshToken = localStorage.getItem('refresh_token')
if (token) {
  useAuthStore.setState({ token, refreshToken })
}
```

**Step 3: Update app auth init**

In `app/lib/auth.ts`:

```typescript
import { createAuthStore, getApiClient } from '@zenbill/shared'
import type { ApiResponse, User } from '@zenbill/shared'
import { appTokenStorage } from './storage'

export const useAuthStore = createAuthStore(appTokenStorage)

export async function initAuth(): Promise<boolean> {
  const token = await appTokenStorage.getToken()
  const refreshToken = await appTokenStorage.getRefreshToken()
  if (token) {
    useAuthStore.setState({ token, refreshToken })
    try {
      const api = getApiClient()
      const res = await api.get<ApiResponse<User>>('/auth/me')
      useAuthStore.getState().setUser(res.data)
    } catch {
      useAuthStore.getState().logout()
      return false
    }
    return true
  }
  return false
}
```

**Step 4: Commit**

```bash
git add packages/shared/src/stores/auth.ts frontend/src/stores/auth.ts app/lib/auth.ts
git commit -m "feat(auth): update auth stores to handle token pairs"
```

---

### Task 9: Add auto-refresh logic to API client

**Files:**
- Modify: `packages/shared/src/api/client.ts`

This is the most critical frontend change. The client must:
1. Intercept 401 responses
2. Try to refresh using the stored refresh token
3. Retry the original request with the new access token
4. If refresh fails, trigger logout

**Step 1: Update createApiClient**

In `packages/shared/src/api/client.ts`:

```typescript
export interface TokenStorage {
  getToken(): Promise<string | null>
  setToken(token: string): Promise<void>
  removeToken(): Promise<void>
  getRefreshToken(): Promise<string | null>
  setRefreshToken(token: string): Promise<void>
  removeRefreshToken(): Promise<void>
}

export interface ApiClientConfig {
  storage: TokenStorage
  baseUrl: string
  onUnauthorized?: () => void
}

export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

let _client: ApiClient | null = null

export function setApiClient(client: ApiClient) {
  _client = client
}

export function getApiClient(): ApiClient {
  if (!_client) throw new Error('@zenbill/shared: API client not initialized. Call setApiClient() first.')
  return _client
}

export function createApiClient(config: ApiClientConfig) {
  const { storage, baseUrl, onUnauthorized } = config

  let refreshPromise: Promise<boolean> | null = null

  async function refreshTokens(): Promise<boolean> {
    const refreshToken = await storage.getRefreshToken()
    if (!refreshToken) return false

    try {
      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (!res.ok) return false

      const json = await res.json()
      if (json.data?.token && json.data?.refresh_token) {
        await storage.setToken(json.data.token)
        await storage.setRefreshToken(json.data.refresh_token)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await storage.getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    if (res.status === 401) {
      // Don't try to refresh if this IS the refresh endpoint
      if (path === '/auth/refresh') {
        await storage.removeToken()
        await storage.removeRefreshToken()
        onUnauthorized?.()
        throw new ApiError(401, 'Unauthorized')
      }

      // Deduplicate concurrent refresh attempts
      if (!refreshPromise) {
        refreshPromise = refreshTokens().finally(() => { refreshPromise = null })
      }

      const refreshed = await refreshPromise

      if (refreshed) {
        // Retry with new token
        const newToken = await storage.getToken()
        const retryHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (newToken) retryHeaders['Authorization'] = `Bearer ${newToken}`

        const retryRes = await fetch(`${baseUrl}${path}`, {
          method,
          headers: retryHeaders,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        })

        if (!retryRes.ok) {
          const retryJson = await retryRes.json()
          if (retryRes.status === 401) {
            await storage.removeToken()
            await storage.removeRefreshToken()
            onUnauthorized?.()
          }
          throw new ApiError(retryJson.code || retryRes.status, retryJson.message || 'Unknown error')
        }

        return retryRes.json()
      }

      // Refresh failed
      await storage.removeToken()
      await storage.removeRefreshToken()
      onUnauthorized?.()
      throw new ApiError(401, 'Unauthorized')
    }

    const json = await res.json()

    if (!res.ok) {
      throw new ApiError(json.code || res.status, json.message || 'Unknown error')
    }

    return json
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  }
}
```

Key design decisions:
- `refreshPromise` deduplication prevents multiple concurrent refresh calls
- Skip refresh for the `/auth/refresh` endpoint itself to avoid infinite loop
- On refresh success, retry the original request once
- On refresh failure, clear both tokens and trigger `onUnauthorized`

**Step 2: Commit**

```bash
git add packages/shared/src/api/client.ts
git commit -m "feat(auth): add auto-refresh logic to API client with deduplication"
```

---

### Task 10: Update login pages to handle token pairs

**Files:**
- Modify: `app/app/(auth)/login.tsx`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/AuthCallbackPage.tsx`

**Step 1: Update app login page**

In `app/app/(auth)/login.tsx`, update the two places where `setAuth` is called:

```typescript
// In handleSendCode (dev mode):
if (res.data?.token) {
  const refreshToken = (res.data as any).refresh_token || ''
  useAuthStore.getState().setAuth(res.data.token, refreshToken, { id: '', email: email.trim() })
  // ... rest unchanged
}

// In handleVerifyCode:
if (res.data?.token) {
  const refreshToken = (res.data as any).refresh_token || ''
  useAuthStore.getState().setAuth(res.data.token, refreshToken, { id: '', email: email.trim() })
  // ... rest unchanged
}
```

Note: Use proper typing by updating the response type to include `refresh_token`.

**Step 2: Update web login page**

In `frontend/src/pages/LoginPage.tsx`:

```typescript
// In handleSubmit (dev mode):
if (token) {
  const refreshToken = (res.data as any)?.refresh_token || ''
  localStorage.setItem('token', token)
  localStorage.setItem('refresh_token', refreshToken)
  const me = await api.get<ApiResponse<User>>('/auth/me')
  setAuth(token, refreshToken, me.data)
  navigate(getRedirectPath(), { replace: true })
}
```

**Step 3: Update AuthCallbackPage**

In `frontend/src/pages/AuthCallbackPage.tsx`:

```typescript
// In useEffect:
const token = searchParams.get('token')
const refreshToken = searchParams.get('refresh_token')
const err = searchParams.get('error')

// ...

if (!token) {
  setError('無效的登入連結')
  return
}

localStorage.setItem('token', token)
if (refreshToken) localStorage.setItem('refresh_token', refreshToken)

api.get<ApiResponse<User>>('/auth/me')
  .then((res) => {
    setAuth(token, refreshToken || '', res.data)
    navigate('/', { replace: true })
  })
  .catch(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('refresh_token')
    setError('驗證失敗，請重新登入')
  })
```

**Step 4: Commit**

```bash
git add app/app/\(auth\)/login.tsx frontend/src/pages/LoginPage.tsx frontend/src/pages/AuthCallbackPage.tsx
git commit -m "feat(auth): update login pages to store and pass refresh tokens"
```

---

### Task 11: Run full test suite and verify

**Step 1: Run backend tests**

Run: `cd backend && go test ./internal/usecase/ -v`
Expected: ALL PASS

**Step 2: Run middleware tests**

Run: `cd backend && go test ./internal/delivery/http/middleware/ -v`
Expected: ALL PASS

**Step 3: Run full backend build**

Run: `cd backend && go build ./...`
Expected: SUCCESS

**Step 4: TypeScript type check**

Run: `cd frontend && npx tsc --noEmit` (if tsconfig is set up)
Run: `cd packages/shared && npx tsc --noEmit` (if applicable)

**Step 5: Commit any fixes and final commit**

```bash
git add -A
git commit -m "feat(auth): complete refresh token implementation"
```

---

### Task 12: Clean up old generateJWT method

**Files:**
- Modify: `backend/internal/usecase/auth_service.go`

After all tests pass, remove the old `generateJWT` method since it's been replaced by `generateTokenWithType`. Search for any remaining callers first.

Run: `cd backend && grep -rn "generateJWT" internal/`

If no callers remain, remove the method. If callers exist (e.g., in tests), update them.

**Step 1: Remove old method and verify**

Run: `cd backend && go build ./... && go test ./... -v`
Expected: SUCCESS

**Step 2: Commit**

```bash
git add backend/internal/usecase/auth_service.go
git commit -m "refactor(auth): remove deprecated generateJWT method"
```
