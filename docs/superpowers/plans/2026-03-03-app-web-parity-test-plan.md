# APP/Web 功能對等驗證 — 執行計畫

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 逐頁面在 Web 和 APP 上執行相同操作，驗證功能行為一致，記錄差異

**Architecture:** 每個 Task 對應一個頁面。先用 Chrome DevTools MCP 操作 Web 並記錄結果（snapshot + screenshot），再用 Maestro MCP 操作 APP 並比對。結果寫入 `docs/plans/2026-03-03-app-web-parity-test-results.md`。

**Tech Stack:** Chrome DevTools MCP (Web on localhost:5173), Maestro MCP (APP on Emulator), Go backend (localhost:8090)

---

## 前置作業：環境準備

### Task 0: 啟動環境並建立結果文件

**Step 1: 確認 backend 已啟動**

確認 Go backend 正在 localhost:8090 運行。如果沒有：
```bash
cd /Users/yuki/projects/zen-bill/backend
go run ./cmd/api/main.go &
```

**Step 2: 確認 Web dev server 已啟動**

確認 Vite dev server 正在 localhost:5173 運行。如果沒有：
```bash
cd /Users/yuki/projects/zen-bill
pnpm dev:web &
```

**Step 3: 確認 APP Emulator 已啟動**

使用 Maestro MCP 列出裝置並啟動：
- `mcp__maestro__list_devices` → 找到可用 emulator
- `mcp__maestro__start_device` → 啟動 emulator
- `mcp__maestro__launch_app` with appId `com.zenbill.app` → 啟動 APP

**Step 4: 開啟 Web 瀏覽器**

使用 Chrome DevTools MCP：
- `mcp__chrome-devtools__navigate_page` → 導航到 `http://localhost:5173`

**Step 5: 建立結果文件**

建立 `docs/plans/2026-03-03-app-web-parity-test-results.md`，初始內容：

```markdown
# APP/Web 功能對等驗證結果

**日期:** 2026-03-03
**環境:** Backend localhost:8090, Web localhost:5173, APP on Emulator

---

## 結果摘要

| # | 頁面 | 狀態 | 差異數 |
|---|------|------|--------|
| 1 | Login | - | - |
| 2 | Dashboard | - | - |
| 3 | Accounts 列表 | - | - |
| 4 | Account 詳情 | - | - |
| 5 | 建立交易 | - | - |
| 6 | Invoices | - | - |
| 7 | Merchants | - | - |
| 8 | Categories | - | - |
| 9 | Rules | - | - |
| 10 | Settings | - | - |
| 11 | Shared Ledgers 列表 | - | - |
| 12 | Shared Ledger 詳情 | - | - |
| 13 | 新增共帳支出 | - | - |
| 14 | Receivables | - | - |

---

## 詳細結果
```

---

## Tier 1: 核心流程

### Task 1: Login 頁面驗證

**Web 操作：**

**Step 1: 截圖 Web 登入頁**
- `mcp__chrome-devtools__navigate_page` url=`http://localhost:5173/login`
- `mcp__chrome-devtools__take_snapshot` → 記錄頁面元素（email input, submit button）
- `mcp__chrome-devtools__take_screenshot` → 截圖保存

**Step 2: 執行 Web 登入**
- `mcp__chrome-devtools__fill` → 填入 `test@example.com`
- `mcp__chrome-devtools__click` → 點擊送出按鈕
- `mcp__chrome-devtools__take_snapshot` → 記錄登入後頁面（應導向 Dashboard）
- `mcp__chrome-devtools__take_screenshot` → 截圖保存

**APP 對照：**

**Step 3: 截圖 APP 登入頁**
- `mcp__maestro__take_screenshot` → 截圖 APP 登入畫面
- `mcp__maestro__inspect_view_hierarchy` → 記錄 UI 元素

**Step 4: 執行 APP 登入**
- `mcp__maestro__tap_on` text=`login_email_input` 或 id 定位
- `mcp__maestro__input_text` text=`test@example.com`
- `mcp__maestro__tap_on` text=`login_submit_button` 或按鈕文字
- `mcp__maestro__take_screenshot` → 截圖登入後畫面

**Step 5: 比對並記錄**

比對項目：
- [ ] Email 輸入框存在
- [ ] 送出按鈕存在
- [ ] 登入成功後導向正確頁面
- [ ] Dev mode token 行為一致

將結果寫入結果文件。

---

### Task 2: Dashboard 頁面驗證

**Web 操作：**

