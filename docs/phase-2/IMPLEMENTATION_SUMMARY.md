# Phase 2 實作總結：電子發票爬蟲 - 登入與驗證碼辨識

**實作日期：** 2026-01-31
**階段：** Phase 2.1 - 2.3（登入流程與基礎架構）
**狀態：** ✅ 程式碼實作完成，待測試驗證

---

## 📦 已完成的模組

### 1. 資料結構定義（Phase 2.2）

**檔案：** `pkg/einvoice/types.go`

**內容：**
- ✅ `InvoiceListResponse` - 發票列表 API 回應結構
- ✅ `InvoiceItem` - 單一發票項目
- ✅ `InvoiceDetailResponse` - 發票明細 API 回應結構
- ✅ `InvoiceDetailItem` - 發票明細項目
- ✅ `DateRange` - 日期區間查詢
- ✅ `LoginCredentials` - 登入憑證
- ✅ `ScraperConfig` - 爬蟲設定
- ✅ 自訂錯誤類型（ErrSessionExpired、ErrCloudflare 等）

**設計亮點：**
- 完整對應財政部 API 的 JSON 結構
- 支援 Unix Timestamp (milliseconds) 格式
- 提供預設設定函式 `DefaultScraperConfig()`

---

### 2. Scraper 介面定義（Phase 2.2）

**檔案：** `pkg/einvoice/scraper.go`

**介面方法：**
```go
type Scraper interface {
    // 認證與 Session 管理
    Login(phoneNumber, verifyCode string) error
    IsSessionValid() bool
    LoadSession() error
    SaveSession() error

    // 發票資料抓取
    GetInvoiceList(dateRange DateRange, page int) (*InvoiceListResponse, error)
    GetAllInvoices(dateRange DateRange) ([]InvoiceItem, error)
    GetInvoiceDetail(token string) (*InvoiceDetailResponse, error)

    // 資源管理
    Close() error
}
```

**設計模式：**
- 介面導向設計（Interface-based）
- 未來可輕鬆替換實作（例如改用 Selenium）
- 符合 Clean Architecture 原則

---

### 3. Playwright 完整實作（Phase 2.3）⭐ **核心模組**

**檔案：** `pkg/einvoice/playwright_impl.go`

**已實作功能：**

#### 3.1 認證與 Session 管理
- ✅ `Login()` - 完整登入流程
  - 處理 Cloudflare 挑戰（等待 10 秒）
  - 填寫手機號碼與驗證碼
  - 整合驗證碼自動辨識（OCR + Fallback）
  - 處理 OAuth 2.0 重定向
  - 自動儲存 Browser Context State

- ✅ `IsSessionValid()` - Session 有效性檢查
  - 檢查 browser_state.json 是否存在
  - 嘗試訪問受保護頁面
  - 檢測是否被導回登入頁面

- ✅ `LoadSession()` - 載入已儲存的 Session
  - 從 browser_state.json 讀取
  - 重建 Browser Context

- ✅ `SaveSession()` - 儲存當前 Session
  - 包含 Cookies、LocalStorage、SessionStorage
  - 自動建立目錄

#### 3.2 發票資料抓取（API 攔截）
- ✅ `GetInvoiceList()` - 單頁發票列表
  - 使用 `page.OnResponse()` 攔截 JSON API
  - 攔截 `/searchCarrierInvoice` endpoint
  - 支援分頁參數
  - 30 秒逾時保護

- ✅ `GetAllInvoices()` - 自動處理分頁
  - 迴圈抓取所有頁面
  - 禮貌性延遲（2 秒）
  - 錯誤容錯（某頁失敗不中斷）

- ✅ `GetInvoiceDetail()` - 發票明細
  - 攔截 `/getCarrierInvoiceDetail` endpoint
  - 使用 token 參數查詢
  - 15 秒逾時保護

