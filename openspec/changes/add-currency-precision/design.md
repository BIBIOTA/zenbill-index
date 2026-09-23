# Design: add-currency-precision

## 精度解析（三層，前者優先）

```
resolveDecimals(currency, settings):
  1. settings 中該幣別的 decimal_places（非 null）
  2. OVERRIDES[currency]      // TWD, JPY, KRW, VND → 0
  3. ISO_4217_DECIMALS[currency]
  4. 2                         // 未知代碼
```

- ISO 表放在 `packages/shared/`，靜態資料，**不使用** `Intl.NumberFormat().resolvedOptions()`：Hermes（APP）與瀏覽器（Web）的 ICU 版本不同，結果可能不一致且難以測試。
- ISO 4217 將 TWD 定為 2 位，實務為 0，因此需要覆寫。JPY / KRW / VND 在 ISO 已是 0，仍明確列入覆寫清單以表明意圖。
- 3 位小數幣別（BHD、IQD、JOD、KWD、LYD、OMR、TND）依 ISO 取 3 位。

## 精度與 multiplier 的關係

精度定義在**儲存值**（`顯示值 × multiplier`）上，而非顯示值：

```
roundToCurrency(display, decimals, multiplier) = round_half_up(display × multiplier, decimals) / multiplier
validateAmountPrecision(display, decimals, multiplier) = display × multiplier 在 decimals 位內（容忍浮點誤差）
```

例：VND（0 位）、multiplier 1000，輸入 `50.5` → 儲存 `50500`，合法。不使用 `log10(multiplier)` 推導顯示位數，因為 multiplier 是 `decimal(19,4)`，不保證是 10 的次方。

## 輸入限制策略

| 情境 | 行為 |
|------|------|
| multiplier = 1 | 超過精度的小數位數無法輸入；0 位幣別在 APP 使用 `number-pad`（無小數點） |
| multiplier ≠ 1 | 允許輸入，送出前以 `validateAmountPrecision` 驗證並顯示錯誤 |
| 編輯既有交易且金額未變更 | 不驗證（既有資料可能超出精度，不強迫使用者改金額而連動 balance） |
| 跨幣別換算出的欄位 | 以 `roundToCurrency` 四捨五入；使用者輸入的欄位不改寫 |

## 匯率

四捨五入目標金額後，`source / target` 可能與匯率略有出入。匯率保留使用者輸入或 API 預填的原值，不回推。

## 顯示

`formatAmount(value, currency, settings)` 固定顯示至精度位數（`minimumFractionDigits = maximumFractionDigits = decimals`），千分位分隔，例如 `5.00`、`1,235`、`1.500`。顯示時依**目前設定**四捨五入，DB 值不變（既有 `12.34` USD 在設定 0 位後顯示 `12`）。

## 後端

- `domain.CurrencySetting` 新增 `DecimalPlaces *int`（`gorm:"type:smallint"`，json `decimal_places`）。
- `CurrencySettingService.UpdateSettings` 驗證：非 null 時需為 0～4（上限 4 對應 `transactions.amount decimal(19,4)`）。
- Handler request item 新增 `DecimalPlaces *int`，選填。
- `Multiplier` 目前是 `binding:"required"`，前端送出「只設精度、multiplier = 1」的列時必須帶 `multiplier: 1`。

### 已知風險
`PUT /currency-settings` 是整批取代（`UpsertBatch` 會刪除未送出的幣別，並以送出的值覆寫）。舊版 APK 存檔時不帶 `decimal_places`，會把使用者設定的精度清為 null。單一使用者情境下可接受，升級 APK 後即不再發生。

## 設定頁存檔規則

原本只送 `multiplier !== 1` 的列；改為 `multiplier !== 1 || decimal_places != null` 即送出，避免只設了精度的幣別被 `UpsertBatch` 刪除。
