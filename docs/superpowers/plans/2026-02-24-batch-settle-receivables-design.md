# Batch Settle Receivables Design

## Summary

在「待收款項」頁面新增「一次結清」功能，讓使用者可以一鍵結清所有待收款項，將款項從待收款帳戶轉入指定的收款帳戶。

## Background

目前每筆待收款項需要單獨點「確認收款」→ 選帳戶 → 確認。當待收款項累積多筆時操作繁瑣。

## Design

### Backend

**新 API endpoint:**
```
POST /api/v1/shared-ledgers/{id}/receivables/settle-all
Body: { "receive_account_id": "uuid" }
```

**`SharedExpenseService.SettleAll()` 邏輯（單一 DB transaction）：**
1. 查詢該 ledger 所有未結清的 receivables
2. 若無待結清項目，回傳錯誤
3. 在單一 DB transaction 內：
   - 對每筆 receivable 建立 SETTLEMENT transaction（記錄到收款帳戶）
   - 收款帳戶 balance += 各筆 settlementAmount
   - 待收款帳戶 balance -= 各筆 settlementAmount
   - 標記每筆 expense 的 settled_at = now
4. 回傳結清筆數與總金額

**Response:**
```json
{ "data": { "settled_count": 5, "total_amount": 1250.0 } }
```

### Frontend

**ReceivablesPage 改動：**

1. **標題右側新增「一次結清」按鈕**
   - emerald 色系，與單筆「確認收款」一致
   - 無待收款項時隱藏或 disabled

2. **點擊後彈出 modal**
   - 顯示總金額（所有待收款項合計）
   - 顯示筆數
   - SearchableSelect 選收款帳戶（排除 RECEIVABLE 和 CREDIT 類型）
   - 確認/取消按鈕

3. **新增 `useSettleAllReceivables` hook**
   - 呼叫 `POST /settle-all`
   - onSuccess 時 invalidate: receivables, expenses, summary, accounts

### Data Flow

```
User clicks「一次結清」
  → Modal opens: shows total amount + account selector
  → User selects account, clicks confirm
  → POST /shared-ledgers/{id}/receivables/settle-all { receive_account_id }
  → Backend (single DB tx):
      For each unsettled receivable:
        ├─ Create SETTLEMENT transaction → receive_account
        ├─ receive_account.balance += amount
        ├─ receivable_account.balance -= amount
        └─ expense.settled_at = now
  → Response: { settled_count, total_amount }
  → Frontend invalidates queries → UI refreshes
```

### Files to Modify

**Backend:**
- `internal/usecase/shared_expense_service.go` — add `SettleAll()` method
- `internal/delivery/http/shared_expense_handler.go` — add handler + route

**Frontend:**
- `frontend/src/pages/ReceivablesPage.tsx` — add button + batch modal
- `frontend/src/hooks/useSharedLedgers.ts` — add `useSettleAllReceivables` hook