**Step 1: 進入 Web Dashboard**
- `mcp__chrome-devtools__navigate_page` url=`http://localhost:5173/`（登入後即為 Dashboard）
- `mcp__chrome-devtools__take_snapshot` → 記錄所有數據：月支出、月收入、最近交易
- `mcp__chrome-devtools__take_screenshot`

**Step 2: 記錄 Web 數據**

從 snapshot 中提取：
- 月支出金額
- 月收入金額
- 最近交易列表（前 10 筆的商家名、金額、日期）

**APP 對照：**

**Step 3: 查看 APP Dashboard**
- 確認已登入狀態（Tab 導航可見）
- `mcp__maestro__take_screenshot`
- `mcp__maestro__inspect_view_hierarchy` → 記錄顯示的數據

**Step 4: 比對並記錄**

比對項目：
- [ ] 月支出金額一致
- [ ] 月收入金額一致
- [ ] 最近交易列表一致（順序、商家、金額）
- [ ] FAB 按鈕存在
- **預期差異:** APP 無淨資產摘要、無趨勢圖表、無待處理發票數

---

### Task 3: Accounts 列表驗證

**Web 操作：**

**Step 1: 進入 Web Accounts 頁**
- `mcp__chrome-devtools__navigate_page` url=`http://localhost:5173/accounts`
- `mcp__chrome-devtools__take_snapshot` → 記錄帳戶列表
- `mcp__chrome-devtools__take_screenshot`

**Step 2: 記錄 Web 數據**

從 snapshot 中提取：
- 帳戶數量
- 每個帳戶的名稱、類型、餘額

**APP 對照：**

**Step 3: 切換到 APP Accounts Tab**
- `mcp__maestro__tap_on` text=`帳戶`（Tab 文字）
- `mcp__maestro__take_screenshot`
- `mcp__maestro__inspect_view_hierarchy`

**Step 4: 比對並記錄**

比對項目：
- [ ] 帳戶數量一致
- [ ] 帳戶名稱一致
- [ ] 餘額數字一致
- **預期差異:** Web 有按幣別/類型分組摘要，APP 可能為簡單卡片列表

---

### Task 4: Account 詳情驗證

**Web 操作：**

**Step 1: 進入 Web 帳戶詳情**
- 從 Accounts 頁點擊第一個帳戶
- `mcp__chrome-devtools__take_snapshot` → 記錄帳戶資訊與交易歷史
- `mcp__chrome-devtools__take_screenshot`

**Step 2: 記錄 Web 數據**

- 帳戶名稱、類型、幣別、銀行
- 交易歷史（前幾筆的日期、金額、備註）

**APP 對照：**

**Step 3: 進入 APP 帳戶詳情**
- 在 APP Accounts Tab 點擊同一帳戶
- `mcp__maestro__take_screenshot`
- `mcp__maestro__inspect_view_hierarchy`

**Step 4: 比對並記錄**

比對項目：
- [ ] 帳戶基本資訊一致
- [ ] 交易歷史一致
- [ ] FAB 按鈕存在（新增交易）
- **預期差異:** Web 有帳單週期導航（CREDIT 卡片）

---

### Task 5: 建立交易驗證（跨平台同步）

**Web 操作：**

**Step 1: 在 Web 建立交易**
- `mcp__chrome-devtools__navigate_page` url=`http://localhost:5173/transactions/new`
- `mcp__chrome-devtools__take_snapshot` → 記錄表單欄位
- 填寫表單：金額（100）、類型（EXPENSE）、帳戶、分類、備註（"Web Test"）
- 送出 → 確認成功

**Step 2: 確認 Web 列表出現新交易**
- 導航到 Dashboard 或 Transactions 頁
- `mcp__chrome-devtools__take_snapshot` → 確認 "Web Test" 交易出現

**APP 對照：**

**Step 3: 確認 APP 也看到新交易**
- 回到 APP Dashboard
- `mcp__maestro__take_screenshot` → 確認 "Web Test" 交易出現在最近交易

**Step 4: 在 APP 建立交易**
- `mcp__maestro__tap_on` id=`dashboard_fab`
- 填寫表單：金額（200）、備註（"APP Test"）
- `mcp__maestro__tap_on` id=`txn_submit_button`

**Step 5: 確認 Web 也看到 APP 建立的交易**
- `mcp__chrome-devtools__navigate_page` type=`reload`
- `mcp__chrome-devtools__take_snapshot` → 確認 "APP Test" 交易出現

**Step 6: 比對並記錄**

