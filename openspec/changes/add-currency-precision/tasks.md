# Tasks: add-currency-precision

## 1. 共享層（packages/shared）
- [x] 1.1 新增 ISO 4217 小數位數表與 `resolveDecimals(currency, settings)`
  - Acceptance: WHEN 使用者設定 `decimal_places` 非 null THEN 回傳設定值
  - Acceptance: WHEN 無設定且幣別為 TWD / JPY / KRW / VND THEN 回傳 0
  - Acceptance: WHEN 無設定且幣別為 KWD / BHD / OMR / JOD / TND / IQD / LYD THEN 回傳 3
  - Acceptance: WHEN 幣別代碼不在表內 THEN 回傳 2
  - Acceptance: 不使用 `Intl`
  - Depends on: -
  - Independence: independent
  - status: complete
- [x] 1.2 新增 `roundToCurrency(display, decimals, multiplier)` 與 `validateAmountPrecision(display, decimals, multiplier)`
  - Acceptance: WHEN VND（0 位）multiplier 1000、display 50.5 THEN 驗證通過；50.5005 THEN 驗證失敗
  - Acceptance: WHEN 四捨五入 THEN 採 half-up，且容忍浮點誤差（例如 `1.005` 於 2 位 → `1.01`）
  - Depends on: -
  - Independence: independent
  - status: complete
- [x] 1.3 新增 `formatAmount(value, currency, settings)`
  - Acceptance: WHEN 5 USD（2 位）THEN `5.00`；1234.57 TWD（0 位）THEN `1,235`；1.5 KWD THEN `1.500`
  - Depends on: 1.1
  - Independence: serial
  - status: complete
- [x] 1.4 `computeCrossCurrencyAmount()` 改為依幣別精度四捨五入
  - Acceptance: 輸入新增來源與目標的 `{ decimals, multiplier }`；算出的金額以 `roundToCurrency` 處理，取代固定 2 位
  - Acceptance: WHEN 16577 TWD、rate 0.2026、目標 JPY THEN target = 81821
  - Acceptance: WHEN 金額被四捨五入 THEN 回傳的 rate 等於輸入的 rate
  - Acceptance: WHEN 反推匯率 THEN 維持 4 位小數
  - Acceptance: 既有 `crossCurrency.test.ts` 情境更新簽章後全數通過
  - Depends on: 1.2
  - Independence: serial
  - status: complete
- [x] 1.5 `CurrencySetting` 型別與 `UpdateCurrencySettingsInput` 新增 `decimal_places?: number | null`
  - Depends on: -
  - Independence: independent
  - status: complete

## 2. 後端（backend/）
- [x] 2.1 `domain.CurrencySetting` 新增 `DecimalPlaces *int`（smallint, nullable）
  - Acceptance: WHEN 執行 `cmd/migrate` THEN `user_currency_settings.decimal_places` 欄位存在且既有資料為 null
  - Depends on: -
  - Independence: independent
  - status: complete
- [x] 2.2 `CurrencySettingService.UpdateSettings` 驗證 `decimal_places`
  - Acceptance: WHEN 非 null 且不在 0～4 THEN 回傳錯誤（handler 回 400）
  - Acceptance: WHEN null THEN 接受
  - Acceptance: usecase 單元測試涵蓋上述情境
  - Depends on: 2.1
  - Independence: serial
  - status: complete
- [x] 2.3 Handler request / response 帶 `decimal_places`
  - Acceptance: WHEN PUT 帶 `decimal_places: 0` THEN GET 回傳 0；未帶 THEN 回傳 null
  - Depends on: 2.1
  - Independence: serial
  - status: complete
- [x] 2.4 repository 整合測試（`APP_ENV=test`，確認連到 5435，避免測試靜默 skip）
  - Depends on: 2.1
  - Independence: serial
  - status: complete

## 3. 設定頁（Web + APP）
- [x] 3.1 `frontend/src/pages/CurrencySettingsPage.tsx` 每列新增小數位數下拉
  - Acceptance: 選項為「預設（N）/ 0 / 1 / 2 / 3 / 4」，N 為 `resolveDecimals` 在無使用者設定時的值
  - Acceptance: 存檔規則改為 `multiplier !== 1 || decimal_places != null` 即送出，multiplier 為 1 時仍帶 `multiplier: 1`
  - Acceptance: 頁面說明精度影響輸入、換算與顯示
  - Depends on: 1.1, 1.5, 2.3
  - Independence: serial
  - status: complete
- [x] 3.2 `app/app/settings/currency-units.tsx` 同 3.1
  - Depends on: 1.1, 1.5, 2.3
  - Independence: serial
  - status: complete

## 4. 換算與輸入限制（Web + APP）
- [x] 4.1 兩端 `TransactionForm.tsx` 的兩個呼叫點（預填匯率 effect、`updateCrossCurrencyField`）傳入來源與目標的精度與 multiplier
  - Acceptance: WHEN Web 與 APP 進行 TWD → JPY 轉帳 THEN 轉入金額為整數
  - Depends on: 1.4
  - Independence: serial
  - status: complete
- [x] 4.2 交易金額、轉帳目標金額、外幣消費 `original_amount` 的輸入限制
  - Acceptance: multiplier = 1 時超過精度的位數無法輸入；0 位幣別在 APP 使用無小數點鍵盤
  - Acceptance: multiplier ≠ 1 時送出前以 `validateAmountPrecision` 驗證並顯示錯誤
  - Acceptance: 編輯既有交易且金額未變更時不驗證
  - Depends on: 1.2
  - Independence: serial
  - status: complete
- [x] 4.3 帳戶建立/編輯的初始餘額輸入限制（APP `AccountQuickCreate.tsx` 與 Web 帳戶表單）
  - Depends on: 1.2
  - Independence: serial
  - status: complete

## 5. 顯示（Web + APP）
- [x] 5.1 帳戶列表、帳戶詳情改用 `formatAmount`
  - Depends on: 1.3
  - Independence: serial
  - status: complete
- [x] 5.2 交易列表、交易詳情改用 `formatAmount`
  - Depends on: 1.3
  - Independence: serial
  - status: complete
- [x] 5.3 首頁總覽、報表改用 `formatAmount`
  - Depends on: 1.3
  - Independence: serial
  - status: complete

## 6. 驗證與收尾
- [x] 6.1 自動化驗證
  - Acceptance: shared 測試、`go test ./internal/usecase/...`、repository 整合測試、`golangci-lint run` 全部通過
  - Acceptance: APP 以 `expo export` 驗證可建置（`tsc` 的基準本來就是壞的）；Web `build` 通過
  - Depends on: 1-5
  - Independence: serial
  - status: complete
- [ ] 6.2 Manual smoke（Web + APP emulator）
  - Acceptance: 設定頁改 USD 為 0 位並存檔後重新載入仍保留；TWD → JPY 轉帳轉入金額為整數；VND 輸入 50.5 可送出；舊交易只改分類可送出
  - Acceptance: 測試資料刪除且 balance 回到原值
  - Depends on: 6.1
  - Independence: serial
  - status: pending
- [x] 6.3 更新 `SPEC.md` / `CONTEXT.md` 的幣別精度說明
  - Depends on: 6.2
  - Independence: serial
  - status: complete
