## Why
當使用者在不同幣別的帳戶間轉帳（例如 USD 帳戶 → TWD 帳戶）時，APP 端的轉帳表單只送出單一 `amount` 與 `target_account_id`，沒有匯率換算。後端會把相同數字當成目標幣別金額入帳（轉 100 USD 進 TWD 帳戶會被記成 100 TWD），造成餘額錯誤。後端 domain 與 API 其實已支援儲存匯率與目標幣別金額，Web 端也已有換算邏輯但內嵌且未接即時匯率，APP 端則完全缺漏。本次變更讓使用者在跨幣別轉帳時可手動填入匯率（並由系統預填即時匯率、可覆寫）以正確換算。

## What Changes
- **cross-currency-transfer**: 抽出共享換算純函式（編輯來源/目標/匯率任兩欄自動算第三欄）、新增匯率預填 hook（沿用既有 `/exchange-rates` endpoint，可覆寫）、APP 端補齊整套跨幣別轉帳 UI、Web 端重構為呼叫共享函式並接上預填。後端不變更。
- **修正（manual smoke finding）**：換算函式加入「單一空欄主規則」——預填匯率視為有效運算元，使用者只輸入一個金額即自動算出另一個，避免「預填匯率＋只填轉出金額」時轉入金額維持 0、送出造成目標帳戶入帳 0 的記帳錯誤。

## Impact
- Affected specs: `specs/cross-currency-transfer/`
- Affected code: `packages/shared/`（新增 `computeCrossCurrencyAmount()`、`useExchangeRate()`）、`frontend/src/components/transactions/TransactionForm.tsx`、`app/components/transactions/TransactionForm.tsx`。後端（`backend/`）不變更。
- Breaking changes: No（既有 API 與資料結構不變；前端送出欄位沿用既有 `original_amount` / `original_currency` / `exchange_rate`）

## Related Artifacts
### Design
- [design.md](./design.md)
- [tasks.md](./tasks.md)
