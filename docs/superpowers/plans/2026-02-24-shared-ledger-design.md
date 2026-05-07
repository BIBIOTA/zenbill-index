# 共同記帳功能 (Shared Ledger) 設計文件

**日期:** 2026-02-24
**狀態:** Draft

## 1. 概述

在 ZenBill 中實作「共同記帳」功能，允許兩個用戶共享一個帳本記錄共同支出，並雙向同步到指定的 Google Sheet。

### 核心需求

- 兩人共享一個帳本，各自可新增共同支出
- 連動個人帳本：付款人自動記錄支出 + 待收款
- 新增 `RECEIVABLE` 帳戶類型，建立共同帳本時自動建立
- 待收款不計入收入，Dashboard 顯示待收款統計
- 從待收款列表確認收款
- 雙向同步 Google Sheet（ZenBill ↔ Sheet）
- 使用 Google Service Account 存取 Sheet
- 支援每日自動同步 + 手動觸發
- Partner 透過 Invite Link 加入共同帳本
- 每個帳本固定一種幣別（不支援多幣別）
- 固定 2 人

## 2. 資料模型

### 2.1 新增 Entity: SharedLedger（共同帳本）

```go
type SharedLedger struct {
    ID                    uint
    Name                  string       // 帳本名稱, e.g. "Yuki & Zumi"
    Currency              string       // 幣別, e.g. "TWD"，建立時設定不可變
    OwnerID               uint         // 建立者 User ID
    PartnerID             *uint        // 夥伴 User ID（加入前為 nil）
    PartnerName           string       // 夥伴顯示名稱
    ReceivableAccountID   uint         // Owner 的 RECEIVABLE 帳戶（自動建立）
    GoogleSheetID         string       // Google Sheet ID
    GoogleSheetGID        string       // Sheet Tab GID
    SyncEnabled           bool         // 是否啟用自動同步
    InviteToken           string       // UUID 邀請碼
    InviteExpiresAt       *time.Time   // 邀請有效期
    CreatedAt             time.Time
    UpdatedAt             time.Time
}
```

### 2.2 新增 Entity: SharedExpense（共同支出）

```go
type SharedExpense struct {
    ID                      uint
    LedgerID                uint          // 所屬共同帳本
    Date                    time.Time     // 交易日期
    Category                string        // 類別（飲食🍽️, 交通🚗, 住宿🏠, 票券🎞️, 用品🛒, 還款💰, 其他）
    Description             string        // 支出說明
    PayerName               string        // 付款人名稱 ("Yuki" or "Zumi")
    PayerUserID             *uint         // 付款人 User ID（可為 nil，表示非 ZenBill 用戶）
    TotalAmount             float64       // 總金額
    SplitMethod             string        // EQUAL, FULL_OWNER, FULL_PARTNER, CUSTOM
    OwnerAmount             float64       // Owner 應負擔金額
    PartnerAmount           float64       // Partner 應負擔金額
    OwnerPaidAmount         float64       // Owner 實際付款金額
    PartnerPaidAmount       float64       // Partner 實際付款金額

    // 連結到個人帳本
    ExpenseTransactionID    *uint         // 付款人的支出交易 ID
    ReceivableTransactionID *uint         // 待收款交易 ID
    SettledAt               *time.Time    // 收款確認時間

    // Google Sheet 同步
    GoogleSheetRowIndex     *int          // Sheet 中的行號（nil = 尚未同步）
    SyncedAt                *time.Time    // 最後同步時間
    SourceType              string        // "zenbill" or "google_sheet"

    CreatedAt               time.Time
    UpdatedAt               time.Time
}
```

### 2.3 Account Type 擴充

```go
// 現有: BANK, CREDIT, CASH, CRYPTO
// 新增:
const AccountTypeReceivable = "RECEIVABLE"
```

### 2.4 Transaction Type 擴充

```go
// 現有: EXPENSE, INCOME, TRANSFER
// 新增:
const TransactionTypeReceivable = "RECEIVABLE"   // 待收款
const TransactionTypeSettlement = "SETTLEMENT"    // 收款確認
```

### 2.5 Google Sheet 類別對照

| ZenBill Category | Google Sheet 值 |
|-----------------|----------------|
| food            | 飲食 🍽️       |
| transport       | 交通 🚗       |
| accommodation   | 住宿 🏠       |
| ticket          | 票券 🎞️       |
| supplies        | 用品 🛒       |
| settlement      | 還款 💰       |
| other           | 其他           |

### 2.6 分帳方式對照

| SplitMethod    | Google Sheet 值          | 計算邏輯                    |
|---------------|-------------------------|---------------------------|
| EQUAL         | 均分                     | TotalAmount / 2            |
| FULL_OWNER    | 由 {OwnerName} 全部負擔   | Owner=全額, Partner=0      |
| FULL_PARTNER  | 由 {PartnerName} 全部負擔 | Owner=0, Partner=全額      |
| CUSTOM        | 非均分(次頁填金額)         | 使用自訂 OwnerAmount/PartnerAmount |