比對項目：
- [ ] 表單欄位一致（金額、類型、帳戶、分類、備註、日期）
- [ ] Web 建立的交易在 APP 可見
- [ ] APP 建立的交易在 Web 可見
- [ ] 金額格式顯示一致

---

### Task 6: Invoices 頁面驗證

**Web 操作：**

**Step 1: 進入 Web Invoices 頁**
- `mcp__chrome-devtools__navigate_page` url=`http://localhost:5173/invoices`
- `mcp__chrome-devtools__take_snapshot`
- `mcp__chrome-devtools__take_screenshot`

**Step 2: 記錄 Web 數據**
- 發票總數
- 各狀態（PENDING/PROCESSED/IGNORED）的數量
- 前幾筆發票的賣方、金額、日期

**Step 3: 測試狀態篩選**
- 選擇 PENDING 篩選 → 記錄數量
- 選擇 PROCESSED 篩選 → 記錄數量

**APP 對照：**

**Step 4: 切換到 APP Invoices Tab**
- `mcp__maestro__tap_on` text=`發票`
- `mcp__maestro__take_screenshot`
- `mcp__maestro__inspect_view_hierarchy`

**Step 5: 測試 APP 狀態篩選**
- 切換狀態篩選 → 記錄數量

**Step 6: 比對並記錄**

比對項目：
- [ ] 發票總數一致
- [ ] 各狀態數量一致
- [ ] 發票內容（賣方、金額）一致
- [ ] 篩選功能可用
- [ ] 批次操作可用

---

## Tier 2: 管理功能

### Task 7: Merchants 頁面驗證

**Web 操作：**

**Step 1: 進入 Web Merchants 頁**
- `mcp__chrome-devtools__navigate_page` url=`http://localhost:5173/merchants`
- `mcp__chrome-devtools__take_snapshot` → 記錄商家列表
- `mcp__chrome-devtools__take_screenshot`

**APP 對照：**

**Step 2: 進入 APP Merchants 頁**
- `mcp__maestro__tap_on` text=`更多`（More Tab）
- `mcp__maestro__tap_on` text=`商家`
- `mcp__maestro__take_screenshot`
- `mcp__maestro__inspect_view_hierarchy`

**Step 3: 比對並記錄**

比對項目：
- [ ] 商家列表一致（名稱、數量）
- [ ] 新增商家功能可用
- [ ] 刪除商家功能可用
- **預期差異:** Web 有表格（含預設分類/帳戶欄位），APP 為列表形式

---

### Task 8: Categories 頁面驗證

**Web 操作：**

**Step 1: 進入 Web Categories 頁**
- `mcp__chrome-devtools__navigate_page` url=`http://localhost:5173/categories`
- `mcp__chrome-devtools__take_snapshot`
- `mcp__chrome-devtools__take_screenshot`

**APP 對照：**

**Step 2: 進入 APP Categories 頁**
- `mcp__maestro__tap_on` text=`更多`
- `mcp__maestro__tap_on` text=`分類`
- `mcp__maestro__take_screenshot`
- `mcp__maestro__inspect_view_hierarchy`

**Step 3: 比對並記錄**

比對項目：
- [ ] 支出分類一致（名稱、數量、層級）
- [ ] 收入分類一致
- [ ] 父子關係正確
- [ ] 新增/刪除功能可用

---

### Task 9: Rules 頁面驗證

**Web 操作：**

**Step 1: 進入 Web Rules 頁**
- `mcp__chrome-devtools__navigate_page` url=`http://localhost:5173/rules`
- `mcp__chrome-devtools__take_snapshot`
- `mcp__chrome-devtools__take_screenshot`

**APP 對照：**

**Step 2: 進入 APP Rules 頁**
- `mcp__maestro__tap_on` text=`更多`
- `mcp__maestro__tap_on` text=`規則`
- `mcp__maestro__take_screenshot`
- `mcp__maestro__inspect_view_hierarchy`

**Step 3: 比對並記錄**

比對項目：
- [ ] 規則列表一致（pattern、merchant、priority）
- [ ] 排序（依 priority）一致
- [ ] Match type 顯示一致
- [ ] CRUD 功能可用
- **預期差異:** Web 有 Regex Tester UI

---

### Task 10: Settings 頁面驗證

**Web 操作：**

**Step 1: 進入 Web Settings 頁**
- `mcp__chrome-devtools__navigate_page` url=`http://localhost:5173/settings`
- `mcp__chrome-devtools__take_snapshot`
- `mcp__chrome-devtools__take_screenshot`

