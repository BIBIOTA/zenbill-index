# Debugging Report: add-tpass-easycard-sync (production outage)

Date: 2026-06-13
Debugger: claude-opus-4-8 (system-debugging session)

> 註：此為 debugging-only 產物。本次調查為 production 線上事故，與 add-tpass-easycard-sync 功能本身無直接關係，僅借用此 change 目錄存放報告。

## Symptom
- Reported behavior: 「production 的服務目前有點問題」（使用者回報，無具體症狀）。
- Observed behavior: prod API (`zenbill_api_prod`) 與 worker (`zenbill_worker_prod`) 對所有需要資料庫的請求回傳 500；排程工作（auto-pay、付款提醒、發票同步、Google Sheet 同步）全部失敗。
- Expected behavior: API 端點正常回傳資料、排程工作正常執行。
- Impact: 高。所有依賴 DB 的功能不可用（登入 magic link、帳戶、銀行、通知、共享帳本、幣別設定、auto-pay、付款提醒、發票同步）。容器本身仍在運行且 `/health` 回 200，故從外部健康檢查看不出異常。

## Reproduction
- Status: reproduced（直接於 prod 容器 log 觀察到持續發生）
- Steps:
  1. `docker logs --since 48h zenbill_api_prod | grep -iE "error"`
  2. `docker logs --since 48h zenbill_worker_prod | grep -iE "error"`
  3. 觀察到所有 DB 操作皆回相同錯誤。
- Environment: Docker（host darwin），network `backend_zenbill_network`。
- Test data / record IDs: user `4a7f8d30-e17f-4a1c-a18f-b711150df12d`、ledger `28b1dc8b-e8c9-42bf-876f-22499d769ae8`。

## Observation Plan
| Layer | Observation method | Evidence captured |
|---|---|---|
| Browser/UI | （未測，後端錯誤已足以定位） | N/A |
| API/backend | `curl /health`、`docker logs zenbill_api_prod` | health 200；所有 DB 端點 500 |
| Database/persistence | `docker ps -a`、`docker inspect zenbill_postgres`、`docker logs zenbill_postgres` | prod DB 容器已 `Exited (0)` |
| Background/async | `docker logs zenbill_worker_prod` | auto-pay / reminder / invoice sync 全失敗 |
| Environment/build | `docker inspect`（network、restart policy） | restart policy `unless-stopped`、容器被手動停止 |

## Evidence
```text
# 共通錯誤（API 與 worker 皆同）
failed to connect to `user=zenbill database=zenbill_prod`:
hostname resolving error: lookup db on 127.0.0.11:53: no such host
# 127.0.0.11 = Docker 內建 DNS；"no such host" = 找不到名為 db 的容器

# docker ps -a（DB 容器）
zenbill_postgres   Exited (0) 17 hours ago   postgres:16-alpine

# docker inspect zenbill_postgres
FinishedAt: 2026-06-12T09:04:01Z | ExitCode: 0 | OOMKilled: false
RestartPolicy: unless-stopped | Network: backend_zenbill_network

# zenbill_postgres 關閉前最後的 log
2026-06-12 09:01:02 FATAL: password authentication failed for user "postgres"
        DETAIL: Role "postgres" does not exist.
2026-06-12 09:03:54 FATAL: password authentication failed for user "postgres"
2026-06-12 09:04:01 LOG: received fast shutdown request   <- 收到 docker stop
2026-06-12 09:04:01 LOG: database system is shut down

# 時間軸對照（UTC）
2026-06-11 19:03  worker 發票同步成功，DB 連線正常
2026-06-12 09:04  zenbill_postgres 收到 stop 請求 → 乾淨關閉 (exit 0)
2026-06-12 10:00  worker auto-pay / reminder 開始報 "no such host: db"
2026-06-13 02:06+ API 所有 DB 端點 500
```

## Data Flow Trace
- Symptom observed at: API/worker 回傳 DB 連線錯誤。
- First incorrect state found at: Docker DNS 無法解析 `db`。
- Boundary where expected became actual: `db`（容器 `zenbill_postgres`）不在運行中 → DNS 無對應紀錄 → 連線失敗。

