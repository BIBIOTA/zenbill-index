# Registration-Closed Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict production login so only existing `users` records can receive or verify login credentials, while keeping dev-mode auto-create behavior.

**Architecture:** Add one auth-domain error and one shared `AuthService` lookup helper, then use that helper in production magic-link and OTP request/verify flows. Map that error to `403` in API responses, to `registration_closed` in Web magic-link redirects, and to the same Chinese message in Web/App login UI. Backend lives in its own Git repository under `backend/`; frontend and App changes live in the root repository.

**Tech Stack:** Go, Gin, GORM, testify/mock, React/Vite, React Native/Expo, TypeScript.

---

## File Structure

- Modify `backend/internal/usecase/auth_service.go`: define `ErrRegistrationClosed`, add `RegistrationClosedMessage`, add `requireExistingUser`, and remove production auto-create from request/verify flows.
- Modify `backend/internal/usecase/auth_service_test.go`: add failing tests for closed registration and update old auto-registration tests to expect rejection.
- Modify `backend/internal/delivery/http/auth_handler.go`: map `ErrRegistrationClosed` to `403` for JSON endpoints and `error=registration_closed` for magic-link redirects.
- Modify `frontend/src/pages/LoginPage.tsx`: show API error messages returned by `/auth/login`.
- Modify `frontend/src/pages/AuthCallbackPage.tsx`: map `registration_closed` callback errors to the closed-registration message.
- Modify `app/app/(auth)/login.tsx`: show backend-provided messages during OTP verification failures.

## Task 1: Backend Service Closed-Registration Tests

**Files:**
- Modify: `backend/internal/usecase/auth_service_test.go`

- [ ] **Step 1: Replace the old magic-link auto-registration test with a rejection test**

In `backend/internal/usecase/auth_service_test.go`, replace `TestAuthService_VerifyToken_NewUser` with:

```go
func TestAuthService_VerifyToken_UnknownUser_ReturnsRegistrationClosed(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := newTestAuthService(userRepo, mlRepo, mailSender)

	ctx := context.Background()
	token := "new-user-token"
	mlID := uuid.New()

	ml := &domain.MagicLink{
		ID:        mlID,
		Email:     "new@example.com",
		Token:     token,
		ExpiresAt: time.Now().Add(10 * time.Minute),
		UsedAt:    nil,
	}

	mlRepo.On("FindByToken", ctx, token).Return(ml, nil)
	mlRepo.On("MarkUsed", ctx, mlID).Return(nil)
	userRepo.On("FindByEmail", ctx, "new@example.com").Return(nil, gorm.ErrRecordNotFound)

	accessToken, refreshToken, callbackURL, err := svc.VerifyToken(ctx, token)

	assert.Empty(t, accessToken)
	assert.Empty(t, refreshToken)
	assert.Empty(t, callbackURL)
	assert.ErrorIs(t, err, ErrRegistrationClosed)
	userRepo.AssertNotCalled(t, "Create", ctx, mock.Anything)
}
```

- [ ] **Step 2: Add request-time magic-link rejection test**

Add this test after `TestAuthService_RequestLogin`:

```go
func TestAuthService_RequestLogin_UnknownUser_ReturnsRegistrationClosed(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := newTestAuthService(userRepo, mlRepo, mailSender)

	ctx := context.Background()
	email := "unknown@example.com"

	userRepo.On("FindByEmail", ctx, email).Return(nil, gorm.ErrRecordNotFound)

	err := svc.RequestLogin(ctx, email, "")

	assert.ErrorIs(t, err, ErrRegistrationClosed)
	mlRepo.AssertNotCalled(t, "Create", ctx, mock.Anything)
	mailSender.AssertNotCalled(t, "Send", mock.Anything, mock.Anything, mock.Anything)
}
```

- [ ] **Step 3: Update the existing magic-link request test to expect user lookup**

In `TestAuthService_RequestLogin`, add this setup before the magic-link repository expectation:

```go
userRepo.On("FindByEmail", ctx, email).Return(&domain.User{
	ID:    uuid.New(),
	Email: email,
}, nil)
```

- [ ] **Step 4: Add OTP request-time rejection test**

