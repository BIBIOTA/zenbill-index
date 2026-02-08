# ZenBill 產品與技術規格

**Version:** 1.0 (MVP)
**Last Updated:** 2026-02-07

---

## 1. 產品願景

### 1.1 問題陳述

1. **手動輸入太累** - 使用者難以持之以恆記帳
2. **資料太髒** - 雲端發票商家名稱雜亂（如「統一百華01店」）
3. **信用卡管理斷層** - 記帳軟體不追蹤「繳卡費」資金流動

### 1.2 解決方案

工程師思維的自動化記帳工具：
- **全自動同步** - Playwright 爬蟲抓取財政部電子發票
- **規則引擎** - Regex/關鍵字自動清洗商家名稱
- **資產生命週期** - 信用卡自動扣款模擬

### 1.3 成功指標

- **自動歸類率** ≥ 90%
- **每日操作時間** < 1 分鐘

---

## 2. 功能需求 (MoSCoW)

### P0: Must Have (MVP)

#### A. 帳戶管理
- **F-A1:** 新增帳戶（銀行、現金、信用卡）
- **F-A2:** 信用卡設定結帳日與繳款日
- **F-A3:** 設定信用卡自動扣款帳戶

#### B. 發票整合
- **F-B1:** 手機條碼登入財政部平台
- **F-B2:** 每日自動同步發票
- **F-B3:** 顯示發票明細（品項、單價）
- **F-B4:** 錯誤處理（Session 過期重登、結構變更偵測）

#### C. 規則引擎
- **F-C1:** 關鍵字/Regex 規則設定
- **F-C2:** 新發票自動套用規則
- **F-C3:** 手動修正後建議新規則

#### D. 交易紀錄
- **F-D1:** 條列式交易清單
- **F-D2:** 複式簿記（轉帳功能）

### P1: Should Have
- **F-E1:** 信用卡自動繳費模擬
- **F-E2:** 儀表板（本月支出、淨資產、預估卡費）

### P2: Could Have
- 加密貨幣 API 串接
- Line Notify 通知
- 預算超支提醒

---

## 3. 技術架構

### 3.1 技術堆疊

| Category | Technology | Rationale |
|----------|------------|-----------|
| Language | **Go 1.22+** | 強型別、高併發 |
| Framework | **Gin** | 效能優異、生態豐富 |
| Database | **PostgreSQL 16** | ACID、JSONB 支援 |
| ORM | **GORM** | 快速開發、Auto Migration |
| Config | **Viper** | 多格式配置支援 |
| Scheduler | **robfig/cron** | 穩定的 Go Cron |
| Scraper | **playwright-go** | Response 攔截、Cloudflare 繞過 |

### 3.2 Clean Architecture

```
internal/
├── domain/      # 純淨實體與介面（禁止 import 框架）
├── usecase/     # 商業邏輯（Rule Engine、Ledger）
├── repository/  # 資料庫實作（GORM）
└── delivery/    # HTTP 層（Gin handlers）
```

**依賴方向:** Delivery → Usecase → Domain ← Repository

### 3.3 資料庫策略

1. **ACID Transaction** - 金流變動必須使用 DB Transaction
2. **JSONB** - `invoices.raw_details` 儲存原始 API Response
3. **Decimal** - 金額使用 `DECIMAL(19, 4)`，Go 層用 `shopspring/decimal`

### 3.4 核心表結構

- `users` - 使用者
- `accounts` - 資產帳戶（含 `auto_pay_from_id`）
- `transactions` - 流水帳（Immutable 優先）
- `invoices` - 發票原始資料（JSONB）
- `merchants` / `merchant_rules` - 正規化引擎知識庫
- `categories` - 分類（階層式）

---

## 4. 發票爬蟲模組

### 4.1 API Endpoints

- **登入:** `https://www.einvoice.nat.gov.tw/accounts/login`
- **發票列表:** `https://service-mc.einvoice.nat.gov.tw/btc/cloud/api/btc502w/searchCarrierInvoice`
- **發票明細:** `https://service-mc.einvoice.nat.gov.tw/btc/cloud/api/common/getCarrierInvoiceDetail`

### 4.2 資料結構

```go
type InvoiceItem struct {
    Token         string `json:"token"`
    InvoiceNumber string `json:"invoiceNumber"`
    InvoiceDate   string `json:"invoiceDate"`   // Unix ms
    SellerName    string `json:"sellerName"`
    TotalAmount   int    `json:"totalAmount"`
}

type InvoiceDetailItem struct {
    Item      string `json:"item"`
    Quantity  string `json:"quantity"`
    UnitPrice string `json:"unitPrice"`
    Amount    string `json:"amount"`
}
```

### 4.3 CAPTCHA OCR

- **Engine:** Tesseract CLI (v5.5.0)
- **預處理策略:**
  - 放大 350% (1050x350 → 3675x1225)
  - 二值化閾值 100 (threshold)
  - PSM 8 (Treat as single word)
  - 白名單字元: `0123456789ABCDEFGHJKLMNPQRSTUVWXYZ`（排除 I, O）
- **準確率:** 單次 60.87%，配合 3 次重試 > 90%
- **實作:** `backend/pkg/einvoice/ocr.go`
- **訓練工具:** `backend/cmd/captcha_trainer/`

### 4.4 API 攔截策略

**採用 Playwright Route 機制:**

