---
change_id: add-tpass-easycard-sync
doc_language: 繁體中文
---

# TPASS 2.0 悠遊卡同步整合設計

## 背景與目標

ZenBill 需要在行動 APP 設定列表新增「TPASS 2.0 悠遊卡」入口。使用者進入後可設定身分證字號與出生年月日，後端使用既有加密憑證機制保存資料，並可透過 TPASS 2.0 悠遊卡查詢頁同步本人已登錄悠遊卡、月份回饋紀錄與回饋資料。

同步後使用者需要能：

- 查看所有 TPASS 2.0 悠遊卡與各卡月份回饋紀錄。
- 查看系統依活動規則計算的「預估回饋」，並保留官方核定或實領欄位。
- 將特定 TPASS 悠遊卡關聯到既有個人信用卡帳戶。
- 在信用卡帳戶詳情頁查看已綁定悠遊卡的上月與本月 TPASS 2.0 搭乘彙總、回饋進度與回饋金額。
- 由 worker 每天凌晨自動同步，也能在 APP 手動觸發同步。

官方查詢網址為 `https://promohub.easycard.com.tw/promohub/applyfbs!query.action`。快照檢查顯示官方頁提供三段流程：查詢表單、卡號清單、單卡回饋金明細。查詢表單需要身分 ID/居留證號、出生年月日與 6 碼圖形驗證碼；卡號清單提供卡號、版面、狀態、早鳥資格與回饋金入口；單卡明細提供月份層級的回饋摘要，不提供逐筆搭乘明細。

## 範圍

本變更包含：

- 新增後端 TPASS domain、repository、usecase、HTTP API 與外部查詢封裝。
- 新增 TPASS 同步資料表與必要 migration。
- 新增 worker 每日 TPASS 同步排程。
- 新增 `packages/shared` types/hooks。
- 調整 APP 設定首頁為列表式入口，並新增 TPASS 設定、卡片列表、卡片詳情與月份回饋紀錄查詢頁。
- 在信用卡帳戶詳情頁新增 TPASS 區塊。

本變更不包含：

- 將 TPASS 搭乘紀錄自動轉成 ZenBill 交易。
- 自動領取或操作官方回饋。
- 從 TPASS 官方頁取得逐筆搭乘明細；快照只證實可取得月份彙總。
- 保證官方核定金額與預估金額完全一致；APP 必須明確區分「預估」與「官方」。

## 架構

採用獨立 TPASS 整合模組，避免將 TPASS 邏輯混入電子發票、帳戶或交易既有流程。

後端新增：

- `backend/internal/domain/tpass.go`：定義 TPASS credential、悠遊卡、月份回饋摘要與回饋估算。
- `backend/internal/repository/tpass_*_repository.go`：處理憑證、卡片與月份摘要持久化。
- `backend/internal/usecase/tpass_service.go`：負責設定憑證、手動同步、排程同步、卡片關聯信用卡帳戶、回饋計算與同步狀態管理。
- `backend/internal/delivery/http/tpass_handler.go`：提供 APP protected routes。
- `backend/pkg/tpass/`：封裝 TPASS 查詢頁 Playwright scraping 與 HTML parsing。此 package 對 usecase 只輸出 typed DTO，不讓 DOM 細節外洩。
- `backend/cmd/worker/main.go`：新增 TPASS sync cron job。

前端與 shared 新增：

- `packages/shared/src/types/index.ts`：新增 TPASS 型別。
- `packages/shared/src/hooks/useTpass.ts`：新增 status、credentials、sync、cards、card detail、monthly summaries、account TPASS summaries hooks。
- `app/app/settings/index.tsx`：設定首頁改為列表式入口，包含電子發票、TPASS 2.0 悠遊卡、幣別設定等。
- `app/app/settings/tpass.tsx`：TPASS 設定與卡片總覽。
- `app/app/tpass/cards/[id].tsx`：TPASS 卡片詳情與紀錄。
- `app/app/accounts/[id].tsx`：信用卡帳戶詳情新增 TPASS 區塊。

## 資料模型

新增資料表如下。

### `tpass_credentials`

每位使用者最多一筆 TPASS 查詢設定。

主要欄位：

- `id`
- `user_id`
- `national_id_encrypted`
- `birth_date_encrypted`
- `national_id_masked`
- `sync_status`
- `sync_error`
- `last_synced_at`
- `created_at`
- `updated_at`

身分證字號與出生年月日使用既有 `crypto.Encryptor` 加密保存。API 不回傳明文，只回傳是否已設定、遮罩身分證、最後同步時間、同步狀態與錯誤訊息。

### `tpass_cards`

