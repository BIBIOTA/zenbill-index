# Debugging Report: debug-credit-card-defer-balance

Date: 2026-07-20
Debugger: Claude (Sonnet 5)

## Symptom
- 回報行為：信用卡帳務被使用者標記「移動到下期」後，該筆交易正確從當期的交易列表中消失，但**當期的餘額計算（每筆交易旁顯示的累計/剩餘金額）沒有跟著把這筆交易的金額移到下期**，該期其餘交易的餘額因此仍然包含這筆已移動交易的影響。
- 預期行為：一旦交易被標記 `billing_period_deferred = true`，該筆交易的金額不應再計入原本期別的餘額計算，應完全移至下一期。
- 影響：使用者看到的信用卡帳單金額（該期累計餘額）與實際「應繳金額」不一致，可能誤導使用者對帳。

## Reproduction
- Status: reproduced（單元測試層級重現，未透過 UI/DB 手動重現，但已從程式碼路徑精確定位並用最小 mock 測試證實）
- Steps（程式碼層重現）：
  1. 建立一筆交易 B（未被標記 deferred，金額 -200，屬於本期）。
  2. 建立一筆交易 A（原本屬於本期，被使用者標記 `billing_period_deferred = true`，金額 -100）。
  3. 呼叫 `TransactionService.ListByAccountWithBalanceInDateRangeWithDeferred(ctx, accountID, accountBalance=10000, periodStart, periodEnd, prevStart, prevEnd, ...)`。
  4. 觀察回傳的 B 交易之 `RunningBalance`。
- 環境：Go 單元測試（`backend/internal/usecase`），使用 mock repository，不需資料庫。
- 測試資料：mock `FindByAccountIDAndDateRangeWithDeferred` 回傳僅含 B（模擬 DB 查詢已正確依 `billing_period_deferred` 過濾掉 A）；mock `SumEffectiveAmountAfterDate` 回傳 0（模擬期末後無交易）。
- 結果：`RunningBalance` = **10000**（未反映 A 被移出的 -100 影響），而正確值應為 **10100**（`accountBalance - A之影響 = 10000 - (-100)`）。已用暫存測試檔重現後刪除（未納入正式測試套件，因為修正應隨附正式回歸測試）。

## Observation Plan
| Layer | Observation method | Evidence captured |
|---|---|---|
| Repository (SQL 查詢) | 閱讀 `TransactionRepositoryImpl.FindByAccountIDAndDateRangeWithDeferred` 與 `SumEffectiveAmountAfterDate` 原始碼 | 確認前者有依 `billing_period_deferred` 過濾，後者完全沒有 |
| Usecase（餘額計算） | 閱讀 `TransactionService.ListByAccountWithBalanceInDateRangeWithDeferred` 原始碼 + 撰寫最小單元測試重現 | 確認 `balanceAtEnd` 計算不受 deferred flag 影響，重現出錯誤數值 10000 |
| Delivery/HTTP | 閱讀 `transaction_handler.go` 呼叫端 | 確認 `account.Balance`（真實、即時累計餘額）直接傳入作為錨點，沒有做任何 deferred 校正 |
| 既有測試涵蓋率 | grep 搜尋 `_test.go` 中 `WithDeferred` 相關測試 | 確認 `ListByAccountWithBalanceInDateRangeWithDeferred` 完全沒有專屬單元測試，只有 mock 方法簽章存在（`transaction_service_test.go:122`），佐證此路徑先前未被驗證過 |
| Database | 未執行（本次未連接測試 DB） | 不需要，因為問題出在 Go 計算邏輯本身，SQL 查詢本身（過濾清單）是正確的 |

## Evidence

```go
// backend/internal/repository/transaction_repository.go:215-239
// SumEffectiveAmountAfterDate 完全沒有考慮 billing_period_deferred，
// 只用 occurred_at > afterDate 篩選：
func (r *TransactionRepositoryImpl) SumEffectiveAmountAfterDate(ctx context.Context, accountID uuid.UUID, afterDate time.Time) (float64, error) {
	...
	Where("(account_id = ? OR target_account_id = ?) AND occurred_at > ?", accountID, accountID, afterDate).
	...
}
```

```go
// backend/internal/usecase/transaction_service.go:399-446
func (s *TransactionService) ListByAccountWithBalanceInDateRangeWithDeferred(...) {
	allTxs, err := s.txRepo.FindByAccountIDAndDateRangeWithDeferred(...) // 正確依 deferred flag 過濾清單
	...
	sumAfter, err := s.txRepo.SumEffectiveAmountAfterDate(ctx, accountID, endDate) // 只看 occurred_at，忽略 deferred flag
	...
	balanceAtEnd := accountBalance - sumAfter // 錨點餘額仍包含已被移出本期的交易金額
	...
}
```