Add this test after `TestAuthService_RequestLoginWithCode`:

```go
func TestAuthService_RequestLoginWithCode_UnknownUser_ReturnsRegistrationClosed(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := newTestAuthService(userRepo, mlRepo, mailSender)

	ctx := context.Background()
	email := "unknown@example.com"

	userRepo.On("FindByEmail", ctx, email).Return(nil, gorm.ErrRecordNotFound)

	err := svc.RequestLoginWithCode(ctx, email)

	assert.ErrorIs(t, err, ErrRegistrationClosed)
	mlRepo.AssertNotCalled(t, "Create", ctx, mock.Anything)
	mailSender.AssertNotCalled(t, "Send", mock.Anything, mock.Anything, mock.Anything)
}
```

- [ ] **Step 5: Update the existing OTP request test to expect user lookup**

In `TestAuthService_RequestLoginWithCode`, add this setup before the magic-link repository expectation:

```go
userRepo.On("FindByEmail", ctx, email).Return(&domain.User{
	ID:    uuid.New(),
	Email: email,
}, nil)
```

- [ ] **Step 6: Add OTP verify rejection test**

Add this test after `TestAuthService_VerifyCode_Success`:

```go
func TestAuthService_VerifyCode_UnknownUser_ReturnsRegistrationClosed(t *testing.T) {
	userRepo := new(MockUserRepo)
	mlRepo := new(MockMagicLinkRepo)
	mailSender := new(MockMailSender)
	svc := newTestAuthService(userRepo, mlRepo, mailSender)

	ctx := context.Background()
	email := "unknown@example.com"
	code := "482917"
	mlID := uuid.New()

	ml := &domain.MagicLink{
		ID:        mlID,
		Email:     email,
		Token:     code,
		Method:    "code",
		ExpiresAt: time.Now().Add(10 * time.Minute),
	}

	mlRepo.On("FindByEmailAndCode", ctx, email, code).Return(ml, nil)
	mlRepo.On("MarkUsed", ctx, mlID).Return(nil)
	userRepo.On("FindByEmail", ctx, email).Return(nil, gorm.ErrRecordNotFound)

	accessToken, refreshToken, err := svc.VerifyCode(ctx, email, code)

	assert.Empty(t, accessToken)
	assert.Empty(t, refreshToken)
	assert.ErrorIs(t, err, ErrRegistrationClosed)
	userRepo.AssertNotCalled(t, "Create", ctx, mock.Anything)
}
```

- [ ] **Step 7: Run service tests and verify they fail for missing behavior**

Run:

```bash
cd backend
go test ./internal/usecase/... -run 'TestAuthService_(RequestLogin|RequestLoginWithCode|VerifyToken|VerifyCode)' -v
```

Expected: FAIL with errors such as `undefined: ErrRegistrationClosed` and mock failures for missing `FindByEmail` calls.

- [ ] **Step 8: Commit failing tests in the backend repo**

```bash
cd backend
git add internal/usecase/auth_service_test.go
git commit -m "test(auth): cover closed registration"
```

## Task 2: Backend Service Implementation

**Files:**
- Modify: `backend/internal/usecase/auth_service.go`

- [ ] **Step 1: Add the closed-registration error and message constant**

In the existing `var` block near the top of `backend/internal/usecase/auth_service.go`, add:

```go
ErrRegistrationClosed = errors.New("registration is closed")
```

After the `var` block, add:

```go
const RegistrationClosedMessage = "目前未開放新使用者註冊"
```

- [ ] **Step 2: Add the shared existing-user helper**

Add this method after `NewAuthService`:

```go
func (s *AuthService) requireExistingUser(ctx context.Context, email string) (*domain.User, error) {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrRegistrationClosed
		}
		return nil, fmt.Errorf("failed to find user: %w", err)
	}
	return user, nil
}
```

- [ ] **Step 3: Require an existing user before creating a magic link**

At the start of `RequestLogin`, before token generation, add:

```go
if _, err := s.requireExistingUser(ctx, email); err != nil {
	return err
}
```

- [ ] **Step 4: Require an existing user before creating an OTP**

