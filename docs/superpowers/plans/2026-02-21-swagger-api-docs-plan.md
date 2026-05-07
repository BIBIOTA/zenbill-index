# Swagger API Documentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add interactive Swagger UI documentation to ZenBill API at `/swagger/index.html` using swaggo/swag annotations.

**Architecture:** Add swag comment annotations to all existing Gin handlers, use `swag init` CLI to auto-generate `docs/` package, register gin-swagger middleware to serve Swagger UI. No business logic changes.

**Tech Stack:** swaggo/swag, gin-swagger, swag CLI

---

### Task 1: Install dependencies

**Files:**
- Modify: `backend/go.mod`

**Step 1: Install swag CLI tool**

Run: `go install github.com/swaggo/swag/cmd/swag@latest`
Expected: swag binary installed to `$GOPATH/bin/swag`

**Step 2: Add Go dependencies**

Run (from `backend/`):
```bash
go get github.com/swaggo/swag
go get github.com/swaggo/gin-swagger
go get github.com/swaggo/files
```

**Step 3: Tidy modules**

Run: `go mod tidy`
Expected: go.mod and go.sum updated with new dependencies

**Step 4: Verify swag CLI works**

Run: `swag --version`
Expected: prints version info

---

### Task 2: Add global Swagger annotations to main.go and register Swagger route

**Files:**
- Modify: `backend/cmd/api/main.go`

**Step 1: Add global swag annotations and swagger route**

Add these annotations as comments before the `main()` function in `cmd/api/main.go`:

```go
// @title           ZenBill API
// @version         1.0
// @description     ZenBill 自動化記帳系統 API
// @host            localhost:8080
// @BasePath        /api/v1
// @schemes         http
```

Add imports:

```go
import (
    // ... existing imports ...
    _ "github.com/yukiota/zenbill/docs" // swagger docs
    swaggerFiles "github.com/swaggo/files"
    ginSwagger "github.com/swaggo/gin-swagger"
)
```

After the health check route and before the `v1` route group, add:

```go
// Swagger UI
router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
```

And add a log line after existing log lines:

```go
log.Printf("📋 Swagger UI: http://localhost%s/swagger/index.html", addr)
```

---

### Task 3: Add Swagger annotations to Account handler

**Files:**
- Modify: `backend/internal/delivery/http/account_handler.go`

**Step 1: Add annotations to each handler method**

Before `ListAccounts`:
```go
// ListAccounts godoc
// @Summary      列出所有帳戶
// @Description  取得目前使用者的所有帳戶列表
// @Tags         帳戶
// @Produce      json
// @Success      200  {object}  Response{data=[]domain.Account}
// @Failure      500  {object}  Response
// @Router       /accounts [get]
```

Before `CreateAccount`:
```go
// CreateAccount godoc
// @Summary      建立帳戶
// @Description  建立新的金融帳戶（銀行、信用卡、現金、加密貨幣）
// @Tags         帳戶
// @Accept       json
// @Produce      json
// @Param        body  body      createAccountRequest  true  "帳戶資訊"
// @Success      200   {object}  Response{data=domain.Account}
// @Failure      400   {object}  Response
// @Failure      500   {object}  Response
// @Router       /accounts [post]
```

Before `GetAccount`:
```go
// GetAccount godoc
// @Summary      取得帳戶
// @Description  依 ID 取得單一帳戶
// @Tags         帳戶
// @Produce      json
// @Param        id   path      string  true  "帳戶 ID (UUID)"
// @Success      200  {object}  Response{data=domain.Account}
// @Failure      400  {object}  Response
// @Failure      404  {object}  Response
// @Router       /accounts/{id} [get]
```

Before `UpdateAccount`:
```go
// UpdateAccount godoc
// @Summary      更新帳戶
// @Description  更新帳戶資訊（餘額不可直接修改，需透過交易）
// @Tags         帳戶
// @Accept       json
// @Produce      json
// @Param        id    path      string                true  "帳戶 ID (UUID)"
// @Param        body  body      updateAccountRequest  true  "更新資訊"
// @Success      200   {object}  Response{data=domain.Account}
// @Failure      400   {object}  Response
// @Failure      404   {object}  Response
// @Failure      500   {object}  Response
// @Router       /accounts/{id} [put]
```