#### 3.3 驗證碼處理
- ✅ `solveCaptchaWithFallback()` - 智慧驗證碼處理
  - 優先使用 Tesseract OCR 自動辨識
  - 支援多個選擇器（`#captchaImage`、`.captcha`）
  - OCR 失敗時回退到人工輸入（CLI Fallback）
  - 整合 `captcha.Handler` 模組（3 次重試機制）

#### 3.4 除錯與錯誤處理
- ✅ `captureErrorSnapshot()` - 自動錯誤截圖
  - 除錯模式下自動觸發
  - 儲存至 `logs/screenshots/`
  - 時間戳檔名（例：`error_20260131_153045.png`）

- ✅ 完整的錯誤日誌
  - 使用 `log.Printf` 輸出關鍵步驟
  - 每個階段都有 ✅ 或 ⚠️ 標記

---

### 4. 測試腳本（Phase 2.7）

**檔案：** `cmd/sandbox/test_scraper.go`

**測試流程：**
1. 從環境變數讀取憑證（`ZENBILL_EINVOICE_PHONE`、`ZENBILL_EINVOICE_VERIFY_CODE`）
2. 初始化爬蟲實例
3. 檢查 Session 有效性
4. 執行登入（如需要）
5. 抓取當月發票列表
6. 顯示前 3 筆發票
7. 抓取第一筆發票的明細
8. 完整輸出報告

**執行方式：**
```bash
export ZENBILL_EINVOICE_PHONE="0912345678"
export ZENBILL_EINVOICE_VERIFY_CODE="mypassword"
go run cmd/sandbox/test_scraper.go
```

---

### 5. 文件與設定

**已建立文件：**
- ✅ `pkg/einvoice/README.md` - 完整使用文件
  - 快速開始指南
  - API 參考
  - 常見問題 FAQ
  - 除錯技巧
  - 效能指標

- ✅ `.env.example` 更新
  - 新增 `ZENBILL_EINVOICE_PHONE`
  - 新增 `ZENBILL_EINVOICE_VERIFY_CODE`
  - 新增 Phase 2 爬蟲進階設定

---

## 🏗️ 架構設計亮點

### 1. Clean Architecture
```
pkg/einvoice/              (Public Library - 獨立模組)
├── types.go               (Data Structures)
├── scraper.go             (Interface Definition)
├── playwright_impl.go     (Implementation)
└── captcha/               (Sub-module)
```

- ✅ 介面與實作分離
- ✅ 可輕鬆替換實作（Playwright → Selenium）
- ✅ 無依賴於 `internal/` 包

### 2. Session 持久化
```
Browser Context State → browser_state.json
├── Cookies
├── LocalStorage
└── SessionStorage
```

- ✅ 避免重複登入
- ✅ 減少驗證碼需求
- ✅ 提升使用者體驗

### 3. 錯誤處理機制
```
API 攔截 → Channel → Timeout 保護
                   ↓
              錯誤截圖（Debug 模式）
                   ↓
              結構化日誌
```

- ✅ 30 秒逾時保護
- ✅ 自動錯誤快照
- ✅ 詳細的錯誤訊息

### 4. 驗證碼處理策略
```
OCR 辨識（Tesseract）
    ↓ 失敗
重試機制（3 次）
    ↓ 仍失敗
Fallback 人工輸入（CLI）
```

- ✅ 高自動化率
- ✅ 容錯能力強
- ✅ 使用者體驗佳

---

## 🎯 技術決策理由

### 1. 為何使用 Playwright 而非 ChromeDP？

**✅ Playwright 優勢：**
```go
// 優雅的 API 攔截（一行完成）
page.OnResponse(func(resp playwright.Response) {
    if strings.Contains(resp.URL(), "searchCarrierInvoice") {
        resp.JSON(&invoices) // 自動解析 JSON
    }
})
```

**❌ ChromeDP 缺點：**
- 需手動處理 CDP 事件
- 需管理 RequestID 對應
- 需處理複雜的 goroutine 同步

### 2. 為何將驗證碼模組獨立？

- ✅ 可單獨測試（Unit Test）
- ✅ 可重複使用（未來可能用於其他網站）
- ✅ 職責單一（Single Responsibility Principle）

