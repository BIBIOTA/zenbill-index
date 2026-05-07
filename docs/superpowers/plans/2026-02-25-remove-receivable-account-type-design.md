# 移除 RECEIVABLE 帳戶類型設計

**日期:** 2026-02-25
**狀態:** Approved

## 背景

RECEIVABLE 帳戶類型目前僅用於共同記帳（Shared Ledger）的應收/應付追蹤。此帳戶類型為唯讀，計算邏輯複雜且與個人帳戶系統無關。前端和 `GetSummary` 已經使用純計算方式（`owner_paid_amount - owner_amount`）來顯示應收金額，RECEIVABLE 帳戶及其 transactions 本質上是 `shared_expenses` 資料的冗餘鏡像。

## 方案

**方案 A（採用）：純計算模式** — 從 `shared_expenses` 即時計算淨額，完全移除 RECEIVABLE 帳戶類型和相關 transactions。

## 移除範圍

### Domain 層

- 移除 `AccountTypeReceivable` 常數和 `IsReceivable()` 方法
- 移除 `SharedLedger.ReceivableAccountID` / `PartnerReceivableAccountID` 欄位及關聯
- 移除 `SharedExpense.ReceivableTransactionID` / `PartnerReceivableTransactionID` 欄位
- 移除 `SharedExpenseRepository.FindSettledAtByReceivableTransactionIDs` 方法

### Usecase 層

- `SharedLedgerService.Create` — 不再建立 RECEIVABLE 帳戶
- `SharedExpenseService.Create` — 移除 receivable transaction 建立邏輯（保留 expense transaction）
- `SharedExpenseService.Settle` / `SettleAll` — 結算只建立個人帳戶的收入/支出 transaction，不再操作 RECEIVABLE 帳戶
- `SharedExpenseService.Delete` — 移除 receivable transaction 反轉邏輯
- `sheet_sync_service.go` — `createExpenseWithReceivable` 移除 receivable 相關邏輯

### Repository 層

- `transaction_repository.go` — 移除 RECEIVABLE 帳戶相關的 JOIN 和過濾
- `shared_expense_repository.go` — 移除 `FindSettledAtByReceivableTransactionIDs`

### HTTP Handler 層

- `shared_expense_handler.go` — 簡化結算 handler（移除 receivable 帳戶操作）

### 前端

- `types/index.ts` — `AccountType` 移除 `'RECEIVABLE'`，`SharedLedger` 移除 `receivable_account_id` 相關欄位
- `AccountsPage.tsx` — 移除 RECEIVABLE typeConfig 和特殊處理
- `AccountDetailPage.tsx` — 移除 RECEIVABLE 唯讀限制
- `TransactionsPage.tsx` — 移除 receivableIds 過濾邏輯
- `useAccounts.ts` — 排序移除 RECEIVABLE
- `useSharedLedgers.ts` — 移除 receivable 帳戶相關 hooks
- `SharedLedgersPage.tsx` — 移除 `getReceivableBalance`
- `ReceivablesPage.tsx` — 移除 RECEIVABLE 帳戶過濾（其餘邏輯已是純計算，保留）

### 保留不變

- `ReceivablesPage` 的核心計算邏輯（已是純計算）
- `SharedExpense` 的 `OwnerPaidAmount` / `PartnerPaidAmount` / `OwnerAmount` / `PartnerAmount`
- `GetSummary`（已是純計算）
- `SettledAt` / `SettlementPersonalTransactionID` 機制

## 結算邏輯簡化

**新的結算流程：**
1. 計算 `netReceivable = owner_paid_amount - owner_amount`
2. 如有選擇帳戶 → 建立收入/支出 transaction + 更新餘額
3. 標記 `settled_at`

移除：receivable account transaction、partner receivable balance 更新。

## 資料庫遷移

1. 刪除所有 RECEIVABLE 類型帳戶的 transactions
2. 刪除所有 RECEIVABLE 類型帳戶
3. `shared_ledgers` 移除 `receivable_account_id` / `partner_receivable_account_id` 欄位
4. `shared_expenses` 移除 `receivable_transaction_id` / `partner_receivable_transaction_id` 欄位
5. 清除 `shared_expenses.settlement_transaction_id` 中指向已刪除 receivable transactions 的引用