保存同步到的悠遊卡。

主要欄位：

- `id`
- `user_id`
- `card_number_encrypted`
- `card_number_hash`
- `card_number_last4`
- `display_number`
- `card_type`
- `registration_status`
- `registered_at`
- `early_bird_qualification`
- `linked_account_id`
- `last_detail_synced_at`
- `raw_data`
- `first_seen_at`
- `last_seen_at`
- `created_at`
- `updated_at`

完整卡號需要能在 APP 顯示，因此以加密欄位保存完整卡號；另以不可逆 hash 做去重與 upsert。卡片列表與信用卡詳情頁預設顯示遮罩或 `display_number`，單張卡片詳情 API 才回傳解密後完整卡號。

`linked_account_id` 可為空；若有值，必須指向同一使用者的 `CREDIT` 帳戶。每張 TPASS 悠遊卡可關聯一個信用卡帳戶，可隨時變更或解除；每個信用卡帳戶最多綁定一張 TPASS 悠遊卡。Repository 或 migration 需以非空 `linked_account_id` 的唯一約束防止同一信用卡帳戶被多張 TPASS 卡片同時綁定。

### `tpass_monthly_summaries`

保存每張卡每月官方回饋摘要與系統計算欄位。這是 TPASS 官方快照可確認取得的主要紀錄資料。

主要欄位：

- `id`
- `user_id`
- `card_id`
- `year`
- `month`
- `query_date`
- `short_bus_count`
- `short_bus_amount`
- `short_bus_official_reward`
- `intercity_bus_count`
- `intercity_bus_amount`
- `intercity_bus_official_reward`
- `taipei_metro_count`
- `taipei_metro_amount`
- `taipei_metro_official_reward`
- `tra_count`
- `tra_amount`
- `tra_official_reward`
- `new_taipei_metro_count`
- `new_taipei_metro_amount`
- `new_taipei_metro_official_reward`
- `rail_count`
- `rail_amount`
- `official_total_reward_amount`
- `redeemed_at`
- `estimated_total_reward_amount`
- `calculation_delta_amount`
- `official_raw_data`
- `calculated_at`
- `created_at`
- `updated_at`

快照中的單卡明細列只有月份數字，沒有直接提供年份。年份必須依 `query_date` 推導：若明細月份小於或等於查詢月份，視為查詢日同年；若明細月份大於查詢月份，視為查詢日前一年。每張卡每月只保留一筆摘要，重跑同步時以 `user_id + card_id + year + month` upsert。

## 回饋計算規則

系統依官方月份彙總自行重算「預估回饋」，並保留官方回饋金欄位。由於官方頁面已提供各分類回饋金與總計，APP 應以官方金額為主要值，系統預估用於核對與提示差異。

規則：

- 使用者持悠遊卡完成活動登錄才具備常客優惠回饋資格。
- 每人最多登錄 5 張本人記名卡片，每卡限登錄 1 次。
- 短途國道客運、一般公路客運及市區公車：
  - 每月 11 至 30 次：基本回饋 15%。
  - 每月 31 次含以上：基本回饋 30%。
- 中長途國道客運：
  - 每月 2 至 3 次：基本回饋 15%。
  - 每月 4 次含以上：基本回饋 30%。
- 臺鐵、臺北捷運及新北捷運：
  - 每月 11 次含以上：軌道加碼回饋 2%。
- 每卡每月限領取 1 次，因此每卡每月只產生一筆 summary。

官方摘要已將資料分成一般公路客運/短途國道客運/市區公車、中長途國道客運、臺北捷運、臺鐵、新北捷運五組。`SHORT_BUS` 與 `INTERCITY_BUS` 分別依自己的搭乘次數門檻計算基本回饋率，並只套用在該分類的官方交易金額；同一分類金額不可重複計入另一種基本回饋。臺北捷運、臺鐵、新北捷運合併計為 `RAIL`，只參與 2% 軌道加碼，不參與基本回饋。

官方頁提示「本網頁只能查前月回饋金，當月回饋金請於下個月查詢」。同步與 UI 必須把當月資料視為可能尚未完整，不應將當月缺資料解讀為無回饋。

## API 設計

所有 TPASS API 都掛在 protected routes，需要 JWT。

