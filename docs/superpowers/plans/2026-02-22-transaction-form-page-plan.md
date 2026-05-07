# Transaction Form: Modal → Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor transaction create/edit from modal to dedicated page routes (`/transactions/new`, `/transactions/:id/edit`), including invoice import flow via route state.

**Architecture:** Extract form logic from `TransactionFormModal.tsx` into a pure `TransactionForm.tsx` component. Create `TransactionFormPage.tsx` as the page wrapper handling routing, data fetching, and navigation. Update `TransactionsPage`, `InvoicesPage`, and `App.tsx` to use navigation instead of modal state.

**Tech Stack:** React, React Router v6 (`useNavigate`, `useParams`, `useSearchParams`, `useLocation`), TanStack Query, TypeScript

---

### Task 1: Add `useTransaction` hook for fetching a single transaction

The edit page needs to fetch a transaction by ID. The backend has `GET /transactions/:id` but there's no frontend hook for it yet.

**Files:**
- Modify: `frontend/src/hooks/useTransactions.ts`

**Step 1: Add the hook**

Add this after the existing `useTransactions` function (around line 28):

```typescript
export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: ['transactions', id],
    queryFn: () => api.get<ApiResponse<Transaction>>(`/transactions/${id}`),
    enabled: !!id,
    select: (res) => res.data,
  })
}
```

Add `ApiResponse` to the import from `@/types` on line 3:

```typescript
import type { Transaction, PaginatedResponse, ApiResponse, CreateTransactionInput } from '@/types'
```

**Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
feat: add useTransaction hook for fetching single transaction
```

---

### Task 2: Create `TransactionForm.tsx` — pure form component

Extract the form body from `TransactionFormModal.tsx` into a standalone component. This is the bulk of the refactor.

**Files:**
- Create: `frontend/src/components/transactions/TransactionForm.tsx`

**Step 1: Create the component**

The component takes props instead of managing its own open/close state. It renders the form fields, type selector, quick-create modals — everything except the modal overlay wrapper.

```tsx
import { useState, useEffect } from 'react'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useMerchants } from '@/hooks/useMerchants'
import { useCreateTransaction, useUpdateTransaction, useDeleteTransaction } from '@/hooks/useTransactions'
import type { Transaction, TransactionType, CreateTransactionInput, CategoryType } from '@/types'
import SearchableSelect from '@/components/ui/SearchableSelect'
import type { SelectOption } from '@/components/ui/SearchableSelect'
import { buildCategoryOptions } from './categoryOptions'
import MerchantQuickCreate from './MerchantQuickCreate'
import CategoryQuickCreate from './CategoryQuickCreate'

const typeColors: Record<string, { text: string; bg: string; label: string }> = {
  EXPENSE: { text: 'text-red-400', bg: 'bg-red-400/10', label: '支出' },
  INCOME: { text: 'text-emerald-400', bg: 'bg-emerald-400/10', label: '收入' },
  TRANSFER: { text: 'text-cyan-400', bg: 'bg-cyan-400/10', label: '轉帳' },
}

type FormData = CreateTransactionInput & { amountStr: string }

const makeEmptyForm = (): FormData => ({
  account_id: '',
  type: 'EXPENSE',
  amount: 0,
  amountStr: '',
  occurred_at: new Date().toISOString().slice(0, 10),
  note: '',
})

const txToForm = (tx: Transaction): FormData => ({
  account_id: tx.account_id,
  target_account_id: tx.target_account_id ?? undefined,
  type: tx.type,
  amount: tx.amount,
  amountStr: String(tx.amount),
  occurred_at: new Date(tx.occurred_at).toISOString().slice(0, 10),
  category_id: tx.category_id ?? undefined,
  merchant_id: tx.merchant_id ?? undefined,
  note: tx.note || '',
})

interface Props {
  /** Existing transaction for edit mode. Undefined = create mode. */
  editingTransaction?: Transaction
  /** Pre-fill form fields (used for invoice import). */
  defaultValues?: Partial<FormData>
  /** Link created transaction to this invoice. */
  invoiceId?: string
  /** Called after successful create/update/delete or cancel. */
  onDone: () => void
}

