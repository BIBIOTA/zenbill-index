# Debugging Report: debug-tpass-month-year-order

Date: 2026-06-16
Debugger: Claude (claude-opus-4-8)

> Debugging-only artifact. Follows up the previous fix
> `archive/2026-06-15-debug-tpass-month-year`, which was incomplete: a
> per-row month-vs-queryMonth rule cannot infer the year correctly for all cards.

> **本檔已去識別化（2026-09-28）**：卡片以 卡A / 卡B 代稱，乘車次數已移除。
> 月份順序、年份推斷邏輯與結論皆為實際值。

## Symptom
- Reported behavior: 上次修正（`month < queryMonth`）後，**卡B** 的「2026 年 6 月」資料不見了。
- Expected behavior: 卡B 的 6 月資料應為 **2026 年 6 月**（當月，當月有乘車，回饋金 0 因當月回饋下月才結算）。
- Impact: 年份推斷對「當月在清單最上方」的卡片會錯置成去年。先前的 `<=` 規則則對「同月出現在清單最下方＝去年」的卡片（如 卡A）錯置成今年。兩種 per-row 規則都無法同時正確。

## Reproduction
- Status: reproduced
- Steps:
  1. 用 `ParseMonthlySummaryHTMLWithQueryDate`（queryDate=2026-06-15）解析兩種官方列順序（最新在最上）：
     - 卡B：`[6,5,4,3,2]`
     - 卡A：`[4,3,2,1,12,11,10,9,8,7,6]`
  2. 檢查月份 6 那列被推斷出的年份。
- Environment: macOS, Go 1.22, `pkg/tpass`（CGO: leptonica/tesseract）。
- Test data / record IDs: 卡B、卡A；queryDate 2026-06-15。

## Observation Plan
| Layer | Observation method | Evidence captured |
|---|---|---|
| Database | `tpass_monthly_summaries` join `tpass_cards`（prod & dev） | 卡B：2025/6 + 2026/2,3,4,5；卡A：2025/6..12 + 2026/1..4 |
| Database | `tpass_cards.raw_data` JSON（保留官方原始列順序） | **卡B 官方順序 06→05→04→03→02**（06 在最上＝最新）；**卡A 官方順序 04→…→07→06**（06 在最下＝最舊）|
| Parser | `pkg/tpass/parser.go:216 inferMonthlySummaryYear`（per-row） | 以 `month < queryMonth` 判斷，與「列在清單中的位置」無關 |
| Reproduction test | 臨時 `pkg/tpass/repro_order_test.go`（已刪除） | 卡B June 推成 2025（應 2026），卡A June 2025（對）|

## Evidence
```text
# 官方原始列順序（raw_data，最新在最上）
卡B:  06 05 04 03 02
卡A:  04 03 02 01 12 11 10 09 08 07 06

# 重現（現行 month < queryMonth）
cardB_june_is_current:   current parser inferred June = 2025, CORRECT = 2026   <-- BUG
cardA_june_is_last_year: current parser inferred June = 2025, CORRECT = 2025   <-- ok
```

## Data Flow Trace
- Symptom observed at: 前端「2026 年」檢視中，卡B 的 6 月格消失。
- First incorrect state found at: `inferMonthlySummaryYear(6, 2026-06)` 對 卡B 回傳 2025。
- Boundary where expected became actual: 官方清單為**遞減時間排序（最新在最上）**。卡B 的 06 是**最上＝最新＝2026/6（當月）**；卡A 的 06 是**最下＝最舊＝2025/6**。年份的決定因子是**列在清單中的位置（跨年回繞）**，不是月份與查詢月的大小比較。

## Working Reference
- Reference: 卡A 修正後為連續的 2025/6→2026/4（正確）；對照之下 卡B 被拆成 2025/6 與 2026/2-5（斷層、且當月 6 月消失）。
- Meaningful differences: 卡A 的最新月是 04（06 在底部去年）；卡B 的最新月就是 06（當月）。同一條 per-row 規則對兩者必有一錯。

## Hypothesis
I think the root cause is **年份必須依官方清單的順序（最新在最上、時間遞減）逐列回推，而非用 `month vs queryMonth` 的 per-row 比較**，because raw_data 顯示 卡B 的 06 在清單最上（最新）、卡A 的 06 在最下（最舊），兩者真實年份相反，唯一能同時解釋的規則是「位置/回繞」推年：
- 最上列（最新）：若其月份 > 查詢月 → 去年，否則今年。
- 往下逐列：當月份「未遞減」(`month[i] >= month[i-1]`) 代表跨年 → 年份 −1。

驗證：
- 卡B `[6,5,4,3,2]`：top 6（6>6 false→2026），其後嚴格遞減 → 全 2026。June=2026 ✓
- 卡A `[4,3,2,1,12,11,…,6]`：top 4→2026，1→12 未遞減→2025，其後遞減至 6→2025。June=2025 ✓
- 全無 2026 資料的卡：top 例如 11（11>6→2025）→ 整串 2025 ✓

## Next Action
- Route to: `spec-driven-dev:test-driven-development`（實作 bug，行為已明確）。
- Minimal fix/test direction:
  1. 重構 `parseMonthlySummary`：解析出有序月份後，用上述「位置/回繞」演算法一次指派全部年份，移除 per-row `inferMonthlySummaryYear` 的 `month < queryMonth` 比較。
  2. 測試覆蓋三種卡型：當月在最上（卡B）、同月在最底（卡A）、整串去年（無當月資料）。保留現有 fixture 迴歸。
  3. DB 校正：把 卡B 的 `(2025,6)` 改回 `(2026,6)`（確認無 `(2026,6)` 既存衝突）；卡A 維持 `(2025,6)` 不動。先 SELECT 預覽再改。

## Resolution (2026-06-16)
- Branch: `fix/tpass-year-inference-by-order`（backend repo）
- Red: `0dd31f8 test: red - infer summary year by official list order`
- Green: `b9b2ab2 fix(tpass): infer summary year by official list order`
- Refactor: `c0f8f9f refactor: simplify month-detail test helper with fmt.Sprintf`
- 修改：`pkg/tpass/parser.go` 以 `assignSummaryYears`（依官方清單順序逐列回推）取代 per-row `inferMonthlySummaryYear`
- 測試：`go test ./pkg/tpass/` 全綠（新增三卡型 + 既有 fixture 迴歸）；`go vet`、`gofmt` 乾淨
- ✅ 已部署（PR #2 squash 合併進 master，`deploy.sh` 四步通過、health check 綠）
- ✅ DB 校正完成（先部署後校正）：prod & dev 將 卡B `(2025,6)` → `(2026,6)`（各 1 列），卡A 維持 `(2025,6)`。驗證：卡B=2026/6、卡A=2025/6 兩 DB 一致。
