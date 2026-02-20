# Magic Link 登入即註冊 設計文件

**日期:** 2026-02-21
**狀態:** Approved

## 概要

為 ZenBill 實作 Magic Link 認證機制。用戶輸入 Email 後收到登入連結，點擊即完成登入；若 Email 不存在則自動建立帳號。無需密碼。

## 需求

- 單一入口：輸入 Email 即可登入或註冊
- Magic Link 透過 SMTP 寄送（自架 Gmail 等）
- JWT 作為 API 認證方式
- 小規模使用（單人/少數人），不需 rate limiting
- 前端會透過 callback URL 接收 JWT

## 流程

```
用戶輸入 Email → POST /api/v1/auth/login
                     ↓
              產生 magic link token（存 DB）
              寄送 Email（含 magic link URL）
                     ↓
              用戶點擊 Magic Link
              → GET /api/v1/auth/verify?token=xxx
                     ↓
              驗證 token（有效 + 未過期 + 未使用）
              ├─ Email 不存在 → 自動建立 User
              └─ Email 已存在 → 取得 User
                     ↓
              簽發 JWT（access token）
              → 302 Redirect 到前端 callback URL
                 {frontend_url}/auth/callback?token={jwt}
```

## 資料表

### magic_links（新增）

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | UUID PK | 主鍵 |
| email | VARCHAR(255) NOT NULL | 目標信箱 |
| token | VARCHAR(255) UNIQUE NOT NULL | crypto random token |
| expires_at | TIMESTAMP NOT NULL | 過期時間（15 分鐘） |
| used_at | TIMESTAMP NULL | 使用時間，NULL 表示未使用 |
| created_at | TIMESTAMP | 建立時間 |

### users（現有，無需修改）

現有 User entity 已有 `id`, `email`, `password_hash`, `created_at`。`password_hash` 在 Magic Link 模式下留空。

## API 端點

| Method | Path | Auth | 說明 |
|--------|------|------|------|
| POST | `/api/v1/auth/login` | No | 輸入 email，寄出 magic link |
| GET | `/api/v1/auth/verify` | No | 驗證 token，redirect 帶 JWT |
| GET | `/api/v1/auth/me` | JWT | 取得當前用戶資訊 |

### POST /api/v1/auth/login

**Request:**
```json
{ "email": "user@example.com" }
```

**Response (200):**
```json
{ "message": "登入連結已寄出，請查看信箱" }
```

不論 email 是否已註冊，回應相同（防止 email enumeration）。

### GET /api/v1/auth/verify?token=xxx

**成功:** 302 Redirect → `{frontend_callback_url}?token={jwt}`

**失敗:** 302 Redirect → `{frontend_callback_url}?error=invalid_token`

### GET /api/v1/auth/me

**Response (200):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "created_at": "2026-02-21T00:00:00Z"
}
```

## Clean Architecture 分層

| Layer | 檔案 | 內容 |
|-------|------|------|
| Domain | `domain/magic_link.go` | MagicLink entity |
| Domain | `domain/repository.go` | MagicLinkRepository interface |
| Repository | `repository/magic_link_repository.go` | GORM 實作 |
| Usecase | `usecase/auth_service.go` | 產生 token、驗證、寄信、簽 JWT |
| Delivery | `delivery/http/auth_handler.go` | 3 個端點 |
| Middleware | `delivery/http/middleware/auth.go` | JWT 驗證 + 注入 userID |
| Pkg | `pkg/mailer/mailer.go` | SMTP 寄信工具 |
| Config | `internal/config/config.go` | 新增 Auth + SMTP config |

## JWT 策略

- 只用 Access Token，過期時間 7 天
- 不做 Refresh Token（小規模不需要）
- Payload: `{ sub: user_id, email: email, exp: ... }`
- 簽名演算法: HS256
- Secret 來自環境變數 `ZENBILL_AUTH_JWT_SECRET`

## 配置

```yaml
smtp:
  host: smtp.gmail.com
  port: 587
  username: ${ZENBILL_SMTP_USERNAME}
  password: ${ZENBILL_SMTP_PASSWORD}
  from: "ZenBill <noreply@yourdomain.com>"

auth:
  jwt_secret: ${ZENBILL_AUTH_JWT_SECRET}
  jwt_expiry: 168h
  magic_link_expiry: 15m
  frontend_callback_url: http://localhost:3000/auth/callback
```

## 現有程式碼改造

所有 handler 中的 `defaultUserID`（hardcoded UUID）改為從 JWT middleware 注入的 `userID`：

```go
// Before
userID := defaultUserID

// After
userID := c.MustGet("userID").(uuid.UUID)
```

## 依賴套件

- `github.com/golang-jwt/jwt/v5` — JWT 簽發與驗證
- `crypto/rand` — 產生 magic link token（標準庫）
- `net/smtp` — SMTP 寄信（標準庫）