export default function TransactionForm({ editingTransaction, defaultValues, invoiceId, onDone }: Props) {
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const { data: merchants } = useMerchants()
  const createTx = useCreateTransaction()
  const updateTx = useUpdateTransaction()
  const deleteTx = useDeleteTransaction()

  const [form, setForm] = useState<FormData>(() =>
    editingTransaction ? txToForm(editingTransaction) : { ...makeEmptyForm(), ...defaultValues },
  )
  const [showMerchantCreate, setShowMerchantCreate] = useState(false)
  const [showCategoryCreate, setShowCategoryCreate] = useState(false)

  useEffect(() => {
    if (editingTransaction) {
      setForm(txToForm(editingTransaction))
    } else {
      setForm({ ...makeEmptyForm(), ...defaultValues })
    }
  }, [editingTransaction, defaultValues])

  const isEditing = !!editingTransaction
  const isPending = createTx.isPending || updateTx.isPending

  const merchantOptions: SelectOption[] = (merchants ?? []).map((m) => ({
    id: m.id,
    label: m.name,
  }))

  const categoryTypeFilter: CategoryType | undefined =
    form.type === 'TRANSFER' ? undefined : (form.type as CategoryType)
  const categoryOptions = buildCategoryOptions(categories ?? [], categoryTypeFilter)

  const handleMerchantChange = (merchantId: string | undefined) => {
    const updates: Partial<FormData> = { merchant_id: merchantId }
    if (merchantId && !form.category_id) {
      const merchant = merchants?.find((m) => m.id === merchantId)
      if (merchant?.default_category_id) {
        updates.category_id = merchant.default_category_id
      }
    }
    setForm({ ...form, ...updates })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const { amountStr: _, ...payload } = form
    const data = {
      ...payload,
      occurred_at: new Date(payload.occurred_at).toISOString(),
      ...(invoiceId ? { invoice_id: invoiceId } : {}),
    }

    if (isEditing) {
      updateTx.mutate({ id: editingTransaction.id, ...data }, { onSuccess: onDone })
    } else {
      createTx.mutate(data, { onSuccess: onDone })
    }
  }

  const handleDelete = () => {
    if (!editingTransaction) return
    deleteTx.mutate(editingTransaction.id, { onSuccess: onDone })
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        {/* Type selector */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">類型</label>
          <div className="flex gap-1">
            {(['EXPENSE', 'INCOME', 'TRANSFER'] as TransactionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, type: t })}
                className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors ${
                  form.type === t
                    ? `${typeColors[t].bg} ${typeColors[t].text}`
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {typeColors[t].label}
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">金額</label>
          <input
            type="number"
            required
            min={0}
            step="any"
            placeholder="輸入金額"
            value={form.amountStr}
            onChange={(e) => setForm({ ...form, amountStr: e.target.value, amount: Number(e.target.value) || 0 })}
            className="w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        {/* Account */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">帳戶</label>
          <select
            required
            value={form.account_id}
            onChange={(e) => setForm({ ...form, account_id: e.target.value })}
            className="w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
          >
            <option value="">選擇帳戶</option>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* Target account (transfer only) */}
        {form.type === 'TRANSFER' && (
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">轉入帳戶</label>
            <select
              required
              value={form.target_account_id || ''}
              onChange={(e) => setForm({ ...form, target_account_id: e.target.value || undefined })}
              className="w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">選擇轉入帳戶</option>
              {accounts?.filter((a) => a.id !== form.account_id).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Merchant */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">商家</label>
          <SearchableSelect
            value={form.merchant_id}
            options={merchantOptions}
            placeholder="無商家"
            onChange={handleMerchantChange}
            onCreateNew={() => setShowMerchantCreate(true)}
            createNewLabel="新增商家"
            allowClear
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">分類</label>
          <SearchableSelect
            value={form.category_id}
            options={categoryOptions}
            placeholder="無分類"
            onChange={(id) => setForm({ ...form, category_id: id })}
            onCreateNew={() => setShowCategoryCreate(true)}
            createNewLabel="新增分類"
            allowClear
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">日期</label>
          <input
            type="date"
            value={form.occurred_at}
            onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
            className="w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        {/* Note */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">備註</label>
          <textarea
            value={form.note || ''}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)] resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteTx.isPending}
                className="h-8 px-4 rounded-lg text-xs font-medium text-red-400 hover:bg-red-400/10 disabled:opacity-50"
              >
                {deleteTx.isPending ? '刪除中...' : '刪除'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onDone} className="h-8 px-4 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
            <button type="submit" disabled={isPending} className="h-8 px-4 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
              {isPending ? (isEditing ? '儲存中...' : '建立中...') : (isEditing ? '儲存' : '建立')}
            </button>
          </div>
        </div>
      </form>

      {/* Quick Create Modals */}
      <MerchantQuickCreate
        open={showMerchantCreate}
        transactionType={categoryTypeFilter}
        onCreated={(id) => handleMerchantChange(id)}
        onClose={() => setShowMerchantCreate(false)}
      />
      <CategoryQuickCreate
        open={showCategoryCreate}
        defaultType={categoryTypeFilter ?? 'EXPENSE'}
        onCreated={(id) => setForm((prev) => ({ ...prev, category_id: id }))}
        onClose={() => setShowCategoryCreate(false)}
      />
    </>
  )
}
```

Key differences from `TransactionFormModal.tsx`:
- No modal overlay/backdrop — just the `<form>` and quick-create modals
- Single `onDone` callback replaces `onClose` (used for cancel, submit success, and delete)
- Delete button added inline (was in `TransactionsPage` table before)
- `max-w-lg` on form for comfortable reading width on full page
- No `open` prop or `if (!open) return null` check
- `defaultAccountId` prop removed — merged into `defaultValues`

**Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
feat: create TransactionForm component extracted from modal
```

