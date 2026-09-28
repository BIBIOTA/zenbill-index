# Debugging Report: debug-tpass-2-green-transport-column

Date: 2026-09-28
Debugger: Claude (claude-opus-5)

> Debugging-only artifact. 相關前案：`archive/2026-06-15-debug-tpass-month-year-order`
> （同一個 parser，上次是年份推斷，這次是欄位數）。
>
> **本檔已去識別化。** 卡片以 卡A–卡E 代稱、金額以示意值取代（欄位數、月份、
> 錯誤訊息與結論皆為實際值）。含真實卡號末四碼與逐月金額的完整版放在私有的
> API repo：`docs/plans/2026-09-28-tpass-2-green-transport-column-debugging.md`。

## Symptom
- Reported behavior: 使用者回報「這個月的 TPASS 2.0 沒有同步」。
- Actual scope（比回報更嚴重）: **自 2026-08-19 20:00 UTC 起，`tpass_monthly_summaries` 一筆都沒有再寫入**，排程卻天天回報 `sync_status=success`。
- Expected behavior: 每日 04:00（Asia/Taipei）排程應更新每張卡的月結，含當月。
- Impact: 當月完全沒有資料；前月停在 8/19 的半月快照。歷時 6 週無任何告警。

## Reproduction
- Status: reproduced（對真實官方站）
- Steps:
  1. 一次性 harness `cmd/tpass_probe`（解 prod 憑證 → 跑 `tpass.Scraper.Query` → 印出每張卡解析到的列數）。
  2. 臨時在 `fetchCardDetails` 加 env 開關的 HTML dump 與錯誤輸出。
- Environment: dev 容器（Go 1.25、Playwright chromium-1169），prod DB 憑證（唯讀）。
- Test data: 5 張卡（卡A–卡E），其中 4 張有回饋明細入口。

## Observation Plan
| Layer | Observation method | Evidence captured |
|---|---|---|
| Database | `max(updated_at)`/`max(calculated_at)` of `tpass_monthly_summaries` | 兩者皆凍在 2026-08-19 20:00 UTC |
| Database | `tpass_cards.last_seen_at` / `last_detail_synced_at` | 皆為查詢當日 → 卡片清單天天同步 |
| Database | `tpass_cards.raw_data` | `MonthlySummaries: null`，但 `RegisteredAt`/`RegistrationStatus` 正確 → 卡片清單解析正常 |
| Git | `git log -- pkg/tpass` | 最後一次變更 2026-06-16 → 斷點非我方程式碼造成 |
| Public HTTP | curl 入口頁 + `applyfbs!query.action`（無需個資） | 頁面已改版（新增 `#queryeld` 高齡回饋查詢、文案出現 TPASS2.0），但 `#query`、`#id`、`#txtcaptcha`、`#imgCapthcha`、`#btnG` 皆在；新欄位 `#cardNo` 的必填驗證在 `goPage()` 中是註解掉的 |
| Scraper | probe + 明細頁 HTML dump | 明細列 23 cells（舊 18） |

## Evidence
```text
card 卡A: ParseMonthlySummary failed: ... month 04: expected exactly 18 cells, got 23
card 卡B: ParseMonthlySummary failed: ... month 09: expected exactly 18 cells, got 23
card 卡C: ParseMonthlySummary failed: ... month 07: expected exactly 18 cells, got 23
card 卡D: ParseMonthlySummary failed: no monthly rows found   <- 官方真的無資料列，正常
RESULT: RED (current month missing)

# 官方明細表頭（新）：每個運輸群組多了第 4 個子欄位
次數 交易金額 回饋金 綠色運輸加碼   × 5 群組 → 1 + 20 + 總計 + 兌領日期 = 23
（舊：次數 交易金額 回饋金 × 5 群組 → 1 + 15 + 總計 + 兌領日期 = 18）

# 當月列的形狀（金額為示意值；官方一直都有，是我們讀不到）
09  N次 N元 回饋 B 綠色加碼 G … 總計 B+G
```

