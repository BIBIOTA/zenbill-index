# Phase 2 驗收清單

**版本：** v1.0.0
**建立日期：** 2026-01-31
**狀態：** 🚧 待驗證（程式碼已完成）

---

## 📋 前置準備

### ✅ 環境需求檢查

- [ ] **Go 1.22+ 已安裝**
  ```bash
  go version
  # 應顯示: go version go1.22.x 或更高
  ```

- [ ] **Playwright 已安裝**
  ```bash
  # 安裝 playwright-go
  go get github.com/playwright-community/playwright-go

  # 下載 Chromium 瀏覽器
  go run github.com/playwright-community/playwright-go/cmd/playwright install chromium
  ```

- [ ] **Tesseract OCR 已安裝**
  ```bash
  tesseract --version
  # 應顯示: tesseract 5.x.x

  # 如未安裝 (macOS):
  brew install tesseract
  ```

- [ ] **PostgreSQL 16 正在運行**
  ```bash
  docker-compose up -d db
  # 或檢查: docker ps | grep postgres
  ```

- [ ] **環境變數已設定**
  ```bash
  # 複製範本
  cp .env.example .env

  # 編輯 .env，填入實際值:
  # ZENBILL_EINVOICE_PHONE=您的手機條碼
  # ZENBILL_EINVOICE_VERIFY_CODE=您的驗證碼
  ```

---

## 🧪 測試階段 1：單元功能驗證

### 測試 1.1: 爬蟲初始化

**目的：** 驗證 Playwright 可正常啟動瀏覽器

**步驟：**
```go
// 建立簡易測試檔案: cmd/sandbox/test_init.go
package main

import (
    "log"
    "github.com/yukiota/zenbill/pkg/einvoice"
)

func main() {
    config := einvoice.DefaultScraperConfig()
    config.Headless = false // 顯示瀏覽器視窗

    scraper, err := einvoice.NewPlaywrightScraper(config)
    if err != nil {
        log.Fatal(err)
    }
    defer scraper.Close()

    log.Println("✅ 爬蟲初始化成功")
}
```

**執行：**
```bash
go run cmd/sandbox/test_init.go
```

**預期結果：**
- [ ] 程式正常啟動
- [ ] 瀏覽器視窗自動開啟
- [ ] 終端輸出: `✅ 爬蟲初始化成功`
- [ ] 程式正常退出（瀏覽器自動關閉）

---

### 測試 1.2: 登入流程（需真實帳號）

**目的：** 驗證完整登入流程（Cloudflare + OAuth + 驗證碼）

**步驟：**
```bash
# 設定環境變數
export ZENBILL_EINVOICE_PHONE="您的手機條碼"
export ZENBILL_EINVOICE_VERIFY_CODE="您的驗證碼"

# 執行測試腳本
go run cmd/sandbox/test_scraper.go
```

**預期結果：**
- [ ] 瀏覽器自動開啟登入頁面
- [ ] 等待 10 秒（Cloudflare 挑戰）
- [ ] 自動填寫手機號碼與驗證碼
- [ ] 驗證碼自動辨識成功 OR 要求人工輸入
- [ ] 成功提交表單
- [ ] OAuth 重定向至 `/portal/` 頁面
- [ ] 終端輸出: `[Scraper] ✅ 登入成功！`
- [ ] `browser_state.json` 檔案已建立

**可能問題與解決：**

| 問題 | 原因 | 解決方案 |
|------|------|---------|
| `timeout 30000ms exceeded` | Cloudflare 挑戰未通過 | 增加 `CloudflareWait` 至 15 秒 |
| `驗證碼處理失敗` | OCR 辨識失敗 | 人工輸入驗證碼（Fallback 機制） |
| `找不到驗證碼影像元素` | 網站改版 | 更新選擇器（`img#captchaImage`） |
| `OAuth 重定向逾時` | 帳號/密碼錯誤 | 檢查環境變數是否正確 |

---

### 測試 1.3: Session 持久化

**目的：** 驗證 Session 可正確儲存與載入

**步驟：**
```bash
# 第一次執行（登入）
go run cmd/sandbox/test_scraper.go

# 第二次執行（應跳過登入）
go run cmd/sandbox/test_scraper.go
```

**預期結果（第一次）：**
- [ ] 執行完整登入流程
- [ ] `browser_state.json` 已建立
- [ ] 檔案大小 > 1KB

**預期結果（第二次）：**
- [ ] 終端輸出: `✅ Session 載入成功`
- [ ] 終端輸出: `✅ Session 有效，跳過登入`
- [ ] **不會**開啟登入頁面
- [ ] 直接進入發票查詢流程

**驗證 Session 檔案：**
```bash
cat browser_state.json | jq .
# 應看到 cookies 和 origins 資料
```

---

### 測試 1.4: 發票列表抓取

**目的：** 驗證 API 攔截與 JSON 解析

**預期結果：**
- [ ] 終端輸出: `[Scraper] 發票總數: X，總頁數: Y`
- [ ] 終端輸出: `✅ 成功攔截到 X 筆發票（第 1 頁）`
- [ ] 顯示前 3 筆發票資訊:
  ```
  1. AB12345678 | 2026-01-15 | NT$ 350 | 優食台灣股份有限公司
  2. CD87654321 | 2026-01-20 | NT$ 120 | 全家便利商店股份有限公司
  3. EF11223344 | 2026-01-25 | NT$ 580 | 統一超商股份有限公司
  ```
