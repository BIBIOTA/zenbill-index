## Why

前一個變更 [debug-tpass-2-green-transport-column](../debug-tpass-2-green-transport-column/debugging-report.md)
修好了 TPASS 2.0 新增「綠色運輸加碼」欄位造成的 parser 全毀，但在 Follow-up 明確留下一項殘留風險：

> **估算缺口**：`TpassRewardService` 不知道綠色運輸加碼，修好後 `calculation_delta_amount`
> 會出現系統性缺口。官方加碼規則未公布於該頁，不宜臆測。

本變更把這個缺口關掉。追查缺口時另外發現兩個同樣會讓 `calculation_delta_amount`
永遠不為零的系統性錯誤，一併修正。三者都不是偶發誤差，而是**每個月都會發生**的固定偏差：

| # | 缺口 | 方向 | Production 證據 |
|---|------|------|-----------------|
| 1 | 綠色運輸加碼完全沒進估算 | 低估 | 2026-08 delta `+15.30`、2026-09 delta `+15.60` |
| 2 | 分組回饋用四捨五入，官方是逐群組無條件進位 | 低估 | 14 個非零月份**無一例外**都等於進位值 |
| 3 | 軌道加碼把三個運具的次數合併比門檻，官方明文「各運具分開計算」 | 高估 | 2025-12 多發 `5.86`、2026-05 多發 `10.54`，官方皆為 `0` |

`calculation_delta_amount` 的存在價值是「官方與我方建模不一致的告警」。在這三個缺口修好之前，
它每個月都不為零，等於永久失效的告警，任何真正的規則變動都會被雜訊蓋掉。

## What Changes

- **tpass-easycard-sync（修改）**：修正 `TpassRewardService` 的三個估算缺口。
  - **綠色運輸加碼沿用官方公布金額**：`TpassRewardEstimate` 新增 `GreenTransportReward`，
    值為月結五個 `*_green_reward` 官方欄位之和，直接計入 `estimated_total_reward_amount`。
    **不臆測加碼規則**（官方回饋條件表格沒有這一段）。
  - **逐群組 `math.Ceil`**：回饋金額 `金額 × 費率` 改為**對每個運具分組**無條件進位到整數元，
    不是對總計進位，也不再四捨五入。
  - **軌道加碼改逐運具計次**：臺北捷運 / 臺鐵 / 新北捷運**各自**累計次數、各自比 11 次門檻、
    達標者只就自己的金額發 2%，最後相加。
  - 以 27 列 production 真實月結建立 table test 迴歸網，每列 `calculation_delta_amount`
    必須為 `0`，並逐群組斷言。
- **UI（修改）**：`packages/shared` 型別補 5 個 `*_green_reward`；Web 卡片詳情頁與 APP 卡片詳情頁的
  運具群組表格新增「綠色加碼」欄（固定顯示），並加一行小字說明該欄採官方公布金額、非系統估算。

## Non-goals

- 不改 `RemainingRidesToNextThreshold`（加碼門檻規則未公布，不該進入顯示給使用者的「還差幾趟」）。
- 不做逐群組 delta 落 DB（測試層級斷言已有足夠診斷力，不值得動 schema 與 API）。
- 不把 Web / APP 兩份重複的 `TRANSPORT_ROWS` 抽成共用元件。
- 不為前端引入測試框架（`frontend/` 目前零測試，那是獨立的基礎設施決策）。
- 不直寫 DB 回填歷史月份（下一次 detail sync 會自動回填，見 design.md「回填策略」）。

## Impact

- Affected specs: `specs/tpass-easycard-sync/`（修改 — 回饋估算需求）
- Affected code:
  - `backend/internal/usecase/tpass_reward_service.go` — 三個缺口的實作
  - `backend/internal/usecase/tpass_reward_service_test.go` — 27 列 production 迴歸網
  - `packages/shared/src/types/index.ts` — `TpassMonthlySummary` 補 5 個 `*_green_reward`
  - `frontend/src/pages/TpassCardDetailPage.tsx` — 群組表格新增「綠色加碼」欄
  - `app/app/settings/tpass/[id].tsx` — 群組表格新增「綠色加碼」欄
- DB migration: 無。5 個 `*_green_reward` 欄位已於前一變更建立。
- Breaking changes: No。API 合約不變；`estimated_total_reward_amount` 與
  `calculation_delta_amount` 的**數值**會改變（這正是修正目的），既有欄位型別與名稱不動。

## Related Artifacts

### Design
- [design.md](./design.md)
- [tasks.md](./tasks.md)

### Debugging
- [前案：TPASS 2.0 綠色運輸加碼欄位](../debug-tpass-2-green-transport-column/debugging-report.md)

### Diagrams
- 無（本次變更是純計算邏輯修正，沿用前案的 ER / Activity 圖）

### Figma Designs
- 無（沿用既有卡片詳情頁群組表格樣式，只新增一欄）
