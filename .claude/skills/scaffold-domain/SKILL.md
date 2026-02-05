---
name: scaffold-domain
description: 自動產生 Clean Architecture 的 Domain Layer 模板，包含 Entity 定義和 Repository Interface。在建立新的業務實體時使用，確保架構一致性。
---

# Scaffold Domain (領域層腳手架)

## 角色定位
💻 **Coder (Developer)** - Clean Architecture 程式碼產生器

## 使用時機
- **建立新 Entity**: 要新增業務實體（如 Payment, Subscription）
- **快速原型**: 需要快速建立基本 CRUD 結構
- **確保一致性**: 避免手動撰寫重複的 boilerplate code
- **新人 onboarding**: 幫助新成員理解專案架構

## 執行方式

### 使用腳本產生模板
```bash
.claude/skills/scaffold-domain/scripts/scaffold.sh <EntityName>
```

### 範例
```bash
# 建立 Payment entity
.claude/skills/scaffold-domain/scripts/scaffold.sh Payment

# 建立 Subscription entity
.claude/skills/scaffold-domain/scripts/scaffold.sh Subscription

# 建立 Budget entity
.claude/skills/scaffold-domain/scripts/scaffold.sh Budget
```

## 產生的檔案結構

執行後會產生兩個檔案：

```
internal/
├── domain/
│   └── payment.go              ← Entity 定義 + Repository Interface
└── repository/
    └── payment_repository.go   ← Repository 實作（GORM）
```

## ZenBill Clean Architecture 規範

根據 `CLAUDE.md` 與 `docs/backend/1.technical-architecture.md`：

### 📁 目錄職責

1. **`internal/domain`** (純淨層)
   - 定義 Entities (業務實體)
   - 定義 Repository Interfaces
   - **禁止**: import GORM, import repository 實作
   - **允許**: 基本 Go 型別、time.Time、標準庫

2. **`internal/repository`** (基礎設施層)
   - 實作 Repository Interfaces
   - 使用 GORM 操作資料庫
   - 依賴注入 `*gorm.DB`

3. **`internal/usecase`** (業務邏輯層)
   - 依賴 Domain Interfaces（不是實作）
   - 協調多個 Repository
   - 實作核心業務邏輯

4. **`internal/delivery/http`** (傳輸層)
   - 解析 HTTP Request
   - 呼叫 Usecase
   - 回傳 JSON Response

### ✅ 產生的模板範例

#### `internal/domain/payment.go`
```go
package domain

import "time"

// Payment represents a payment entity in the system
type Payment struct {
	ID        int64     `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// TODO: Add your fields here
}

// PaymentRepository defines the interface for payment data access
type PaymentRepository interface {
	Create(payment *Payment) error
	GetByID(id int64) (*Payment, error)
	Update(payment *Payment) error
	Delete(id int64) error
	List(limit, offset int) ([]*Payment, error)
}
```

#### `internal/repository/payment_repository.go`
```go
package repository

import (
	"github.com/your-username/zenbill/internal/domain"
	"gorm.io/gorm"
)

type paymentRepository struct {
	db *gorm.DB
}

// NewPaymentRepository creates a new payment repository
func NewPaymentRepository(db *gorm.DB) domain.PaymentRepository {
	return &paymentRepository{db: db}
}

func (r *paymentRepository) Create(payment *domain.Payment) error {
	return r.db.Create(payment).Error
}

func (r *paymentRepository) GetByID(id int64) (*domain.Payment, error) {
	var payment domain.Payment
	err := r.db.First(&payment, id).Error
	if err != nil {
		return nil, err
	}
	return &payment, nil
}

func (r *paymentRepository) Update(payment *domain.Payment) error {
	return r.db.Save(payment).Error
}

func (r *paymentRepository) Delete(id int64) error {
	return r.db.Delete(&domain.Payment{}, id).Error
}

