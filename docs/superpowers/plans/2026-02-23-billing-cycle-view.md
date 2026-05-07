# Billing Cycle View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add billing cycle navigation and period totals to the credit card account detail page, enabling users to reconcile transactions by statement period.

**Architecture:** Pure frontend change. A utility function `getBillingCycle()` computes date ranges from the account's `closing_day`. The existing `GET /transactions` API already supports `start_date`/`end_date` filtering. The `AccountDetailPage` gains a cycle navigator (prev/next arrows + date label + expense total) that only renders for CREDIT accounts with a `closing_day`.

**Tech Stack:** React, TypeScript, TanStack Query, Lucide icons, Tailwind CSS.

**Design doc:** `docs/plans/2026-02-23-billing-cycle-view-design.md`

---

### Task 1: Create `getBillingCycle` utility

**Files:**
- Create: `frontend/src/utils/billingCycle.ts`

**Step 1: Create the utility file**

This function takes a `closingDay` (1-28) and an `offset` (0 = current period, -1 = previous, etc.) and returns the billing cycle date range.

The "current period" is the one that contains today. For `closingDay = 25`:
- If today is Feb 10, current period = Jan 26 ~ Feb 25
- If today is Feb 26, current period = Feb 26 ~ Mar 25

```typescript
// frontend/src/utils/billingCycle.ts

export interface BillingCycle {
  startDate: string   // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
  label: string       // e.g. "1/26 ~ 2/25"
}

/**
 * Calculate a billing cycle date range based on the credit card closing day.
 *
 * A billing cycle runs from (previous closing day + 1) to (current closing day).
 * Example: closing_day=25 → cycle is 26th of prev month to 25th of this month.
 *
 * @param closingDay - The statement closing day (1-28)
 * @param offset - 0 for current period (containing today), -1 for previous, +1 for next
 */
export function getBillingCycle(closingDay: number, offset: number = 0): BillingCycle {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Determine which cycle "today" falls in:
  // If today's date > closingDay, the current cycle ends next month on closingDay.
  // If today's date <= closingDay, the current cycle ends this month on closingDay.
  let endYear = today.getFullYear()
  let endMonth = today.getMonth() // 0-indexed

  if (today.getDate() > closingDay) {
    // Current cycle ends next month
    endMonth += 1
    if (endMonth > 11) {
      endMonth = 0
      endYear += 1
    }
  }

  // Apply offset
  endMonth += offset
  while (endMonth > 11) {
    endMonth -= 12
    endYear += 1
  }
  while (endMonth < 0) {
    endMonth += 12
    endYear -= 1
  }

  // End date: endYear-endMonth-closingDay
  const endDate = new Date(endYear, endMonth, closingDay)

  // Start date: previous month's closingDay + 1
  let startMonth = endMonth - 1
  let startYear = endYear
  if (startMonth < 0) {
    startMonth = 11
    startYear -= 1
  }
  const startDate = new Date(startYear, startMonth, closingDay + 1)

  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const shortFmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`

  return {
    startDate: fmt(startDate),
    endDate: fmt(endDate),
    label: `${shortFmt(startDate)} ~ ${shortFmt(endDate)}`,
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `billingCycle.ts`

**Step 3: Commit**

```bash
git add frontend/src/utils/billingCycle.ts
git commit -m "feat: add getBillingCycle utility for credit card statement periods"
```

---

### Task 2: Add billing cycle navigator to AccountDetailPage

**Files:**
- Modify: `frontend/src/pages/AccountDetailPage.tsx`

This task modifies the page to:
1. Add `cycleOffset` state (only used for CREDIT accounts with `closing_day`)
2. Compute billing cycle dates and pass them as `start_date`/`end_date` to the transaction query
3. Add a cycle navigator UI between the section header and the transaction list
4. Calculate and display the period's expense total

**Step 1: Add imports and state**

At the top of `AccountDetailPage.tsx`, add the import:

```typescript
// Add to existing imports at line 1
import { useState } from 'react'   // already imported
// Add new imports:
import { ChevronLeft, ChevronRight } from 'lucide-react'  // add to existing lucide import
import { getBillingCycle } from '@/utils/billingCycle'
```

Update the lucide import (line 3) from:
```typescript
import { ArrowLeft, Pencil, X, Check, CreditCard, Banknote, Wallet, Plus } from 'lucide-react'
```
to:
```typescript
import { ArrowLeft, Pencil, X, Check, CreditCard, Banknote, Wallet, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
```

**Step 2: Add cycle state and modify transaction query**

Inside the component, after line 34 (`const [autoEditDone, setAutoEditDone] = useState(false)`), add:

```typescript
const [cycleOffset, setCycleOffset] = useState(0)
```

Replace the existing `useTransactions` call (lines 36-40):

```typescript
// FROM:
const { data: txData } = useTransactions({
  account_id: id,
  page: 1,
  page_size: txPage * 20,
})

// TO:
const isCreditWithCycle = account?.type === 'CREDIT' && account.closing_day != null
const cycle = isCreditWithCycle ? getBillingCycle(account.closing_day!, cycleOffset) : null

const { data: txData } = useTransactions({
  account_id: id,
  ...(cycle
    ? { start_date: cycle.startDate, end_date: cycle.endDate, page: 1, page_size: 200 }
    : { page: 1, page_size: txPage * 20 }
  ),
})
```

Note: `account` may be undefined at this point since the query runs before account loads. The `isCreditWithCycle` check handles this — when `account` is undefined, `cycle` is `null` and the query uses the original pagination behavior. When `account` loads and it's a credit card, React re-renders and the query refetches with the cycle dates.

**Step 3: Add expense total calculation**

After line 118 (`const hasMore = ...`), add:

```typescript
const cycleExpenseTotal = cycle
  ? transactions
      .filter((tx) => tx.type === 'EXPENSE')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  : 0
```

**Step 4: Add the billing cycle navigator UI**

In the JSX, replace the transactions section header (lines 268-276):

```tsx
{/* FROM: */}
<div className="flex items-center justify-between mb-3">
  <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">交易記錄</h2>
  <button
    onClick={openCreateTx}
    className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-[var(--color-accent)] text-white text-[11px] font-medium hover:opacity-90"
  >
    <Plus className="w-3 h-3" /> 新增交易
  </button>
</div>

{/* TO: */}
<div className="flex items-center justify-between mb-3">
  <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">交易記錄</h2>
  <button
    onClick={openCreateTx}
    className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-[var(--color-accent)] text-white text-[11px] font-medium hover:opacity-90"
  >
    <Plus className="w-3 h-3" /> 新增交易
  </button>
</div>
{cycle && (
  <div className="flex items-center justify-between mb-3 py-2 px-1">
    <button
      onClick={() => setCycleOffset((o) => o - 1)}
      className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
    >
      <ChevronLeft className="w-4 h-4" />
    </button>
    <div className="text-center">
      <p className="text-sm font-medium">{cycle.label}</p>
      <p className="text-xs text-[var(--text-muted)]">
        本期支出 <span className="text-red-400 font-medium tabular-nums">${cycleExpenseTotal.toLocaleString()}</span>
      </p>
    </div>
    <button
      onClick={() => setCycleOffset((o) => o + 1)}
      className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
    >
      <ChevronRight className="w-4 h-4" />
    </button>
  </div>
)}
```

**Step 5: Hide "load more" button in cycle mode**

The existing "load more" button should only show for non-cycle mode (since cycle mode loads all at once). Change the `hasMore` condition (around line 291-298):

```tsx
{/* FROM: */}
{hasMore && (
  <button ...>載入更多</button>
)}

{/* TO: */}
{!cycle && hasMore && (
  <button ...>載入更多</button>
)}
```

**Step 6: Verify TypeScript compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

**Step 7: Commit**

```bash
git add frontend/src/pages/AccountDetailPage.tsx
git commit -m "feat: add billing cycle navigator to credit card account detail page"
```

---

### Task 3: Manual browser verification

**Step 1: Start the dev server (if not running)**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npm run dev`

**Step 2: Open a credit card account detail page in the browser**

Navigate to a CREDIT account that has `closing_day` set. Verify:

- [ ] Billing cycle navigator appears below "交易記錄" heading
- [ ] Date range label shows correct period (e.g. "1/26 ~ 2/25")
- [ ] Left/right arrows navigate to previous/next periods
- [ ] Expense total updates when switching periods
- [ ] Transaction list filters correctly for the displayed period
- [ ] "載入更多" button is hidden in cycle mode

**Step 3: Open a non-credit-card account**

Verify:
- [ ] No billing cycle navigator appears
- [ ] "載入更多" button still works as before
- [ ] No visual changes

**Step 4: Final commit if any fixes needed**

```bash
git add -u
git commit -m "fix: billing cycle view adjustments from manual testing"
```
