# Dev 環境跳過 Email 驗證

**日期:** 2026-02-24
**狀態:** Approved

## 目標

Dev 環境登入時，輸入 email 後直接取得 JWT，不寄送 magic link email。

## 設計

### 方案：後端 `/auth/login` 在 dev 環境直接回傳 JWT

**後端改動：**

1. **`AuthServiceConfig`** 新增 `DevMode bool`
2. **`AuthService.RequestLogin`** — dev mode 時：
   - 跳過 magic link 建立與寄信
   - Find-or-create user by email
   - 產生 JWT
   - 回傳 JWT + callback URL
3. **`AuthService`** 新增 `DevLogin(ctx, email)` method，回傳 `(jwtStr, error)`
4. **`AuthHandler.Login`** — dev mode 時回傳 `{ token: "jwt...", redirect_url: "/auth/callback?token=..." }`
5. **`cmd/api/main.go`** — 將 `app.env` 傳入 `AuthServiceConfig.DevMode`

**前端改動：**

1. **`LoginPage.tsx`** — POST `/auth/login` 後檢查 response：
   - 有 `token` → 存入 auth store，跳轉首頁
   - 沒有 → 顯示「請檢查信箱」（現有行為）

**環境判斷：**
- 使用現有 `app.env` 設定（`ZENBILL_APP_ENV`）
- `development` → dev mode
- `production` → 正常 magic link 流程

## 影響範圍

| 檔案 | 改動 |
|------|------|
| `backend/internal/usecase/auth_service.go` | 新增 DevLogin method, DevMode config |
| `backend/internal/delivery/http/auth_handler.go` | Login handler 分支邏輯 |
| `backend/cmd/api/main.go` | 傳入 DevMode |
| `frontend/src/pages/LoginPage.tsx` | 處理 token response |

## 安全性

- DevMode 僅在 `app.env=development` 時啟用
- Production 環境完全不受影響
- JWT 產生邏輯與 production 一致