重現測試輸出：
```text
=== RUN   TestRepro_DeferredTransaction_BalanceAnchorIgnoresDeferredFlag
    deferred_balance_repro_test.go:55: running balance for B (only tx shown this period) = 10000
--- PASS
```
（此測試斷言目前的錯誤值 10000，並反向驗證正確值應為 10100 —— 測試檔已在確認後刪除，未提交，正式修正時應補上等價的回歸測試。）

## Data Flow Trace
- 症狀觀察點：前端顯示的該期交易列表旁「累計餘額」欄位。
- 第一個出錯狀態：`ListByAccountWithBalanceInDateRangeWithDeferred` 內的 `balanceAtEnd := accountBalance - sumAfter`。
- 出錯邊界：`SumEffectiveAmountAfterDate`（repository 層）與「清單過濾邏輯」（`FindByAccountIDAndDateRangeWithDeferred`）之間出現不一致 —— 清單過濾**有**尊重 `billing_period_deferred`，但用來當作餘額計算錨點的 SQL 加總**沒有**尊重它。兩者對「這筆交易算不算這一期」的認定不同步。

## Working Reference
- 參考對照：`ListByAccountWithBalanceInDateRange`（無 deferred 版本，`transaction_service.go:347` 附近）與其單元測試 `TestListByAccountWithBalanceInDateRange*`（`transaction_running_balance_test.go:166-264`）。
- 有意義的差異：非 deferred 版本裡，「清單所含交易」與「餘額計算所依據的時間範圍」是同一套邏輯（都是單純的 `occurred_at` 範圍），兩者天生一致，所以沒有這個問題。而 `WithDeferred` 版本引入了「清單依 `billing_period_deferred` 重新分類」的邏輯，但餘額錨點計算 (`SumEffectiveAmountAfterDate`) 卻仍套用舊版「只看 `occurred_at`」的邏輯，沒有同步更新以尊重 `billing_period_deferred`，造成兩套真相不一致。

## Hypothesis
我認為根本原因是：**`SumEffectiveAmountAfterDate`（以及依賴它計算 `balanceAtEnd` 的 `ListByAccountWithBalanceInDateRangeWithDeferred`）在計算期末餘額錨點時，完全沒有考慮 `billing_period_deferred` 旗標，只用真實的 `occurred_at` 時間做判斷。** 因此當一筆交易被標記為 deferred（邏輯上移到下一期）後：
- 交易列表（`FindByAccountIDAndDateRangeWithDeferred`）正確地將它從本期清單移除、歸入下期。
- 但餘額錨點（`balanceAtEnd = accountBalance - sumAfter`）仍然把這筆交易的金額當作「已發生在本期或更早」而納入計算基礎，因為它的 `occurred_at` 確實落在本期範圍內，`SumEffectiveAmountAfterDate` 對此視而不見。
- 結果：從 `balanceAtEnd` 往回逐筆扣減清單中交易金額所得出的各筆「累計餘額」，全部多算/少算了這筆被移動交易的金額，造成使用者回報的「餘額沒有跟著這筆交易一起移到下期」。

## Next Action
- Route to: `spec-driven-dev:writing-spec`（先確認並補上「信用卡帳期延期交易」對於期末餘額計算的正確行為規格，因為目前 SPEC.md 對此餘額計算邊界情況未見明確定義），再視情況銜接 `spec-driven-dev:test-driven-development` 進行修正。
- Minimal fix/test direction（供後續實作參考，尚未實作）：
  - 需要讓「餘額錨點計算」與「清單過濾邏輯」共用同一套 `billing_period_deferred` 認定規則。可行方向：
    1. 新增/修改 repository 方法，讓餘額計算的加總也能依 `billing_period_deferred` 排除「本期內但已標記 deferred」的交易，並排除「上期內但已標記 deferred（已算入本期清單）」的交易在 `sumAfter` 之前的重複計算（需仔細處理，避免雙重調整）。
    2. 或者改用「先計算不含 deferred 概念的真實期末餘額，再加/減每筆被 deferred 移入/移出本期的金額差」的方式修正 `balanceAtEnd`。
  - 需補上單元測試：至少涵蓋「本期交易被標記 deferred 移出」與「上期交易被標記 deferred 移入本期」兩種情境下的 `RunningBalance` 正確性，填補目前 `ListByAccountWithBalanceInDateRangeWithDeferred` 完全沒有專屬測試的空缺。
