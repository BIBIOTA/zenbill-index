# RECEIVABLE 帳戶交易結清狀態標示

**日期:** 2026-02-25
**狀態:** Approved

## 問題

RECEIVABLE 帳戶的交易明細頁（AccountDetailPage）中，每筆交易只顯示類型（INCOME/EXPENSE/TRANSFER）和金額，無法辨識哪些應收/應付交易已經透過結清被抵銷。用戶在查看個人帳戶時，缺乏結清歷史的可見性。

## 解決方案

在 RECEIVABLE 帳戶的交易列表中，為每筆交易加上結清狀態標示。

### Backend 變更

1. **Transaction 回傳結構新增欄位**：`settled_at *time.Time`（JSON: `settled_at`，可選欄位）
2. **查詢邏輯**：當查詢的帳戶類型為 RECEIVABLE 時，LEFT JOIN `shared_expenses` 表：
   - `shared_expenses.receivable_transaction_id = transactions.id` → 取得 `settled_at`
   - 只有 RECEIVABLE 帳戶的交易會填充此欄位，其他帳戶不受影響
3. **實作位置**：修改 transaction repository 的 `FindByAccountID` 或相關查詢方法

### Frontend 變更

1. **Transaction type**：新增 `settled_at?: string` 欄位
2. **TransactionRow 元件**：
   - 當 `settled_at` 有值時，顯示結清 badge（灰綠色「已結清 MM/DD」）
   - 已結清交易的文字略微變淡（降低 opacity 或使用 muted color）
   - 未結清交易維持原樣

### 視覺設計

```
未結清：
[收入] 共同帳本 - 晚餐         +$500    ← 原本的亮色
       2/20                    餘額 1,200

已結清：
[收入] 共同帳本 - 午餐         +$300    ← 文字略淡
       2/15  ✓ 已結清 2/25     餘額 700  ← 多一個結清標示
```

## 影響範圍

- `backend/internal/domain/transaction.go` — Transaction struct 新增 SettledAt 欄位（非 DB 欄位，僅查詢時填充）
- `backend/internal/repository/transaction_repository.go` — 查詢邏輯加 LEFT JOIN
- `frontend/src/types/index.ts` — Transaction interface 新增 settled_at
- `frontend/src/components/transactions/TransactionRow.tsx` — 渲染結清狀態

## 不做的事

- 不建立新頁面或新 Tab
- 不修改結清邏輯本身
- 不影響非 RECEIVABLE 帳戶的交易顯示