## Working Reference
- Reference: 2026-06-11 19:03 worker 發票同步成功（同一套 prod 設定下 DB 連線正常）。
- Meaningful differences: 唯一差異是 `zenbill_postgres` 容器在 2026-06-12 09:04 UTC 被停止，之後即無法連線。app 容器設定、network、restart policy 皆未變。

## Hypothesis
根因為 **prod 資料庫容器 `zenbill_postgres`（compose 服務 `db`）於 2026-06-12 09:04 UTC（台北 17:04）被手動停止後未再啟動**。因 restart policy 為 `unless-stopped`，手動 stop 的容器不會自動重啟，導致 Docker DNS 無法解析 `db`，prod API/worker 全部無法連線資料庫。

容器停止前出現的 `password authentication failed for user "postgres" / Role "postgres" does not exist` 為失敗的登入嘗試（疑似 pgadmin 或外部探測以不存在的 `postgres` 帳號連線），**非本次中斷主因**（停止為 exit 0 的乾淨關閉），但值得留意是否有人為操作或誤連。

## Next Action
- Route to: 運維修復（非程式碼缺陷）。
- Minimal fix: 重新啟動 prod DB 容器
  - `docker start zenbill_postgres`，或 `docker compose -f backend/docker-compose.yml up -d db`
  - 啟動後驗證：`curl -s http://127.0.0.1:8091/api/v1/banks` 應回 200、worker log 不再出現 "no such host"。
- 後續強化（建議）：
  1. 調查 09:04 為何被停止（是否誤操作 / 部署腳本 / 主機事件）。
  2. 追查 `postgres` 帳號失敗登入來源（pgadmin 設定或外部探測）。
  3. 評估對 prod DB 加上監控/告警（容器停止、連線失敗率），目前 `/health` 不含 DB 檢查，無法反映此類故障。

## Resolution (2026-06-13)
- 進一步證據顯示「停止」並非單純失誤：`crs-postgres` 於 2026-06-12T09:04:02Z 啟動，剛好在 `zenbill_postgres` 09:04:01Z 關閉的 1 秒後 → 有人為了把 host port 5432 讓給 crs-postgres 而停掉 prod DB，之後忘了讓 prod DB 換 port 開回來。
- 修復：在 `backend/docker-compose.prod.yml` 為 `db` 服務加上 `ports: !override [ "5435:5432" ]`，避開 5432 衝突（`!override` 必要，否則 compose 會「合併」port 清單仍綁 5432）。app 透過網路別名 `db` 連線，不受 host port 影響。
- 執行：`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d db` 重建 db（保留 volume `backend_postgres_data`，資料無損）；重啟 worker 清掉壞掉的連線池。
- 驗證：
  - `db` 解析正常（172.19.0.7）。
  - API login 端點實際執行 `SELECT * FROM "users"` 查詢，無連線錯誤（先前為 500 → 現為正常業務回應）。
  - worker 重啟後 4 個排程工作全部註冊成功，log 無 "no such host"。
- Status: RESOLVED。
```

---

# Debugging Report #2: TPASS 首次手動同步「未預期錯誤」

Date: 2026-06-14
Debugger: claude-opus-4-8 (system-debugging session)

> 註：此為與 add-tpass-easycard-sync 功能直接相關的同步失敗調查。

## Symptom
- Reported behavior: 在測試版 APP 綁定好 TPASS 設定後，第一次手動同步發生「未預期錯誤」。
- Expected behavior: 手動同步成功登入 TPASS 官方查詢頁，抓取卡片清單與月份回饋摘要。
- Impact: 中。功能本身無法完成同步；既有資料有被正確保留（無資料損毀）。使用者看到一般同步失敗訊息。

## Reproduction
- Status: reproduced（dev 後端 log 直接觀察到，且即時抓取官方頁可重現根因）。
- Steps:
  1. 測試版 APP（`com.zenbill.app.preview`）打 dev 後端 `zenbill_api_dev`（Tailscale `:8090`）。
  2. `PUT /api/v1/tpass/credentials` 綁定 → 後端自動觸發一次同步（`sync_status=syncing`）。
  3. 同步呼叫 `pkg/tpass` scraper → `Goto` 官方查詢頁 → `WaitForSelector("#id", visible)`。
  4. 30 秒逾時失敗。
- Environment: dev 容器 `zenbill_api_dev`，host darwin。
- Test data / record IDs: user `4a7f8d30-e17f-4a1c-a18f-b711150df12d`、credential masked `C******101`。

## Observation Plan
| Layer | Observation method | Evidence captured |
|---|---|---|
| Browser/UI | （未測，後端 log 已足以定位） | N/A |
| API/backend | `docker logs zenbill_api_dev \| grep tpass` | 同步在 02:20:34 failed，scraper timeout |
| Database/persistence | 同上 log 內 SQL | credential 正常寫入；`sync_status=failed`、`sync_error` 已寫入；資料保留 |
| Background/async | scraper（Playwright）waitForSelector | `#id` 30s timeout |
| 外部 provider | `curl` 官方查詢頁 URL | HTTP 200 但僅 199 bytes「系統維護中」公告頁 |

