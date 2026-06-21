---
change_id: add-cross-currency-transfer-rate
doc_language: 繁體中文
---

# 跨幣別轉帳手動匯率換算

## 1. 背景與問題

當使用者在不同幣別的帳戶之間轉帳（例如 USD 帳戶 → TWD 帳戶）時，目前 APP 端的轉帳表單只送出單一 `amount` 與 `target_account_id`，**沒有匯率換算**。結果後端會把「相同數字」當成目標幣別金額入帳（轉 100 USD 進 TWD 帳戶會被記成入帳 100 TWD），造成餘額錯誤。

本次變更讓使用者在跨幣別轉帳時可手動填入匯率（並可由系統預填即時匯率、再覆寫）來正確換算。

### 現況盤點（重要）

- **後端：已完整支援，無需修改。**
  - `domain.Transaction` 已有 `OriginalAmount` / `OriginalCurrency` / `ExchangeRate` 欄位。
  - `applyBalance` / `reverseBalance` 透過 `TargetTransferAmount()` 以「目標幣別金額」對目標帳戶入帳。
  - `createTransactionRequest` / `updateTransactionRequest` 已接受 `original_amount` / `original_currency` / `exchange_rate`，並有 `GetRate` 自動 fallback。
  - `GET /exchange-rates?from=&to=` endpoint（`ExchangeRateHandler`）已存在。
- **Web（`frontend/`）：已實作「兩者皆可切換」換算邏輯**，但邏輯內嵌在 `TransactionForm.tsx`，且**未**接 API 即時匯率預填。
- **APP（`app/`）：完全未實作**跨幣別轉帳。

因此本變更的實際範圍集中在前端與共享層。

## 2. 方案

採 **方案 A：抽共用邏輯 + 補齊 APP + 新增匯率預填 hook**。

- 將換算邏輯抽成 `packages/shared/` 的純函式（單一真相，兩端共用，避免行為漂移）。
- Web 改為呼叫共享函式（行為不變），APP 套用同一份邏輯實作 React Native UI。
- 新增 `useExchangeRate()` hook 包裝既有 `/exchange-rates` endpoint，偵測到跨幣別時預填匯率，使用者可覆寫。

備選方案（不採用）：

- **方案 B（只補 APP、邏輯各自複製）**：兩端邏輯重複，未來易漂移，違反「共享邏輯優先放 `packages/shared/`」原則。
- **方案 C（後端代算）**：後端已能儲存，重算屬多餘；即時換算體驗仍需前端，不划算。

## 3. 架構與範圍

| 層 | 變更 |
|----|------|
| `backend/` | **不改**（domain、balance 邏輯、API binding、`/exchange-rates` 皆已就緒） |
| `packages/shared/` | 新增 `computeCrossCurrencyAmount()` 純函式；新增 `useExchangeRate()` hook；既有 types 不動 |
| `frontend/`（Web） | `TransactionForm.tsx` 改為呼叫共享函式（行為不變）+ 接上匯率預填 |
| `app/`（RN） | `TransactionForm.tsx` 新增整套 cross-currency UI（target / rate 欄）+ 共享函式 + 匯率預填 |

依賴方向：`app/` 與 `frontend/` → `packages/shared/` → 既有 API client。

## 4. 換算邏輯（共享純函式）

抽出可單元測試的純函式，沿用 Web 既有語意：

- 輸入：`{ source, target, rate, lastEdited }`，其中 `lastEdited` 為最近被編輯的欄位佇列（保留最後 2 個相異欄位）。
- 規則（優先序）：
  1. **單一空欄主規則**：{source, target, rate} 中恰好一個為空（≤0）、另外兩個 > 0 時，直接算出該空欄（缺 `target`：`target = source / rate`；缺 `source`：`source = target * rate`；缺 `rate`：`rate = source / target`）。**自動預填的匯率視為有效運算元**，因此只輸入一個金額即可完成換算，不需使用者另外碰匯率欄。（修正 manual smoke 發現的「預填匯率＋只填轉出金額時轉入金額維持 0、送出會讓目標帳戶入帳 0」bug）
  2. **三欄皆有值的 tie-break**：三欄皆 > 0 時，依 `lastEdited` 最近編輯的兩欄決定重算第三欄。
- 守衛：兩欄以上為空，或任一參與運算的值 `<= 0` 時不觸發自動換算。
- 精度：金額四捨五入至小數 2 位，匯率至小數 4 位（沿用 Web 既有規則）。

### 匯率方向定義（消除歧義）

`rate = 來源幣金額 ÷ 目標幣金額`，即「**1 單位目標幣 = rate 單位來源幣**」。此定義與 Web 既有公式（`target = source / rate`）一致，整個系統必須全程沿用，不得在不同檔案出現相反方向。

## 5. 匯率自動預填（新功能，兩端皆有）

- 新增 `packages/shared/` 的 `useExchangeRate(from, to)` hook，呼叫 `GET /exchange-rates?from=<來源幣>&to=<目標幣>`。
- **方向轉換：** API 回傳「1 from = Y to」，而本系統 `rate` 定義為 `來源幣 / 目標幣`，故預填值需取倒數：`rate = 1 / Y`。此反轉必須在 hook 或表單明確處理並加註解，避免方向錯誤。
- 觸發條件：`isCrossCurrency` 為真，且使用者**尚未手動編輯過 rate** 時帶入預填值；使用者一旦手動修改 rate，即停止覆寫。

## 6. 送出 payload（兩端一致）

跨幣別轉帳時：

- `amount` = 來源幣金額 × `sourceMultiplier`
- `original_amount` = 目標幣金額 × `targetMultiplier`
- `original_currency` = 目標帳戶幣別
- `exchange_rate` = `rate`

非跨幣別（含非 TRANSFER）時：`original_amount` / `original_currency` / `exchange_rate` 一律送 `undefined`（與 Web 現況一致）。

`sourceMultiplier` / `targetMultiplier` 來自既有 `getMultiplier(currencySettings, currency)`，分別取來源、目標帳戶幣別。

## 7. 錯誤處理與邊界

- **匯率 API 失敗**：不阻擋表單，匯率欄留給使用者手填（fallback）。
- **rate 或金額為 0 / 空**：不觸發自動換算（沿用 `> 0` 守衛）。
- **來源與目標同幣別**：隱藏 rate / target 欄，走原本單一金額流程；不送 cross 欄位。
- **切換帳戶造成幣別關係改變**：重置 `lastEdited` 與「rate 是否被手動編輯」狀態，重新評估是否預填。

## 8. 測試策略

- **共享單元測試**（`packages/shared/`）：`computeCrossCurrencyAmount()` 三種缺欄情境、`<= 0` 守衛、精度、rate 方向反轉。
- **APP / Web 元件測試**：
  - 跨幣別偵測（同幣別不顯示 rate/target 欄）。
  - 匯率預填只覆寫一次，使用者改過後不再覆寫。
  - 送出 payload 欄位與 multiplier 套用正確。
- **後端**：無變更，沿用既有測試。

## 9. 跨平台同步檢查（CLAUDE 強制）

本功能必須同時在 APP（`app/`）與 Web（`frontend/`）完成，共享邏輯放入 `packages/shared/`，不允許僅完成單一平台即標記完成。

## Probable next steps

- **UML（建議）**：source / target / rate 三欄的「編輯任兩欄自動算第三欄」具狀態互動，適合畫一張 activity 或 state 圖釐清自動換算與預填的觸發時機。交由 `writing-plans` 確認是否納入 `writing-uml`。
- **Figma**：不需要。沿用既有 `TransactionForm` 版型，僅新增兩個輸入欄，無新視覺設計。