## Data Flow Trace
- Symptom observed at: App/DB 沒有當月的 TPASS 月結。
- First incorrect state found at: `pkg/tpass/parser.go` 的 `len(cells) != monthlySummaryCellCount`（硬寫 18）對 23 欄列回傳 error。
- Boundary where expected became actual: `fetchCardDetails` 收到該 error 後 `continue`（無 log）→ `card.MonthlySummaries` 為空 → `upsertCard` 的 `len(...)==0 → return nil` → 該卡不算失敗 → 整體 `success`。
- 放大傷害的三個點：三個靜默 `continue`、零列不算失敗、`LastDetailSyncedAt` 只看 `RewardDetailAvailable` 就蓋時間戳。

## Root Cause
TPASS 2.0 在官方回饋明細表的**每個運輸群組都新增「綠色運輸加碼」子欄位**，資料列由 18 cells 變 23 cells，且 `回饋金總計` 與 `兌領日期` 的索引由 16/17 位移到 21/22。parser 的 all-or-nothing 欄位數斷言使整張卡的所有月份一起被丟棄。

「綠色運輸加碼」是實際金額，且已含在官方總計內：`回饋金總計 = 基本回饋 + 綠色運輸加碼`。

## Resolution (2026-09-28)
- 修改（API repo，commit `5992bd7`）：
  1. `pkg/tpass/parser.go` — 由列寬推導每群組 stride（3=舊版 / 4=TPASS 2.0），未知寬度明確報錯；`TransportRewardSummary` 新增 `GreenTransportReward`；新增 `ErrNoMonthlyRows` sentinel。
  2. `pkg/tpass/scraper.go` — `fetchCardDetails` 三個靜默 `continue` 改為記錄 `CardListItem.DetailError`；「無回饋紀錄」(`ErrNoMonthlyRows`) 不算失敗。
  3. `internal/domain/tpass.go` — 逐群組新增 5 個 `*_green_reward` 欄位（GORM AutoMigrate）。
  4. `internal/repository/tpass_repository.go` — upsert 的 `DoUpdates` 納入 5 個新欄位。
  5. `internal/usecase/tpass_sync_service.go` — `DetailError` 非空 → 該卡計為失敗、整體 `partial_failed`，且**不**更新 `LastDetailSyncedAt`；並把綠色加碼寫入月結。
- 測試：
  - 新 fixture `pkg/tpass/testdata/card_detail_v2.html`（23 欄，去識別化）。
  - `TestParseMonthlySummaryHTMLExtractsTPASS2Rows`（已驗證移除修正即變紅）、`...RejectsUnknownColumnLayout`、`...ReportsNoRowsAsSentinel`。
  - `TestFetchCardDetailsRecordsWhyDetailIsMissing`（抓取失敗 / 版面未知 / 空歷史三情境）。
  - `TestTpassSync_BrokenCardDetail_ReportsPartialFailure`、`TestTpassSync_CardWithoutRewardHistoryStaysSuccess`。
  - Repository upsert 測試補上綠色加碼欄位（已驗證漏欄位即變紅）。
  - `go test ./...` 全綠（repository 測試需 `ZENBILL_REPOSITORY_TEST_DSN` 才會真的執行，預設會靜默 skip）；`go vet`、`gofmt` 乾淨。
- 端到端：修正後的 probe 對真實官方站 GREEN，每張有明細的卡都讀到完整月份列，且所有卡 `detailErr=""`。
- 部署：已推上 API repo master，`deploy.sh` 自動跑 migration（新增 5 欄）並重建映像，health check 通過。

## Follow-up（未做，需另行決定）
- **資料回填**：既有月結會在下次同步被官方值覆蓋（含前月的半月快照修正）。
- **估算缺口**：`TpassRewardService` 不知道綠色運輸加碼，修好後 `calculation_delta_amount` 會出現系統性缺口。官方加碼規則未公布於該頁，不宜臆測。
- **一次性 harness**：`cmd/tpass_probe`（標記 `[DEBUG-tp9]`，untracked）保留作為部署後驗證，之後刪除。
- **舊報告的個資**：`archive/2026-06-15-debug-tpass-month-year{,-order}` 兩份在本公開 repo 中含實際卡號末四碼與金額，尚未處理（需改寫 git 歷史）。
