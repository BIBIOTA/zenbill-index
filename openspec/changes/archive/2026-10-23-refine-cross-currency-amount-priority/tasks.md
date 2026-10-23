# Tasks: refine-cross-currency-amount-priority

## 1. 共享層（packages/shared）

- [x] 1.1 `computeCrossCurrencyAmount()` 改為「最近兩個不同編輯欄位以外的那一個被推算」
      - WHEN 匯率已預填、lastEdited 為 source → target、兩金額 > 0
      - THEN 反推匯率 `source / target`（4 位），兩金額不變
      - WHEN lastEdited 為 target → rate
      - THEN 重算來源金額 `target * rate`
      - WHEN 只編輯過一個金額且匯率 > 0
      - THEN 以匯率推算另一個金額（維持既有逐字輸入不卡住）
- [x] 1.2 `shouldPrefillRate(isCrossCurrency, lastEdited)`
      - WHEN lastEdited 含 rate，或同時含 source 與 target
      - THEN 回傳 false
- [x] 1.3 新增 `initialCrossCurrencyEdits(isEditingCrossCurrencyTransfer)`
      - WHEN 編輯既有跨幣轉帳 THEN `['source', 'target']`；否則 `[]`

## 2. Web（frontend/）

- [x] 2.1 lastEdited 初始值改用 `initialCrossCurrencyEdits()`；預填條件改用新簽章
- [x] 2.2 只在「跨幣 → 非跨幣」時清空 lastEdited

## 3. APP（app/）

- [x] 3.1 同 2.1
- [x] 3.2 同 2.2

## 4. 驗證

- [x] 4.1 `packages/shared` vitest 全綠、兩端 typecheck／build 不新增錯誤
- [x] 4.2 Web 手動驗證：TWD→USD 預填匯率後，先填來源、再填目標 → 匯率被反推、來源不被覆寫
