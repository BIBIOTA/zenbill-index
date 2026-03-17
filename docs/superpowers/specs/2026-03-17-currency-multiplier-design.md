# 幣別單位倍數（Currency Multiplier）設計規格

## 概述

讓使用者為特定幣別設定輸入倍數，減少日常記帳時的數字輸入量。例如 VND 設定倍數 1,000，輸入 `50` 即代表 ₫50,000。

## 需求摘要

| 項目 | 決策 |
|------|------|
| 設定層級 | 幣別層級（同幣別所有帳戶共用） |
| 倍數輸入 | 自由輸入任意正數 |
| 設定入口 | 獨立的幣別設定頁（設定區域） |
| 套用範圍 | 僅輸入時（乘以倍數存入實際金額） |
| 顯示行為 | 餘額與交易歷史顯示實際金額 |
| 輸入提示 | 即時預覽實際金額 |
| 舊資料處理 | 不需要，資料庫都是實際金額 |
| 資料儲存 | 後端資料庫（跨裝置同步） |

## 資料模型

### 新增表：`user_currency_settings`

```sql
CREATE TABLE user_currency_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  currency_code VARCHAR(3) NOT NULL,  -- ISO 4217, e.g. "VND"
  multiplier    DECIMAL(19,4) NOT NULL DEFAULT 1,  -- e.g. 1000
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, currency_code)
);
```

- 每個使用者每個幣別最多一筆設定
- `multiplier` 預設為 1（不做轉換）
- 只有使用者主動設定過的幣別才會有記錄，未設定的視為 multiplier = 1

## API 設計

### `GET /api/v1/currency-settings`

回傳使用者所有已設定的幣別倍數。

**Response:**
```json
{
  "data": [
    { "currency_code": "VND", "multiplier": 1000 },
    { "currency_code": "JPY", "multiplier": 100 }
  ]
}
```

### `PUT /api/v1/currency-settings`

批次更新（整批覆蓋）。

**Request:**
```json
{
  "settings": [
    { "currency_code": "VND", "multiplier": 1000 },
    { "currency_code": "JPY", "multiplier": 100 }
  ]
}
```

**規則：**
- 不在 request 裡的幣別 → 刪除該設定（回歸 multiplier = 1）
- `multiplier` 必須 > 0 且 <= 1,000,000（避免溢位）
- `currency_code` 必須是合法的 ISO 4217 代碼

## 後端架構（Clean Architecture）

### Domain Layer

`backend/internal/domain/currency_setting.go`

```go
type CurrencySetting struct {
    ID           uuid.UUID
    UserID       uuid.UUID
    CurrencyCode string
    Multiplier   float64  // 使用 float64 與現有 codebase 一致
    CreatedAt    time.Time
    UpdatedAt    time.Time
}
```

Repository 介面定義在 `backend/internal/domain/repository.go`（與現有慣例一致）：

```go
type CurrencySettingRepository interface {
    FindByUserID(ctx context.Context, userID uuid.UUID) ([]CurrencySetting, error)
    UpsertBatch(ctx context.Context, userID uuid.UUID, settings []CurrencySetting) error
}
```

### Repository Layer

`backend/internal/repository/currency_setting_repository.go`

- GORM 實作
- `UpsertBatch`：使用 PostgreSQL `ON CONFLICT (user_id, currency_code) DO UPDATE` 做 true upsert，搭配 `DELETE WHERE currency_code NOT IN (...)` 移除不在列表中的設定
- Repository 內部自行管理 DB transaction（不需跨 repo 協調）

### Usecase Layer

`backend/internal/usecase/currency_setting_usecase.go`

- `GetSettings(userID)` — 直接 proxy 到 repo
- `UpdateSettings(userID, settings)` — 驗證 multiplier > 0，呼叫 repo

### Delivery Layer

`backend/internal/delivery/http/currency_setting_handler.go`

- `GET /currency-settings` → `GetSettings`
- `PUT /currency-settings` → `UpdateSettings`

## 前端設計

### 幣別設定頁

**位置：** 設定區域新增「幣別單位」頁面

**頁面內容：**
- 列出使用者「有使用中帳戶」的幣別（從現有 `useAccounts()` hook 取得帳戶清單，前端提取不重複的 currency code）
- 每個幣別一列：旗幟 + 幣別代碼 + 名稱 + 倍數輸入框
- 輸入框預設顯示 `1`（未設定過的幣別）
- 儲存按鈕，一次送出所有變更

### Shared Hook

`packages/shared/src/hooks/useCurrencySettings.ts`

- `useCurrencySettings()` — 查詢 + 快取使用者的幣別設定
- `useUpdateCurrencySettings()` — 批次更新 mutation
- `getMultiplier(currencyCode)` — 取得指定幣別的倍數，未設定回傳 1

App 和 Web 共用同一個 hook。

### 金額輸入套用倍數

**行為：**
1. 輸入框根據目前帳戶的幣別，查詢 `getMultiplier(currencyCode)`
2. 如果 multiplier != 1，輸入框下方顯示即時預覽：`實際金額：₫50,000`
3. 送出時：`actualAmount = inputValue × multiplier`
4. 如果 multiplier = 1（或未設定），不顯示預覽（跟現在一樣）

**影響元件：**
- `app/components/transactions/TransactionForm.tsx` — App 交易表單
- `frontend/src/components/transactions/TransactionForm.tsx` — Web 交易表單
- `app/components/quickcreate/AccountQuickCreate.tsx` — 帳戶初始餘額
- 跨幣別轉帳時，source 和 target 各自依自己的幣別套用倍數

**不影響：**
- 餘額顯示 — 保持顯示實際金額
- 交易歷史 — 保持顯示實際金額
