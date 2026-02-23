# Transaction Row Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify transaction display across TransactionsPage, RecentTransactions, and AccountDetailPage using a shared `TransactionRow` component.

**Architecture:** Extract the card-style row layout from AccountDetailPage into a reusable `TransactionRow` component, then replace the inline JSX in all three views. The component accepts optional props for edit button, running balance, and custom description.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react icons

---

## Context

Three views currently display transactions differently:
- **AccountDetailPage** (`frontend/src/pages/AccountDetailPage.tsx:284-316`): Card-style rows with type badge, description/date stacked, amount, running balance, hover edit button
- **TransactionsPage** (`frontend/src/pages/TransactionsPage.tsx:76-127`): HTML `<table>` with 6 columns (date, type, merchant, note, amount, actions including delete)
- **RecentTransactions** (`frontend/src/components/dashboard/RecentTransactions.tsx:17-39`): Compact rows, similar to account detail but with different spacing and missing type background colors

The `typeColors` config is duplicated in AccountDetailPage and TransactionsPage. RecentTransactions uses a slightly different `typeLabel` format.

---

### Task 1: Create `TransactionRow` shared component

**Files:**
- Create: `frontend/src/components/transactions/TransactionRow.tsx`

**Step 1: Create the component file**

Extract the row layout from AccountDetailPage (lines 288-314) into a standalone component. The `typeColors` constant moves here as the single source of truth.

```tsx
import { Pencil } from 'lucide-react'
import type { Transaction } from '@/types'

export const typeColors: Record<string, { text: string; bg: string; label: string }> = {
  EXPENSE: { text: 'text-red-400', bg: 'bg-red-400/10', label: '支出' },
  INCOME: { text: 'text-emerald-400', bg: 'bg-emerald-400/10', label: '收入' },
  TRANSFER: { text: 'text-cyan-400', bg: 'bg-cyan-400/10', label: '轉帳' },
}

interface TransactionRowProps {
  transaction: Transaction
  showEditButton?: boolean
  onEdit?: (txId: string) => void
  getDescription?: (tx: Transaction) => string
  runningBalance?: number
}

export function TransactionRow({ transaction: tx, showEditButton, onEdit, getDescription, runningBalance }: TransactionRowProps) {
  const tc = typeColors[tx.type] || typeColors.EXPENSE
  const description = getDescription ? getDescription(tx) : (tx.note || '(無描述)')

  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0 group">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${tc.text} ${tc.bg}`}>{tc.label}</span>
        <div className="min-w-0">
          <p className="text-sm truncate">{description}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{new Date(tx.occurred_at).toLocaleDateString('zh-TW')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className={`text-sm font-medium tabular-nums ${tc.text}`}>
            {tx.type === 'INCOME' ? '+' : '-'}${Math.abs(tx.amount).toLocaleString()}
          </p>
          {runningBalance !== undefined && (
            <p className="text-[11px] tabular-nums text-[var(--text-muted)]">
              餘額 {runningBalance.toLocaleString()}
            </p>
          )}
        </div>
        {showEditButton && onEdit && (
          <button
            onClick={() => onEdit(tx.id)}
            className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--color-accent)] transition-opacity"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors (component compiles cleanly)

**Step 3: Commit**

```bash
git add frontend/src/components/transactions/TransactionRow.tsx
git commit -m "feat: create TransactionRow shared component"
```

---

### Task 2: Refactor AccountDetailPage to use TransactionRow

**Files:**
- Modify: `frontend/src/pages/AccountDetailPage.tsx`

**Step 1: Update imports**

Replace the `Pencil` import (no longer needed directly) and add `TransactionRow` + `typeColors`:

```tsx
// Remove Pencil from lucide-react import (line 3) — it's still needed for the account edit button, keep it
// Add at top of imports:
import { TransactionRow, typeColors } from '@/components/transactions/TransactionRow'
```

Remove the local `typeColors` constant (lines 16-20).

**Step 2: Replace inline transaction row JSX**

Replace lines 285-316 (the `transactions.map` block) with:

```tsx
{transactions.map((tx) => (
  <TransactionRow
    key={tx.id}
    transaction={tx}
    showEditButton
    onEdit={openEditTx}
    getDescription={getTxDescription}
    runningBalance={tx.running_balance}
  />
))}
```

**Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/pages/AccountDetailPage.tsx
git commit -m "refactor: use TransactionRow in AccountDetailPage"
```

---

### Task 3: Refactor TransactionsPage to use TransactionRow

**Files:**
- Modify: `frontend/src/pages/TransactionsPage.tsx`

**Step 1: Update imports**

```tsx
// Replace line 2: remove Pencil (no longer needed)
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
// Replace line 3: remove useDeleteTransaction
import { useTransactions } from '@/hooks/useTransactions'
// Add:
import { TransactionRow } from '@/components/transactions/TransactionRow'
```

Remove the local `typeColors` constant (lines 6-10).
Remove `const deleteTx = useDeleteTransaction()` (line 21).

**Step 2: Build a `getDescription` helper using merchant data**

Add after `merchantName` function (around line 41):

```tsx
const getTxDescription = (tx: Transaction) => {
  if (tx.merchant_id) {
    return merchantName(tx.merchant_id) ?? (tx.note || '(無描述)')
  }
  return tx.note || '(無描述)'
}
```

Add `Transaction` to the type import: `import type { Transaction } from '@/types'`

**Step 3: Replace the table with card-style rows**

Replace lines 75-127 (the entire `{/* Table */}` section) with:

```tsx
{/* Transactions */}
<div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-4">
  {isLoading ? (
    <p className="text-sm text-[var(--text-muted)] text-center py-8">載入中...</p>
  ) : transactions.length === 0 ? (
    <p className="text-sm text-[var(--text-muted)] text-center py-8">尚無交易紀錄</p>
  ) : (
    <div className="space-y-1">
      {transactions.map((tx) => (
        <TransactionRow
          key={tx.id}
          transaction={tx}
          showEditButton
          onEdit={openEdit}
          getDescription={getTxDescription}
        />
      ))}
    </div>
  )}
</div>
```

**Step 4: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/pages/TransactionsPage.tsx
git commit -m "refactor: use TransactionRow in TransactionsPage, replace table layout"
```

---

### Task 4: Refactor RecentTransactions to use TransactionRow

**Files:**
- Modify: `frontend/src/components/dashboard/RecentTransactions.tsx`

**Step 1: Replace entire component body**

```tsx
import type { Transaction } from '@/types'
import { TransactionRow } from '@/components/transactions/TransactionRow'

interface RecentTransactionsProps {
  transactions: Transaction[]
}

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-4">
      <h3 className="text-sm font-semibold mb-3">最近交易</h3>
      {transactions.length > 0 ? (
        <div className="space-y-1">
          {transactions.map((tx) => (
            <TransactionRow key={tx.id} transaction={tx} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)] text-center py-6">尚無交易紀錄</p>
      )}
    </div>
  )
}
```

**Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/components/dashboard/RecentTransactions.tsx
git commit -m "refactor: use TransactionRow in RecentTransactions"
```

---

### Task 5: Visual verification

**Step 1: Start dev server and verify all three views**

Run: `cd frontend && npm run dev`

Check these pages in the browser:
1. **Dashboard** (`/`) — Recent Transactions widget should show card-style rows
2. **Transactions** (`/transactions`) — Should show card-style rows with search/filter/pagination, hover edit button
3. **Account Detail** (`/accounts/:id`) — Should look identical to before (with running balance)

**Step 2: Final commit if any tweaks needed**

If spacing or styling adjustments are needed, fix and commit.
