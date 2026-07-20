# Progress: debug-credit-card-defer-balance

## Session 1 — 2026-07-20 17:35
- Stage: TDD
- Task: 1.1 修正 `ListByAccountWithBalanceInDateRangeWithDeferred` 的 `balanceAtEnd` 計算，排除本期內已標記延期的交易
- Transition: not_started → in_progress
- Next action: 撰寫失敗測試，涵蓋 spec Scenario「Deferred-out transaction is excluded from the current period's balance」。

## Session 2 — 2026-07-20 17:50
- Stage: TDD
- Task: 1.1 修正 `ListByAccountWithBalanceInDateRangeWithDeferred` 的 `balanceAtEnd` 計算，排除本期內已標記延期的交易
- Transition: in_progress → passing
- Evidence:
  - Commits: 82d1f4c test: red - Deferred-out transaction is excluded from the current period's balance; 0200f40 feat: green - exclude deferred-out transactions from current period's balance anchor
  - Tests: `go test ./internal/usecase/... -run TestListByAccountWithBalanceInDateRangeWithDeferred` → `--- PASS: TestListByAccountWithBalanceInDateRangeWithDeferred_DeferredOutTransactionIsExcludedFromTheCurrentPeriodsBalance`；相關既有測試（`TestListByAccountWithBalance*`, `TestEffectiveAmount*`, `TestTransactionService_*`）全數維持通過。`go build ./...` 通過。（`internal/delivery/http` 套件既有一個與本次變更無關的 pre-existing 編譯錯誤 `tpass_handler_test.go:167 unknown field MonthlySummaries`，已用 `git stash` 驗證在本次變更前就存在，不在本次修正範圍。）
- Next action: 進入 task 1.2，撰寫「取消延期後餘額正確恢復」情境的測試。
- Blockers: 無（`internal/delivery/http` 的 pre-existing 編譯錯誤不阻擋本次修正，但會阻擋該套件的 `go test`；已記錄於 debugging 範圍外，交由後續獨立處理）

## Session 3 — 2026-07-20 17:52
- Stage: TDD
- Task: 1.2 驗證取消延期後餘額正確恢復
- Transition: not_started → in_progress
- Next action: 撰寫測試涵蓋 spec Scenario「Un-deferring a transaction restores it to the current period's balance」。

## Session 4 — 2026-07-20 17:58
- Stage: TDD
- Task: 1.2 驗證取消延期後餘額正確恢復
- Transition: in_progress → passing
- Evidence:
  - Commits: 65f5ca5 test: green - Un-deferring a transaction restores it to the current period's balance
  - Tests: `go test ./internal/usecase/... -run TestListByAccountWithBalanceInDateRangeWithDeferred -v` → both scenario tests `--- PASS`
- Next action: 進入 task 1.3，撰寫「上期延期進本期的交易餘額不需額外調整」回歸測試。
- Blockers: 無

## Session 5 — 2026-07-20 18:00
- Stage: TDD
- Task: 1.3 驗證上期延期進本期的交易餘額不需額外調整（回歸保護）
- Transition: not_started → in_progress
- Next action: 撰寫測試涵蓋 spec Scenario「Deferred-in transaction from the previous period is already reflected in the balance」。

## Session 6 — 2026-07-20 18:05
- Stage: TDD
- Task: 1.3 驗證上期延期進本期的交易餘額不需額外調整（回歸保護）
- Transition: in_progress → passing
- Evidence:
  - Commits: d6c6632 test: green - Deferred-in transaction from the previous period is already reflected in the balance
  - Tests: `go test ./internal/usecase/... -run TestListByAccountWithBalanceInDateRangeWithDeferred -v` → all 3 scenario tests `--- PASS`
- Next action: 進入 task 1.4，撰寫混合情境（清單與餘額一致性）測試。
- Blockers: 無

## Session 7 — 2026-07-20 18:07
- Stage: TDD
- Task: 1.4 驗證清單與餘額在混合情境下保持一致（清單/餘額必須共用同一套認定規則）
- Transition: not_started → in_progress
- Next action: 撰寫測試涵蓋 spec Scenario「List and balance stay consistent for a mixed period」。

## Session 8 — 2026-07-20 18:15
- Stage: TDD
- Task: 1.4 驗證清單與餘額在混合情境下保持一致（清單/餘額必須共用同一套認定規則）
- Transition: in_progress → passing
- Evidence:
  - Commits: 2d30919 test: green - List and balance stay consistent for a mixed period
  - Tests: `go test ./internal/usecase/... -run TestListByAccountWithBalanceInDateRangeWithDeferred -v` → all 4 scenario tests `--- PASS`; `go build ./...` passes.
- Next action: 所有 task 已完成，進入 spec-driven-dev:verification-before-completion。
- Blockers: 無
