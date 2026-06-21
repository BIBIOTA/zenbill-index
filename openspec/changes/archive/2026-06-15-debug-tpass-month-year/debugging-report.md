# Debugging Report: debug-tpass-month-year

Date: 2026-06-16
Debugger: Claude (claude-opus-4-8)

> Debugging-only artifact. Records root-cause investigation for the TPASS
> "幽靈 6 月資料" bug; no spec change yet.

## Symptom
- Reported behavior: 悠遊卡號末四碼 9011 在 2026 年 6 月「沒有乘車紀錄」，TPASS 同步後卻出現了一筆 2026/6 的月份明細，資料來源不明。
- Expected behavior: 2026 年 6 月（當月）不應出現任何明細；該卡若 6 月無乘車，就不該有 6 月資料。
- Impact: 月份明細年份錯置 → 估算回饋、前端「本月」統計、(user_id, card_id, year, month) 唯一鍵全部受污染。可能影響所有在「查詢當月」有同月份（上一年）資料列的卡片，非單一卡片。

## Reproduction
- Status: reproduced
- Steps:
  1. 取 `pkg/tpass/testdata/card_detail.html`（真實官網明細結構），把第一列月份由 `04` 改為 `06`，模擬滾動視窗中「與查詢同月、但屬去年」的資料列。
  2. 以 `queryDate = 2026-06-16` 呼叫 `ParseMonthlySummaryHTMLWithQueryDate`。
  3. 觀察 month==6 那列被推斷出的年份。
- Environment: macOS, Go 1.22, `pkg/tpass`（需 CGO flags：leptonica/tesseract）。
- Test data / record IDs: 卡號末四碼 9011；fixture 查詢日 2026/06/08。

## Observation Plan
| Layer | Observation method | Evidence captured |
|---|---|---|
| Browser/UI（官網） | fixture `card_detail.html` 內官方提醒文字 | 「★回饋金提醒（本網頁只能查前月回饋金，當月回饋金請於下個月查詢）」— 官網**永不**顯示當月資料 |
| Parser | `pkg/tpass/parser.go:216 inferMonthlySummaryYear` | 邊界條件 `month <= queryDate.Month()` 把「等於當月」誤判為今年 |
| Usecase | `internal/usecase/tpass_sync_service.go:278` buildMonthlySummary 直接採用 `row.Year` | 錯誤年份原樣寫入 DB，並以 (card, year, month) upsert |
| Reproduction test | 臨時 `pkg/tpass/repro_year_test.go`（已刪除） | June 列被標為 2026，斷言失敗 |

## Evidence
```text
=== RUN   TestRepro_CurrentMonthRowYearMisinferred
    repro_year_test.go:24: June row inferred year = 2026 (count=7). Expected 2025;
        current month is never shown by the official site.
    repro_year_test.go:26: BUG REPRODUCED: June row labeled 2026 but current-month
        data cannot exist; should be 2025
--- FAIL: TestRepro_CurrentMonthRowYearMisinferred

# 官方明細頁提醒（testdata/card_detail.html:90）
★回饋金提醒（本網頁只能查前月回饋金，當月回饋金請於下個月查詢）

# 問題程式碼 pkg/tpass/parser.go:216
func inferMonthlySummaryYear(month int, queryDate *time.Time) int {
    if queryDate == nil { return 0 }
    if month <= int(queryDate.Month()) {   // <-- BUG: 含「等於當月」
        return queryDate.Year()
    }
    return queryDate.Year() - 1
}
```

## Data Flow Trace
- Symptom observed at: DB / 前端出現卡 9011 的「2026 年 6 月」明細。
- First incorrect state found at: `inferMonthlySummaryYear(6, 2026-06)` 回傳 2026。
- Boundary where expected became actual: 官網滾動視窗中那列其實是 **2025 年 6 月**（官網永不顯示當月＝2026/6）；`<=` 把「month == 當月」歸給今年，年份 −1 沒被套用。

## Working Reference
- Reference: `TestParseMonthlySummaryHTMLExtractsRows`（月份 4/3/1 → 2026，12 → 2025）全數正確。
- Meaningful differences: 既有測試的月份都 **嚴格小於** 查詢月(6)，從未覆蓋「month == 查詢月」這個邊界，正是 bug 藏身處。改成 `<` 後既有測試仍全綠。

## Hypothesis
I think the root cause is **`inferMonthlySummaryYear` 的邊界用 `month <= queryDate.Month()`**，because 官網明細頁明文「只能查前月回饋金，當月不顯示」，因此資料列月份等於查詢當月時，必屬**去年**同月；現行 `<=` 卻把它判成今年，使去年 6 月的真實乘車資料被貼上「2026 年 6 月」標籤，看起來像「卡 9011 憑空多出 6 月資料」。資料是真的，只是年份錯置。

## Next Action
- Route to: `spec-driven-dev:test-driven-development`（實作有 approved 行為，屬實作 bug）。
- Minimal fix/test direction:
  1. 把 `parser.go:216` 的 `month <= int(queryDate.Month())` 改為 `month < int(queryDate.Month())`。
  2. 新增覆蓋邊界的測試：queryDate 6 月 + 月份 6 的列 → 應為 **2025**（保留現有 4/3/1/12 案例為迴歸）。
  3. 修後對既有 DB 做一次資料校正評估：先前同步若把「當月」列寫成今年，需把該列年份 −1（或重新同步覆蓋）。

## Resolution (2026-06-16)
- Branch: `fix/tpass-month-year-inference`（backend repo）
- Red: `f6b4482 test: red - month equal to query month infers previous year`
- Green: `a6bc785 fix(tpass): infer previous year for summary row equal to query month`
- 修改：`pkg/tpass/parser.go` `inferMonthlySummaryYear` `month <= queryMonth` → `month < queryMonth`
- 測試：`go test ./pkg/tpass/` 全綠（新增邊界測試 + 既有 4/3/1/12 迴歸）；`go vet` 乾淨
- ⏳ 未處理：既有 DB 的歷史污染資料校正（step 3）——待使用者決定一次性校正或重新同步覆蓋。