- [ ] 發票資料正確（日期、金額、商家名稱）

**驗證分頁處理（如果發票超過 10 筆）：**
- [ ] 終端顯示: `[Scraper] 正在抓取第 2/X 頁...`
- [ ] 所有頁面都成功抓取
- [ ] 總筆數 = 實際發票數量

---

### 測試 1.5: 發票明細抓取

**目的：** 驗證 token 參數傳遞與明細 API 攔截

**預期結果：**
- [ ] 終端輸出: `🔍 發票號碼: AB12345678`
- [ ] 終端輸出: `✅ 成功攔截明細（X 個品項）`
- [ ] 顯示發票明細:
  ```
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
  ```
- [ ] 品項資訊正確（名稱、數量、金額）
- [ ] 小計加總等於總額

---

## 🧪 測試階段 2：錯誤處理驗證

### 測試 2.1: Session 過期處理

**步驟：**
```bash
# 刪除 Session 檔案
rm browser_state.json

# 執行測試（應自動重新登入）
go run cmd/sandbox/test_scraper.go
```

**預期結果：**
- [ ] 檢測到 Session 無效
- [ ] 自動執行登入流程
- [ ] 登入成功後繼續執行

---

### 測試 2.2: 驗證碼 OCR 失敗處理

**步驟：**
```bash
# 修改設定強制使用 Fallback
# 在 test_scraper.go 中設定:
config.FallbackToManual = true
```

**預期結果：**
- [ ] OCR 辨識失敗後
- [ ] 終端提示: `⚠️ OCR 辨識失敗，請手動輸入驗證碼`
- [ ] 可成功輸入驗證碼
- [ ] 登入流程繼續

---

### 測試 2.3: 網路逾時處理

**步驟：**
```bash
# 縮短逾時時間測試
config.Timeout = 5 * time.Second
```

**預期結果：**
- [ ] 若 API 回應超過 5 秒
- [ ] 終端輸出錯誤訊息
- [ ] 錯誤截圖已儲存至 `logs/screenshots/error_*.png`

---

## 🧪 測試階段 3：整合測試

### 測試 3.1: 完整流程測試

**步驟：**
```bash
# 刪除所有快取
rm -f browser_state.json
rm -rf logs/screenshots/*

# 執行完整測試
go run cmd/sandbox/test_scraper.go
```

**檢查清單：**
- [ ] 登入成功
- [ ] 發票列表抓取成功
- [ ] 發票明細抓取成功
- [ ] Session 已儲存
- [ ] 無錯誤截圖產生
- [ ] 終端輸出: `✅ 測試完成！`

---

### 測試 3.2: 程式碼品質檢查

**步驟：**
```bash
# 執行 lint 檢查
golangci-lint run ./pkg/einvoice/...

# 執行單元測試
go test ./pkg/einvoice/... -v

# 編譯檢查
go build ./...
```

**預期結果：**
- [ ] Lint 通過（無錯誤）
- [ ] 所有測試通過
- [ ] 程式碼成功編譯

---

## 📊 效能指標驗證

| 操作 | 預期時間 | 實測時間 | 狀態 |
|------|---------|---------|------|
| 登入（首次） | ~25 秒 | ______ 秒 | ⏳ |
| 登入（Session 有效） | ~1 秒 | ______ 秒 | ⏳ |
| 抓取發票列表（10 筆） | ~3 秒 | ______ 秒 | ⏳ |
| 抓取發票明細（1 筆） | ~2 秒 | ______ 秒 | ⏳ |
| 驗證碼辨識 | ~110 毫秒 | ______ 毫秒 | ⏳ |

---

## ✅ Phase 2 完成標準

### 功能驗收
- [ ] ✅ 可成功登入財政部平台
- [ ] ✅ 可成功攔截並解析發票列表 API
- [ ] ✅ 可成功取得每張發票的明細
- [ ] ✅ 可正確處理分頁（若發票超過 10 筆）
- [ ] ✅ 發票資料正確寫入變數（待 Phase 2.6 寫入資料庫）
- [ ] ✅ Session 管理正常運作（Cookie 持久化）

### 品質驗收
- [ ] ✅ 程式碼通過 `go build ./...`
- [ ] ✅ 程式碼通過 `golangci-lint run`（如可執行）
- [ ] ✅ 錯誤處理完善（有 retry 機制）
- [ ] ✅ 驗證碼處理有 Fallback 機制

### 文件驗收
- [ ] ✅ 技術架構文件已更新（`1.technical-architecture.md`）
- [ ] ✅ TODO list 已更新並標記完成項目（`4.todo-list.md`）
- [ ] ✅ 實作總結已建立（`docs/phase-2/IMPLEMENTATION_SUMMARY.md`）
- [ ] ✅ 使用文件已建立（`pkg/einvoice/README.md`）

---

## 🚀 下一步行動

### 立即執行（如果環境已準備好）
1. 安裝 Chromium 瀏覽器
2. 設定環境變數（手機條碼 + 驗證碼）
3. 執行測試腳本
4. 驗證所有功能正常

### 後續開發（Phase 2.6）
1. 實作 `SyncService` - 整合爬蟲與資料庫
2. 實作憑證加密儲存（AES-256）
3. 整合到 Worker 排程任務

---

**驗收人：** __________________
**驗收日期：** __________________
**最終狀態：** ⏳ 待測試 / ✅ 通過 / ❌ 失敗

**備註：**
________________________________________________________________
________________________________________________________________
________________________________________________________________