Before `DeleteAccount`:
```go
// DeleteAccount godoc
// @Summary      刪除帳戶
// @Description  刪除帳戶（帳戶下不能有交易紀錄）
// @Tags         帳戶
// @Produce      json
// @Param        id   path      string  true  "帳戶 ID (UUID)"
// @Success      200  {object}  Response
// @Failure      400  {object}  Response
// @Failure      404  {object}  Response
// @Failure      500  {object}  Response
// @Router       /accounts/{id} [delete]
```

---

### Task 4: Add Swagger annotations to Invoice handler

**Files:**
- Modify: `backend/internal/delivery/http/invoice_handler.go`

**Step 1: Add annotations to each handler method**

Before `ListInvoices`:
```go
// ListInvoices godoc
// @Summary      列出發票
// @Description  取得發票列表，支援分頁與篩選（日期、狀態）
// @Tags         發票
// @Produce      json
// @Param        page        query     int     false  "頁碼"          default(1)
// @Param        page_size   query     int     false  "每頁數量"      default(20) maximum(100)
// @Param        start_date  query     string  false  "開始日期 (YYYY-MM-DD)"
// @Param        end_date    query     string  false  "結束日期 (YYYY-MM-DD)"
// @Param        status      query     string  false  "發票狀態"      Enums(PENDING, PROCESSED, IGNORED)
// @Success      200  {object}  PaginatedResponse{data=[]InvoiceListItem}
// @Failure      400  {object}  Response
// @Failure      500  {object}  Response
// @Router       /invoices [get]
```

Before `TriggerSync`:
```go
// TriggerSync godoc
// @Summary      手動同步發票
// @Description  從財政部電子發票平台同步指定日期範圍的發票
// @Tags         發票
// @Accept       json
// @Produce      json
// @Param        body  body      SyncRequest  true  "同步日期範圍"
// @Success      200   {object}  Response
// @Failure      400   {object}  Response
// @Failure      401   {object}  Response
// @Failure      500   {object}  Response
// @Router       /invoices/sync [post]
```

Before `Login`:
```go
// Login godoc
// @Summary      登入電子發票平台
// @Description  使用手機號碼和驗證碼登入財政部電子發票平台
// @Tags         認證
// @Accept       json
// @Produce      json
// @Param        body  body      LoginRequest  true  "登入資訊"
// @Success      200   {object}  Response
// @Failure      400   {object}  Response
// @Failure      401   {object}  Response
// @Router       /auth/login [post]
```

Before `UpdateInvoiceStatus`:
```go
// UpdateInvoiceStatus godoc
// @Summary      更新發票狀態
// @Description  將發票狀態從 PENDING 更新為 PROCESSED 或 IGNORED
// @Tags         發票
// @Accept       json
// @Produce      json
// @Param        id    path      string               true  "發票 ID (UUID)"
// @Param        body  body      UpdateStatusRequest   true  "新狀態"
// @Success      200   {object}  Response
// @Failure      400   {object}  Response
// @Failure      404   {object}  Response
// @Failure      500   {object}  Response
// @Router       /invoices/{id}/status [patch]
```

---

### Task 5: Add Swagger annotations to Transaction handler

**Files:**
- Modify: `backend/internal/delivery/http/transaction_handler.go`

**Step 1: Add annotations to each handler method**

Before `ListTransactions`:
```go
// ListTransactions godoc
// @Summary      列出交易
// @Description  取得交易列表，支援分頁與篩選（帳戶、日期範圍）
// @Tags         交易
// @Produce      json
// @Param        page        query     int     false  "頁碼"          default(1)
// @Param        page_size   query     int     false  "每頁數量"      default(20) maximum(100)
// @Param        account_id  query     string  false  "帳戶 ID (UUID)"
// @Param        start_date  query     string  false  "開始日期 (YYYY-MM-DD)"
// @Param        end_date    query     string  false  "結束日期 (YYYY-MM-DD)"
// @Success      200  {object}  PaginatedResponse{data=[]domain.Transaction}
// @Failure      400  {object}  Response
// @Failure      500  {object}  Response
// @Router       /transactions [get]
```

Before `CreateTransaction`:
```go
// CreateTransaction godoc
// @Summary      建立交易
// @Description  建立新的交易紀錄（支出、收入或轉帳），自動更新帳戶餘額。若提供外幣幣別但未提供匯率，將自動查詢匯率。
// @Tags         交易
// @Accept       json
// @Produce      json
// @Param        body  body      createTransactionRequest  true  "交易資訊"
// @Success      200   {object}  Response{data=domain.Transaction}
// @Failure      400   {object}  Response
// @Failure      500   {object}  Response
// @Router       /transactions [post]
```

