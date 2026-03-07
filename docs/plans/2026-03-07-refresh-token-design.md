# Refresh Token Design

Date: 2026-03-07

## Goal

Extend login session from 7 days to 14 days using access + refresh token architecture.

## Token Architecture

- **Access token**: JWT, 15-minute expiry, used for API requests
- **Refresh token**: JWT, 14-day expiry, sliding window (re-issued on each refresh)
- Both are stateless signed JWTs, no DB storage
- Refresh token JWT claims include a `type` field to prevent using refresh token as access token

## Backend Changes

### Config (`internal/config/config.go`)
- Rename/repurpose `JWTExpiry` to `AccessTokenExpiry`, default `15m`
- Add `RefreshTokenExpiry`, default `336h` (14 days)

### Auth Service (`internal/usecase/auth_service.go`)
- Login returns both access token and refresh token
- Add `RefreshToken(refreshTokenStr string) (accessToken, newRefreshToken string, err error)`:
  1. Parse and validate refresh token JWT
  2. Verify `type` claim is `"refresh"`
  3. Generate new access + refresh token pair
  4. Return both

### JWT Claims
- Add `TokenType string` field to `JWTClaims`
- Access token: `type: "access"`
- Refresh token: `type: "refresh"`

### New Endpoint
- `POST /auth/refresh` — accepts `{ "refresh_token": "..." }`, returns new token pair

### Auth Middleware
- Reject tokens where `type != "access"`

## Frontend Changes

### `packages/shared/src/api/client.ts`
- On 401 response, attempt refresh using stored refresh token
- If refresh succeeds, retry original request with new access token
- If refresh fails, trigger logout

### `packages/shared/src/stores/auth.ts`
- Store both `token` (access) and `refreshToken`
- `setAuth` accepts both tokens
- `logout` clears both

### `TokenStorage` interface
- Add `getRefreshToken()`, `setRefreshToken()`, `removeRefreshToken()`

### Platform storage implementations
- App (`app/lib/storage.ts`): SecureStore for refresh token
- Web (`frontend/`): localStorage for refresh token

## Backward Compatibility

- Frontend and backend must deploy simultaneously
- Old 7-day JWTs (without `type` claim) remain valid until natural expiry
  - Auth middleware should treat missing `type` as `"access"` for transition period

## Out of Scope

- Token revocation
- Device/session management
- Refresh token rotation detection (stolen token detection)
