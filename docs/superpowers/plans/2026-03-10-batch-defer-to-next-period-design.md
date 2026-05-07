# 信用卡明細「批次移至下期」功能設計

**日期:** 2026-03-10
**狀態:** Approved

## 背景

信用卡結帳日前幾天的消費，銀行可能會將其入帳到下一期帳單。為了讓 ZenBill 的統計金額與實際收到的銀行帳單一致，需要提供手動標記交易為「下期」的功能。

## 設計

### 1. 資料模型

在 `transactions` 表新增欄位：

```go
// Transaction entity
BillingPeriodDeferred bool // 預設 false，標記為下期時設為 true
```

查詢邏輯調整：
- **當期查詢**: 原本的日期區間 + `WHERE deferred = false`
- **下期查詢**: 原本的日期區間 + `OR (上一期日期區間 AND deferred = true)`

原始 `occurred_at` 不變，保留真實消費日期。

### 2. API

```
PATCH /transactions/batch-defer
Body: { "transaction_ids": ["uuid1", "uuid2", ...], "deferred": true }
```

- `deferred: true` = 移至下期
- `deferred: false` = 撤銷（退回原期）
- 同一個 endpoint 處理標記和撤銷

### 3. 前端 UI 流程

#### 當期明細 — 標記流程

1. 頁面右上角新增「選取」按鈕，點擊進入多選模式
2. 每筆交易左側出現 checkbox
3. 勾選後底部浮出操作列，顯示已選數量 + 「移至下期」按鈕
4. 確認後呼叫 batch API，交易從當期列表消失，當期總額重新計算

#### 下期明細 — 撤銷流程

1. 從上期移入的交易顯示特殊標記（「從上期移入」標籤 + 原始消費日期）
2. 點擊該標籤或交易，出現「退回原期」選項
3. 確認後該交易回到原本的期數

### 4. 帳單金額影響

- 「繳卡費」按鈕計算的金額自動反映 deferred 狀態（基於查詢結果計算）
- AutoPayService 不受影響（它看的是 account balance，不是 billing cycle 統計）

### 5. 影響範圍

- **Backend**: Transaction domain entity, repository 查詢邏輯, 新增 batch-defer API endpoint
- **Frontend (Web)**: AccountDetailPage 多選模式, 下期移入標記
- **Frontend (App)**: accounts/[id] 多選模式, 下期移入標記
- **DB Migration**: transactions 表新增 `billing_period_deferred` 欄位
