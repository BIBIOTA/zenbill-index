# Tasks: add-cross-currency-transfer-rate

## 1. 共享層（packages/shared）
- [x] 1.1 新增 `computeCrossCurrencyAmount()` 純函式
  - Acceptance: WHEN 已編輯欄位恰為 source 與 rate（缺 target）且兩值皆 > 0 THEN 回傳 `target = source / rate`（四捨五入至小數 2 位）
  - Acceptance: WHEN 已編輯欄位恰為 target 與 rate（缺 source）且兩值皆 > 0 THEN 回傳 `source = target * rate`（四捨五入至小數 2 位）
  - Acceptance: WHEN 已編輯欄位恰為 source 與 target（缺 rate）且兩值皆 > 0 THEN 回傳 `rate = source / target`（四捨五入至小數 4 位）
  - Acceptance: WHEN 任一參與運算值 <= 0 或被編輯欄位少於 2 個 THEN 不計算、回傳原值
  - Depends on: -
  - Independence: independent
  - status: passing
- [ ] 1.2 新增 `useExchangeRate(from, to)` hook
  - Acceptance: WHEN 傳入 from / to 幣別 THEN 呼叫 `GET /exchange-rates?from=<from>&to=<to>` 並回傳 `rate = 1 / Y`（Y 為 API 回傳的「1 from = Y to」），方向與 `computeCrossCurrencyAmount` 的 `來源幣 / 目標幣` 定義一致
  - Acceptance: WHEN from 或 to 為空 THEN 不發出請求
  - Acceptance: WHEN API 失敗 THEN hook 不拋錯阻擋呼叫端、回傳無預填值
  - Depends on: -
  - Independence: independent
  - status: not_started
- [ ] 1.3 撰寫共享層單元測試
  - Acceptance: WHEN 執行 shared 測試 THEN 涵蓋 1.1 三種缺欄情境、`<= 0` 守衛、精度、以及 1.2 的 rate 倒數方向轉換，全部通過
  - Depends on: 1.1, 1.2
  - Independence: serial
  - status: not_started

## 2. Web（frontend/）
- [ ] 2.1 重構 `TransactionForm.tsx` 改用共享 `computeCrossCurrencyAmount()`
  - Acceptance: WHEN 在 Web 進行跨幣別轉帳並編輯任兩欄 THEN 第三欄自動換算結果與重構前完全一致（行為不變）
  - Acceptance: WHEN 移除內嵌換算邏輯後 THEN `frontend/` 不再保留重複的換算實作
  - Depends on: 1.1
  - Independence: serial
  - status: not_started
- [ ] 2.2 在 Web 表單接上匯率自動預填
  - Acceptance: WHEN 偵測到 `isCrossCurrency` 且使用者尚未手動編輯 rate THEN 以 `useExchangeRate` 預填匯率欄
  - Acceptance: WHEN 使用者手動修改 rate 後 THEN 後續不再以預填值覆寫
  - Acceptance: WHEN 來源與目標帳戶切換為同幣別 THEN 隱藏 rate / target 欄並重置預填與 `lastEdited` 狀態
  - Depends on: 1.2, 2.1
  - Independence: serial
  - status: not_started

## 3. APP（app/）
- [ ] 3.1 在 `TransactionForm.tsx` 新增跨幣別偵測與 target / rate 輸入欄
  - Acceptance: WHEN type 為 TRANSFER 且來源與目標帳戶幣別不同 THEN 顯示目標金額欄與匯率欄
  - Acceptance: WHEN 來源與目標帳戶同幣別 THEN 不顯示 target / rate 欄、走原本單一金額流程
  - Acceptance: WHEN 編輯任兩欄 THEN 透過共享 `computeCrossCurrencyAmount()` 自動算出第三欄
  - Depends on: 1.1
  - Independence: serial
  - status: not_started
- [ ] 3.2 APP 表單接上匯率預填並組裝 payload
  - Acceptance: WHEN 偵測到跨幣別且 rate 未被手動編輯 THEN 以 `useExchangeRate` 預填匯率、可覆寫
  - Acceptance: WHEN 送出跨幣別轉帳 THEN payload 帶 `amount = 來源幣金額 × sourceMultiplier`、`original_amount = 目標幣金額 × targetMultiplier`、`original_currency = 目標帳戶幣別`、`exchange_rate = rate`
  - Acceptance: WHEN 送出非跨幣別交易 THEN `original_amount` / `original_currency` / `exchange_rate` 皆為 undefined
  - Depends on: 1.2, 3.1
  - Independence: serial
  - status: not_started

## 4. 驗證與收尾
- [ ] 4.1 兩端元件測試與跨平台同步驗證
  - Acceptance: WHEN 執行 Web 與 APP 測試 THEN 涵蓋跨幣別偵測、預填只覆寫一次、payload 與 multiplier 套用正確，全部通過
  - Acceptance: WHEN 檢視變更 THEN APP 與 Web 行為一致且共享邏輯集中於 `packages/shared/`（符合 CLAUDE 跨平台同步規範）
  - Depends on: 2.2, 3.2
  - Independence: serial
  - status: not_started

## Optional artifacts
- [ ] PlantUML diagrams (spec-driven-dev:writing-uml)
- [ ] Figma designs (spec-driven-dev:writing-figma)
