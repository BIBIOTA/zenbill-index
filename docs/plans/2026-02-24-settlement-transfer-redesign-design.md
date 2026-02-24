# Settlement Transfer Redesign Design

## Summary

結清從「建立 SETTLEMENT 交易」改為「TRANSFER 轉帳」或「純平帳」。收款帳戶變為可選，不指定時只平帳待收款帳戶。

## Background

目前結清使用 `SETTLEMENT` 類型交易直接增加收款帳戶餘額。但會計上，結清應是「轉帳」：從待收款帳戶轉出到個人帳戶（對方還錢），或從個人帳戶轉入待收款帳戶（我還錢）。此外，使用者希望能不指定帳戶，僅平帳待收款。

## Design

### Four Settlement Scenarios

| # | Direction | Account Specified? | Behavior |
|---|-----------|-------------------|----------|
| A | 對方欠我 (receivable > 0) | Yes | TRANSFER: receivable_acct → specified_acct |
| B | 對方欠我 (receivable > 0) | No  | Balance-only: receivable_acct.balance -= amount |
| C | 我欠對方 (receivable < 0) | Yes | TRANSFER: specified_acct → receivable_acct |
| D | 我欠對方 (receivable < 0) | No  | Balance-only: receivable_acct.balance += |amount| |

### Backend Changes

**1. Modify `Settle()` in `shared_expense_service.go`:**
- Change `receiveAccountID uuid.UUID` to `receiveAccountID *uuid.UUID` (optional)
- When account provided: create TRANSFER transaction using existing transfer pattern (AccountID=source, TargetAccountID=target), update both account balances
- When no account: only update receivable account balance to zero out the entry, no transaction created
- Keep marking `settled_at`

**2. Modify `SettleAll()` in `shared_expense_service.go`:**
- Same optional account logic as `Settle()`

**3. Modify `settleReceivableRequest` in `shared_expense_handler.go`:**
- Change `ReceiveAccountID` from `binding:"required"` to optional
- Parse as `*uuid.UUID` when present

**4. Remove `TransactionTypeSettlement`:**
- Settlement now uses `TransactionTypeTransfer`
- Can remove or keep for backward compat — recommend keeping the constant but using TRANSFER for new settlements

**5. Update `TransactionTypeReceivable`:**
- Shared expense creation still uses RECEIVABLE type — no change needed there

### Frontend Changes

**1. ReceivablesPage settle modals:**
- Account selector becomes optional (remove the disabled condition that requires account selection)
- Confirm button enabled even without account selected
- Add hint text: "未選帳戶時僅平帳待收款"

### API Changes

**Existing endpoints (no new routes):**
```
POST /shared-ledgers/{id}/receivables/{eid}/settle
POST /shared-ledgers/{id}/receivables/settle-all
Body: { "receive_account_id": "uuid" | null }  // now optional
```

### Files to Modify

**Backend:**
- `backend/internal/usecase/shared_expense_service.go` — Settle(), SettleAll()
- `backend/internal/usecase/shared_expense_service_test.go` — update existing tests, add new scenarios
- `backend/internal/delivery/http/shared_expense_handler.go` — make receive_account_id optional

**Frontend:**
- `frontend/src/pages/ReceivablesPage.tsx` — optional account in modals
- `frontend/src/hooks/useSharedLedgers.ts` — update mutation types