## 3. 核心業務流程

### 3.1 建立共同帳本

```
用戶建立 SharedLedger（填入名稱、幣別、Partner 名稱、Google Sheet ID）
  → 自動建立 RECEIVABLE 類型的 Account（名稱: "{帳本名稱} 應收帳款"）
  → 產生 InviteToken（UUID，有效期 7 天）
  → 返回帳本資訊 + 邀請連結
```

### 3.2 Partner 加入

```
Owner 分享連結: /shared-ledgers/invite/{token}
Partner 點擊連結
  → 未登入 → 導向登入頁，登入後自動跳轉
  → 已登入 → 顯示確認頁「{OwnerName} 邀請你加入共同帳本 {Name}」
  → 確認加入 → 更新 SharedLedger.PartnerID
  → Partner 也自動建立一個 RECEIVABLE 帳戶
```

### 3.3 新增共同支出（ZenBill 端）

以 Yuki (Owner) 付 500 元晚餐、均分為例：

```
1. 建立 SharedExpense:
   - TotalAmount=500, SplitMethod=EQUAL
   - OwnerAmount=250, PartnerAmount=250
   - OwnerPaidAmount=500, PartnerPaidAmount=0
   - PayerName="Yuki", PayerUserID=Yuki's ID

2. 建立 Transaction #1 (EXPENSE):
   - Amount: -500
   - AccountID: Yuki 選擇的付款帳戶
   - Type: EXPENSE
   - Description: "晚餐（共同支出）"

3. 建立 Transaction #2 (RECEIVABLE):
   - Amount: +250
   - AccountID: RECEIVABLE 帳戶
   - Type: RECEIVABLE
   - Description: "晚餐 - 待收 Zumi"

4. 標記 SharedExpense:
   - ExpenseTransactionID = Transaction #1 ID
   - ReceivableTransactionID = Transaction #2 ID
   - SourceType = "zenbill"
   - GoogleSheetRowIndex = nil（待同步）
```

### 3.4 確認收款

```
Yuki 在待收款列表點「確認收款」（選擇 SharedExpense #X, 金額 250）
  → 選擇收款帳戶（e.g. 現金）
  → 建立 Transaction (SETTLEMENT): +250 到現金帳戶
  → 減少 RECEIVABLE 帳戶餘額: -250
  → 更新 SharedExpense.SettledAt = now
  → 同步一筆「還款」到 Google Sheet
```

### 3.5 Google Sheet 雙向同步

**ZenBill → Sheet:**
```
1. 查詢 GoogleSheetRowIndex = nil 的 SharedExpense
2. 轉換為 Sheet 行格式（時間戳記, 日期, 類別, 說明, 付款金額, 分帳方式...）
3. Append 到 Google Sheet
4. 更新 GoogleSheetRowIndex 和 SyncedAt
```

**Sheet → ZenBill:**
```
1. 讀取 Google Sheet 所有行
2. 比對時間戳記，找出不存在於 ZenBill 的新行
3. 為每筆新行建立 SharedExpense
4. 如果付款人是 Owner (Yuki) → 建立個人 EXPENSE + RECEIVABLE 交易
5. 如果付款人是 Partner (Zumi) → 只記錄 SharedExpense（不建個人交易）
6. 更新 GoogleSheetRowIndex
```

**同步觸發方式:**
- 手動：API `POST /shared-ledgers/:id/sync`
- 自動：Worker 每日執行一次（可配置）

**衝突處理:**
- 以「時間戳記」作為唯一識別，避免重複建立
- ZenBill 建立的記錄帶 SourceType="zenbill"，Sheet 來的帶 "google_sheet"

## 4. API 端點

### 4.1 共同帳本管理

```
POST   /shared-ledgers                       # 建立共同帳本
GET    /shared-ledgers                       # 列出我的共同帳本
GET    /shared-ledgers/:id                   # 取得帳本詳情
PUT    /shared-ledgers/:id                   # 更新帳本設定
DELETE /shared-ledgers/:id                   # 刪除帳本
```

### 4.2 邀請機制

```
POST   /shared-ledgers/:id/invite            # 產生/重新產生邀請連結
GET    /shared-ledgers/invite/:token          # 查看邀請資訊（公開）
POST   /shared-ledgers/invite/:token/accept   # 接受邀請（需登入）
```

### 4.3 共同支出

```
POST   /shared-ledgers/:id/expenses           # 新增共同支出
GET    /shared-ledgers/:id/expenses           # 列出（分頁、日期篩選）
GET    /shared-ledgers/:id/expenses/:eid      # 單筆詳情
PUT    /shared-ledgers/:id/expenses/:eid      # 更新
DELETE /shared-ledgers/:id/expenses/:eid      # 刪除
```

### 4.4 待收款管理