func (r *paymentRepository) List(limit, offset int) ([]*domain.Payment, error) {
	var payments []*domain.Payment
	err := r.db.Limit(limit).Offset(offset).Find(&payments).Error
	return payments, err
}
```

## 使用流程

### 標準工作流程

1. **檢查 Schema**
   ```bash
   # 先用 schema-inspector 確認資料表設計
   .claude/skills/schema-inspector/scripts/inspect.sh payments
   ```

2. **產生模板**
   ```bash
   .claude/skills/scaffold-domain/scripts/scaffold.sh Payment
   ```

3. **補充欄位**
   根據 Schema 補充 Entity 的欄位定義

4. **自訂 Repository 方法**
   新增業務需要的特殊查詢方法

5. **執行 Lint**
   ```bash
   .claude/skills/lint-check/scripts/lint.sh
   ```

6. **撰寫測試**
   建立對應的測試檔案

## 完整範例：建立 Payment Entity

### Step 1: 查詢 Schema
```
User: 我要建立 Payment entity
Assistant: 好的，讓我先查看資料表設計...
[使用 schema-inspector]

根據 Schema，payments 表包含：
- id (BIGSERIAL)
- account_id (BIGINT)
- amount (BIGINT) -- 單位：分
- payment_date (TIMESTAMP)
- description (VARCHAR(255))
```

### Step 2: 產生模板
```bash
.claude/skills/scaffold-domain/scripts/scaffold.sh Payment
```

### Step 3: 補充欄位
```go
// internal/domain/payment.go
type Payment struct {
	ID          int64     `json:"id"`
	AccountID   int64     `json:"account_id"`
	Amount      int64     `json:"amount"`        // 單位：分
	PaymentDate time.Time `json:"payment_date"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
```

### Step 4: 新增自訂方法
```go
// PaymentRepository interface 增加業務方法
type PaymentRepository interface {
	Create(payment *Payment) error
	GetByID(id int64) (*Payment, error)
	Update(payment *Payment) error
	Delete(id int64) error
	List(limit, offset int) ([]*Payment, error)

	// 自訂查詢
	GetByAccountID(accountID int64) ([]*Payment, error)
	GetByDateRange(start, end time.Time) ([]*Payment, error)
}
```

### Step 5: 實作自訂方法
```go
// internal/repository/payment_repository.go
func (r *paymentRepository) GetByAccountID(accountID int64) ([]*domain.Payment, error) {
	var payments []*domain.Payment
	err := r.db.Where("account_id = ?", accountID).Find(&payments).Error
	return payments, err
}
```

## 與其他 Skills 的配合

### 完整開發流程
```
1. consult-spec       → 確認需求
2. schema-inspector   → 查看資料表設計
3. scaffold-domain    → 產生基本模板
4. [手動補充欄位與邏輯]
5. lint-check         → 檢查程式碼品質
6. [撰寫測試]
7. check-progress     → 更新進度
```

## 客製化建議

### 修改模板（進階）
如果你想調整產生的模板格式，可以編輯：
```bash
.claude/skills/scaffold-domain/scripts/scaffold.sh
```

例如：
- 加入更多預設方法（如 `FindByName`）
- 加入 Soft Delete 支援（`DeletedAt` 欄位）
- 加入分頁輔助函數

### 產生 Usecase 層（可選）
可以擴充此 Skill 來同時產生 Usecase：
```go
// internal/usecase/payment_usecase.go
type PaymentUsecase interface {
	CreatePayment(payment *domain.Payment) error
	ProcessPayment(id int64) error
}
```

## 注意事項

### ✅ 應該做的
- 產生後立即補充欄位（不要留空 TODO）
- 根據 Schema 設定正確的 GORM tags
- 為自訂方法撰寫測試
- 保持 Domain 層的純淨性（不 import GORM）

### ❌ 不應該做的
- 不要直接使用模板，必須根據實際需求調整
- 不要在 Domain 層 import `gorm` 或 `repository`
- 不要產生用不到的檔案（造成程式碼污染）
- 不要跳過 lint-check 就提交程式碼

## 手動建立 vs 使用 Scaffold

| 情況 | 建議 |
|------|------|
| 簡單 CRUD Entity | ✅ 使用 Scaffold |
| 複雜業務邏輯 | ⚠️ 產生後大幅修改 |
| 特殊資料結構 | ❌ 手動建立更快 |
| 學習架構 | ✅ 使用 Scaffold 理解模式 |

## 擴充建議

未來可以擴充此 Skill 來產生：
- Migration 檔案
- 測試檔案模板
- API Handler 模板
- Usecase 模板
- DTO (Data Transfer Object) 模板

這樣就能實現「一鍵產生完整功能」的自動化開發流程！
