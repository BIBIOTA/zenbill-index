# Debugging Report: debug-credit-card-cycle-expense-scope-check

Date: 2026-07-20
Debugger: Claude (Sonnet 5)

## Symptom
- Reported behavior：使用者詢問，先前針對「信用卡帳務標記移動到下期後，本期餘額計算沒有跟著移動」的修正（已於 `2026-07-20-debug-credit-card-defer-balance` 完成並封存），是否也一併修正了「本期支出」的重新計算。
- Expected behavior：確認「本期支出」（Web/APP 帳戶詳細頁顯示的本期消費總額）在交易被標記延期後，是否也正確地把該筆金額移到下一期。
- Impact：釐清修正範圍是否有遺漏，避免使用者誤以為某個數字還沒修好，或誤以為某個已經是對的數字被改壞。

## Reproduction
- Status: not applicable（本次為程式碼追蹤式的範圍確認，非重現一個新 bug；未實際跑 UI 操作）
- Steps: 追蹤「本期支出」數字在前端（Web + APP）的計算來源，回溯到後端 API 與 repository 層，確認它與先前已修正的 `balanceAtEnd`／`RunningBalance` 是否共用同一份資料。

## Observation Plan
| Layer | Observation method | Evidence captured |
|---|---|---|
| Frontend (Web) | 閱讀 `frontend/src/pages/AccountDetailPage.tsx` 原始碼，追蹤 `cycleExpenseTotal` 變數來源與顯示位置 | 第 66 行請求帶入 `prev_start_date`/`prev_end_date`；第 150-158 行 `cycleExpenseTotal` 由 `transactions.reduce(...)` 計算；第 528 行顯示為「本期支出」標籤 |
| Frontend (APP) | 閱讀 `app/app/accounts/[id].tsx` 原始碼 | 第 66-76 行請求同樣帶入 `prev_start_date`/`prev_end_date`；第 85-91 行 `cycleExpenseTotal` 計算方式與 Web 完全一致 |
| API/backend | 閱讀 `internal/delivery/http/transaction_handler.go` 的 `ListTransactions`（約第 171-211 行）| 當請求帶 `prev_start_date`/`prev_end_date` 時，會呼叫 `txService.ListByAccountWithBalanceInDateRangeWithDeferred`（已於前次修正）取得交易清單與 running balance |
| Database/persistence | 閱讀 `internal/repository/transaction_repository.go` 的 `FindByAccountIDAndDateRangeWithDeferred`（第 355-378 行）| 確認此查詢在**修正前後皆未變更**——它原本就正確依 `billing_period_deferred` 過濾（本期排除 `= true` 的、上期併入 `= true` 的），這是先前除錯報告中已確認「清單本身是對的，錯的是餘額錨點」的部分 |
| Environment/build | 額外核對 `internal/repository/transaction_repository.go` 的 `GetMonthlyStats`（第 248-296 行，`GET /transactions/stats`）| 這是「跨帳戶、依日曆月份」的儀表板統計，與信用卡「本期」（帳單週期）概念不同，且完全不處理 `billing_period_deferred`；不是「本期支出」這個 UI 數字的資料來源，故不在本次修正範圍內，但列為潛在待觀察項目 |

## Evidence
```text
frontend/src/pages/AccountDetailPage.tsx:66
  ...(prevCycle ? { prev_start_date: prevCycle.startDate, prev_end_date: prevCycle.endDate } : {}),

frontend/src/pages/AccountDetailPage.tsx:150-158
  const cycleExpenseTotal = cycle
    ? transactions.reduce((sum, tx) => {
        if (tx.type === 'EXPENSE') return sum + Math.abs(tx.amount)
        if (tx.type === 'INCOME') return sum - Math.abs(tx.amount)
        return sum
      }, 0)
    : 0

frontend/src/pages/AccountDetailPage.tsx:528
  本期支出 <span ...>{getCurrencySymbol(account.currency)}{cycleExpenseTotal.toLocaleString()}</span>

app/app/accounts/[id].tsx:66-91
  （App 端邏輯與 Web 端一致：同樣以 prev_start_date/prev_end_date 呼叫 API，
   同樣用 transactions.reduce(...) 計算 cycleExpenseTotal）

internal/repository/transaction_repository.go:355-378 (FindByAccountIDAndDateRangeWithDeferred)
  Where(
      "(account_id = ? OR target_account_id = ?) AND ("+
          "(occurred_at >= ? AND occurred_at <= ? AND billing_period_deferred = false) OR "+
          "(occurred_at >= ? AND occurred_at <= ? AND billing_period_deferred = true)"+
          ")", ...)
  — 此查詢在本次除錯的兩個修正（原始 balanceAtEnd 修正 + 本次範圍確認）前後皆未變更，因為它從一開始就是對的。
```

