# OTP 驗證碼登入 + 登入頁中文化

Date: 2026-03-05

## 問題

1. APP 登入寄出的 magic link 點擊後在瀏覽器開啟，無法跳轉回 APP
2. APP 登入頁文字為英文，應為中文

## 設計

### Issue 1: 驗證碼登入（APP 專用）

將 APP 的登入流程從 magic link 改為 6 位數字驗證碼（OTP），Web 保留 magic link。

#### 流程

```
APP:  輸入 email → POST /auth/login { method: "code" } → 收到驗證碼 email → 輸入驗證碼 → POST /auth/verify { email, code } → 取得 JWT
Web:  輸入 email → POST /auth/login (method 預設 "link") → 收到 magic link email → 點擊連結 → GET /auth/verify?token=... → redirect callback
```

#### 後端變更

**`POST /auth/login` — 增加 `method` 參數**
- `method: "link"`（預設）→ 現有 magic link 流程不變
- `method: "code"` → 產生 6 位數字（100000-999999），存入 `magic_links.token`，寄驗證碼 email

**`POST /auth/verify` — 新 endpoint（APP 驗證碼驗證）**
- Request: `{ "email": "...", "code": "123456" }`
- 用 email + code 查詢 `magic_links`（最新未使用未過期的記錄）
- 成功 → 回傳 `{ "token": "<jwt>" }`
- 失敗 → 回傳錯誤（驗證碼錯誤/過期）
- 速率限制：同一 email 5 分鐘內最多 5 次錯誤嘗試

**`GET /auth/verify?token=...` — 保留（Web magic link redirect）**
- 不變

**Domain: `MagicLink` entity**
- 新增 `Method` 欄位（`string`，值為 `"link"` 或 `"code"`，預設 `"link"`）
- 其餘欄位不變，`Token` 可存 hex 或 6 位數字
- `CallbackURL` 保留給 web 用

**Email 模板**
- 新增 `BuildVerificationCodeEmail(code string) string` 函式
- 模板內容：顯示驗證碼，不含連結

#### APP 變更

**`login.tsx` — 三階段畫面**
- 階段 1：輸入 email（中文文字）
- 階段 2：輸入 6 位驗證碼（numeric keyboard，自動 focus）
- 階段 3：驗證中 loading → 成功導向首頁

**移除 `callback.tsx`** — APP 不再需要 deep link callback

### Issue 2: 登入頁中文化

| 原英文 | 中文 |
|--------|------|
| Sign in with your email | 使用 Email 登入 |
| your@email.com | 你的電子信箱 |
| Send login link | 發送驗證碼 |
| Sending... | 發送中... |
| Check your email | 請查看信箱 |
| We sent a login link to {email}. Tap the link in the email to sign in. | 驗證碼已寄至 {email}，請輸入信件中的 6 位數驗證碼 |
| Use a different email | 使用其他 Email |
| Signing in... | 登入中... |
| Error / Login failed | 錯誤 / 登入失敗 |

## 不變的部分

- Web 前端 magic link 流程完全不動
- `GET /auth/verify` redirect endpoint 保留
- Dev mode 直接回傳 JWT 的行為保留
- JWT 產生邏輯不變