```
GET    /shared-ledgers/:id/receivables        # 待收款列表
POST   /shared-ledgers/:id/receivables/:eid/settle  # 確認收款
```

### 4.5 同步與統計

```
POST   /shared-ledgers/:id/sync              # 手動觸發雙向同步
GET    /shared-ledgers/:id/sync/status        # 同步狀態
GET    /shared-ledgers/:id/summary            # 統計（總支出、各自負擔、待收款）
```

## 5. Google Sheet 整合

### 5.1 技術方案

- 使用 Google Sheets API v4
- Service Account 認證（JSON key 存放於伺服器）
- Sheet 需分享編輯權限給 Service Account email

### 5.2 套件結構

```
pkg/googlesheet/
├── client.go          # Sheets API 客戶端初始化
├── mapper.go          # SharedExpense ↔ Sheet 行的轉換
└── sync_service.go    # 雙向同步邏輯
```

### 5.3 Sheet 寫入格式

| 欄位        | 來源                                |
|------------|-------------------------------------|
| 時間戳記    | SharedExpense.CreatedAt              |
| 日期        | SharedExpense.Date (MM/DD)           |
| 類別        | Category → 中文+emoji 對照           |
| 支出說明    | SharedExpense.Description            |
| Yuki 付款   | OwnerPaidAmount (if > 0)            |
| Zumi 付款   | PartnerPaidAmount (if > 0)          |
| 分帳方式    | SplitMethod → 中文對照              |
| Yuki        | OwnerAmount (if CUSTOM split)       |
| Zumi        | PartnerAmount (if CUSTOM split)     |

注意：Sheet 中的 "Yuki"/"Zumi" 對應 Owner/Partner 名稱。

### 5.4 環境變數

```
ZENBILL_GOOGLE_SERVICE_ACCOUNT_KEY_PATH  # Service Account JSON key 路徑
```

## 6. 前端頁面

### 6.1 新增頁面

| 頁面 | 路由 | 功能 |
|------|------|------|
| SharedLedgersPage | `/shared-ledgers` | 帳本列表，顯示待收/待付總額 |
| SharedLedgerDetailPage | `/shared-ledgers/:id` | 帳本詳情、支出列表、統計卡片 |
| SharedExpenseFormPage | `/shared-ledgers/:id/expenses/new` | 新增/編輯共同支出 |
| SharedExpenseFormPage | `/shared-ledgers/:id/expenses/:eid` | 編輯共同支出 |
| ReceivablesPage | `/shared-ledgers/:id/receivables` | 待收款列表 + 確認收款 |
| InviteAcceptPage | `/shared-ledgers/invite/:token` | 接受邀請確認頁 |

### 6.2 Dashboard 修改

- 新增「待收款項」卡片（顯示所有共同帳本的待收總額）
- 點擊跳轉到對應帳本的 receivables 頁面

### 6.3 SharedExpenseForm 欄位

- 日期 (DatePicker)
- 類別 (Select: 飲食, 交通, 住宿, 票券, 用品, 還款, 其他)
- 支出說明 (Text)
- 付款人 (Radio: Owner / Partner)
- 付款金額 (Number)
- 付款帳戶 (AccountSelect, 僅付款人為自己時顯示)
- 分帳方式 (Radio: 均分, Owner全負擔, Partner全負擔, 非均分)
- Owner 自訂金額 (Number, 僅「非均分」時顯示)
- Partner 自訂金額 (Number, 僅「非均分」時顯示)

## 7. Clean Architecture 分層

```
internal/domain/
  ├── shared_ledger.go         # SharedLedger entity + repository interface
  └── shared_expense.go        # SharedExpense entity + repository interface

internal/repository/
  ├── shared_ledger_repository.go
  └── shared_expense_repository.go

internal/usecase/
  ├── shared_ledger_service.go    # 帳本 CRUD + 邀請機制
  ├── shared_expense_service.go   # 支出 CRUD + 分帳計算 + 個人帳本連動
  └── sheet_sync_service.go       # Google Sheet 雙向同步

internal/delivery/http/
  ├── shared_ledger_handler.go
  └── shared_expense_handler.go

pkg/googlesheet/
  ├── client.go
  ├── mapper.go
  └── sync_service.go
```

## 8. 錯誤處理

- Google Sheet API 失敗 → 記錄錯誤，不影響 ZenBill 本地資料
- 同步衝突（時間戳重複） → 跳過已存在的記錄
- Partner 尚未加入 → 仍可新增支出，但 Partner 端不產生交易
- Invite Token 過期 → 返回錯誤，需重新產生

## 9. 測試策略

- **Domain Unit Tests:** 分帳計算邏輯、Category/SplitMethod 轉換
- **Usecase Unit Tests:** SharedExpense 建立流程（mock repository）
- **Integration Tests:** Repository CRUD、Google Sheet 同步（mock API）
- **E2E:** 完整流程（建立帳本 → 新增支出 → 同步 Sheet → 確認收款）