## Data Flow Trace
- 「本期支出」數字的資料來源：前端對 `/transactions?...&prev_start_date=...&prev_end_date=...` 的回應 `data`（交易陣列），在前端用 `reduce` 加總 EXPENSE 減 INCOME。
- 這個交易陣列由後端 `FindByAccountIDAndDateRangeWithDeferred` 產生，其 WHERE 子句從最初就正確依 `billing_period_deferred` 篩選（本期排除已標記延期的，上期併入已標記延期的）。
- 先前的 bug 只存在於**另一個獨立計算**：`balanceAtEnd`（`ListByAccountWithBalanceInDateRangeWithDeferred` 內，用來推算每筆交易旁顯示的 `RunningBalance`／APP 端的「餘額」欄位），因為它是用 `accountBalance - SumEffectiveAmountAfterDate(...)` 這條完全獨立於 `billing_period_deferred` 的公式算出來的。
- 因此「本期支出」（加總交易陣列金額）與「本期餘額／RunningBalance」（用 balanceAtEnd 公式往回推算）雖然都顯示在同一個帳戶詳細頁，但走的是兩條不同的計算路徑；前者從未出過問題，後者是先前修正的對象。

## Working Reference
- Reference：`internal/usecase/transaction_deferred_balance_test.go` 中 `TestListByAccountWithBalanceInDateRangeWithDeferred_ListAndBalanceStayConsistentForAMixedPeriod` 已經涵蓋「清單成員」與「逐筆餘額」在混合情境下的一致性檢查，間接證明清單本身（本期支出加總的資料來源）在延期情境下是正確的。
- Meaningful differences：無需額外程式碼差異比對——本次確認的結論是「本期支出」的計算路徑與已修正的 `balanceAtEnd` 路徑本來就是分開的，且前者從未受到那個 bug 影響。

## Hypothesis
「本期支出」（cycleExpenseTotal）**在先前的修正之前就已經是正確的**，因為它是直接加總交易列表（`transactions.reduce`），而交易列表的篩選邏輯（`FindByAccountIDAndDateRangeWithDeferred` 的 `billing_period_deferred` 過濾）從一開始就沒有 bug——有 bug 的是另一個獨立的餘額錨點公式（`balanceAtEnd`），只影響每筆交易旁顯示的「餘額」欄位（`RunningBalance` / APP 端的「餘額」數字），不影響「本期支出」這個加總數字。**先前的修正（commits 82d1f4c / 0200f40 等）已經完整修正了「餘額」欄位的問題，而「本期支出」則本來就不需要修正、也沒有被改動。**

## Next Action
- Route to: 無需進一步修正實作；本次為範圍確認，結論已足夠回覆使用者問題。
- Minimal fix/test direction: 若日後想更嚴謹地保證兩者不會再次分岔，可以考慮新增一個整合層級測試，斷言「本期支出」（交易金額加總）與「RunningBalance 差額加總」在延期情境下彼此一致（目前已有 unit test 從 `RunningBalance` 面向涵蓋，但沒有從『交易金額加總』面向另外驗證）。非必要，屬於加固建議，非本次問題所需。
- 額外觀察項（不在本次範圍）：`GetMonthlyStats`（`GET /transactions/stats`，儀表板用的跨帳戶月度統計）完全不處理 `billing_period_deferred`，語意上是「日曆月」而非「信用卡帳單週期」，目前判斷不屬於「本期支出」這個 UI 數字的資料來源，但如果之後有人把它誤用在信用卡帳單情境，會重現類似的 bug 模式，值得留意。