---

### Task 3: Create `TransactionFormPage.tsx` — page wrapper

This page reads route params to determine mode (create vs edit vs invoice import), fetches necessary data, and renders `TransactionForm`.

**Files:**
- Create: `frontend/src/pages/TransactionFormPage.tsx`

**Step 1: Create the page**

```tsx
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTransaction } from '@/hooks/useTransactions'
import TransactionForm from '@/components/transactions/TransactionForm'

export default function TransactionFormPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  const invoiceId = searchParams.get('invoiceId') ?? undefined
  const isEditing = !!id

  // Edit mode: fetch the transaction
  const { data: transaction, isLoading } = useTransaction(id)

  // Invoice import: read matched defaults from route state
  const routeState = location.state as { defaultValues?: Record<string, unknown> } | null
  const defaultValues = routeState?.defaultValues

  const handleDone = () => navigate(-1)

  const title = isEditing ? '編輯交易' : invoiceId ? '從發票建立交易' : '新增交易'

  if (isEditing && isLoading) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={handleDone}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-bold">{title}</h1>
      </div>

      <TransactionForm
        editingTransaction={isEditing ? transaction : undefined}
        defaultValues={defaultValues}
        invoiceId={invoiceId}
        onDone={handleDone}
      />
    </div>
  )
}
```

**Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
feat: create TransactionFormPage with route-based create/edit
```

---

### Task 4: Add routes to `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Add lazy import and routes**

Add after the `TransactionsPage` lazy import (line 11):

```typescript
const TransactionFormPage = lazy(() => import('@/pages/TransactionFormPage'))
```

Add two routes inside the `<Route element={<AppLayout />}>` block, **before** the `/transactions` route (order matters — `/transactions/new` must come before `/transactions/:id` to avoid treating "new" as an id):

```tsx
<Route path="/transactions/new" element={<TransactionFormPage />} />
<Route path="/transactions/:id/edit" element={<TransactionFormPage />} />
<Route path="/transactions" element={<TransactionsPage />} />
```

**Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
feat: add transaction form page routes
```

---

### Task 5: Update `TransactionsPage.tsx` — use navigation instead of modal

**Files:**
- Modify: `frontend/src/pages/TransactionsPage.tsx`

**Step 1: Replace modal with navigate**

1. Add `useNavigate` to the router import (line 2):
   ```typescript
   import { useSearchParams, useNavigate } from 'react-router-dom'
   ```

2. Remove the `TransactionFormModal` import (line 6):
   ```typescript
   // DELETE: import TransactionFormModal from '@/components/transactions/TransactionFormModal'
   ```

3. Remove the `Transaction` type import (line 7) — no longer needed:
   ```typescript
   // DELETE: import type { Transaction } from '@/types'
   ```

4. Add navigate hook inside the component (after line 16):
   ```typescript
   const navigate = useNavigate()
   ```

5. Remove modal state (lines 25-26):
   ```typescript
   // DELETE: const [showForm, setShowForm] = useState(false)
   // DELETE: const [editingTx, setEditingTx] = useState<Transaction | undefined>()
   ```

6. Replace `openCreate` (lines 39-42) with:
   ```typescript
   const openCreate = () => navigate('/transactions/new')
   ```

7. Replace `openEdit` (lines 44-47) with:
   ```typescript
   const openEdit = (txId: string) => navigate(`/transactions/${txId}/edit`)
   ```

8. Remove `closeForm` function (lines 49-52) entirely.

9. Update the edit button click handler (line 125):
   ```typescript
   onClick={() => openEdit(tx.id)}
   ```
   (was `onClick={() => openEdit(tx)}`)

10. Remove the `<TransactionFormModal ... />` JSX at the bottom (lines 168-172).

11. Remove unused imports: `useState` from react (if no longer used — check; `searchParams` state still uses `useState` from URL, but it's `useSearchParams` not `useState`). Actually `useState` is no longer needed — remove from the react import on line 1.

**Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
refactor: replace transaction modal with page navigation in TransactionsPage
```

