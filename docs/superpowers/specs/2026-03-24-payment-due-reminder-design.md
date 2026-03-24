# 信用卡繳款日提醒推播功能設計

**日期：** 2026-03-24
**狀態：** 已核可

## 概述

在信用卡繳款日前一天的 18:00（Asia/Taipei）發送推播通知，提醒使用者繳款或確認自動扣款狀態。

## 需求

### 提醒對象

所有設有 `payment_due_day` 的信用卡帳戶，不論是否啟用自動扣款。

### 通知內容依情境區分

**1. 未啟用自動扣款：**
- 標題：`💳 {卡名} 明天繳款截止`
- 內文：`目前待繳金額 NT${金額}，繳款截止日為 {月}/{日}。`

**2. 已啟用自動扣款 — 餘額充足：**
- 標題：`💳 {卡名} 明天自動扣款`
- 內文：`預計從「{來源帳戶名}」自動扣繳 NT${金額}。`

**3. 已啟用自動扣款 — 餘額不足：**
- 標題：`⚠️ {卡名} 扣款餘額不足`
- 內文：`明天預計自動扣繳 NT${金額}，但「{來源帳戶名}」餘額僅 NT${餘額}，請盡快補足 NT${差額}。`

### 多張卡合併推播

- **1 張卡：** 直接發該卡通知，點擊導向 `/accounts/{id}`
- **2 張以上：** 合併成一則推播，點擊導向 `/notifications`
  - 標題含餘額不足警示（如有）
  - 內文列出卡名與合計金額
  - 範例（有餘額不足）：
    - 標題：`⚠️ 3 張信用卡明天繳款截止（1 張餘額不足）`
    - 內文：`國泰世華、台新銀行、玉山銀行，合計待繳 NT$35,200。台新銀行帳戶餘額不足，請盡快補足。`
  - 範例（全部正常）：
    - 標題：`💳 3 張信用卡明天繳款截止`
    - 內文：`國泰世華、台新銀行、玉山銀行，合計待繳 NT$35,200。`

### 通知記錄

- 不論推播是否合併，每張卡各寫一筆 `Notification` 到 DB
- `type`: `PAYMENT_DUE_REMINDER`
- `resource_type`: `account`
- `resource_id`: 該信用卡的 Account ID
- 通知列表中點擊各筆記錄導向對應的 `/accounts/{id}`

### 時區

固定 `Asia/Taipei` (UTC+8)。

## 技術設計

### 方案

Worker Cron Job（方案 A），與現有自動扣款 Job 模式一致。

### 架構

```
每天 18:00 (Asia/Taipei)
    │
    ▼
Worker Cron Job
    │
    ▼
PaymentReminderService.SendReminders(ctx)
    │
    ├─ 1. 計算明天日期 (taipei.Now() + 1 day)
    ├─ 2. 查詢 payment_due_day == 明天的信用卡
    ├─ 3. 冪等檢查（今日是否已發過 PAYMENT_DUE_REMINDER）
    ├─ 4. 按 UserID 分組
    │
    ▼ 對每位使用者
    │
    ├─ 逐張卡產生 Notification 寫入 DB
    │   ├─ 未啟用自動扣款 → 「記得繳款」
    │   └─ 已啟用自動扣款 → 查來源帳戶餘額
    │       ├─ 足夠 → 「明天自動扣款」
    │       └─ 不足 → 「⚠️ 餘額不足」
    │
    └─ 發送 Expo Push
        ├─ 1 張卡 → 單則推播 (data: resourceType=account, resourceID=卡ID)
        └─ 2+ 張卡 → 合併推播 (data: resourceType=notifications)
```

### 冪等性

`SendReminders` 開頭檢查今日是否已為該使用者發過 `PAYMENT_DUE_REMINDER` 通知（查 `notifications` 表 `created_at` 在今日 && `type` 匹配），已發過則跳過。

### 修改檔案清單

| 檔案 | 變更 |
|------|------|
| `backend/internal/domain/notification.go` | 新增 `PAYMENT_DUE_REMINDER` 類型常數 |
| `backend/internal/usecase/payment_reminder_service.go` | **新增** — 核心提醒邏輯 |
| `backend/internal/repository/account_repository.go` | 新增 `FindCreditCardsByDueDay` 方法 |
| `backend/internal/config/config.go` | 新增 `PaymentReminderSchedule` 設定欄位 |
| `backend/cmd/worker/main.go` | 新增 Cron Job 註冊 |
| `app/lib/pushNotifications.ts` | 擴充推播點擊路由（account 類型） |
| `app/app/notifications.tsx` | 確認 account resourceType 路由映射 |
| `frontend/src/pages/NotificationsPage.tsx` | 同上（Web 端） |

### 不需修改

- `pkg/pushnotification/expo.go` — 完全複用
- `NotificationService` / `NotificationRepository` — 完全複用
- 通知列表 UI 元件 — 完全複用
- 資料庫 migration — 不需新增欄位或表

### 新增 Repository 方法

```go
// AccountRepository
FindCreditCardsByDueDay(ctx context.Context, dueDay int) ([]*Account, error)
```

查詢條件：`type = 'CREDIT' AND payment_due_day = ?`，preload `AutoPayFrom` 關聯以取得來源帳戶餘額。

### 新增 Config

```yaml
worker:
  payment_reminder_schedule: "0 18 * * *"
```

`WorkerConfig` 新增 `PaymentReminderSchedule string`。Worker 啟動時使用 `cron.WithLocation(asiaTaipei)` 確保時區正確。

## 決策紀錄

| 決策 | 選擇 | 原因 |
|------|------|------|
| 提醒範圍 | 全部信用卡，依情境不同訊息 | 有自動扣款也需確認餘額 |
| 餘額不足判斷 | 比較來源帳戶餘額與信用卡待繳金額 | 避免扣款失敗 |
| 多卡推播 | 合併成一則 | 減少打擾 |
| 單卡推播 | 獨立一則，導向帳戶詳情 | 直覺操作 |
| 點擊導向 | 單卡→帳戶頁 / 多卡→通知列表 | 資訊層級合理 |
| 時區 | 固定 Asia/Taipei | 使用者皆在台灣 |
| 實作方案 | Worker Cron Job | 與現有架構一致 |
