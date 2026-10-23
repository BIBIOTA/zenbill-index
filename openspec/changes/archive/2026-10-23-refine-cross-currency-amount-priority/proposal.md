## Why
跨幣別轉帳實際入帳時，銀行有點差與手續費，「實際扣款金額」與「實際入帳金額」兩個數字才是真相，匯率只是結果。
但目前 `computeCrossCurrencyAmount()` 以匯率為錨（rate-anchored）：表單已預填即時匯率時，使用者先填來源金額會算出目標金額，接著改目標金額卻會用匯率**反推覆寫來源金額**，無法照兩個實際金額記帳、讓系統算出匯率。

另外，編輯既有的跨幣轉帳時，表單的編輯紀錄從空開始，即時匯率預填會蓋掉當初存的匯率並重算目標金額；改其中一個金額也會用舊匯率覆寫另一個實際金額。

## What Changes
- **cross-currency-transfer（修改）**：
  - 推算規則改為「**被推算的欄位 = 最近兩個不同手動編輯欄位以外的那一個**」。只編輯過一個欄位時維持以匯率為錨推算另一個金額（含預填匯率），規則不依欄位是否為空，因此不會重現 0.03 卡住的問題（見 archive `2026-06-21-add-cross-currency-transfer-rate` progress 5.4）。
  - `shouldPrefillRate()` 改為「跨幣且未手動改過匯率、且未手動填過兩個金額」才預填。
  - 編輯既有跨幣轉帳時，編輯紀錄初始為 `['source', 'target']`；只在「由跨幣變為非跨幣」時清空編輯紀錄（帳戶清單載入前不清空）。
  - Web（`frontend/`）與 APP（`app/`）兩端 TransactionForm 同步調整。

## Non-goals
- 不改匯率方向（`來源 ÷ 目標`）、顯示方式與 4 位精度
- 不改後端與 DB schema
- 不處理「只填目標金額後預填匯率才回來」時不推算來源金額的既有行為

## Impact
- Affected specs: `specs/cross-currency-transfer/`（修改）
- Affected code: `packages/shared/src/utils/crossCurrency.ts`（+ 測試）、`frontend/src/components/transactions/TransactionForm.tsx`、`app/components/transactions/TransactionForm.tsx`
- Breaking changes: `shouldPrefillRate()` 簽章由 `(isCrossCurrency, rateManuallyEdited)` 改為 `(isCrossCurrency, lastEdited)`，僅兩端表單使用