### 3. 為何使用 Channel 處理 API 回應？

```go
responseChan := make(chan error, 1)
page.OnResponse(func(resp playwright.Response) {
    // 解析 JSON...
    responseChan <- nil
})

select {
case err := <-responseChan:
    return result, err
case <-time.After(30 * time.Second):
    return nil, ErrNetworkTimeout
}
```

- ✅ 非同步處理
- ✅ 逾時保護
- ✅ 避免無限等待

---

## ✅ 驗收標準檢查清單

### Phase 2.1: Playwright 環境建置
- ✅ playwright-go 已加入 `go.mod`
- ⏭️ Chromium 需手動安裝（`go run ... install chromium`）
- ✅ 環境變數範本已更新（`.env.example`）
- ✅ 測試腳本已建立（`cmd/sandbox/test_scraper.go`）

### Phase 2.2: 資料結構定義
- ✅ `InvoiceListResponse` 已定義
- ✅ `InvoiceDetailResponse` 已定義
- ✅ 所有欄位都有 `json` tag
- ✅ 錯誤類型已定義

### Phase 2.3: 登入流程實作
- ✅ `Login()` 方法已實作
- ✅ Cloudflare 挑戰處理（10 秒等待）
- ✅ 驗證碼自動辨識（整合 OCR）
- ✅ OAuth 重定向處理
- ✅ Session 持久化（browser_state.json）

### Phase 2.4: 發票列表抓取
- ✅ `GetInvoiceList()` 已實作
- ✅ API 攔截機制（`page.OnResponse`）
- ✅ 分頁處理（`GetAllInvoices()`）

### Phase 2.5: 發票明細抓取
- ✅ `GetInvoiceDetail()` 已實作
- ✅ Token 參數傳遞
- ✅ 禮貌性延遲（2 秒）

---

## 🚧 待完成項目（Phase 2.6 - 2.8）

### Phase 2.6: 資料庫寫入邏輯
- [ ] 建立 `internal/usecase/sync_service.go`
- [ ] 實作 `SyncInvoices()` 方法
- [ ] 整合 `InvoiceRepository`
- [ ] 實作憑證加密/解密（AES-256）

### Phase 2.7: 測試與驗證
- [ ] 執行測試腳本（`go run cmd/sandbox/test_scraper.go`）
- [ ] 驗證登入流程
- [ ] 驗證發票列表抓取
- [ ] 驗證發票明細抓取
- [ ] 驗證 Session 持久化

### Phase 2.8: 監控與日誌
- [ ] 整合 `log/slog` 結構化日誌
- [ ] 追蹤同步指標（成功率、耗時）

---

## 🔧 使用者操作指南

### 首次設定

1. **安裝 Playwright 瀏覽器：**
   ```bash
   go run github.com/playwright-community/playwright-go/cmd/playwright install chromium
   ```

2. **設定環境變數：**
   ```bash
   cp .env.example .env
   # 編輯 .env，填入您的手機條碼與驗證碼
   ```

3. **執行測試腳本：**
   ```bash
   export $(cat .env | xargs)
   go run cmd/sandbox/test_scraper.go
   ```

### 預期輸出

