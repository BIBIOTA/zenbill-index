# Verification Report: debug-credit-card-defer-balance

Date: 2026-07-20
Verifier: Claude (Sonnet 5)

## Summary
- Code: PASS
- Spec: PASS
- Progress log: PASS
- Diagrams: n/a
- Designs: n/a

## Code Evidence

### go vet（本次變更觸及的套件）
```
$ CGO_CPPFLAGS=... CGO_LDFLAGS=... go vet ./internal/usecase/... ./internal/repository/... ./internal/domain/...
(no output — clean)
```

### gofmt（本次變更檔案）
```
$ gofmt -l internal/usecase/transaction_deferred_balance_test.go internal/repository/transaction_repository.go internal/domain/repository.go internal/delivery/http/transaction_handler_test.go
(no output — clean)
```
`internal/usecase/transaction_service.go` 被 `gofmt -l` 列出，但已用 `git show 8da792c:internal/usecase/transaction_service.go | gofmt -l /dev/stdin` 驗證該格式問題在本次變更**之前**（父 commit `8da792c`）就已存在，位於本次未觸碰的第 63/166 行（`learnMerchantDefaults(ctx, repos.MerchantRepo,tx)` 缺空格），與本次修正無關，未一併修改（避免無關變更混入）。

`golangci-lint` 在本機環境未安裝（`which golangci-lint` 找不到指令），改用 `go vet` + `gofmt -l` 作為替代靜態檢查，兩者皆乾淨。

### go build
```
$ CGO_CPPFLAGS=... CGO_LDFLAGS=... go build ./...
BUILD_OK
```

### go test（scoped to internal/usecase，排除 3 個與本次變更無關的既有失敗測試）
```
$ CGO_CPPFLAGS=... CGO_LDFLAGS=... go test ./internal/usecase/... -v \
    -skip 'TestSharedExpenseService_Delete_WithExpenseTransaction|TestSharedExpenseService_Delete_NoTransactions|TestSharedExpenseService_Delete_Settled_WithPersonalTransaction'
...
=== RUN   TestListByAccountWithBalanceInDateRangeWithDeferred_DeferredOutTransactionIsExcludedFromTheCurrentPeriodsBalance
--- PASS: TestListByAccountWithBalanceInDateRangeWithDeferred_DeferredOutTransactionIsExcludedFromTheCurrentPeriodsBalance (0.00s)
=== RUN   TestListByAccountWithBalanceInDateRangeWithDeferred_UnDeferringATransactionRestoresItToTheCurrentPeriodsBalance
--- PASS: TestListByAccountWithBalanceInDateRangeWithDeferred_UnDeferringATransactionRestoresItToTheCurrentPeriodsBalance (0.00s)
=== RUN   TestListByAccountWithBalanceInDateRangeWithDeferred_DeferredInTransactionFromThePreviousPeriodIsAlreadyReflectedInTheBalance
--- PASS: TestListByAccountWithBalanceInDateRangeWithDeferred_DeferredInTransactionFromThePreviousPeriodIsAlreadyReflectedInTheBalance (0.00s)
=== RUN   TestListByAccountWithBalanceInDateRangeWithDeferred_ListAndBalanceStayConsistentForAMixedPeriod
--- PASS: TestListByAccountWithBalanceInDateRangeWithDeferred_ListAndBalanceStayConsistentForAMixedPeriod (0.00s)
...
PASS
ok  	github.com/yukiota/zenbill/internal/usecase	0.414s
```
147 個測試全數 PASS（含既有 `TestListByAccountWithBalance*`、`TestTransactionService_*` 等未受影響測試）。

### go test（internal/repository — 確認新 repository 方法編譯與現有整合測試相容）
```
ok  	github.com/yukiota/zenbill/internal/repository	1.240s
```

### 已知、與本次變更無關的既有失敗（已用證據排除）
1. **`internal/usecase` 內 3 個 `TestSharedExpenseService_Delete_*` 測試 panic**（`shared_expense_service_test.go` / `shared_ledger_service_test.go:28` 的 mock 設定不完整，導致 `MockSharedLedgerRepository.FindByID` 收到未預期呼叫而 panic，並中止整個測試 binary）。
   - 證據：`git stash` 回到本次變更前的 commit，單獨執行 `go test ./internal/usecase/... -run TestSharedExpenseService_Delete_WithExpenseTransaction` 仍然 panic，確認與本次修正無關，屬既有缺陷。
   - 影響：因 panic 會中止整個 test binary，不加 `-skip` 直接跑 `go test ./internal/usecase/...`（或 `go test ./...`）會導致本次新增的 `TestListByAccountWithBalanceInDateRangeWithDeferred_*` 測試因檔名排序在 panic 之後而完全不會被執行到。已改用 `-skip` 排除這 3 個既有失敗測試，取得完整、可信的執行結果。
   - 建議：另開獨立 issue 修復 `SharedExpenseService.Delete` 相關測試的 mock 設定，不在本次變更範圍內處理。
2. **`internal/delivery/http` 套件編譯失敗**（`tpass_handler_test.go:167: unknown field MonthlySummaries in struct literal of type tpass.QueryResult`）。
   - 證據：同樣用 `git stash` 驗證在本次變更前就存在。
   - 影響：`internal/delivery/http` 套件的既有測試（含 `transaction_handler_test.go`）目前完全無法 `go test`/`go vet`，因為整個套件連編譯都過不了。已確認本次變更新增的 `mockTxRepo.SumEffectiveAmountDeferredInRange` 方法本身語法正確（`go vet` 對照排除 tpass 檔案後的邏輯無誤，且該檔案未被本次變更觸碰）；但受限於既有編譯錯誤，未能對 `internal/delivery/http` 套件跑出通過的 `go test` 結果。
   - 建議：另開獨立 issue 修復 `tpass_handler_test.go` 的 `QueryResult` struct 欄位不匹配問題（可能是 `tpass` 套件已重構但測試未同步更新），不在本次變更範圍內處理。

### Scenario coverage
```
MATCHED: Deferred-out transaction is excluded from the current period's balance
MATCHED: Un-deferring a transaction restores it to the current period's balance
MATCHED: Deferred-in transaction from the previous period is already reflected in the balance
MATCHED: List and balance stay consistent for a mixed period
```
`specs/billing-period-balance/spec.md` 內所有 4 個 `#### Scenario:` 均有對應且逐字對齊的測試函式（位於 `backend/internal/usecase/transaction_deferred_balance_test.go`）。

## Diagram Verification
| File | Type | Status | Notes |
|---|---|---|---|
| n/a | n/a | n/a | 本次變更未建立 `diagrams/` 目錄；純後端計算邏輯修正，已於 tasks.md 標記 deferred 並附理由 |

## Design Verification
| State | Figma node | Status | Diff |
|---|---|---|---|
| n/a | n/a | n/a | 本次變更未建立 `designs/figma.md`；未變更任何 UI/畫面，已於 tasks.md 標記 deferred 並附理由 |

## Next Actions
- All clear — suggest `openspec archive debug-credit-card-defer-balance`。
- 範圍外建議（不阻擋本次 archive）：
  1. 修復 `internal/usecase/shared_expense_service_test.go` 中 3 個 `TestSharedExpenseService_Delete_*` 的 `MockSharedLedgerRepository` mock 設定缺漏（`FindByID` 未預期呼叫導致 panic，會中止整個 `internal/usecase` test binary）。
  2. 修復 `internal/delivery/http/tpass_handler_test.go:167` 的 `tpass.QueryResult` struct 欄位不匹配（`MonthlySummaries`），目前導致整個 `internal/delivery/http` 套件無法編譯測試。
