# Figma Designs: add-tpass-easycard-sync

## Figma File
- File: https://www.figma.com/design/uK6obEOLyu2ht16pbv1J6c
- File key: uK6obEOLyu2ht16pbv1J6c

## Versions
- [v1] Frame node: 5:2 — 設定首頁已登入狀態，包含「TPASS 2.0 悠遊卡」入口。
- [v1] Frame node: 5:25 — TPASS 設定與卡片總覽 happy path。
- [v1] Frame node: 5:65 — TPASS 單張卡片詳情 happy path，顯示完整卡號、關聯信用卡與官方月彙總。
- [v1] Frame node: 5:117 — 信用卡帳戶詳情 TPASS 區塊，顯示單張綁定悠遊卡、上月/本月搭乘彙總、門檻進度與回饋金額。
- [v1] Frame node: 5:138 — TPASS 未設定 credential 的 empty state。
- [v1] Frame node: 5:153 — TPASS 同步中的 loading state。
- [v1] Frame node: 5:164 — TPASS 非預期同步錯誤 state。
- [v1] Frame node: 5:175 — TPASS 當月資料尚未完整或唯讀限制 state。
- [v1] Frame node: 5:187 — TPASS 未登入 state。

## States
| State | Frame node | Screenshot |
|---|---|---|
| Settings authenticated | 5:2 | screenshots/01-settings-authenticated.png |
| Happy path - TPASS settings | 5:25 | screenshots/02-tpass-settings-happy.png |
| Happy path - card detail | 5:65 | screenshots/03-tpass-card-detail-happy.png |
| Happy path - credit account TPASS section | 5:117 | screenshots/04-credit-account-tpass-section.png |
| Empty | 5:138 | screenshots/05-empty.png |
| Loading | 5:153 | screenshots/06-loading.png |
| Error - unexpected sync error | 5:164 | screenshots/07-error-unexpected.png |
| Disabled / read-only | 5:175 | screenshots/08-disabled.png |
| Unauthenticated | 5:187 | screenshots/09-unauthenticated.png |

## Shared Components Used
- `Button` (existing) — 用於手動同步、解除設定、外部紀錄連結、登入與重試操作；文字需置中對齊。
- `Card` (existing) — 用於設定列、credential 狀態、卡片列表項目、月份彙總與帳戶 TPASS 區塊。
- `Input` (existing) — 用於身分 ID/居留證號、出生年月日、關聯信用卡帳戶與唯讀完整卡號欄位。
- `SearchableSelect` (existing) — 用於 TPASS 卡片詳情選擇或解除關聯信用卡帳戶。
- `StatusBadge` (new) — 用於已同步、已登錄、已綁定、官方核定、差幾次、非預期錯誤等狀態；文字需在 badge 內水平置中。
- `SummaryMetricRow` (new) — 用於顯示最後同步、身分遮罩、官方回饋總計、系統預估差異、帳戶摘要與月摘要數值。
- `TpassCardListItem` (new) — 用於 TPASS 設定頁的卡片列表；已關聯時顯示實際信用卡帳戶名稱，未關聯時顯示未關聯。
- `MonthlyRewardTable` (new) — 用於卡片詳情頁顯示官方月彙總的運具、次數、金額與回饋欄位。

## Acceptance Criteria
- 設定首頁實作必須符合 frame 5:2，且「TPASS 2.0 悠遊卡」為可點擊入口。
- TPASS 設定頁 happy path 必須符合 frame 5:25，顯示遮罩身分證、出生年月日、最後同步、手動同步、解除設定、卡片列表與最近官方回饋。
- TPASS 設定頁卡片列表不得宣稱有逐筆交易明細；已關聯卡片必須顯示實際信用卡帳戶名稱，例如「台新玫瑰 Giving 卡」。
- TPASS 卡片詳情必須符合 frame 5:65；只有卡片詳情可顯示完整卡號，列表與信用卡帳戶 TPASS 區塊不得回傳或顯示完整明文卡號以外的未授權資料。
- TPASS 卡片詳情的月份摘要必須顯示官方提供的運具分類次數、交易金額、官方回饋、總回饋、兌領日期與系統預估差異。
- TPASS 卡片詳情必須提供官方悠遊卡交易紀錄外部連結，且不得宣稱 ZenBill 已同步逐筆搭乘明細。
- 信用卡帳戶詳情 TPASS 區塊必須符合 frame 5:117；每個信用卡帳戶最多顯示一張綁定 TPASS 悠遊卡。
- 信用卡帳戶詳情 TPASS 區塊必須顯示上月與本月交通工具搭乘紀錄、本月距離下一個回饋門檻還需搭乘幾次、上月回饋與本月預估回饋。
- Empty state 必須符合 frame 5:138，顯示身分 ID/居留證號與出生年月日輸入，提交文案為「儲存並同步」。
- Loading state 必須符合 frame 5:153，同步中按鈕為 disabled，不允許重複觸發同步。
- Error state 必須符合 frame 5:164，表達非預期同步錯誤；不得要求使用者手動輸入驗證碼。OCR 驗證碼失敗、官方頁維護或 DOM 改版都應落在此狀態。
- Disabled / read-only state 必須符合 frame 5:175，明確表示當月資料尚未開放或不可同步，並保留完整卡號唯讀顯示。
- Unauthenticated state 必須符合 frame 5:187，提示登入後才能保存身分資料、同步卡片與關聯信用卡帳戶。
- 所有 `StatusBadge` 與 `Button` 的文字必須在容器內水平置中，且在 360px 寬手機 viewport 不得換行、裁切或重疊。
