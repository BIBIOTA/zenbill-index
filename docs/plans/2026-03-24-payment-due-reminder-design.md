# 信用卡繳款日提醒推播功能設計

**日期：** 2026-03-24
**狀態：** 已核可

## 概述

在信用卡繳款日前一天的 18:00（Asia/Taipei）發送推播通知，提醒使用者繳款或確認自動扣款狀態。

## 需求

### 提醒對象

所有設有 `payment_due_day` 的信用卡帳戶，不論是否啟用自動扣款。

**跳過條件：** `Balance >= 0`（無待繳金額）的卡不發送通知。

### 通知內容依情境區分

金額顯示根據帳戶的 `Currency` 欄位動態選擇貨幣符號（TWD → NT$、USD → US$、JPY → ¥ 等）。金額使用千分位格式。

**1. 未啟用自動扣款：**
- 標題：`💳 {卡名} 明天繳款截止`
- 內文：`目前待繳金額 {幣別}{金額}，繳款截止日為 {月}/{日}。`

**2. 已啟用自動扣款 — 餘額充足：**
- 標題：`💳 {卡名} 明天自動扣款`
- 內文：`預計從「{來源帳戶名}」自動扣繳 {幣別}{金額}。`

**3. 已啟用自動扣款 — 餘額不足：**
- 標題：`⚠️ {卡名} 扣款餘額不足`
- 內文：`明天預計自動扣繳 {幣別}{金額}，但「{來源帳戶名}」餘額僅 {幣別}{餘額}，請盡快補足 {幣別}{差額}。`

**4. 已啟用自動扣款 — 但來源帳戶不存在（設定異常）：**
- 標題：`⚠️ {卡名} 自動扣款設定異常`
- 內文：`明天繳款截止，待繳 {幣別}{金額}，但自動扣款來源帳戶已不存在，請手動繳款或重新設定。`

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
Worker Cron Job (CRON_TZ=Asia/Taipei 0 18 * * *)
    │
    ▼
PaymentReminderService.SendReminders(ctx)
    │
    ├─ 1. 計算明天日期 (taipei.Now() + 1 day)
    ├─ 2. 查詢到期信用卡（含短月份補償）
    │     條件: payment_due_day == tomorrow.Day()
    │           OR (tomorrow 是該月最後一天 AND payment_due_day > 該月天數)
    ├─ 3. 過濾 Balance >= 0 的卡（無待繳）
    ├─ 4. 冪等檢查（per-card：今日是否已為該卡發過 PAYMENT_DUE_REMINDER）
    ├─ 5. 按 UserID 分組
    │
    ▼ 對每位使用者
    │
    ├─ 逐張卡產生 Notification 寫入 DB
    │   ├─ 未啟用自動扣款 → 「記得繳款」
    │   ├─ 已啟用自動扣款但來源帳戶不存在 → 「設定異常」
    │   └─ 已啟用自動扣款 → 查來源帳戶餘額
    │       ├─ 足夠 → 「明天自動扣款」
    │       └─ 不足 → 「⚠️ 餘額不足」
    │
    └─ 發送 Expo Push
        ├─ 1 張卡 → 單則推播 (data: resourceType=account, resourceID=卡ID)
        └─ 2+ 張卡 → 合併推播 (data: resourceType=notifications)
```

### 短月份補償邏輯

當 `payment_due_day = 31` 但該月只有 30 天（如 4 月），實際繳款日為 4/30，提醒應在 4/29 發出。

查詢邏輯：
```
tomorrow = taipei.Now().AddDate(0, 0, 1)
tomorrowDay = tomorrow.Day()
lastDayOfMonth = time.Date(tomorrow.Year(), tomorrow.Month()+1, 0, ...).Day()
isLastDay = (tomorrowDay == lastDayOfMonth)

