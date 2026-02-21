# Account Detail Page Design

Date: 2026-02-21

## Problem

The accounts list page (`/accounts`) shows accounts as cards but provides no way to:
1. View individual account details (bank info, credit card settings, etc.)
2. Edit account settings (name, passbook number, auto-pay config, etc.)
3. See transactions associated with a specific account

## Decision

Add a dedicated detail page at `/accounts/:id` with inline editing and transaction history.

## Design

### Route & Navigation

- New route: `/accounts/:id` → `AccountDetailPage`
- Accounts list: clicking an account card navigates to `/accounts/:id`
- Detail page: back link to `/accounts`

### Page Layout

```
┌──────────────────────────────────────────┐
│ ← 帳戶列表                               │
│                                          │
│ 🏦 台新銀行 Richart              [編輯]  │
│ NT$ 45,200                               │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ 帳戶資訊                             │ │
│ │ 類型: 銀行帳戶    幣別: TWD          │ │
│ │ 帳號: 1234-5678   銀行: 台新銀行     │ │
│ │ 建立日期: 2026-01-15                 │ │
│ │                                      │ │
│ │ (信用卡帳戶額外顯示)                  │ │
│ │ 結帳日: 15    繳款日: 25             │ │
│ │ 自動扣款: ✅ 從 Richart              │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ 交易記錄                                 │
│ ┌──────────────────────────────────────┐ │
│ │ 02/20  全聯福利中心        -$350     │ │
│ │ 02/19  薪資轉帳          +$45,000   │ │
│ │ 02/18  Uber Eats           -$120    │ │
│ │ ...                                  │ │
│ │            [載入更多]                 │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### Inline Edit Behavior

- Click "編輯" button → info fields become editable inputs
- Editable fields: name, passbook_number, bank, currency, closing_day, payment_due_day, auto_pay_enabled, auto_pay_from_id
- Read-only fields: balance (computed from transactions), type (immutable after creation), created_at
- Edit mode shows "儲存" and "取消" buttons
- Save calls `PUT /accounts/:id`

### Transaction List

- Uses existing `GET /transactions?account_id=xxx` API
- Paginated with "Load more" button
- Each row: date, description/merchant, amount (color-coded: green for income, red for expense)
- Initially loads 20 transactions

## Technical Implementation

### New Files

- `frontend/src/pages/AccountDetailPage.tsx` — Main detail page component

### Modified Files

- `frontend/src/App.tsx` — Add route `/accounts/:id`
- `frontend/src/pages/AccountsPage.tsx` — Make account cards clickable (navigate to detail)
- `frontend/src/hooks/useAccounts.ts` — Add `useAccount(id)` hook for single account fetch

### Existing Infrastructure (no changes needed)

- Backend API: `GET /accounts/:id`, `PUT /accounts/:id`, `GET /transactions?account_id=xxx` all exist
- Frontend hooks: `useUpdateAccount()`, `useTransactions({ account_id })` already available
- Types: `Account`, `Transaction`, `CreateAccountInput` all defined

### Data Flow

1. Navigate to `/accounts/:id`
2. Fetch account with `GET /accounts/:id`
3. Display account info in read-only mode
4. Fetch transactions with `GET /transactions?account_id=:id&page_size=20`
5. On edit: switch to editable inputs, save with `PUT /accounts/:id`
6. On load more: fetch next page of transactions