Before `GetTransaction`:
```go
// GetTransaction godoc
// @Summary      取得交易
// @Description  依 ID 取得單一交易紀錄
// @Tags         交易
// @Produce      json
// @Param        id   path      string  true  "交易 ID (UUID)"
// @Success      200  {object}  Response{data=domain.Transaction}
// @Failure      400  {object}  Response
// @Failure      404  {object}  Response
// @Router       /transactions/{id} [get]
```

Before `UpdateTransaction`:
```go
// UpdateTransaction godoc
// @Summary      更新交易
// @Description  更新交易紀錄，自動重新計算帳戶餘額
// @Tags         交易
// @Accept       json
// @Produce      json
// @Param        id    path      string                    true  "交易 ID (UUID)"
// @Param        body  body      updateTransactionRequest  true  "更新資訊"
// @Success      200   {object}  Response{data=domain.Transaction}
// @Failure      400   {object}  Response
// @Failure      404   {object}  Response
// @Failure      500   {object}  Response
// @Router       /transactions/{id} [put]
```

Before `DeleteTransaction`:
```go
// DeleteTransaction godoc
// @Summary      刪除交易
// @Description  刪除交易紀錄並回沖帳戶餘額
// @Tags         交易
// @Produce      json
// @Param        id   path      string  true  "交易 ID (UUID)"
// @Success      200  {object}  Response
// @Failure      400  {object}  Response
// @Failure      500  {object}  Response
// @Router       /transactions/{id} [delete]
```

---

### Task 6: Add Swagger annotations to Category handler

**Files:**
- Modify: `backend/internal/delivery/http/category_handler.go`

**Step 1: Add annotations to each handler method**

Before `ListCategories`:
```go
// ListCategories godoc
// @Summary      列出分類（樹狀結構）
// @Description  取得所有分類，回傳階層式樹狀結構
// @Tags         分類
// @Produce      json
// @Success      200  {object}  Response{data=[]categoryTreeNode}
// @Failure      500  {object}  Response
// @Router       /categories [get]
```

Before `CreateCategory`:
```go
// CreateCategory godoc
// @Summary      建立分類
// @Description  建立新的分類（支援子分類）
// @Tags         分類
// @Accept       json
// @Produce      json
// @Param        body  body      createCategoryRequest  true  "分類資訊"
// @Success      200   {object}  Response{data=domain.Category}
// @Failure      400   {object}  Response
// @Failure      500   {object}  Response
// @Router       /categories [post]
```

Before `UpdateCategory`:
```go
// UpdateCategory godoc
// @Summary      更新分類
// @Description  更新分類名稱、圖示或父分類
// @Tags         分類
// @Accept       json
// @Produce      json
// @Param        id    path      string                 true  "分類 ID (UUID)"
// @Param        body  body      updateCategoryRequest  true  "更新資訊"
// @Success      200   {object}  Response{data=domain.Category}
// @Failure      400   {object}  Response
// @Failure      404   {object}  Response
// @Failure      500   {object}  Response
// @Router       /categories/{id} [put]
```

Before `DeleteCategory`:
```go
// DeleteCategory godoc
// @Summary      刪除分類
// @Description  刪除分類（分類下不能有交易紀錄）
// @Tags         分類
// @Produce      json
// @Param        id   path      string  true  "分類 ID (UUID)"
// @Success      200  {object}  Response
// @Failure      400  {object}  Response
// @Failure      404  {object}  Response
// @Failure      500  {object}  Response
// @Router       /categories/{id} [delete]
```

---

### Task 7: Add Swagger annotations to Merchant, Bank, ExchangeRate handlers

**Files:**
- Modify: `backend/internal/delivery/http/merchant_handler.go`
- Modify: `backend/internal/delivery/http/bank_handler.go`
- Modify: `backend/internal/delivery/http/exchange_rate_handler.go`

**Step 1: Merchant handler annotations**

Before `ListMerchants`:
```go
// ListMerchants godoc
// @Summary      列出商家
// @Description  取得所有商家列表
// @Tags         商家
// @Produce      json
// @Success      200  {object}  Response{data=[]domain.Merchant}
// @Failure      500  {object}  Response
// @Router       /merchants [get]
```