WHERE type = 'CREDIT' AND payment_due_day IS NOT NULL AND (
    payment_due_day = tomorrowDay
    OR (isLastDay = true AND payment_due_day > lastDayOfMonth)
)
```

`FindCreditCardsByDueDay` 方法簽名調整為接收完整日期：

```go
// AccountRepository
FindCreditCardsDueOn(ctx context.Context, date time.Time) ([]*Account, error)
```

內部自動處理短月份補償，preload `AutoPayFrom` 關聯。

### 冪等性

Per-card 粒度：查 `notifications` 表中 `type = PAYMENT_DUE_REMINDER AND resource_id = {card_id} AND created_at in today (Asia/Taipei)`。已存在則跳過該卡。

需在 `NotificationRepository` 新增方法：

```go
ExistsByTypeAndResourceToday(ctx context.Context, nType NotificationType, resourceType string, resourceID uuid.UUID, date time.Time) (bool, error)
```

### 時區處理

使用 cron expression 內的 `CRON_TZ` 前綴，而非全域 `cron.WithLocation()`，避免影響現有 Job：

```go
scheduler.AddFunc("CRON_TZ=Asia/Taipei 0 18 * * *", func() { ... })
```

### 修改檔案清單

| 檔案 | 變更 |
|------|------|
| `backend/internal/domain/notification.go` | 新增 `PAYMENT_DUE_REMINDER` 類型常數 |
| `backend/internal/domain/repository.go` | `AccountRepository` 新增 `FindCreditCardsDueOn` 介面；`NotificationRepository` 新增 `ExistsByTypeAndResourceToday` 介面 |
| `backend/internal/usecase/payment_reminder_service.go` | **新增** — 核心提醒邏輯 |
| `backend/internal/repository/account_repository.go` | 實作 `FindCreditCardsDueOn` |
| `backend/internal/repository/notification_repository.go` | 實作 `ExistsByTypeAndResourceToday` |
| `backend/internal/config/config.go` | 新增 `PaymentReminderSchedule` 設定欄位 |
| `backend/cmd/worker/main.go` | 新增 Cron Job 註冊（使用 CRON_TZ） |
| `app/lib/pushNotifications.ts` | 擴充推播點擊路由（新增 `account` 和 `notifications` resourceType 處理） |
| `app/app/notifications.tsx` | 確認 account resourceType 路由映射 |
| `frontend/src/pages/NotificationsPage.tsx` | 同上（Web 端） |

### 不需修改

- `pkg/pushnotification/expo.go` — 完全複用
- `NotificationService`（usecase）— 完全複用
- 通知列表 UI 元件 — 完全複用
- 資料庫 migration — 不需新增欄位或表

### 新增 Config

```yaml
worker:
  payment_reminder_schedule: "CRON_TZ=Asia/Taipei 0 18 * * *"
```

`WorkerConfig` 新增 `PaymentReminderSchedule string`。

### 日誌策略

與現有 Worker Job 一致，使用 structured logging：
- Job 開始：`"starting payment reminder job"`
- 每位使用者處理：`"processing reminders" user_id=... card_count=...`
- 推播發送：`"sent payment reminder push" user_id=... merged=true/false`
- Job 完成：`"payment reminder job completed" total_users=... total_cards=... duration=...`
- 錯誤：`"failed to send reminder" user_id=... error=...`

## 決策紀錄

| 決策 | 選擇 | 原因 |
|------|------|------|
| 提醒範圍 | 全部信用卡，依情境不同訊息 | 有自動扣款也需確認餘額 |
| Balance=0 | 跳過，不發通知 | 無待繳金額無需提醒 |
| 餘額不足判斷 | 比較來源帳戶餘額與信用卡待繳金額 | 避免扣款失敗 |
| 多卡推播 | 合併成一則 | 減少打擾 |
| 單卡推播 | 獨立一則，導向帳戶詳情 | 直覺操作 |
| 點擊導向 | 單卡→帳戶頁 / 多卡→通知列表 | 資訊層級合理 |
| 時區 | 固定 Asia/Taipei，用 CRON_TZ 前綴 | 不影響現有 Job |
| 冪等性 | Per-card 粒度 | 避免部分失敗後重跑時跳過整個使用者 |
| 短月份 | 查詢時自動補償 | payment_due_day=31 在 30 天月份不漏發 |
| 多幣別 | 根據 Currency 欄位動態顯示 | 支援非 TWD 信用卡 |
| 實作方案 | Worker Cron Job | 與現有架構一致 |
