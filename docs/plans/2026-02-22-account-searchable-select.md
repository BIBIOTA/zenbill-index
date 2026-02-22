# Account Searchable Select Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace plain `<select>` with `SearchableSelect` for account selection in TransactionForm, with type-based grouping.

**Architecture:** Create a `buildAccountOptions` utility (mirroring `buildCategoryOptions`) that groups accounts by type. Swap both account `<select>` elements in `TransactionForm.tsx` to use `SearchableSelect`.

**Tech Stack:** React, TypeScript, existing `SearchableSelect` component

---

### Task 1: Create `buildAccountOptions` utility

**Files:**
- Create: `frontend/src/components/transactions/accountOptions.ts`

**Step 1: Create the utility file**

```ts
import type { Account } from '@/types'
import type { SelectOption } from '@/components/ui/SearchableSelect'

const typeLabels: Record<string, string> = {
  CASH: '現金',
  BANK: '銀行',
  CREDIT: '信用卡',
  CRYPTO: '加密貨幣',
}

export function buildAccountOptions(
  accounts: Account[],
  excludeId?: string,
): SelectOption[] {
  const grouped = new Map<string, Account[]>()

  for (const acct of accounts) {
    if (acct.id === excludeId) continue
    const group = grouped.get(acct.type) ?? []
    group.push(acct)
    grouped.set(acct.type, group)
  }

  const result: SelectOption[] = []
  for (const [type, accts] of grouped) {
    if (accts.length === 0) continue
    result.push({ id: `group-${type}`, label: typeLabels[type] ?? type, group: typeLabels[type] ?? type })
    for (const acct of accts) {
      result.push({ id: acct.id, label: acct.name, indent: true })
    }
  }

  return result
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add frontend/src/components/transactions/accountOptions.ts
git commit -m "feat: add buildAccountOptions utility for grouped account select"
```

---

### Task 2: Replace account `<select>` with `SearchableSelect` in TransactionForm

**Files:**
- Modify: `frontend/src/components/transactions/TransactionForm.tsx`

**Step 1: Add import**

At line 9, after the `buildCategoryOptions` import, add:

```ts
import { buildAccountOptions } from './accountOptions'
```

**Step 2: Add account options computation**

After the `categoryOptions` line (line 81), add:

```ts
const accountOptions = buildAccountOptions(accounts ?? [])
const targetAccountOptions = buildAccountOptions(accounts ?? [], form.account_id)
```

**Step 3: Replace source account `<select>` (lines 155-168)**

Replace the entire `{/* Account */}` block with:

```tsx
{/* Account */}
<div>
  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">帳戶</label>
  <SearchableSelect
    value={form.account_id || undefined}
    options={accountOptions}
    placeholder="選擇帳戶"
    onChange={(id) => setForm({ ...form, account_id: id ?? '' })}
    allowClear={false}
  />
</div>
```

**Step 4: Replace target account `<select>` (lines 171-186)**

Replace the entire `{/* Target account */}` block with:

```tsx
{/* Target account (transfer only) */}
{form.type === 'TRANSFER' && (
  <div>
    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">轉入帳戶</label>
    <SearchableSelect
      value={form.target_account_id}
      options={targetAccountOptions}
      placeholder="選擇轉入帳戶"
      onChange={(id) => setForm({ ...form, target_account_id: id })}
      allowClear
    />
  </div>
)}
```

**Step 5: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 6: Visual verification**

Open the transaction form in the browser and verify:
- Account field shows searchable dropdown with type grouping (現金, 銀行, 信用卡, 加密貨幣)
- Typing filters accounts
- Selecting works correctly
- Transfer mode shows target account also as searchable select
- Target account excludes the selected source account

**Step 7: Commit**

```bash
git add frontend/src/components/transactions/TransactionForm.tsx
git commit -m "feat: replace account select with SearchableSelect in TransactionForm"
```