- `GET /tpass/status`：取得是否已設定、遮罩身分證、最後同步、同步狀態與錯誤。
- `PUT /tpass/credentials`：設定或更新身分證字號、出生年月日。
- `DELETE /tpass/credentials`：解除設定。預設保留已同步卡片、紀錄與摘要；只刪除加密查詢憑證並停用後續同步。
- `POST /tpass/sync`：手動同步目前使用者 TPASS 資料。
- `GET /tpass/cards`：列出卡片、登錄狀態、早鳥資格、關聯帳戶與最近月份摘要；不回傳完整卡號明文。
- `GET /tpass/cards/:id`：取得單張卡片詳情，包含完整卡號與近期紀錄。
- `PUT /tpass/cards/:id/linked-account`：關聯或解除既有信用卡帳戶。
- `GET /tpass/summaries`：依卡片、年月查詢月份回饋摘要。
- `GET /accounts/:id/tpass`：信用卡帳戶詳情頁使用，回傳該信用卡帳戶綁定的單張 TPASS 悠遊卡、上月與本月月份彙總、目前距離下一個回饋門檻的搭乘次數，以及上月/本月可得回饋。

手動同步若同一使用者已有同步進行中，回傳可讀錯誤並保持既有同步狀態，不啟動並發同步。

## APP 流程

設定首頁改為列表式入口：

- 帳戶資訊。
- 電子發票設定。
- TPASS 2.0 悠遊卡。
- 幣別設定。

TPASS 設定頁：

- 未設定時顯示身分證字號與出生年月日輸入。
- 已設定時顯示遮罩身分證、最後同步時間、同步狀態與最後錯誤。
- 提供更新設定、解除設定與手動同步。
- 顯示卡片列表、登錄狀態、關聯信用卡帳戶與最近月份預估回饋。

TPASS 卡片詳情頁：

- 顯示完整卡號、卡片資訊與登錄狀態。
- 可選擇或解除關聯信用卡帳戶。
- 顯示月份摘要、預估回饋、官方核定或實領欄位。
- 顯示月份回饋紀錄，包含各運具分類的次數、交易金額、官方回饋金、總回饋與兌領日期。
- 提供官方「悠遊卡查詢交易紀錄」外部連結，供使用者自行查看逐筆交易。

信用卡帳戶詳情頁：

- 若該信用卡帳戶有綁定 TPASS 悠遊卡，新增 TPASS 區塊；每個信用卡帳戶只會顯示一張綁定悠遊卡。
- 區塊顯示綁定卡片、上月與本月各運具分類的搭乘次數、目前本月距離回饋門檻還需搭乘幾次、上月可得回饋與本月預估可得回饋。
- 若官方尚未開放本月完整回饋資料，APP 仍可顯示目前已同步到的本月搭乘彙總與門檻進度，但必須標示本月回饋為預估或待官方次月核定。
- 不把 TPASS 紀錄混入一般交易列表，避免與真實帳務交易混淆。

## 同步流程

同步分成四段：

1. 讀取並解密 TPASS credential。
2. 透過 `pkg/tpass` 查詢卡片清單。
3. 逐張卡送出 `apply.cardNo` 查詢單卡回饋金明細。
4. Upsert 卡片與月份摘要。
5. 依官方摘要重算預估回饋與差異。

同步成功時更新 `last_synced_at` 與 `sync_status`。同步失敗時保留既有資料，只更新 `sync_status = failed` 與 `sync_error`。

每日自動同步由 worker 執行，新增獨立設定，例如 `ZENBILL_WORKER_TPASS_SYNC_SCHEDULE`。預設排程為每天凌晨，且不與電子發票同步排程綁死。

查詢入口有 6 碼圖形驗證碼與語音驗證碼。`pkg/tpass` 需比照電子發票同步，透過既有 Tesseract OCR 自動辨識圖形驗證碼並提交查詢；手動同步與排程同步都不提供人工輸入驗證碼流程。若 OCR 多次辨識失敗、官方回應驗證碼錯誤或驗證碼 DOM 改版，視為非預期同步錯誤，更新 `sync_status = failed` 與 `sync_error`，並保留既有資料。

`pkg/tpass` 需使用 typed DTO 封裝外部頁面資料。快照已確認可用 selector 與欄位包含：查詢表單 `#id`、`#year_field`、`#month_field`、`#date_field`、`#txtcaptcha`、`#apply_csrfToken`；卡號清單 `#t1`；單卡明細 `table.t`。若官方頁維護或 DOM 改版，scraper/parser 回傳明確錯誤，不應 panic。

## 錯誤處理

