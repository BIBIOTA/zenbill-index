# Settlement Google Sheet Sync Design

## Date: 2026-02-25

## Goal

結清待收款（單筆/批次）時，自動在 Google Sheet 新增一筆 `還款 💰` 記錄，讓 Sheet 金額與 ZenBill 對齊。

## Core Rules

1. **單筆結清** → 一筆 settlement SharedExpense，金額 = 該筆 netReceivable
2. **批次結清** → 一筆彙總 settlement SharedExpense，金額 = 所有 netReceivable 加總
3. **金額為 0** → 不建立記錄
4. **付款人邏輯：** 正數 = Partner 付 / Partner 負擔，負數 = Owner 付 / Owner 負擔
5. **Sheet 寫入失敗不影響結清**，背景同步會自動補推

## Settlement SharedExpense Fields

| Field | Value | Notes |
|-------|-------|-------|
| LedgerID | current ledger | |
| Category | `settlement` | Maps to `還款 💰` in Sheet |
| Description | `結清待收款` | Fixed |
| Date | settlement date | |
| SourceType | `zenbill` | |
| SettledAt | `now()` | Immediately settled |
| ReceivableTransactionID | `nil` | No receivable transaction |
| ExpenseTransactionID | `nil` | No expense transaction |

### Payer Logic (by net receivable sign)

| Scenario | OwnerPaidAmount | PartnerPaidAmount | SplitMethod | Bearer |
|----------|----------------|-------------------|-------------|--------|
| Partner owes Owner (positive) | 0 | totalAmount | FULL_PARTNER | Partner |
| Owner owes Partner (negative) | abs(totalAmount) | 0 | FULL_OWNER | Owner |

## Code Changes

### Modified Files

1. **`backend/internal/usecase/shared_expense_service.go`**
   - `Settle()` — after settlement, call writeSettlementToSheet
   - `SettleAll()` — after batch settlement, aggregate net amount, call writeSettlementToSheet

2. **New method: `writeSettlementToSheet()`**
   - Create settlement SharedExpense (settled_at=now)
   - Save to DB
   - Convert via ExpenseToRow()
   - Append to Google Sheet
   - Update GoogleSheetRowIndex + SyncedAt

### Flow

```
Settle() / SettleAll()
    ├─ (existing) settle + update balances
    └─ writeSettlementToSheet(ledger, totalAmount)
         ├─ Create settlement SharedExpense (settled_at=now)
         ├─ Save to DB
         ├─ ExpenseToRow() conversion
         ├─ AppendRows() write to Sheet
         └─ Update GoogleSheetRowIndex + SyncedAt
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Ledger has no Google Sheet configured | Skip Sheet write, still create DB record |
| Sheet write fails | Settlement succeeds (no rollback), log warning, SyncedAt=nil, background sync will retry |
| Net amount is 0 | Do not create settlement SharedExpense |

### Aggregation Logic (SettleAll)

Sum each expense's `netReceivable` (= `OwnerPaidAmount - OwnerAmount`):
- Positive: partner owes owner
- Negative: owner owes partner

Final `totalNet` determines payer in the single consolidated settlement row.
