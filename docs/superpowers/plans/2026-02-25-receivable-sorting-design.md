# RECEIVABLE 帳戶交易排序設計

**日期:** 2026-02-25
**範圍:** AccountDetailPage — RECEIVABLE 帳戶專用排序

## 需求

查看 RECEIVABLE（應收帳款）帳戶明細時，交易排序改為：
1. **未結清** (`settled_at IS NULL`) 排在前面
2. **已結清** (`settled_at IS NOT NULL`) 排在後面
3. 每組內按 **`updated_at DESC`**（最近更新在前）

附帶變更：RECEIVABLE 帳戶隱藏 running balance（因排序不再按時間順序，running balance 無意義）。

## 方案選擇

採用 **後端排序方案**：在 repository 層偵測帳戶類型，RECEIVABLE 帳戶使用不同 ORDER BY。

理由：分頁正確、改動最小、前端不需額外邏輯。

## 實作變更

### Backend

**`backend/internal/repository/transaction_repository.go`**
- `FindByAccountID` 需要接收帳戶類型參數（或帳戶物件）
- RECEIVABLE 帳戶：`ORDER BY (settled_at IS NULL) DESC, updated_at DESC`
- 其他帳戶：維持 `ORDER BY occurred_at DESC`
- 注意：`settled_at` 來自 `shared_expenses` 表，需要 LEFT JOIN

**`backend/internal/usecase/transaction_service.go`**
- `ListByAccountWithBalance`：RECEIVABLE 帳戶跳過 running balance 計算
- `populateSettledAt` 需在排序前執行（或排序在 SQL 層處理）

### Frontend

**`frontend/src/pages/AccountDetailPage.tsx`**
- RECEIVABLE 帳戶隱藏 running balance 欄位顯示

## 排序 SQL 邏輯

```sql
-- RECEIVABLE 帳戶
SELECT t.*, se.settled_at
FROM transactions t
LEFT JOIN shared_expenses se ON se.receivable_transaction_id = t.id
WHERE t.account_id = ?
ORDER BY (se.settled_at IS NULL) DESC, t.updated_at DESC
LIMIT ? OFFSET ?

-- 其他帳戶（不變）
SELECT * FROM transactions
WHERE account_id = ?
ORDER BY occurred_at DESC
LIMIT ? OFFSET ?
```