Before `CreateMerchant`:
```go
// CreateMerchant godoc
// @Summary      建立商家
// @Description  建立新的商家（可設定預設分類與帳戶）
// @Tags         商家
// @Accept       json
// @Produce      json
// @Param        body  body      createMerchantRequest  true  "商家資訊"
// @Success      200   {object}  Response{data=domain.Merchant}
// @Failure      400   {object}  Response
// @Failure      500   {object}  Response
// @Router       /merchants [post]
```

Before `UpdateMerchant`:
```go
// UpdateMerchant godoc
// @Summary      更新商家
// @Description  更新商家名稱、預設分類或預設帳戶
// @Tags         商家
// @Accept       json
// @Produce      json
// @Param        id    path      string                 true  "商家 ID (UUID)"
// @Param        body  body      updateMerchantRequest  true  "更新資訊"
// @Success      200   {object}  Response{data=domain.Merchant}
// @Failure      400   {object}  Response
// @Failure      404   {object}  Response
// @Failure      500   {object}  Response
// @Router       /merchants/{id} [put]
```

Before `DeleteMerchant`:
```go
// DeleteMerchant godoc
// @Summary      刪除商家
// @Description  刪除商家
// @Tags         商家
// @Produce      json
// @Param        id   path      string  true  "商家 ID (UUID)"
// @Success      200  {object}  Response
// @Failure      400  {object}  Response
// @Failure      404  {object}  Response
// @Failure      500  {object}  Response
// @Router       /merchants/{id} [delete]
```

**Step 2: Bank handler annotations**

Before `ListBanks`:
```go
// ListBanks godoc
// @Summary      列出銀行
// @Description  取得所有銀行列表，可依關鍵字搜尋
// @Tags         銀行
// @Produce      json
// @Param        q    query     string  false  "搜尋關鍵字（銀行名稱或代碼）"
// @Success      200  {object}  Response{data=[]domain.Bank}
// @Failure      500  {object}  Response
// @Router       /banks [get]
```

**Step 3: ExchangeRate handler annotations**

Before `GetRate`:
```go
// GetRate godoc
// @Summary      查詢匯率
// @Description  查詢兩種貨幣之間的匯率
// @Tags         匯率
// @Produce      json
// @Param        from  query     string  true  "來源幣別 (如 USD, JPY)"
// @Param        to    query     string  true  "目標幣別 (如 TWD)"
// @Success      200   {object}  Response
// @Failure      400   {object}  Response
// @Failure      500   {object}  Response
// @Router       /exchange-rates [get]
```

---

### Task 8: Generate Swagger docs and verify

**Files:**
- Create (auto-generated): `backend/docs/docs.go`
- Create (auto-generated): `backend/docs/swagger.json`
- Create (auto-generated): `backend/docs/swagger.yaml`

**Step 1: Run swag init to generate docs**

Run (from `backend/`):
```bash
swag init -g cmd/api/main.go -o docs/ --parseDependency --parseInternal
```

Expected: `docs/docs.go`, `docs/swagger.json`, `docs/swagger.yaml` created

**Step 2: Verify it compiles**

Run (from `backend/`):
```bash
go build ./...
```

Expected: No compilation errors

**Step 3: Fix any swag parse errors**

If `swag init` reports errors, fix the annotations and re-run. Common issues:
- Missing import paths for domain types
- Incorrect `{object}` references
- Mismatched braces in generic response types

---

### Task 9: Verify Swagger UI works (manual test)

**Step 1: Check generated swagger.json contains all endpoints**

Run:
```bash
grep -c '"\/.*":' backend/docs/swagger.json
```

Expected: Should list paths for all ~20 endpoints

**Step 2: Verify docs compile into the binary**

Run (from `backend/`):
```bash
go build -o /tmp/zenbill-api cmd/api/main.go
```

Expected: Binary built successfully

---

### Task 10: Commit

**Step 1: Stage and commit all changes**

```bash
cd /Users/yuki/projects/zen-bill/backend
git add docs/ cmd/api/main.go internal/delivery/http/ go.mod go.sum
git commit -m "feat: add Swagger API documentation with swaggo/swag

- Add swag annotations to all 20+ API endpoints
- Register gin-swagger middleware at /swagger/*
- Auto-generate docs/ package via swag init
- Swagger UI available at /swagger/index.html

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
