# Stock Daily Performance Design

**Date:** 2026-05-12
**Goal:** APP 與 Web 總覽頁的「股票投資」區塊顯示今日績效。

## 背景

目前 APP 與 Web Dashboard 都有 `StockInvestmentSection`。它會顯示股票總市值與相對平均成本的累積未實現損益，但沒有顯示今日漲跌造成的損益。

使用者希望總覽頁股票投資區塊顯示「今日績效」。本設計採用券商 App 常見定義：

```text
今日損益 = (最新價 - 昨收價) * 持股數
```

今日績效會同時出現在幣別總計與個股列。若某支股票缺少昨收或今日漲跌資料，該股票顯示 `--`，且不納入總計。

## 方案

採用「擴充現有股價刷新資料」：

- 後端擴充 Yahoo Finance quote 解析，取得昨收與今日漲跌資料。
- `RefreshPrices` 寫回股票帳戶的今日績效相關欄位。
- APP/Web 沿用現有 `useAccounts()` 與 `useRefreshStockPrices()` 資料流。
- APP/Web 透過 shared utility 計算個股與幣別總計今日績效。

不新增 Dashboard 專用 API，也不讓前端直接查股價來源。

## 資料模型

在 `accounts` 新增 nullable 欄位：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `previous_close_price` | decimal(19,4), nullable | 昨收價 |
| `day_change` | decimal(19,4), nullable | 單股今日漲跌金額 |
| `day_change_percent` | decimal(9,4), nullable | 今日漲跌幅，百分比數值，例如 `1.23` |

更新範圍：

- `backend/internal/domain/account.go`
- `backend/internal/repository/account_repository.go`
- 新增 DB migration
- `packages/shared/src/types/index.ts`

既有帳戶資料的新欄位預設 `NULL`。舊資料仍可正常渲染，今日績效顯示 `--`。

## 股價來源與刷新

`backend/pkg/stockprice/provider.go` 的 `Quote` 新增：

- `PreviousClosePrice *float64`
- `DayChange *float64`
- `DayChangePercent *float64`

Yahoo Finance chart API 目前已用於取得 `regularMarketPrice`。實作時從 chart response 的 `meta` 讀取可用欄位：

- `regularMarketPrice`
- `previousClose`
- `chartPreviousClose`，只在 `previousClose` 缺少時作為 fallback
- `regularMarketChange`
- `regularMarketChangePercent`

若 Yahoo 缺少 `regularMarketChange`，但有最新價與昨收，後端可計算：

```text
day_change = regularMarketPrice - previousClose
day_change_percent = day_change / previousClose * 100
```

若昨收不可用，今日績效欄位保持 `NULL`。`RefreshPrices` 仍更新 `last_price`、`last_price_at`、`balance`，不因今日績效缺資料而失敗。

`RefreshPrices` 保留現有行為：

- 每位使用者 30 秒 rate limit。
- provider 完全失敗時回傳快取股票帳戶。
- 個別股票缺資料時只略過該股票的今日績效。

## Shared 計算

在 `packages/shared/src/utils/stockCalculations.ts` 新增共用計算。

個股今日績效：

```text
daily_pnl = day_change * shares_held
daily_percent = day_change_percent
```

若缺少 `day_change` 或 `previous_close_price`，回傳 `null`。

幣別總計今日績效：

```text
total_daily_pnl = sum(daily_pnl)
previous_market_value = sum(previous_close_price * shares_held)
total_daily_percent = total_daily_pnl / previous_market_value * 100
```

只彙總今日績效資料完整的股票。若該幣別沒有任何可計算股票，回傳 `null`。

## UI 行為

### 幣別總計

股票投資區塊保留現有資訊：

- `總市值 TWD/USD`
- 累積未實現損益與百分比

新增：

- `今日 +$1,234 (+1.2%)`
- 資料不足時顯示 `今日 --`

### 個股列

保留現有資訊：

- 股票名稱
- 持股數
- 最新價
- 市值
- 累積未實現損益

新增：

- `今日 +$123 (+0.8%)`
- 資料不足時顯示 `今日 --`

顏色規則：

- 正數：綠色
- 負數：紅色
- 0 或 `--`：muted 色

`lastUpdated` 顯示沿用現有 Web 行為；APP 在股票投資區塊底部顯示同樣的「股價更新於」資訊。若沒有任何股票有 `last_price_at`，不顯示更新時間。

## 受影響檔案

後端：

- `backend/pkg/stockprice/provider.go`
- `backend/internal/usecase/stock_service.go`
- `backend/internal/repository/account_repository.go`
- `backend/internal/domain/account.go`
- `backend/internal/usecase/stock_service_test.go`
- `backend/pkg/stockprice/provider_test.go`
- `backend/migrations/<date>_add_stock_daily_performance.sql`

Shared：

- `packages/shared/src/types/index.ts`
- `packages/shared/src/utils/stockCalculations.ts`
- `packages/shared/src/utils/__tests__/stockCalculations.test.ts`

APP：

- `app/app/(tabs)/index.tsx`

Web：

- `frontend/src/pages/DashboardPage.tsx`

## 錯誤處理

- 股價 provider 完全失敗：沿用現有快取資料回傳，不讓 Dashboard 壞掉。
- 有最新價但缺昨收：更新總市值與累積損益，今日績效顯示 `--`。
- 部分股票缺今日績效：只排除該股票，不影響其他股票與幣別總計。
- 前端不自行推測今日績效，避免把累積損益誤顯示成今日損益。

## 測試

後端：

- `YahooProvider.GetQuote` 可解析最新價、昨收、今日漲跌與漲跌幅。
- 缺少昨收時 quote 的今日績效欄位為 nil，且不回傳錯誤。
- `StockService.RefreshPrices` 會寫入新欄位。
- provider 部分缺資料時仍回傳股票帳戶。

Shared：

- 個股今日績效計算。
- 缺欄位時回傳 `null`。
- 幣別總計只納入資料完整股票。
- 幣別總計百分比使用昨日總市值加權，不用個股百分比平均。

APP/Web：

- TypeScript 型別檢查。
- Dashboard 建置或 lint。
- 手動驗證股票投資區塊在有資料、缺資料、正負損益時的顯示。

## 不在本次範圍

- 不計算今日已實現損益。
- 不新增歷史股價表。
- 不新增 Dashboard 專用股票績效 API。
- 不改買賣股票 API request shape。
- 不改現有累積未實現損益定義。