At the start of `RequestLoginWithCode`, before `generateOTP()`, add:

```go
if _, err := s.requireExistingUser(ctx, email); err != nil {
	return err
}
```

- [ ] **Step 5: Replace `VerifyToken` auto-create with existing-user lookup**

Replace the current `user, err := s.userRepo.FindByEmail...` block in `VerifyToken` with:

```go
user, err := s.requireExistingUser(ctx, ml.Email)
if err != nil {
	return "", "", "", err
}
```

- [ ] **Step 6: Replace `VerifyCode` auto-create with existing-user lookup**

Replace the current `user, err := s.userRepo.FindByEmail...` block in `VerifyCode` with:

```go
user, err := s.requireExistingUser(ctx, ml.Email)
if err != nil {
	return "", "", err
}
```

- [ ] **Step 7: Run service tests and verify they pass**

Run:

```bash
cd backend
go test ./internal/usecase/... -run 'TestAuthService_(RequestLogin|RequestLoginWithCode|VerifyToken|VerifyCode|DevLogin)' -v
```

Expected: PASS. `TestAuthService_DevLogin_NewUser` must still pass, proving dev auto-create remains.

- [ ] **Step 8: Commit backend service implementation**

```bash
cd backend
git add internal/usecase/auth_service.go internal/usecase/auth_service_test.go
git commit -m "feat(auth): close self registration"
```

## Task 3: Backend HTTP Error Mapping

**Files:**
- Modify: `backend/internal/delivery/http/auth_handler.go`

- [ ] **Step 1: Map closed registration in `Login`**

In `Login`, update both production request branches.

For OTP:

```go
if req.Method == "code" {
	if err := h.authService.RequestLoginWithCode(c.Request.Context(), req.Email); err != nil {
		if errors.Is(err, usecase.ErrRegistrationClosed) {
			Forbidden(c, usecase.RegistrationClosedMessage)
			return
		}
		h.logger.Error("failed to send verification code", "email", req.Email, "error", err)
	}
	SuccessWithMessage(c, "驗證碼已寄出，請查看信箱", nil)
	return
}
```

For magic link:

```go
origin := c.GetHeader("Origin")
if err := h.authService.RequestLogin(c.Request.Context(), req.Email, origin); err != nil {
	if errors.Is(err, usecase.ErrRegistrationClosed) {
		Forbidden(c, usecase.RegistrationClosedMessage)
		return
	}
	h.logger.Error("failed to send magic link", "email", req.Email, "error", err)
}
SuccessWithMessage(c, "登入連結已寄出，請查看信箱", nil)
```

- [ ] **Step 2: Add the required import**

Add `errors` to the import list:

```go
import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/usecase"
)
```

- [ ] **Step 3: Map closed registration in magic-link callback**

In `Verify`, replace the error branch with:

```go
if err != nil {
	h.logger.Warn("magic link verification failed", "error", err)
	if errors.Is(err, usecase.ErrRegistrationClosed) {
		c.Redirect(http.StatusFound, h.frontendCallbackURL+"?error=registration_closed")
		return
	}
	c.Redirect(http.StatusFound, h.frontendCallbackURL+"?error=invalid_token")
	return
}
```

- [ ] **Step 4: Map closed registration in OTP verify**

In `VerifyCode`, replace the error branch with:

```go
if err != nil {
	h.logger.Warn("code verification failed", "email", req.Email, "error", err)
	if errors.Is(err, usecase.ErrRegistrationClosed) {
		Forbidden(c, usecase.RegistrationClosedMessage)
		return
	}
	Unauthorized(c, "驗證碼錯誤或已過期")
	return
}
```

- [ ] **Step 5: Run backend tests**

Run:

```bash
cd backend
go test ./internal/usecase/... ./internal/delivery/http/... -v
```

Expected: PASS.

- [ ] **Step 6: Commit HTTP mapping**

```bash
cd backend
git add internal/delivery/http/auth_handler.go
git commit -m "feat(auth): return closed registration errors"
```

