# Stock Current Price Display Design

**Date:** 2026-05-13
**Goal:** APP 與 Web 的總覽頁股票投資、帳戶列表頁、帳戶詳細頁顯示目前股價與更新時間。

## 背景

ZenBill 已支援股票帳戶，後端會透過 `POST /accounts/stocks/refresh-prices` 更新股票帳戶的 `last_price`、`balance`、`last_price_at`，並已擴充今日績效欄位。Web/App 總覽頁的「股票投資」區塊目前已顯示最新價與「股價更新於」資訊；帳戶列表與帳戶詳細頁則需要補齊股價更新時間，讓使用者能判斷畫面上的價格是否新鮮。

本次需求選擇「顯示最新價 + 更新時間」，不新增列表或詳細頁的額外手動刷新按鈕。既有總覽頁與詳細頁刷新行為維持不變。

## 採用方案

採用「前端顯示補齊，沿用既有資料流」：

- 不新增後端 API。
- 不新增資料庫欄位。
- 不改 `Account` API response shape。
- Web/App 沿用既有 `useAccounts()` 與 `useRefreshStockPrices()`。
- 進入總覽頁、帳戶列表頁、帳戶詳細頁時，沿用現有自動刷新股價邏輯。
- UI 直接顯示帳戶資料中的 `last_price` 與 `last_price_at`。

若實作時發現 Web/App 重複時間計算或格式化邏輯，可以在 shared package 加入小型 utility，例如：

- `getLatestStockPriceUpdatedAt(accounts)`
- `formatStockPriceUpdatedAt(value)`

utility 只負責純計算與格式化，不觸發 API。

## 不採用方案

### 專用股價查詢 API

新增 quote-only endpoint 可以讓頁面只查行情，不重拉帳戶列表，但需要新增後端 handler、shared hook、前端快取同步策略。以本次需求而言成本偏高，且現有 `refresh-prices` 已可滿足。

### 每張股票卡片顯示更新時間

每張股票帳戶卡各自顯示更新時間最精準，但會讓帳戶列表資訊過密。使用者已選擇在股票分類標題旁顯示一次整體更新時間。

## UI 規格

### 總覽頁股票投資

Web: `frontend/src/pages/DashboardPage.tsx`

App: `app/app/(tabs)/index.tsx`

保留目前顯示：

- 幣別總市值。
- 累積未實現損益。
- 今日績效。
- 個股持股數、每股最新價、市值、損益。
- 區塊底部「股價更新於」。
- 既有「重新整理」按鈕。

若沒有任何股票有 `last_price_at`，總覽頁不顯示底部更新時間，沿用現有行為。

### 帳戶列表頁

Web: `frontend/src/pages/AccountsPage.tsx`

App: `app/app/(tabs)/accounts.tsx` 與 `app/components/accounts/AccountCard.tsx`

股票帳戶卡片維持精簡顯示：

- 股票名稱與代號。
- 帳戶市值。
- 持股數。
- 每股最新價。
- 未實現損益百分比。

股票分類標題旁新增整體更新時間：

```text
股票 · 股價更新於 2026/5/13 14:30
```

更新時間取該分類內有 `last_price_at` 的股票中最新的時間。若所有股票都缺少 `last_price_at`，標題維持只顯示「股票」，不顯示更新時間。

### 帳戶詳細頁

Web: `frontend/src/pages/AccountDetailPage.tsx`

App: `app/app/accounts/[id].tsx`

在「持股資訊」的「現價」欄位中顯示股價與更新時間：

```text
現價
NT$580
更新於 2026/5/13 14:30
```

若 `last_price_at` 缺少，現價仍顯示 `last_price`，下方小字顯示：

```text
尚未更新
```

現有買入、賣出、更新股價操作維持原樣。

## 時間格式

時間使用 `zh-TW` locale 顯示，實作優先採平台內建：

```ts
new Date(lastPriceAt).toLocaleString('zh-TW')
```

不新增日期套件。若 Web/App 顯示格式略有平台差異可接受，但文字語意需一致：

- 有時間：`股價更新於 ...` 或 `更新於 ...`
- 無時間：列表不顯示時間，詳細頁顯示 `尚未更新`

## 錯誤處理

- 股價刷新失敗時，沿用目前快取資料；頁面仍顯示既有 `last_price`。
- `last_price_at` 缺少時不阻斷渲染。
- 帳戶列表缺少更新時間時，不顯示分類標題旁的更新時間。
- 帳戶詳細頁缺少更新時間時，現價下方顯示 `尚未更新`。
- 若 `last_price` 為 0 但仍有持股，UI 如實顯示 0，不在前端推測價格。

## 受影響檔案

Shared:

- `packages/shared/src/utils/stockCalculations.ts`，只有在需要共用 helper 時修改。
- `packages/shared/src/utils/__tests__/stockCalculations.test.ts`，若新增 helper 則補測試。

Web:

- `frontend/src/pages/AccountsPage.tsx`
- `frontend/src/pages/AccountDetailPage.tsx`
- `frontend/src/pages/DashboardPage.tsx`，僅在需要微調既有顯示時修改。

App:

- `app/app/(tabs)/accounts.tsx`
- `app/components/accounts/AccountCard.tsx`
- `app/app/accounts/[id].tsx`
- `app/app/(tabs)/index.tsx`，僅在需要微調既有顯示時修改。

## 測試與驗證

Shared:

- 若新增 `getLatestStockPriceUpdatedAt`，測試會忽略非股票帳戶、忽略 null、回傳最新時間。
- 若新增格式化 helper，測試 null 與有效 ISO time。

Web:

- 執行 TypeScript/build 或 lint。
- 驗證帳戶列表的股票分類標題會顯示最新 `last_price_at`。
- 驗證帳戶詳細頁「現價」下方顯示更新時間或 `尚未更新`。

App:

- 執行 TypeScript/typecheck。
- 驗證帳戶列表與詳細頁型別正確。
- 手動檢查窄螢幕下股票列表標題不與其他文字重疊。

手動驗證情境：

- 單支股票有 `last_price_at`。
- 多支股票有不同 `last_price_at`，列表取最新時間。
- 所有股票都沒有 `last_price_at`。
- 股價刷新失敗但仍有快取價格。

## 不在本次範圍

- 不新增歷史股價圖。
- 不新增即時串流報價。
- 不改 Yahoo Finance provider。
- 不改股價刷新 rate limit。
- 不在帳戶列表或詳細頁新增新的手動刷新按鈕。
- 不調整股票損益與今日績效計算公式。