```
========================================
  財政部電子發票爬蟲測試腳本
========================================
📱 手機號碼: 0912345678
🔑 驗證碼: @Bi***TA@

[Step 1] 初始化爬蟲...
✅ 爬蟲初始化成功

[Step 2] 檢查 Session 狀態...
⚠️  Session 無效或不存在，開始登入...

[Step 3] 執行登入流程...
[Scraper] 開始登入流程...
[Scraper] 訪問登入頁面...
[Scraper] 等待 Cloudflare 挑戰完成（10s）...
[Scraper] 填寫手機號碼與驗證碼...
[Scraper] 處理圖形驗證碼...
[Scraper] ✅ 驗證碼: ABC123
[Scraper] 提交登入表單...
[Scraper] 等待 OAuth 重定向...
[Scraper] 儲存 Session...
[Scraper] ✅ Session 已儲存至: ./browser_state.json
[Scraper] ✅ 登入成功！
✅ 登入成功

[Step 4] 抓取當月發票列表...
📅 查詢區間: 2026-01-01 ~ 2026-01-31
✅ 成功攔截到 15 筆發票（第 1 頁）
[Scraper] 發票總數: 15，總頁數: 1
[Scraper] ✅ 共抓取 15 筆發票

[發票列表] (顯示前 3 筆)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. AB12345678 | 2026-01-15 | NT$ 350 | 優食台灣股份有限公司
2. CD87654321 | 2026-01-20 | NT$ 120 | 全家便利商店股份有限公司
3. EF11223344 | 2026-01-25 | NT$ 580 | 統一超商股份有限公司
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Step 5] 抓取第一筆發票明細...
🔍 發票號碼: AB12345678
✅ 成功攔截明細（3 個品項）
✅ 明細抓取成功（3 個品項）

[發票明細]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
商家: 優食台灣股份有限公司
統編: 82886921
總額: NT$ 350

品項:
  1. 溫沙拉 x 1 = NT$ 150
  2. 果汁 x 1 = NT$ 100
  3. 麵包 x 2 = NT$ 100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

========================================
✅ 測試完成！
========================================
```

---

## 📊 檔案清單

| 檔案 | 行數 | 狀態 | 說明 |
|------|------|------|------|
| `pkg/einvoice/types.go` | ~150 | ✅ | 資料結構定義 |
| `pkg/einvoice/scraper.go` | ~60 | ✅ | Scraper 介面 |
| `pkg/einvoice/playwright_impl.go` | ~380 | ✅ | Playwright 實作 |
| `cmd/sandbox/test_scraper.go` | ~150 | ✅ | 測試腳本 |
| `pkg/einvoice/README.md` | ~400 | ✅ | 使用文件 |
| `.env.example` | ~90 | ✅ | 環境變數範本 |
| **總計** | **~1,230** | **6/6** | **100% 完成** |

---

## 🎓 學習筆記

### 關鍵技術點

1. **Playwright Response 攔截器：**
   - 必須在頁面操作**前**設定 `page.OnResponse()`
   - 使用 Channel 處理非同步回應
   - 需要逾時保護機制

2. **Browser Context State：**
   - 包含 Cookies、LocalStorage、SessionStorage
   - 使用 `StorageState()` 儲存
   - 使用 `StorageStatePath` 載入

3. **Cloudflare 挑戰：**
   - 需等待 10 秒讓 JavaScript 執行完成
   - 使用 `time.Sleep()` 而非 `WaitForSelector()`
   - 未來可考慮使用 `WaitForLoadState("networkidle")`

4. **OAuth 2.0 重定向：**
   - 使用 `WaitForURL("**/portal/**")` 檢測成功登入
   - Timeout 設為 30 秒（OAuth 流程可能較慢）

---

## 🔍 下一步建議

### 立即執行（Phase 2.7）
```bash
# 1. 安裝 Chromium
go run github.com/playwright-community/playwright-go/cmd/playwright install chromium

# 2. 設定憑證
export ZENBILL_EINVOICE_PHONE="您的手機條碼"
export ZENBILL_EINVOICE_VERIFY_CODE="您的驗證碼"

# 3. 執行測試
go run cmd/sandbox/test_scraper.go
```

### 後續開發（Phase 2.6）
1. 實作 `SyncService` - 整合爬蟲與資料庫
2. 實作憑證加密儲存（AES-256）
3. 整合到 Worker 排程任務

---

**實作總結：**
✅ Phase 2.1 - 2.5 **程式碼實作完成**
⏭️ Phase 2.7 **待測試驗證**（需真實帳號）
⏭️ Phase 2.6 **待整合資料庫**

**預估測試時間：** 30 分鐘（含首次登入與發票抓取）

---

**文件版本：** v1.0.0
**最後更新：** 2026-01-31
**作者：** Claude (AI Programming Assistant)