## Task 4: Web Login Error Display

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/AuthCallbackPage.tsx`

- [ ] **Step 1: Update login request catch to show API messages**

In `frontend/src/pages/LoginPage.tsx`, replace:

```tsx
    } catch {
      setError('發送失敗，請稍後再試')
    } finally {
```

with:

```tsx
    } catch (err) {
      setError(err instanceof Error ? err.message : '發送失敗，請稍後再試')
    } finally {
```

- [ ] **Step 2: Update callback error mapping**

In `frontend/src/pages/AuthCallbackPage.tsx`, replace:

```tsx
    if (err) {
      setError(err === 'missing_token' ? '缺少驗證 token' : '登入連結無效或已過期')
      return
    }
```

with:

```tsx
    if (err) {
      if (err === 'missing_token') {
        setError('缺少驗證 token')
      } else if (err === 'registration_closed') {
        setError('目前未開放新使用者註冊')
      } else {
        setError('登入連結無效或已過期')
      }
      return
    }
```

- [ ] **Step 3: Build Web**

Run:

```bash
pnpm --filter frontend build
```

Expected: PASS with TypeScript and Vite build completing.

- [ ] **Step 4: Commit Web changes in the root repo**

```bash
git add frontend/src/pages/LoginPage.tsx frontend/src/pages/AuthCallbackPage.tsx
git commit -m "feat(web): show closed registration auth errors"
```

## Task 5: App OTP Verification Error Display

**Files:**
- Modify: `app/app/(auth)/login.tsx`

- [ ] **Step 1: Update OTP verification catch**

In `handleVerifyCode`, replace:

```tsx
    } catch (err) {
      Alert.alert('錯誤', '驗證碼錯誤或已過期')
      setStage('code')
      setCode('')
    }
```

with:

```tsx
    } catch (err) {
      Alert.alert('錯誤', err instanceof Error ? err.message : '驗證碼錯誤或已過期')
      setStage('code')
      setCode('')
    }
```

- [ ] **Step 2: Run available TypeScript/build checks**

The App package has no `test`, `lint`, `typecheck`, or `build` script. Run the root typecheck to catch TypeScript issues in packages that expose typecheck scripts:

```bash
pnpm -r typecheck
```

Expected: If the command fails because `app` has no `typecheck` script, record that and run:

```bash
pnpm --filter frontend build
```

Expected: PASS. The App change is a local TypeScript-safe catch-block expression and must be manually verified in Task 6.

- [ ] **Step 3: Commit App change in the root repo**

```bash
git add 'app/app/(auth)/login.tsx'
git commit -m "feat(app): show auth verification errors"
```

## Task 6: End-to-End Verification

**Files:**
- Read only unless a verification failure exposes a bug.

- [ ] **Step 1: Run focused backend auth tests**

Run:

```bash
cd backend
go test ./internal/usecase/... ./internal/delivery/http/... -v
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

Run:

```bash
cd backend
go build ./...
```

Expected: PASS. If CGO/Tesseract headers are missing, export the project-required flags and rerun:

```bash
export CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include"
export CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib"
cd backend
go build ./...
```

- [ ] **Step 3: Run Web build**

Run:

```bash
pnpm --filter frontend build
```

Expected: PASS.

- [ ] **Step 4: Manually verify Web closed-registration login**

Start backend and Web using the project’s normal dev setup. Submit an email that is not in `users` on the Web login page.

Expected:

- Request to `/api/v1/auth/login` returns `403`.
- Response JSON includes `message: "目前未開放新使用者註冊"`.
- Login page displays `目前未開放新使用者註冊`.
- No magic-link email is sent.

- [ ] **Step 5: Manually verify Web callback mapping**

Open:

```text
http://localhost:5173/auth/callback?error=registration_closed
```

Expected: The page displays `目前未開放新使用者註冊`.

- [ ] **Step 6: Manually verify App send-code rejection**

Run the App against the backend and submit an email that is not in `users`.

Expected:

- Request to `/api/v1/auth/login` with `method: "code"` returns `403`.
- App alert displays `目前未開放新使用者註冊`.
- App stays on the email stage.

- [ ] **Step 7: Inspect git status in both repositories**

Run:

```bash
git status --short
cd backend
git status --short
```

Expected: Only intentional uncommitted changes remain. If all tasks committed cleanly, both outputs are empty.
