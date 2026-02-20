# ZenBill 記帳功能設計文件

日期：2026-02-20

## 概述

在 ZenBill 現有架構上漸進式擴充，支援完整的記帳功能：手動記帳與發票自動轉交易並重。僅後端 API，不含前端。

## 方案：漸進式擴充（方案 A）

在現有 schema 上做最小修改，新增銀行種子資料表，擴充 accounts 和 transactions 欄位。

## 資料模型變更

### 新增表：`banks`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | uuid PK | |
| `code` | varchar(3) UNIQUE NOT NULL | 銀行代碼（如 812、013） |
| `name` | varchar(100) NOT NULL | 銀行全名 |
| `short_name` | varchar(50) | 常用簡稱 |
| `created_at` | timestamp | |

種子資料包含台灣約 36 家主要銀行，用 SQL migration 灌入。

### 修改表：`accounts`

新增欄位：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `bank_id` | uuid FK→banks (nullable) | 綁定的銀行 |
| `passbook_number` | varchar(20) | 存摺帳號（選填） |
| `auto_pay_enabled` | bool DEFAULT true | 信用卡是否啟用自動繳款 |

### 修改表：`transactions`

新增欄位：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `original_amount` | decimal(19,4) | 原始幣別金額 |
| `original_currency` | varchar(3) | 原始幣別 |
| `exchange_rate` | decimal(19,8) | 匯率 |

邏輯：同幣別交易三欄位為 NULL；跨幣別交易 `amount` = 帳戶幣別金額。

## API 端點

### Banks（唯讀）

- `GET /api/v1/banks` — 列出所有銀行（支援 `?q=` 搜尋）

### Accounts CRUD

- `GET /api/v1/accounts` — 列出帳戶（支援 type 篩選）
- `POST /api/v1/accounts` — 建立帳戶
- `GET /api/v1/accounts/:id` — 取得帳戶詳情
- `PUT /api/v1/accounts/:id` — 更新帳戶
- `DELETE /api/v1/accounts/:id` — 刪除帳戶（有交易時禁止）

### Transactions CRUD

- `GET /api/v1/transactions` — 列出交易（分頁、篩選：account_id, type, category_id, merchant_id, date range）
- `POST /api/v1/transactions` — 建立交易（同時更新帳戶餘額）
- `GET /api/v1/transactions/:id` — 取得交易詳情
- `PUT /api/v1/transactions/:id` — 更新交易（回滾+重新套用餘額）
- `DELETE /api/v1/transactions/:id` — 刪除交易（回滾餘額）

### Categories CRUD

- `GET /api/v1/categories` — 列出分類（樹狀結構）
- `POST /api/v1/categories` — 建立分類
- `PUT /api/v1/categories/:id` — 更新分類
- `DELETE /api/v1/categories/:id` — 刪除分類（有交易時禁止）

### Merchants CRUD

- `GET /api/v1/merchants` — 列出商家
- `POST /api/v1/merchants` — 建立商家
- `PUT /api/v1/merchants/:id` — 更新商家
- `DELETE /api/v1/merchants/:id` — 刪除商家

### 匯率

- `GET /api/v1/exchange-rates?from=USD&to=TWD` — 查詢即時匯率

## 核心業務邏輯

### 餘額即時更新

所有餘額變動在同一個 DB transaction 中完成：

- EXPENSE → `account.balance -= amount`
- INCOME → `account.balance += amount`
- TRANSFER → `source.balance -= amount`, `target.balance += amount`
- 更新交易：回滾舊影響 → 套用新影響
- 刪除交易：回滾影響

### 信用卡繳款

信用卡 balance 代表未繳金額（正值 = 欠款）。

**自動繳款（auto_pay_enabled = true）：**
- Worker cron 每日檢查 payment_due_day
- 自動建立 TRANSFER：auto_pay_from_id → 信用卡
- 金額 = 信用卡當前 balance（全額繳清）

**手動繳款（auto_pay_enabled = false）：**
- 不自動處理，使用者手動建立 TRANSFER

### 匯率服務

- 外部 API（exchangerate-api.com 或台灣央行牌告匯率）
- 當日快取（同幣別對每日查一次）
- 建立交易時，若有 original_currency 但無 exchange_rate，自動拉取填入

### 發票轉交易

延續現有 Rule Engine：發票同步 → 規則匹配商家 → 自動建立交易（關聯 invoice_id）。

## 台灣銀行種子資料

約 36 家主要銀行，包含：臺銀(004)、土銀(005)、合庫(006)、一銀(007)、華銀(008)、彰銀(009)、上海商銀(011)、富邦(012)、國泰(013)、兆豐(017)、花旗(021)、王道(048)、臺企銀(050)、渣打(052)、台中銀(053)、京城(054)、滙豐(081)、瑞興(101)、華泰(102)、新光(103)、陽信(108)、板信(118)、三信(147)、聯邦(803)、遠東(805)、元大(806)、永豐(807)、玉山(808)、凱基(809)、星展(810)、台新(812)、日盛(815)、安泰(816)、中信(822)、樂天(826)、LINE Bank(827)。

用 SQL migration 灌入。