## Evidence
```text
# dev API log（關鍵錯誤，2026-06-14 02:20:34Z）
ERROR tpass sync: scraper query failed
  error: "unexpected TPASS scraper error: TPASS page structure changed:
           wait for TPASS selector #id: playwright: timeout: Timeout 30000ms exceeded."
UPDATE tpass_credentials SET sync_error='TPASS 官方查詢失敗，已保留既有資料', sync_status='failed' ...
POST /api/v1/tpass/sync → 500 (33.57s)

# 注意：綁定 credential（PUT）已自動觸發一次同步；02:20:04 使用者再按手動同步
# 被正確拒絕為 409「already in progress」（並非 bug，是並發保護生效）。

# 即時抓取官方查詢頁（2026-06-14）
$ curl https://promohub.easycard.com.tw/promohub/applyfbs!query.action
HTTP 200 | size 199 bytes（連續多次皆相同）
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>悠遊卡服務系統</title></head>
<body><div>系統維護中，造成不便 敬請見諒。</div></body></html>

# 對照快照 fixture（同步選擇器當初正確）
tmp/tpass-snapshots/query.html (2.4MB) 內含 id="id" id="year_field"
  id="month_field" id="date_field" id="txtcaptcha"
```

## Data Flow Trace
- Symptom observed at: `POST /tpass/sync` 回 500，scraper 回 `ErrPageStructureChanged`。
- First incorrect state found at: `waitForQueryForm()` 等不到 `#id`（`scraper.go:389`）。
- Boundary where expected became actual: 官方頁進入「系統維護中」狀態，回傳的維護頁不含任何查詢表單欄位 → `#id` 永遠不會出現 → 30s timeout。

## Working Reference
- Reference: `tmp/tpass-snapshots/query.html` 快照（功能開發時抓的正常查詢頁，含完整 `#id` 表單）。
- Meaningful differences: 唯一差異是官方站目前處於維護模式，回 199 bytes 公告頁取代正常查詢頁。我方 scraper 程式碼、selector、容器設定皆無變動。

## Hypothesis（已修正 — 初版誤判為站台維護）
> 初版假設「全站維護中」**錯誤**。用首頁對照後查明真正根因如下。

根因為 **scraper 把導航起始頁寫成錯誤的 URL：`applyfbs!query.action`（Struts2 的查詢「提交方法」端點），而真正的查詢表單頁是 `applyfbs.action`**。

關鍵證據：
- 即時對照：
  - `GET applyfbs.action` → HTTP 200、13.3KB **正常頁**，含同意條款按鈕 `btnGo` / `pop-term`，但初始 DOM 尚無 `#id`。
  - `GET applyfbs!query.action` → HTTP 200、僅 199 bytes「系統維護中」殘根頁，**不含 `#id`**。
  - response header 帶 `vary: Sec-Fetch-Dest,Sec-Fetch-Mode,Sec-Fetch-Site,Sec-Fetch-User` → 伺服器依 Fetch-Metadata（是否為站內流程）給不同回應；直接 GET `!query.action`（站外導航）即回殘根頁。