```go
// 攔截發票列表 API
err = page.Route("**/searchCarrierInvoice", func(route playwright.Route) {
    response, _ := route.Fetch()
    body, _ := response.Body()
    // 解析並儲存發票列表
})

// 攔截發票明細 API
err = page.Route("**/getCarrierInvoiceDetail", func(route playwright.Route) {
    response, _ := route.Fetch()
    body, _ := response.Body()
    // 解析並儲存發票明細
})
```

**關鍵設計決策:**
- 使用 `ExpectResponse()` 而非 `OnResponse()`（避免 handler 累積）
- 避免在 OnResponse 內呼叫 `response.Body()`（可能 deadlock）
- JWT token 在每次查詢時更新，需透過 invoice number 匹配明細

---

## 5. 規則引擎

### 5.1 匹配類型

| Type | 說明 | 範例 |
|------|------|------|
| EXACT | 精確匹配 | `Uber` = `Uber` |
| CONTAINS | 部分匹配 | `Uber Eats Taipei` contains `Uber` |
| REGEX | 正規表示式 | `^7-11.*` matches `7-11 Dunhua Store` |

### 5.2 執行邏輯

```go
func ResolveMerchant(rawName string, rules []Rule) (int, error) {
    for _, rule := range rules {  // 按 Priority 排序
        matched := false
        switch rule.MatchType {
        case "CONTAINS":
            matched = strings.Contains(rawName, rule.Pattern)
        case "REGEX":
            matched, _ = regexp.MatchString(rule.Pattern, rawName)
        }
        if matched {
            return rule.TargetMerchantID, nil
        }
    }
    return 0, fmt.Errorf("no match found")
}
```

---

## 6. 測試規格

### 6.1 單元測試 (Rule Engine)

| Case ID | 名稱 | 輸入 | 預期 |
|---------|------|------|------|
| UT-RULE-01 | 精確匹配 | `keyword="Uber", type=EXACT` | Match |
| UT-RULE-02 | 部分匹配 | `keyword="Uber", type=CONTAINS` | Match |
| UT-RULE-03 | Regex 匹配 | `keyword="^7-11.*", type=REGEX` | Match |
| UT-RULE-05 | 優先級 | 規則A(pri=10), 規則B(pri=50) | 命中 B |

### 6.2 整合測試 (API)

| Case ID | Endpoint | 預期 |
|---------|----------|------|
| IT-ACC-01 | `POST /v1/accounts` | 201 Created |
| IT-TX-01 | `POST /v1/transactions` | Transaction + 餘額更新 |

### 6.3 E2E 場景

1. **發票同步** - 爬蟲抓取 → 規則匹配 → 寫入交易
2. **規則回溯** - 新增規則後歷史資料自動歸類
3. **自動繳卡費** - 繳款日到期自動產生轉帳

### 6.4 執行指令

```bash
# 單元測試
go test ./internal/usecase/... -v

# 整合測試（需 Docker DB）
docker-compose up -d db
APP_ENV=test go test ./internal/repository/... -v

# 覆蓋率
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out
```

---

## 7. 開發階段

### Phase 0: 基礎建設 ✅ (Completed: 2026-01-22)
- ✅ Repository setup
- ✅ Docker Compose (PostgreSQL + pgAdmin)
- ✅ Viper config management
- ✅ Project structure (Clean Architecture)

### Phase 1: 資料模型 ✅ (Completed: 2026-01-25)
- ✅ Domain entities (User, Account, Transaction, Invoice, Merchant, Category)
- ✅ GORM repositories
- ✅ Database migration tool
- ✅ Domain entity unit tests

### Phase 2: 發票爬蟲 ✅ (Completed: 2026-02-08)
- ✅ **Phase 2.1**: Playwright 環境建置與登入流程
- ✅ **Phase 2.2**: CAPTCHA OCR 實作
  - Tesseract CLI 整合
  - 影像預處理（放大、二值化）
  - 準確率 60.87%（單次），配合重試機制 >90%
- ✅ **Phase 2.3**: 發票列表爬取
  - API Response 攔截（`searchCarrierInvoice`）
  - 多月份查詢支援
  - Session 管理與錯誤處理
- ✅ **Phase 2.4**: 發票明細爬取
  - 明細 API 攔截（`getCarrierInvoiceDetail`）
  - 品項解析（名稱、數量、單價）
- ✅ **Phase 2.5**: 發票同步服務整合
  - `InvoiceSyncService` 實作
  - 資料庫寫入（Invoice + 原始 JSON）
  - 重複發票檢查
- ✅ **Phase 2.6**: 日誌與效能監控
  - Structured logging (zap)
  - Sync metrics (duration, invoice count, errors)
  - Integration tests (mock + real DB)

### Phase 3: 商業邏輯 🚧 (In Progress)
- ✅ Domain entities & interfaces
- 🚧 Rule Engine usecase
- 🚧 Merchant normalization service
- 🚧 Ledger calculation service
- ⏳ Transaction creation from invoices

### Phase 4: API Server ⏳
- 🚧 Gin server setup
- ⏳ CRUD endpoints (Accounts, Transactions, Invoices)
- ⏳ Rule management endpoints

### Phase 5: 背景排程 ⏳
- ⏳ Cron scheduler (robfig/cron)
- ⏳ Daily invoice sync job
- ⏳ Auto-pay execution

### Phase 6: 收尾 ⏳
- ⏳ Code quality (lint, test coverage)
- ⏳ API documentation
- ⏳ Deployment guide

---

## 8. 非功能需求

1. **資料隱私** - DB 不對外開放、API 走 HTTPS
2. **錯誤恢復** - 財政部 API 掛掉不 crash，6 小時後重試
3. **回應速度** - 頁面切換 < 0.1s，手動同步 10-30s
