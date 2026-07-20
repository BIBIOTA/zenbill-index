## Why
信用卡帳期檢視功能允許使用者將某筆交易標記為「延期到下一期」（`billing_period_deferred = true`），交易列表會正確地將該筆交易從本期清單移到下一期清單。但本期「累計餘額」（每筆交易旁顯示的 running balance）的計算錨點 `balanceAtEnd`（見 `debugging-report.md`）完全沒有考慮 `billing_period_deferred` 旗標，只依真實 `occurred_at` 時間判斷。結果是：交易被標記延期後從清單消失了，但它的金額仍留在本期餘額計算基礎裡，導致本期其餘交易顯示的累計餘額仍隱含這筆已移出交易的影響，與使用者預期（延期＝完全移到下一期，包含金額）不符。

此規格補齊「信用卡帳期延期交易對期末餘額計算」這個先前未被規格化、也未被測試涵蓋的行為邊界。

## What Changes
- **billing-period-balance**：修正 `TransactionService.ListByAccountWithBalanceInDateRangeWithDeferred` 的餘額錨點計算，使其排除「本期內但已標記延期」的交易金額，讓延期交易的餘額影響隨交易一起完全移到下一期；並明確規格化「上期延期進本期」的交易金額應維持計入本期餘額（因為它們的真實發生時間本就早於本期期末，不需額外調整）。

## Impact
- Affected specs: `specs/billing-period-balance/`
- Affected code: `backend/internal/usecase/transaction_service.go`（`ListByAccountWithBalanceInDateRangeWithDeferred` 及其餘額錨點計算邏輯，必要時新增/調整 `backend/internal/repository/transaction_repository.go` 的加總方法或呼叫方式）
- Breaking changes: No（純粹修正既有計算邏輯的正確性，不變更 API 介面、request/response 結構或資料庫欄位）

## Related Artifacts
### Design
- [debugging-report.md](./debugging-report.md)

（本次變更為除錯導向修正，未經過 `brainstorming`/`design.md` 流程；根本原因分析與證據已記錄於 `debugging-report.md`，作為本規格的設計依據。）
