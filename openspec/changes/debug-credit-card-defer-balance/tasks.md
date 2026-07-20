# Tasks: debug-credit-card-defer-balance

## 1. Backend（backend/internal/usecase, backend/internal/repository）
- [x] 1.1 修正 `ListByAccountWithBalanceInDateRangeWithDeferred` 的 `balanceAtEnd` 計算，排除本期內已標記延期的交易
  - Acceptance: WHEN 交易 A 的 `occurred_at` 落在本期 `[startDate, endDate]` 且 `billing_period_deferred = true` THEN 交易 A 不出現在本期交易列表中（既有行為，不變）AND 本期其他交易顯示的 `RunningBalance` 不再包含交易 A 的金額 AND `balanceAtEnd` 等於 `accountBalance` 減去期末後所有交易的金額，再減去交易 A 的金額
  - Depends on: -
  - Independence: independent
  - status: passing
  - note: backend commits 82d1f4c (test: red) + 0200f40 (feat: green). 新增 `domain.TransactionRepository.SumEffectiveAmountDeferredInRange` 並在 usecase 中扣除本期已標記延期交易的效果。
- [x] 1.2 驗證取消延期後餘額正確恢復
  - Acceptance: WHEN 一筆原本 `billing_period_deferred = true` 且落在本期 `[startDate, endDate]` 的交易被改回 `billing_period_deferred = false` THEN 該交易重新出現在本期列表 AND 本期交易顯示的 `RunningBalance` 重新包含其金額
  - Depends on: 1.1
  - Independence: serial
  - status: passing
  - note: backend commit 65f5ca5。此情境在 1.1 的修正下已直接通過（無需額外生產程式碼變更），作為回歸保護測試保留。
- [x] 1.3 驗證上期延期進本期的交易餘額不需額外調整（回歸保護）
  - Acceptance: WHEN 交易 B 的 `occurred_at` 落在上期 `[prevStartDate, prevEndDate]` 且 `billing_period_deferred = true` THEN 交易 B 出現在本期交易列表中（既有行為，不變）AND `balanceAtEnd` 不需針對交易 B 做額外調整（其效果已透過真實 `accountBalance` 減去期末後交易金額自然涵蓋）
  - Depends on: 1.1
  - Independence: serial
  - status: passing
  - note: backend commit d6c6632。確認 `SumEffectiveAmountDeferredInRange` 只查 `[startDate, endDate]`，不會對上期延期進本期的交易重複調整。
- [x] 1.4 驗證清單與餘額在混合情境下保持一致（清單/餘額必須共用同一套認定規則）
  - Acceptance: WHEN 本期同時包含未延期交易、一筆延期出去到下期的交易、一筆從上期延期進來的交易 THEN 顯示的交易列表與 `balanceAtEnd` 逐筆往回推算所依據的交易集合完全一致 AND 逐筆 `RunningBalance` 差額加總後精確等於 `balanceAtEnd`（無殘留金額）
  - Depends on: 1.1, 1.2, 1.3
  - Independence: serial
  - status: passing
  - note: backend commit 2d30919。涵蓋清單成員一致性與逐筆餘額差額的內部一致性檢查。

## Optional artifacts
- [ ] PlantUML diagrams (spec-driven-dev:writing-uml)
- [ ] Figma designs (spec-driven-dev:writing-figma)