---

### Task 6: Update `InvoicesPage.tsx` — use navigation for invoice import

**Files:**
- Modify: `frontend/src/pages/InvoicesPage.tsx`

**Step 1: Replace modal with navigate**

1. Add `useNavigate` to the router import (line 2):
   ```typescript
   import { useSearchParams, useNavigate } from 'react-router-dom'
   ```

2. Remove the `TransactionFormModal` import (line 6):
   ```typescript
   // DELETE: import TransactionFormModal from '@/components/transactions/TransactionFormModal'
   ```

3. Add navigate hook inside the component (after line 14):
   ```typescript
   const navigate = useNavigate()
   ```

4. Remove `importTarget` state (line 25):
   ```typescript
   // DELETE: const [importTarget, setImportTarget] = useState<{ invoice: Invoice; defaultValues: Record<string, unknown> } | null>(null)
   ```

5. Update `handleImport` to navigate instead of setting state (lines 79-108). Replace the function body:

   ```typescript
   const handleImport = async (inv: Invoice) => {
     const note = formatInvoiceNote(inv)
     const baseDefaults = {
       type: 'EXPENSE' as const,
       amount: inv.total_amount,
       amountStr: String(inv.total_amount),
       occurred_at: new Date(inv.invoice_date).toISOString().slice(0, 10),
       note,
     }

     try {
       const res = await matchInvoice.mutateAsync(inv.id)
       const match = res.data
       navigate(`/transactions/new?invoiceId=${inv.id}`, {
         state: {
           defaultValues: {
             ...baseDefaults,
             ...(match.merchant_id ? { merchant_id: match.merchant_id } : {}),
             ...(match.category_id ? { category_id: match.category_id } : {}),
             ...(match.account_id ? { account_id: match.account_id } : {}),
           },
         },
       })
     } catch {
       navigate(`/transactions/new?invoiceId=${inv.id}`, {
         state: { defaultValues: baseDefaults },
       })
     }
   }
   ```

6. Remove the `<TransactionFormModal ... />` JSX at the bottom (lines 288-293).

**Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
refactor: replace transaction modal with page navigation in InvoicesPage
```

---

### Task 7: Delete `TransactionFormModal.tsx`

**Files:**
- Delete: `frontend/src/components/transactions/TransactionFormModal.tsx`

**Step 1: Delete the file**

```bash
rm frontend/src/components/transactions/TransactionFormModal.tsx
```

**Step 2: Verify no remaining imports**

Run: `grep -r "TransactionFormModal" frontend/src/`
Expected: No results

**Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```
refactor: delete TransactionFormModal replaced by TransactionForm + page
```

---

### Task 8: Manual smoke test

**No files changed — verification only.**

**Step 1: Start dev server**

Run: `cd frontend && npm run dev`

**Step 2: Test create flow**

1. Navigate to `/transactions`
2. Click "新增交易"
3. Verify URL changes to `/transactions/new`
4. Fill form and submit
5. Verify redirected back to `/transactions`

**Step 3: Test edit flow**

1. On `/transactions`, click a transaction's edit icon
2. Verify URL changes to `/transactions/<id>/edit`
3. Verify form pre-fills with transaction data
4. Edit and save
5. Verify redirected back

**Step 4: Test invoice import flow**

1. Navigate to `/invoices`
2. Click "匯入" on a PENDING invoice
3. Verify URL changes to `/transactions/new?invoiceId=<id>`
4. Verify form pre-fills with invoice data
5. Submit and verify redirect back to invoices

**Step 5: Test cancel/back**

1. On any form page, click back arrow or "取消"
2. Verify returns to previous page

**Step 6: Final commit (if any fixes needed)**

```
fix: address smoke test findings
```