- 快照 fixture `tmp/tpass-snapshots/query.html`（含 `#id`）的 form 是 `action="...applyfbs.action" method="post"`，且含 `btnGo`×3 → 證實含 `#id` 的完整查詢表單來自 **`applyfbs.action` 同意條款後 POST 回來的狀態**，不是 `!query.action`。
- 真實使用者流程（已由使用者確認可查詢）：`applyfbs.action` → 點 `btnGo` 同意條款 → POST `applyfbs.action` → 顯示含 `#id`/年月日/驗證碼的查詢表單 → 提交。scraper 完全跳過前兩步，直接 GET 一個站外不可達的 `!query.action`。

推論：此 scraper **對線上站台從未成功過**，與「第一次手動同步即失敗」一致。fixture-based parser/scraper 單元測試會過，是因為它們吃存好的 HTML，沒有真的走線上導航。這是 ZenBill 端的實作缺陷（錯誤的進入點 URL + 缺少同意條款步驟），非外部站台問題。

design.md「實作前確認項」其實已留下伏筆：「確認官方正式頁是否仍使用 `applyfbs!query2.action` / `applyfbs!queryResult.action`」——這個 URL 確認項未落實。

## Next Action
- Route to: `spec-driven-dev:test-driven-development`（這是實作缺陷，需改 scraper 流程並補測試）。
- Minimal fix direction（`backend/pkg/tpass/scraper.go`）：
  1. 把導航起始頁從 `applyfbs!query.action` 改為 `https://promohub.easycard.com.tw/promohub/applyfbs.action`。
  2. 新增同意條款步驟：載入後點 `#btnGo`（`pop-term`），等待含 `#id` 的查詢表單出現（比照 einvoice 真實點擊觸發 JS）。
  3. 釐清提交目標：表單 `method="post"`、`action=applyfbs.action`；查詢結果 / 卡號清單 / 單卡明細的實際 action（`!query` / `!query2` / `!queryResult`）需用真實流程攔截確認，更新 design.md 的 URL 確認項。
  4. 補一個「直接 GET `!query.action` 回 199B 殘根頁」的偵測或測試，避免未來再退化成這種沉默逾時。
- 驗證：修正後跑一次真實手動同步，log 應出現 `#id` 表單被填入、驗證碼提交、卡號清單解析成功，而非 `wait for selector #id timeout`。

## Resolution（2026-06-14，已實作）
- `backend/pkg/tpass/scraper.go`：
  - 新增 `EntryURL = applyfbs.action`、`AgreeButtonSelector = #btnGo`、`Query2Action`、`CardNoInputSelector`。
  - 新增 `openQueryForm()`：Goto(EntryURL) → Click(`#btnGo`) 同意條款 → 等查詢表單；captcha retry 每次重走此流程。
  - `queryPage` interface 改：`Submit`→`SubmitQuery`（回卡號清單），新增 `Click` 與 `CardDetail(cardNumber)`（query2）。
  - 新增 `fetchCardDetails()`：逐張 `RewardDetailAvailable` 卡片送 query2，解析月報並掛到該卡；單卡解析失敗略過該卡（符合 design 容錯），傳輸層失敗才視為致命。
  - `playwrightQueryPage.CardDetail` 用 `page.Evaluate` 設 `apply.cardNo` + 切 form action 為 query2 後 submit，等 `table.t`。
  - `QueryResult` 移除扁平 `MonthlySummaries`，改由 `CardListItem.MonthlySummaries` 逐卡攜帶。
- `backend/internal/usecase/tpass_sync_service.go`：移除「flat summaries 只掛第一張卡」的 KNOWN LIMITATION hack（`firstRewardDetailCardIndex`/`countRewardDetailCards`），改逐卡寫入 `card.MonthlySummaries`。
- 測試：`pkg/tpass`（含逐卡 query2、同意條款點擊斷言）與 `internal/usecase`（per-card 歸戶）全綠；`go build ./...`、`go vet` 通過。（`golangci-lint` 此環境未安裝，未跑。）
- 待真實驗證：需使用者本人用測試版 APP 跑一次手動同步（需身分證/生日 + 線上驗證碼 OCR），確認端到端成功。
- Status: 程式碼已修正，待線上端到端驗證。
