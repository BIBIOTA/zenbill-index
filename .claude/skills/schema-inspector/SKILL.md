---
name: schema-inspector
description: 查看 ZenBill 資料庫 Schema 設計，確保 GORM models 與資料表結構一致。在建立或修改 domain entities、repository 實作、或資料庫操作前使用。
---

# Schema Inspector (資料庫 Schema 檢查器)

## 角色定位
🗄️ **Reviewer (Architecture)** - 確保資料庫設計與實作一致

## 使用時機
- **建立 Domain Entity**: 撰寫 `internal/domain/*.go` 之前
- **實作 Repository**: 撰寫資料庫查詢邏輯之前
- **修改欄位**: 要新增或修改資料表欄位時
- **Debug 資料問題**: 發現資料不一致或查詢錯誤時
- **撰寫 Migration**: 建立資料庫遷移腳本時
- **Code Review**: 檢查別人的 GORM struct 是否正確

## 執行方式

### 方法 1: 使用輔助腳本（推薦）
```bash
# 查看完整 Schema
.claude/skills/schema-inspector/scripts/inspect.sh

# 搜尋特定資料表
.claude/skills/schema-inspector/scripts/inspect.sh accounts
.claude/skills/schema-inspector/scripts/inspect.sh invoices
```

### 方法 2: 直接讀取 PlantUML
```bash
cat docs/backend/2.database-schema.puml
```

### 方法 3: 使用 Grep 搜尋
```bash
grep -C 5 "entity accounts" docs/backend/2.database-schema.puml
```

## Schema 文件位置
- **主要 Schema**: `docs/backend/2.database-schema.puml`
- **格式**: PlantUML ER Diagram

## ZenBill 資料表結構概覽

根據 Phase-1 設計，核心資料表包括：

### 1️⃣ 帳戶系統
- **accounts** - 帳戶主表（資產/負債）
- **account_types** - 帳戶類型（現金/信用卡/應付帳款等）

### 2️⃣ 發票系統
- **invoices** - 電子發票主表
- **invoice_items** - 發票明細
- **merchants** - 商家資料（正規化後）

### 3️⃣ 交易系統
- **transactions** - 交易記錄（複式簿記）
- **ledger_entries** - 分錄（借/貸）

### 4️⃣ 規則引擎
- **normalization_rules** - 商家正規化規則（Regex）

## GORM Struct 撰寫規範

### ✅ 正確示範
```go
package domain

import "time"

// Account 對應 accounts 資料表
type Account struct {
    ID            int64     `gorm:"primaryKey;autoIncrement" json:"id"`
    UserID        int64     `gorm:"not null;index" json:"user_id"`
    AccountTypeID int64     `gorm:"not null" json:"account_type_id"`
    Name          string    `gorm:"size:100;not null" json:"name"`
    Balance       int64     `gorm:"default:0" json:"balance"` // 單位：分
    Currency      string    `gorm:"size:3;default:'TWD'" json:"currency"`
    CreatedAt     time.Time `gorm:"autoCreateTime" json:"created_at"`
    UpdatedAt     time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (Account) TableName() string {
    return "accounts"
}
```

### ❌ 常見錯誤
```go
// 錯誤 1: 欄位名稱與 Schema 不符
type Account struct {
    ID      int64  `json:"id"`
    AccType string `json:"type"` // ❌ Schema 是 account_type_id，不是 type
}

// 錯誤 2: 缺少必要的 GORM tags
type Account struct {
    ID   int64  // ❌ 缺少 gorm tags
    Name string // ❌ 缺少 size 限制
}

// 錯誤 3: 在 domain 層 import GORM（違反 Clean Architecture）
// ❌ domain 層應該是純 struct，GORM tags 僅用於 JSON mapping
```

## 重要設計規範

### 💰 金額儲存規則
**所有金額欄位使用 `int64` 儲存「分」為單位**
```go
Balance int64 `json:"balance"` // 儲存 100 代表 $1.00
```
原因：避免浮點數精度問題

### 📅 時間欄位
```go
CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
```

### 🔗 外鍵關係
```go
// 定義關聯
AccountTypeID int64       `gorm:"not null" json:"account_type_id"`
AccountType   AccountType `gorm:"foreignKey:AccountTypeID" json:"account_type,omitempty"`
```

### 📝 JSONB 儲存原始資料
```go
RawDetails datatypes.JSON `gorm:"type:jsonb" json:"raw_details"`
```

## 檢查清單 (Checklist)

在撰寫 Domain Entity 或 Repository 時，使用此清單：

- [ ] 欄位名稱與 Schema 完全一致
- [ ] 資料型別正確（特別是 `int64` vs `string`）
- [ ] 金額欄位使用 `int64`（單位：分）
- [ ] 必要欄位加上 `not null` tag
- [ ] 外鍵關係正確定義
- [ ] 時間欄位使用 `time.Time` 與 `autoCreateTime`/`autoUpdateTime`
- [ ] String 欄位有 `size` 限制
- [ ] `TableName()` 函數回傳正確的表名
- [ ] JSONB 欄位使用 `datatypes.JSON`

## 與其他 Skills 的配合

### 配合 lint-check
```
我建立了 Account struct，讓我先用 schema-inspector 確認欄位...
[確認欄位正確]
現在用 lint-check 確保程式碼品質...
```

### 配合 scaffold-domain
```
我要建立 Payment entity，先用 schema-inspector 查看資料表設計...
[查看 payments 表結構]
然後用 scaffold-domain 產生基本模板...
```

## 實際應用範例

### 範例 1: 建立新 Entity
```
User: 幫我建立 Invoice entity
Assistant: 好的，讓我先查看 Schema...
[使用 schema-inspector 查詢 invoices 表]

根據 Schema (docs/backend/2.database-schema.puml:45)，
invoices 表包含以下欄位：
- id (BIGSERIAL)
- invoice_number (VARCHAR(50))
- issue_date (DATE)
- total_amount (BIGINT) -- 單位：分
- raw_details (JSONB)
...

我將按照此結構建立 Invoice struct...
```

### 範例 2: Debug 資料問題
```
User: 為什麼查詢 Account 時 Balance 是 null？
Assistant: 讓我檢查 Schema 設計...
[使用 schema-inspector]

根據 Schema，Balance 欄位定義為：
balance BIGINT DEFAULT 0 NOT NULL

您的 GORM struct 是否正確設定了 default tag？
應該是：Balance int64 `gorm:"default:0"`
```

## 注意事項
- **Schema 為權威來源**: 實作必須嚴格遵守 Schema 設計
- **禁止直接修改資料表**: 任何 Schema 變更必須透過 Migration
- **同步更新文件**: 修改 Schema 後必須更新 PlantUML 文件
- **遵守命名規範**: 資料表與欄位使用 `snake_case`，Go struct 使用 `PascalCase`
