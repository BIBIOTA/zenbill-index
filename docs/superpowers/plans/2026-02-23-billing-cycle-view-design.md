# 信用卡帳單週期對帳功能設計

**日期:** 2026-02-23
**狀態:** 已核准

## 需求

用戶希望在帳戶明細頁面根據信用卡結帳日查看特定帳單週期的交易明細，並顯示該期間的總金額，方便與實體帳單對帳。

## 設計決策

### 方案選擇：純前端實作

不需修改後端。現有 `GET /transactions` API 已支援 `start_date` / `end_date` 篩選，前端計算帳單週期日期區間並加總金額。

**理由：**
- 信用卡月帳單通常 30-50 筆，前端加總可靠
- 現有 API 完全滿足需求
- 最快上線，之後可視需要加後端 summary

### 帳單週期計算邏輯

以 `closing_day = 25` 為例：
- **本期帳單：** 上月 26 日 ~ 本月 25 日（上月結帳日次日 → 本月結帳日）
- 預設顯示包含今天的那個週期
- 支援前後切換瀏覽歷史/未來週期

工具函式 `getBillingCycle(closingDay: number, offset: number)`：
- `offset = 0` → 包含今天的週期
- `offset = -1` → 上一期
- 回傳 `{ startDate: string, endDate: string, label: string }`

### UI 變更

**範圍：** 僅 `AccountDetailPage.tsx`，僅信用卡帳戶且有 `closing_day`。

1. **帳單週期切換列**（交易記錄區塊內，標題與新增按鈕之間）：
   - 左右箭頭切換期別
   - 中間顯示日期區間，例如「1/26 ~ 2/25」
   - 下方顯示該期支出總額

2. **交易列表**改用週期的 `start_date` / `end_date` 篩選

3. **非信用卡帳戶**不受影響，保持原有行為

### 載入策略

- 帳單週期模式下 `page_size` 設為 200 以一次載完該期所有交易
- 前端 `reduce` 計算 EXPENSE 類型交易的總額

## 影響範圍

- `frontend/src/pages/AccountDetailPage.tsx` — 主要修改
- 不修改後端
- 不修改資料庫
- 不新增 API 端點
