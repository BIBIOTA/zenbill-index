## Why
跨幣別轉帳換算時，`computeCrossCurrencyAmount()` 不分幣別一律四捨五入到小數 2 位，轉入 TWD / JPY 這類實務上無小數的幣別會算出 `81821.32` 之類的金額，使用者只能另外記一筆尾差交易把餘額補回銀行實際入帳的整數。系統目前沒有「幣別精度」的概念：輸入、換算、顯示都不知道某幣別該有幾位小數。

本次變更引入「幣別精度（decimal places）」：預設依 ISO 4217 小數位數（TWD / JPY / KRW / VND 覆寫為 0），使用者可於「幣別單位」設定頁針對每個幣別覆寫；精度套用於跨幣別換算結果、金額輸入限制、以及金額顯示格式。

## What Changes
- **currency-precision（新）**：
  - `packages/shared/` 新增 ISO 4217 小數位數靜態表 + 覆寫（TWD / JPY / KRW / VND = 0）+ 解析函式（使用者設定 → 覆寫 → ISO → 預設 2）
  - 後端 `user_currency_settings` 新增可為 null 的 `decimal_places`（0～4），`GET/PUT /currency-settings` 帶此欄位並驗證；後端不做換算與四捨五入
  - Web / APP「幣別單位」設定頁每列新增小數位數下拉（預設（N）/ 0～4）；存檔規則改為「multiplier ≠ 1 或有設定小數位數」即送出
  - 金額輸入限制：交易金額、轉帳目標金額、帳戶初始餘額、外幣消費原始金額依幣別精度驗證（以 `輸入值 × multiplier` 判定）
  - 共用 `formatAmount()`：固定顯示至幣別精度位數，套用於帳戶、交易、首頁總覽、報表
- **cross-currency-transfer（修改）**：換算出的金額改為依「該欄幣別精度 + multiplier」四捨五入（half-up），不再固定 2 位；匯率維持使用者/API 原值，不因金額四捨五入回推

## Non-goals
- 不修正既有資料（prod 已有帶小數的 TWD/JPY 交易與使用者手動補的尾差交易，另開需求處理）
- 後端不做換算、四捨五入或精度驗證交易金額
- 共同帳本（shared ledger）支出表單不在範圍內
- 編輯舊交易時，若金額未變更則不做精度驗證

## Impact
- Affected specs: `specs/currency-precision/`（新）、`specs/cross-currency-transfer/`（修改）
- Affected code:
  - `packages/shared/`（精度表、`resolveDecimals()`、`roundToCurrency()`、`validateAmountPrecision()`、`formatAmount()`、`computeCrossCurrencyAmount()` 簽章、`CurrencySetting` 型別）
  - `backend/internal/domain/currency_setting.go`、`usecase/currency_setting_service.go`、`delivery/http/currency_setting_handler.go`
  - `frontend/src/pages/CurrencySettingsPage.tsx`、`app/app/settings/currency-units.tsx`
  - 兩端 `TransactionForm.tsx`、帳戶建立/編輯表單、帳戶/交易/總覽/報表的金額顯示
- DB migration: `user_currency_settings.decimal_places`（nullable smallint）。prod 會自行 AutoMigrate；dev 需手動執行 `cmd/migrate`
- Breaking changes: No（新欄位可為 null；舊 client 不送此欄位時行為等同「預設」）

## Related Artifacts
- [design.md](./design.md)
- [tasks.md](./tasks.md)
