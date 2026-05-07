# Registration-Closed Auth Design

## Goal

Only accounts that already exist in `users` may use the production login flows.
ZenBill is not open for new self-registration, so an unknown email should receive
a clear rejection message: `目前未開放新使用者註冊`.

Development mode keeps its existing shortcut: `DevLogin` may still create a user
automatically for local testing.

## Current Behavior

The auth service currently treats login as registration:

- `RequestLogin` and `RequestLoginWithCode` create magic-link or OTP records
  without checking whether the email belongs to an existing user.
- `VerifyToken` and `VerifyCode` create a user when the email is not found.
- `DevLogin` also creates a user when the email is not found.

This allows any email holder to create a new account by completing magic-link or
OTP verification.

## Approach

Use a strict production allow-list based on the existing `users` table.

`AuthService` will add one shared helper, such as `requireExistingUser(ctx,
email)`, to centralize user lookup behavior:

- Existing user: return the user and continue.
- `gorm.ErrRecordNotFound`: return a domain error, such as
  `ErrRegistrationClosed`.
- Any other repository error: return a wrapped internal error.

This helper will be used by production magic-link and OTP request/verify flows.
`DevLogin` will not use it, so dev mode behavior remains unchanged.

## Backend Behavior

### POST `/auth/login`

In non-dev mode, the handler will call the existing auth service methods. Those
methods will check the email before creating a magic-link or OTP record.

For an unknown email:

- Return `403 Forbidden`.
- Response body uses the existing API shape:
  `{ "code": 403, "message": "目前未開放新使用者註冊" }`.
- Do not create a `magic_links` row.
- Do not send email.

For an existing email:

- Magic-link flow keeps returning `登入連結已寄出，請查看信箱`.
- OTP flow keeps returning `驗證碼已寄出，請查看信箱`.

### GET `/auth/verify?token=...`

The endpoint must keep its current redirect behavior for Web magic links.

If the token is valid but the linked email no longer has a user:

- Return no JWT.
- Redirect to the callback URL with `?error=registration_closed`.

Existing missing, expired, or used token behavior stays unchanged.

### POST `/auth/verify`

OTP verification will no longer create a user after a valid code. If the email is
not found after OTP lookup:

- Return `403 Forbidden`.
- Response message is `目前未開放新使用者註冊`.

Invalid or expired OTP behavior stays as `401` with the current invalid-code
message.

### Dev Mode

`DevLogin` remains unchanged. In dev mode, `/auth/login` can still return a token
and auto-create a user when needed.

## Web Handling

### Login Page

`frontend/src/pages/LoginPage.tsx` currently replaces all login request failures
with `發送失敗，請稍後再試`.

It should display the API error message when available:

- `目前未開放新使用者註冊` for closed registration.
- Existing fallback text only for unknown non-Error failures.

### Auth Callback Page

`frontend/src/pages/AuthCallbackPage.tsx` should map
`error=registration_closed` to `目前未開放新使用者註冊`.

Existing mappings remain:

- `missing_token` -> `缺少驗證 token`
- Other error values -> `登入連結無效或已過期`

## App Handling

`app/app/(auth)/login.tsx` already displays API error messages during the send
code stage through `err.message`, so closed registration will appear correctly
when the user submits an unknown email.

The OTP verification catch block currently always displays
`驗證碼錯誤或已過期`. It should display `err.message` when the backend provides
one, with the existing text as fallback. This covers stale OTP or edge cases
where the user disappears after a code was issued.

## Testing

### Backend Unit Tests

Update `backend/internal/usecase/auth_service_test.go`:

- `RequestLogin` with an existing user creates a magic link and sends email.
- `RequestLogin` with an unknown user returns `ErrRegistrationClosed`, does not
  create a magic link, and does not send email.
- `RequestLoginWithCode` follows the same existing/unknown user behavior.
- `VerifyToken` with an unknown user returns `ErrRegistrationClosed` and does
  not create a user.
- `VerifyCode` with an unknown user returns `ErrRegistrationClosed` and does not
  create a user.
- `DevLogin` existing tests continue to prove dev auto-create behavior remains.

Add or update handler-level tests if the project has suitable HTTP auth handler
coverage. At minimum, service tests must prove no auto-registration remains in
production flows.

### Web Tests

If frontend test coverage exists for login pages, add checks that:

- `LoginPage` displays the API error message from `/auth/login`.
- `AuthCallbackPage` displays `目前未開放新使用者註冊` for
  `?error=registration_closed`.

If no suitable test harness exists, include manual verification steps in the
implementation plan.

### App Tests

If App tests exist for the login screen, verify that the OTP verification catch
shows backend-provided messages. Otherwise, include manual verification steps in
the implementation plan.

## Non-Goals

- No database migration.
- No public registration endpoint.
- No admin user-management UI.
- No configurable `allow_self_registration` flag for this iteration.
- No change to dev-mode auto-create behavior.