**APP 對照：**

**Step 2: 進入 APP Settings 頁**
- `mcp__maestro__tap_on` text=`更多`
- `mcp__maestro__tap_on` text=`設定`
- `mcp__maestro__take_screenshot`
- `mcp__maestro__inspect_view_hierarchy`

**Step 3: 比對並記錄**

比對項目：
- [ ] 用戶 email 顯示一致
- [ ] 發票綁定狀態一致
- [ ] 登出按鈕存在
- **預期差異:** Web 有信用卡自動扣款設定區塊

---

## Tier 3: 共帳功能

### Task 11: Shared Ledgers 列表驗證

**Web 操作：**

**Step 1: 進入 Web Shared Ledgers 頁**
- `mcp__chrome-devtools__navigate_page` url=`http://localhost:5173/shared-ledgers`
- `mcp__chrome-devtools__take_snapshot`
- `mcp__chrome-devtools__take_screenshot`

**APP 對照：**

**Step 2: 切換到 APP 分帳 Tab**
- `mcp__maestro__tap_on` text=`分帳`
- `mcp__maestro__take_screenshot`
- `mcp__maestro__inspect_view_hierarchy`

**Step 3: 比對並記錄**

比對項目：
- [ ] 帳本數量一致
- [ ] 帳本名稱、合作夥伴、幣別一致
- [ ] 新增帳本功能可用

---

### Task 12: Shared Ledger 詳情驗證

**Web 操作：**

**Step 1: 進入 Web 帳本詳情**
- 從列表點擊第一個帳本
- `mcp__chrome-devtools__take_snapshot`
- `mcp__chrome-devtools__take_screenshot`

**Step 2: 記錄 Web 數據**
- 統計摘要（總額、我的份額、對方份額、應收）
- 支出列表（前幾筆）

**APP 對照：**

**Step 3: 進入 APP 帳本詳情**
- 在分帳 Tab 點擊同一帳本
- `mcp__maestro__take_screenshot`
- `mcp__maestro__inspect_view_hierarchy`

**Step 4: 比對並記錄**

比對項目：
- [ ] 統計摘要數字一致
- [ ] 支出列表一致
- [ ] 操作按鈕存在（新增支出、應收帳款）
- **預期差異:** APP 無 Sheet 綁定、Alias 管理

---

### Task 13: 新增共帳支出驗證

**Web 操作：**

**Step 1: 進入 Web 新增支出表單**
- 從帳本詳情點擊新增支出
- `mcp__chrome-devtools__take_snapshot` → 記錄表單欄位
- `mcp__chrome-devtools__take_screenshot`

**APP 對照：**

**Step 2: 進入 APP 新增支出表單**
- 從帳本詳情點擊 FAB 或新增按鈕
- `mcp__maestro__take_screenshot`
- `mcp__maestro__inspect_view_hierarchy`

**Step 3: 比對並記錄**

比對項目：
- [ ] 表單欄位一致（日期、類別、描述、金額）
- [ ] 付款人選擇一致（我/對方）
- [ ] 分帳方式一致（均分/全我/全對方/自訂）
- [ ] 類別選項一致

---

### Task 14: Receivables 頁面驗證

**Web 操作：**

**Step 1: 進入 Web Receivables 頁**
- 從帳本詳情點擊應收帳款按鈕
- `mcp__chrome-devtools__take_snapshot`
- `mcp__chrome-devtools__take_screenshot`

**APP 對照：**

**Step 2: 進入 APP Receivables 頁**
- 從帳本詳情點擊應收帳款按鈕
- `mcp__maestro__take_screenshot`
- `mcp__maestro__inspect_view_hierarchy`

**Step 3: 比對並記錄**

比對項目：
- [ ] 應收/應付項目一致
- [ ] 金額一致
- [ ] 結算按鈕存在
- [ ] 「全部結算」按鈕存在

---

## 收尾

### Task 15: 彙整結果與提交

**Step 1: 更新結果摘要表**

根據所有測試結果，更新結果文件頂部的摘要表格（狀態與差異數）。

**Step 2: 列出所有 FAIL / PARTIAL 項目**

整理需要修復的問題清單，按嚴重度排序：
- Critical: 功能完全不可用
- Major: 數據不一致或重要功能缺失
- Minor: 顯示差異但不影響使用
- Expected Difference: 已知的平台差異

**Step 3: 提交結果文件**

```bash
git add docs/plans/2026-03-03-app-web-parity-test-results.md
git commit -m "docs: add APP/Web parity test results"
```