- 未設定 credential：同步 API 回傳設定缺失錯誤。
- credential 解密失敗：回傳伺服器錯誤並記錄 log，不回傳敏感內容。
- 官方頁維護或連線失敗：同步狀態設為 failed，APP 顯示最後成功同步與失敗原因。
- OCR 驗證碼流程非預期失敗：同步狀態設為 failed，APP 顯示一般同步錯誤與最後成功同步時間，不要求使用者手動輸入驗證碼。
- 身分證字號或出生年月日格式不合法：HTTP layer 回傳 400。
- 卡片關聯帳戶不存在、非本人帳戶或非信用卡帳戶：回傳 400 或 404。
- 同步期間重複觸發：回傳同步進行中，不啟動第二個同步。
- parser 遇到月份年份無法推導或欄位數量不符：略過該卡明細、保存同步錯誤並保留既有摘要。

usecase layer 禁止 `panic`，所有外部錯誤都要顯式回傳並記錄。

## 測試策略

Domain tests：

- 短途/公車 10 次無基本回饋。
- 短途/公車 11 至 30 次為 15%。
- 短途/公車 31 次含以上為 30%。
- 中長途國道 1 次無基本回饋。
- 中長途國道 2 至 3 次為 15%。
- 中長途國道 4 次含以上為 30%。
- 軌道 11 次含以上有 2% 加碼。
- 每卡每月只產生一筆摘要。
- 依查詢日推導跨年月份。
- 官方總回饋與系統預估差異可被保存。

Usecase tests：

- 設定 TPASS credential 時明文不落 DB。
- 手動同步 upsert 卡片與月摘要。
- 同步失敗時保留既有資料並更新錯誤狀態。
- 同一使用者同步不可並發。
- 卡片只能關聯同一使用者的 `CREDIT` 帳戶。
- 同一信用卡帳戶最多只能綁定一張 TPASS 悠遊卡。
- 卡片可解除關聯。

Repository tests：

- `card_number_hash` 去重。
- 依卡片、年月查詢月份摘要。
- 依信用卡帳戶查詢單張綁定 TPASS 卡片、上月/本月摘要、門檻剩餘次數與回饋金額。

HTTP handler tests：

- status、credentials、sync、cards、summaries routes 的成功與錯誤回應。
- 未授權請求被拒絕。
- 列表 API 不回傳完整卡號明文。
- 卡片詳情 API 可回傳完整卡號。

APP/shared tests：

- hooks query key 與 mutation invalidation 正確。
- 設定首頁顯示 TPASS 2.0 悠遊卡入口。
- TPASS 設定頁可顯示未設定、同步中、同步失敗、已同步狀態。
- 卡片列表不顯示完整卡號，卡片詳情顯示完整卡號。
- 信用卡帳戶詳情頁顯示單張綁定悠遊卡、上月/本月搭乘彙總、門檻剩餘次數與回饋金額。
- 卡片詳情顯示月份回饋摘要，不宣稱有逐筆搭乘明細。

Parser tests：

- 使用快照 HTML fixture 驗證卡片清單解析。
- 使用快照 HTML fixture 驗證單卡月份摘要解析。
- 使用快照 HTML fixture 驗證跨年月份推導、官方總回饋與兌領日期解析。

## 實作前確認項

- 將已下載的 TPASS 快照 HTML 從 `tmp/tpass-snapshots/` 整理成 repo 內測試 fixture，並移除快照中非必要的個資。
- 復用電子發票同步的 Tesseract OCR 基礎設施，並針對 TPASS 驗證碼建立 retry 與失敗分類；本變更不設計人工驗證碼流程。
- 確認官方正式頁是否仍使用 `applyfbs!query2.action` 查詢卡號清單、`applyfbs!queryResult.action` 查詢單卡明細。
- 刪除 credential 時 APP 預設保留已同步資料；若未來需要刪除 TPASS 資料，應另設明確資料刪除 API 與二次確認。

## Probable next steps

此變更涉及後端 usecase、外部同步、APP 多頁面狀態與信用卡帳戶關聯，資料流與資料模型互動中等複雜。後續建議：

- 已選擇 `spec-driven-dev:writing-uml`：使用 activity diagram 描述 TPASS 同步流程，使用 ER diagram 描述 TPASS 資料模型。
- 需要 `spec-driven-dev:writing-figma`：APP 設定列表、TPASS 設定頁、卡片詳情與信用卡 TPASS 區塊屬於新 UI，適合先建立低風險視覺設計。

## Diagrams

- [Activity: TPASS Sync Flow](./diagrams/01-activity-tpass-sync-flow.puml) — 描述 APP 手動同步與 worker 排程同步如何處理 credential、OCR 驗證碼、官方查詢、卡片與月摘要 upsert、錯誤狀態分流。
- [ER: TPASS Data Model](./diagrams/02-er-tpass-data-model.puml) — 描述 `users`、`accounts`、`tpass_credentials`、`tpass_cards`、`tpass_monthly_summaries` 的關係與唯一約束。
