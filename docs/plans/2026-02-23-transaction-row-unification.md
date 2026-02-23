# Transaction Row Unification Design

**Date:** 2026-02-23
**Goal:** Unify transaction display across TransactionsPage, RecentTransactions, and AccountDetailPage using a shared component.

## Context

Currently three views display transactions differently:
- **AccountDetailPage**: Card-style rows (type badge + description/date stacked, amount right-aligned, hover edit button)
- **TransactionsPage**: HTML table with 6 columns
- **RecentTransactions**: Compact rows similar to account detail but with slight style differences

## Design

### Shared Component: `TransactionRow`

**File:** `frontend/src/components/TransactionRow.tsx`

**Props:**
- `transaction: Transaction` — transaction data
- `showEditButton?: boolean` — show pencil icon on hover (default: false)
- `onEdit?: (txId: string) => void` — edit callback
- `getDescription?: (tx: Transaction) => string` — custom description text (default: `tx.note`)
- `runningBalance?: number` — optional, only AccountDetailPage passes this

**Layout (matches AccountDetailPage):**
```
[Type Badge] [Description]          [$Amount] [Edit]
             [Date]                 [餘額 xxx]
```

- Left: type badge (shrink-0) + description/date stacked (min-w-0 truncate)
- Right: amount with +/- and color + optional running balance below + optional hover edit button
- Edit button: opacity-0 → opacity-100 on group hover

### Page Changes

1. **AccountDetailPage** — Replace inline row JSX with `<TransactionRow>`, pass `showEditButton`, `onEdit`, `runningBalance`
2. **TransactionsPage** — Remove `<table>`, use `<div className="space-y-1">` + `<TransactionRow>` per item. Keep search/filter/pagination. Pass `showEditButton`, `onEdit`. Use merchant name as description via `getDescription`. Remove inline delete button and `useDeleteTransaction`.
3. **RecentTransactions** — Replace inline row JSX with `<TransactionRow>`, no edit button.

### Removed
- Inline delete button from TransactionsPage
- `useDeleteTransaction` import
- HTML table markup from TransactionsPage
