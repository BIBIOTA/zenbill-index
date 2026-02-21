# Account Detail Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `/accounts/:id` detail page with inline editing and transaction history.

**Architecture:** New page component fetched via React Router `useParams`. Uses existing backend APIs (`GET/PUT /accounts/:id`, `GET /transactions?account_id=`). Adds one new hook (`useAccount`) and one new page component. Minimal changes to existing files.

**Tech Stack:** React 19, TypeScript, React Router DOM 7, TanStack React Query 5, Tailwind CSS 4, Lucide icons

---

### Task 1: Add `useAccount(id)` hook

**Files:**
- Modify: `frontend/src/hooks/useAccounts.ts`

**Step 1: Add the hook**

Add this function after the existing `useAccounts()` hook (after line 10):

```typescript
export function useAccount(id: string) {
  return useQuery({
    queryKey: ['accounts', id],
    queryFn: () => api.get<ApiResponse<Account>>(`/accounts/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}
```

**Step 2: Verify no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/hooks/useAccounts.ts
git commit -m "feat: add useAccount(id) hook for single account fetch"
```

---

### Task 2: Create `AccountDetailPage` — read-only view

**Files:**
- Create: `frontend/src/pages/AccountDetailPage.tsx`

**Step 1: Create the page component**

```tsx
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Pencil, X, Check, CreditCard, Banknote, Wallet } from 'lucide-react'
import { useAccount, useAccounts, useUpdateAccount } from '@/hooks/useAccounts'
import { useBanks } from '@/hooks/useBanks'
import { useTransactions } from '@/hooks/useTransactions'
import type { Account, AccountType, CreateAccountInput } from '@/types'

const typeConfig: Record<AccountType, { label: string; color: string; border: string; icon: typeof CreditCard }> = {
  BANK: { label: '銀行帳戶', color: 'text-emerald-400', border: 'border-t-emerald-400', icon: Banknote },
  CREDIT: { label: '信用卡', color: 'text-amber-400', border: 'border-t-amber-400', icon: CreditCard },
  CASH: { label: '現金', color: 'text-cyan-400', border: 'border-t-cyan-400', icon: Wallet },
}

const inputClass = 'w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)]'

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: account, isLoading } = useAccount(id!)
  const { data: banks } = useBanks()
  const { data: allAccounts } = useAccounts()
  const updateAccount = useUpdateAccount()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<CreateAccountInput>>({})
  const [txPage, setTxPage] = useState(1)

  const { data: txData } = useTransactions({
    account_id: id,
    page: 1,
    page_size: txPage * 20,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!account) {
    return (
      <div className="p-4 md:p-6">
        <Link to="/accounts" className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-4">
          <ArrowLeft className="w-4 h-4" /> 帳戶列表
        </Link>
        <p className="text-sm text-[var(--text-muted)]">找不到此帳戶</p>
      </div>
    )
  }

  const cfg = typeConfig[account.type] ?? typeConfig.CASH
  const Icon = cfg.icon
  const bankName = banks?.find((b) => b.id === account.bank_id)?.name
  const autoPayAccount = allAccounts?.find((a) => a.id === account.auto_pay_from_id)

  const startEdit = () => {
    setForm({
      name: account.name,
      currency: account.currency,
      passbook_number: account.passbook_number,
      bank_id: account.bank_id ?? undefined,
      closing_day: account.closing_day ?? undefined,
      payment_due_day: account.payment_due_day ?? undefined,
      auto_pay_enabled: account.auto_pay_enabled,
      auto_pay_from_id: account.auto_pay_from_id ?? undefined,
    })
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setForm({})
  }

  const saveEdit = () => {
    updateAccount.mutate(
      { id: account.id, ...form },
      { onSuccess: () => setEditing(false) },
    )
  }

  const transactions = txData?.data ?? []
  const hasMore = txData?.pagination ? txData.pagination.page < txData.pagination.total_pages : false

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      {/* Back link */}
      <Link to="/accounts" className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <ArrowLeft className="w-4 h-4" /> 帳戶列表
      </Link>

      {/* Header */}
      <div className={`bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] border-t-2 ${cfg.border} p-4`}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${cfg.color}`} />
            {editing ? (
              <input
                value={form.name ?? ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="text-lg font-bold bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-lg px-2 py-0.5 focus:outline-none focus:border-[var(--color-accent)]"
              />
            ) : (
              <h1 className="text-lg font-bold">{account.name}</h1>
            )}
          </div>
          {editing ? (
            <div className="flex gap-1">
              <button
                onClick={saveEdit}
                disabled={updateAccount.isPending}
                className="flex items-center gap-1 h-8 px-3 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" /> {updateAccount.isPending ? '儲存中...' : '儲存'}
              </button>
              <button onClick={cancelEdit} className="flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                <X className="w-3.5 h-3.5" /> 取消
              </button>
            </div>
          ) : (
            <button onClick={startEdit} className="flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              <Pencil className="w-3.5 h-3.5" /> 編輯
            </button>
          )}
        </div>
        <p className="text-2xl font-bold tabular-nums">${account.balance.toLocaleString()}</p>
      </div>

      {/* Account Info */}
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-4 space-y-3">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">帳戶資訊</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-[var(--text-muted)] text-xs">類型</span>
            <p>{cfg.label}</p>
          </div>
          <div>
            <span className="text-[var(--text-muted)] text-xs">幣別</span>
            {editing ? (
              <select value={form.currency ?? 'TWD'} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputClass}>
                <option value="TWD">TWD</option>
                <option value="USD">USD</option>
                <option value="JPY">JPY</option>
                <option value="EUR">EUR</option>
              </select>
            ) : (
              <p>{account.currency}</p>
            )}
          </div>
          {(account.type === 'BANK' || account.type === 'CREDIT') && (
            <>
              <div>
                <span className="text-[var(--text-muted)] text-xs">銀行</span>
                {editing ? (
                  <select value={form.bank_id ?? ''} onChange={(e) => setForm({ ...form, bank_id: e.target.value || undefined })} className={inputClass}>
                    <option value="">請選擇銀行</option>
                    {banks?.map((b) => (
                      <option key={b.id} value={b.id}>{b.code} - {b.name}</option>
                    ))}
                  </select>
                ) : (
                  <p>{bankName ?? '-'}</p>
                )}
              </div>
              <div>
                <span className="text-[var(--text-muted)] text-xs">帳號</span>
                {editing ? (
                  <input value={form.passbook_number ?? ''} onChange={(e) => setForm({ ...form, passbook_number: e.target.value })} placeholder="帳號" className={inputClass} />
                ) : (
                  <p>{account.passbook_number || '-'}</p>
                )}
              </div>
            </>
          )}
          {account.type === 'CREDIT' && (
            <>
              <div>
                <span className="text-[var(--text-muted)] text-xs">結帳日</span>
                {editing ? (
                  <input type="number" min={1} max={28} value={form.closing_day ?? ''} onChange={(e) => setForm({ ...form, closing_day: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} />
                ) : (
                  <p>{account.closing_day ? `每月 ${account.closing_day} 日` : '-'}</p>
                )}
              </div>
              <div>
                <span className="text-[var(--text-muted)] text-xs">繳款日</span>
                {editing ? (
                  <input type="number" min={1} max={28} value={form.payment_due_day ?? ''} onChange={(e) => setForm({ ...form, payment_due_day: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} />
                ) : (
                  <p>{account.payment_due_day ? `每月 ${account.payment_due_day} 日` : '-'}</p>
                )}
              </div>
              <div className="col-span-2">
                <span className="text-[var(--text-muted)] text-xs">自動扣款</span>
                {editing ? (
                  <div className="flex items-center gap-3 mt-1">
                    <input
                      type="checkbox"
                      checked={form.auto_pay_enabled ?? false}
                      onChange={(e) => setForm({ ...form, auto_pay_enabled: e.target.checked, auto_pay_from_id: e.target.checked ? form.auto_pay_from_id : undefined })}
                      className="w-4 h-4 rounded border-[var(--border-subtle)] accent-[var(--color-accent)]"
                    />
                    {form.auto_pay_enabled && (
                      <select value={form.auto_pay_from_id ?? ''} onChange={(e) => setForm({ ...form, auto_pay_from_id: e.target.value || undefined })} className={inputClass}>
                        <option value="">請選擇扣款帳戶</option>
                        {allAccounts?.filter((a) => a.type === 'BANK').map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <p>{account.auto_pay_enabled ? `✅ 從 ${autoPayAccount?.name ?? '(未知帳戶)'}` : '關閉'}</p>
                )}
              </div>
            </>
          )}
          <div>
            <span className="text-[var(--text-muted)] text-xs">建立日期</span>
            <p>{new Date(account.created_at).toLocaleDateString('zh-TW')}</p>
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-4">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">交易記錄</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">尚無交易記錄</p>
        ) : (
          <div className="space-y-1">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0">
                <div>
                  <p className="text-sm">{tx.note || '(無描述)'}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{new Date(tx.occurred_at).toLocaleDateString('zh-TW')}</p>
                </div>
                <span className={`text-sm font-medium tabular-nums ${tx.type === 'INCOME' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {tx.type === 'INCOME' ? '+' : '-'}${Math.abs(tx.amount).toLocaleString()}
                </span>
              </div>
            ))}
            {hasMore && (
              <button
                onClick={() => setTxPage((p) => p + 1)}
                className="w-full py-2 text-xs text-[var(--color-accent)] hover:opacity-80"
              >
                載入更多
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Verify no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/pages/AccountDetailPage.tsx
git commit -m "feat: add AccountDetailPage with inline edit and transaction list"
```

---

### Task 3: Wire up route and navigation

**Files:**
- Modify: `frontend/src/App.tsx` (add route)
- Modify: `frontend/src/pages/AccountsPage.tsx` (make cards clickable)

**Step 1: Add route to App.tsx**

After line 9 (the `AccountsPage` lazy import), add:

```typescript
const AccountDetailPage = lazy(() => import('@/pages/AccountDetailPage'))
```

After line 35 (the `/accounts` route), add:

```tsx
            <Route path="/accounts/:id" element={<AccountDetailPage />} />
```

**Step 2: Make account cards clickable in AccountsPage.tsx**

Add `useNavigate` import — change line 1-5 from:

```tsx
import { useState } from 'react'
import { Plus, Pencil, Trash2, CreditCard, Banknote, Wallet } from 'lucide-react'
import { useAccounts, useCreateAccount, useDeleteAccount } from '@/hooks/useAccounts'
import { useBanks } from '@/hooks/useBanks'
import type { Account, AccountType, CreateAccountInput } from '@/types'
```

to:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, CreditCard, Banknote, Wallet } from 'lucide-react'
import { useAccounts, useCreateAccount, useDeleteAccount } from '@/hooks/useAccounts'
import { useBanks } from '@/hooks/useBanks'
import type { Account, AccountType, CreateAccountInput } from '@/types'
```

Inside the component function, after line 17 (`const deleteAccount = ...`), add:

```typescript
  const navigate = useNavigate()
```

Replace the account card `<div>` (lines 74-104) — change the outer div from:

```tsx
                  <div
                    key={account.id}
                    className={`bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] border-t-2 ${cfg.border} p-4`}
                  >
```

to:

```tsx
                  <div
                    key={account.id}
                    onClick={() => navigate(`/accounts/${account.id}`)}
                    className={`bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] border-t-2 ${cfg.border} p-4 cursor-pointer hover:border-[var(--color-accent)]/30 transition-colors`}
                  >
```

Update the edit and delete buttons to stop event propagation. Change lines 83-93 from:

```tsx
                      <div className="flex gap-1">
                        <button className="p-1 rounded hover:bg-[var(--bg-hover)]">
                          <Pencil className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        </button>
                        <button
                          onClick={() => deleteAccount.mutate(account.id)}
                          className="p-1 rounded hover:bg-[var(--bg-hover)]"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
```

to:

```tsx
                      <div className="flex gap-1">
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/accounts/${account.id}?edit=1`) }} className="p-1 rounded hover:bg-[var(--bg-hover)]">
                          <Pencil className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteAccount.mutate(account.id) }}
                          className="p-1 rounded hover:bg-[var(--bg-hover)]"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
```

**Step 3: Handle `?edit=1` query param in AccountDetailPage**

In `AccountDetailPage.tsx`, add `useSearchParams` import — change the `useParams` import line to:

```tsx
import { useParams, useSearchParams, Link } from 'react-router-dom'
```

After `const [txPage, setTxPage] = useState(1)`, add:

```tsx
  const [searchParams] = useSearchParams()
```

After the `if (!account)` block (after the early returns), add this `useEffect`-free approach: replace the `startEdit` function definition and add auto-edit on mount. Change the approach: instead of useEffect, check `searchParams` when account loads. Replace the existing `startEdit` definition with:

```tsx
  const shouldAutoEdit = searchParams.get('edit') === '1' && !editing && account

  const startEdit = () => {
    setForm({
      name: account.name,
      currency: account.currency,
      passbook_number: account.passbook_number,
      bank_id: account.bank_id ?? undefined,
      closing_day: account.closing_day ?? undefined,
      payment_due_day: account.payment_due_day ?? undefined,
      auto_pay_enabled: account.auto_pay_enabled,
      auto_pay_from_id: account.auto_pay_from_id ?? undefined,
    })
    setEditing(true)
  }

  if (shouldAutoEdit) {
    startEdit()
  }
```

Actually, this won't work in React because calling `setEditing` during render causes issues. Use `useEffect` instead. Add import:

```tsx
import { useState, useEffect } from 'react'
```

And replace the auto-edit logic with a `useEffect` after the `startEdit` function:

```tsx
  useEffect(() => {
    if (searchParams.get('edit') === '1' && account && !editing) {
      startEdit()
    }
  }, [account]) // eslint-disable-line react-hooks/exhaustive-deps
```

**Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Verify dev server renders**

Run: `cd frontend && npm run dev`
Expected: Vite dev server starts without errors

**Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/AccountsPage.tsx frontend/src/pages/AccountDetailPage.tsx
git commit -m "feat: wire up account detail route and clickable cards"
```

---

### Task 4: Manual browser verification

**Step 1: Open accounts page**

Navigate to `https://yukimac-mini.echo-mercat.ts.net:3000/accounts`

- Verify account cards show cursor pointer on hover
- Verify clicking a card navigates to `/accounts/<uuid>`

**Step 2: Verify detail page**

On the detail page:
- Back link "帳戶列表" returns to `/accounts`
- Account name, balance, type, currency displayed correctly
- For credit card accounts: closing day, payment due day, auto-pay info shown

**Step 3: Verify inline edit**

- Click "編輯" button → fields become inputs
- Change account name → click "儲存"
- Verify name updates without page reload
- Click "編輯" then "取消" → reverts to read-only

**Step 4: Verify transactions section**

- Transactions for this account are listed
- "載入更多" button appears if more transactions exist
- Income is green, expense is red

**Step 5: Verify edit button from list page**

- On accounts list, click pencil icon → navigates to detail page in edit mode

**Step 6: Commit any fixes if needed**

---

### Task 5: Final cleanup and commit

**Step 1: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 2: Run lint if configured**

Run: `cd frontend && npm run lint` (if available)
Expected: No errors

**Step 3: Squash or final commit if needed**

Ensure all changes are committed with clean messages.
