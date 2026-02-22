# Searchable Select + Quick Create Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace native `<select>` dropdowns for merchant/category in the transaction form with a searchable select component, add quick-create sub-modals, and auto-fill merchant default category.

**Architecture:** A shared `SearchableSelect` UI component handles the dropdown with search. Two Quick Create modals (`MerchantQuickCreate`, `CategoryQuickCreate`) open from the select's "+" button. `TransactionFormModal` orchestrates these and handles the merchant→category auto-fill logic.

**Tech Stack:** React, TypeScript, TanStack Query (existing hooks), Tailwind CSS (existing design tokens), lucide-react (existing icons)

---

### Task 1: Create SearchableSelect Component

**Files:**
- Create: `frontend/src/components/ui/SearchableSelect.tsx`

**Step 1: Create the component file**

```tsx
// frontend/src/components/ui/SearchableSelect.tsx
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X, Search, Plus } from 'lucide-react'

export interface SelectOption {
  id: string
  label: string
  icon?: string
  group?: string       // group header text (option becomes non-selectable header)
  indent?: boolean     // render indented (for child categories)
}

interface SearchableSelectProps {
  value: string | undefined
  options: SelectOption[]
  placeholder: string
  onChange: (id: string | undefined) => void
  onCreateNew?: () => void
  createNewLabel?: string
  allowClear?: boolean
}

export default function SearchableSelect({
  value,
  options,
  placeholder,
  onChange,
  onCreateNew,
  createNewLabel = '新增',
  allowClear = true,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    if (isOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // Auto-focus search when opened
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  const selectedOption = options.find((o) => o.id === value && !o.group)
  const displayLabel = selectedOption
    ? `${selectedOption.icon ? selectedOption.icon + ' ' : ''}${selectedOption.label}`
    : ''

  // Filter options: keep group headers if any child matches
  const filtered = search
    ? options.filter((opt) => {
        if (opt.group) {
          // Keep group header if any following item in same group matches
          const idx = options.indexOf(opt)
          for (let i = idx + 1; i < options.length && !options[i].group; i++) {
            if (options[i].label.toLowerCase().includes(search.toLowerCase())) return true
          }
          return false
        }
        return opt.label.toLowerCase().includes(search.toLowerCase())
      })
    : options

  const handleSelect = (id: string) => {
    onChange(id)
    setIsOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(undefined)
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm text-left flex items-center gap-2 focus:outline-none focus:border-[var(--color-accent)]"
      >
        <span className={`flex-1 truncate ${!selectedOption ? 'text-[var(--text-muted)]' : ''}`}>
          {displayLabel || placeholder}
        </span>
        {allowClear && value && (
          <X className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0" onClick={handleClear} />
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-[60] mt-1 w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)]">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋..."
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-[var(--text-muted)]">找不到結果</div>
            )}
            {filtered.map((opt, i) =>
              opt.group ? (
                <div key={`group-${i}`} className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                  {opt.icon ? `${opt.icon} ` : ''}{opt.label}
                </div>
              ) : (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] transition-colors ${
                    opt.indent ? 'pl-7' : ''
                  } ${opt.id === value ? 'text-[var(--color-accent)] font-medium' : ''}`}
                >
                  {opt.icon ? `${opt.icon} ` : ''}{opt.label}
                </button>
              ),
            )}
          </div>

          {/* Create new button */}
          {onCreateNew && (
            <button
              type="button"
              onClick={() => { onCreateNew(); setIsOpen(false); setSearch('') }}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--bg-hover)] border-t border-[var(--border-subtle)]"
            >
              <Plus className="w-3.5 h-3.5" />
              {createNewLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to SearchableSelect.tsx

**Step 3: Commit**

```bash
git add frontend/src/components/ui/SearchableSelect.tsx
git commit -m "feat: add SearchableSelect component with search and create-new button"
```

---

### Task 2: Create MerchantQuickCreate Modal

**Files:**
- Create: `frontend/src/components/transactions/MerchantQuickCreate.tsx`

**Step 1: Create the component**

```tsx
// frontend/src/components/transactions/MerchantQuickCreate.tsx
import { useState } from 'react'
import { useCreateMerchant } from '@/hooks/useMerchants'
import { useCategories } from '@/hooks/useCategories'
import { useAccounts } from '@/hooks/useAccounts'
import type { CreateMerchantInput, CategoryType } from '@/types'
import SearchableSelect from '@/components/ui/SearchableSelect'
import type { SelectOption } from '@/components/ui/SearchableSelect'
import { buildCategoryOptions } from './categoryOptions'

interface Props {
  open: boolean
  /** Filter categories to this transaction type when showing default category */
  transactionType?: CategoryType
  onCreated: (merchantId: string) => void
  onClose: () => void
}

export default function MerchantQuickCreate({ open, transactionType, onCreated, onClose }: Props) {
  const { data: categories } = useCategories()
  const { data: accounts } = useAccounts()
  const createMerchant = useCreateMerchant()

  const [form, setForm] = useState<CreateMerchantInput>({ name: '' })

  if (!open) return null

  const categoryOptions = buildCategoryOptions(categories ?? [], transactionType)

  const accountOptions: SelectOption[] = (accounts ?? []).map((a) => ({
    id: a.id,
    label: a.name,
  }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMerchant.mutate(form, {
      onSuccess: (res) => {
        onCreated(res.data.id)
        setForm({ name: '' })
        onClose()
      },
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={handleSubmit} className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-6 w-full max-w-sm space-y-4">
        <h3 className="text-sm font-bold">新增商家</h3>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">名稱</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="商家名稱"
            className="w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">預設分類</label>
          <SearchableSelect
            value={form.default_category_id}
            options={categoryOptions}
            placeholder="選填"
            onChange={(id) => setForm({ ...form, default_category_id: id })}
            allowClear
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">預設帳戶</label>
          <SearchableSelect
            value={form.default_account_id}
            options={accountOptions}
            placeholder="選填"
            onChange={(id) => setForm({ ...form, default_account_id: id })}
            allowClear
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-8 px-4 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button type="submit" disabled={createMerchant.isPending} className="h-8 px-4 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
            {createMerchant.isPending ? '建立中...' : '建立'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/transactions/MerchantQuickCreate.tsx
git commit -m "feat: add MerchantQuickCreate modal"
```

---

### Task 3: Create CategoryQuickCreate Modal

**Files:**
- Create: `frontend/src/components/transactions/CategoryQuickCreate.tsx`

**Step 1: Create the component**

```tsx
// frontend/src/components/transactions/CategoryQuickCreate.tsx
import { useState } from 'react'
import { useCreateCategory } from '@/hooks/useCategories'
import { useCategories } from '@/hooks/useCategories'
import type { CreateCategoryInput, CategoryType } from '@/types'
import SearchableSelect from '@/components/ui/SearchableSelect'

interface Props {
  open: boolean
  defaultType?: CategoryType
  onCreated: (categoryId: string) => void
  onClose: () => void
}

export default function CategoryQuickCreate({ open, defaultType, onCreated, onClose }: Props) {
  const { data: categories } = useCategories()
  const createCategory = useCreateCategory()

  const [form, setForm] = useState<CreateCategoryInput>({
    name: '',
    type: defaultType ?? 'EXPENSE',
    icon: '',
  })

  if (!open) return null

  // Only show top-level categories as potential parents
  const parentOptions = (categories ?? [])
    .filter((c) => !c.parent_id && c.type === form.type)
    .map((c) => ({ id: c.id, label: `${c.icon} ${c.name}` }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createCategory.mutate(form, {
      onSuccess: (res) => {
        onCreated(res.data.id)
        setForm({ name: '', type: defaultType ?? 'EXPENSE', icon: '' })
        onClose()
      },
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={handleSubmit} className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-6 w-full max-w-sm space-y-4">
        <h3 className="text-sm font-bold">新增分類</h3>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">名稱</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="分類名稱"
            className="w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">類型</label>
          <div className="flex gap-1">
            {(['EXPENSE', 'INCOME'] as CategoryType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, type: t, parent_id: undefined })}
                className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors ${
                  form.type === t
                    ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {t === 'EXPENSE' ? '支出' : '收入'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">圖示 (Emoji)</label>
          <input
            value={form.icon || ''}
            onChange={(e) => setForm({ ...form, icon: e.target.value })}
            placeholder="例如: 🍽️"
            className="w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">父分類</label>
          <SearchableSelect
            value={form.parent_id}
            options={parentOptions}
            placeholder="無（頂層分類）"
            onChange={(id) => setForm({ ...form, parent_id: id })}
            allowClear
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-8 px-4 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button type="submit" disabled={createCategory.isPending} className="h-8 px-4 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
            {createCategory.isPending ? '建立中...' : '建立'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/transactions/CategoryQuickCreate.tsx
git commit -m "feat: add CategoryQuickCreate modal"
```

---

### Task 4: Create Category Options Helper

Both `TransactionFormModal` and `MerchantQuickCreate` need to transform the `Category[]` tree into flat `SelectOption[]`. Extract this to a shared helper.

**Files:**
- Create: `frontend/src/components/transactions/categoryOptions.ts`

**Step 1: Create the helper**

```ts
// frontend/src/components/transactions/categoryOptions.ts
import type { Category, CategoryType } from '@/types'
import type { SelectOption } from '@/components/ui/SearchableSelect'

/**
 * Flatten Category tree into SelectOption[] for SearchableSelect.
 * Parent categories become non-selectable group headers.
 * Child categories are indented with emoji icons.
 * Optionally filter by CategoryType (EXPENSE/INCOME).
 */
export function buildCategoryOptions(
  categories: Category[],
  filterType?: CategoryType,
): SelectOption[] {
  const result: SelectOption[] = []

  for (const cat of categories) {
    // Skip if filtered by type and doesn't match
    if (filterType && cat.type !== filterType) continue
    // Skip child categories at top level (they'll be nested under parent)
    if (cat.parent_id) continue

    if (cat.children && cat.children.length > 0) {
      // Parent with children → group header
      result.push({ id: `group-${cat.id}`, label: cat.name, icon: cat.icon, group: cat.name })
      for (const child of cat.children) {
        result.push({ id: child.id, label: child.name, icon: child.icon, indent: true })
      }
    } else {
      // Standalone category (no children)
      result.push({ id: cat.id, label: cat.name, icon: cat.icon })
    }
  }

  return result
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/transactions/categoryOptions.ts
git commit -m "feat: add buildCategoryOptions helper for flat SelectOption list"
```

---

### Task 5: Integrate into TransactionFormModal

Replace the native `<select>` dropdowns for merchant and category with `SearchableSelect`, wire up quick-create modals, and add merchant→category auto-fill.

**Files:**
- Modify: `frontend/src/components/transactions/TransactionFormModal.tsx`

**Step 1: Rewrite TransactionFormModal**

Replace the full file content with:

```tsx
// frontend/src/components/transactions/TransactionFormModal.tsx
import { useState, useEffect } from 'react'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useMerchants } from '@/hooks/useMerchants'
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/useTransactions'
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

const makeEmptyForm = (defaultAccountId?: string): FormData => ({
  account_id: defaultAccountId ?? '',
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
  open: boolean
  editingTransaction?: Transaction
  defaultAccountId?: string
  onClose: () => void
}

export default function TransactionFormModal({ open, editingTransaction, defaultAccountId, onClose }: Props) {
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const { data: merchants } = useMerchants()
  const createTx = useCreateTransaction()
  const updateTx = useUpdateTransaction()

  const [form, setForm] = useState<FormData>(() =>
    editingTransaction ? txToForm(editingTransaction) : makeEmptyForm(defaultAccountId),
  )
  const [showMerchantCreate, setShowMerchantCreate] = useState(false)
  const [showCategoryCreate, setShowCategoryCreate] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(editingTransaction ? txToForm(editingTransaction) : makeEmptyForm(defaultAccountId))
    }
  }, [open, editingTransaction, defaultAccountId])

  if (!open) return null

  const isEditing = !!editingTransaction
  const isPending = createTx.isPending || updateTx.isPending

  // Build options
  const merchantOptions: SelectOption[] = (merchants ?? []).map((m) => ({
    id: m.id,
    label: m.name,
  }))

  const categoryTypeFilter: CategoryType | undefined =
    form.type === 'TRANSFER' ? undefined : (form.type as CategoryType)
  const categoryOptions = buildCategoryOptions(categories ?? [], categoryTypeFilter)

  // Merchant → category auto-fill
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
    const data = { ...payload, occurred_at: new Date(payload.occurred_at).toISOString() }

    if (isEditing) {
      updateTx.mutate({ id: editingTransaction.id, ...data }, { onSuccess: onClose })
    } else {
      createTx.mutate(data, { onSuccess: onClose })
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <form
          onSubmit={handleSubmit}
          className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
        >
          <h2 className="text-base font-bold">{isEditing ? '編輯交易' : '新增交易'}</h2>

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

          {/* Merchant - SearchableSelect */}
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

          {/* Category - SearchableSelect */}
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
            <input
              value={form.note || ''}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-8 px-4 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
            <button type="submit" disabled={isPending} className="h-8 px-4 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
              {isPending ? (isEditing ? '儲存中...' : '建立中...') : (isEditing ? '儲存' : '建立')}
            </button>
          </div>
        </form>
      </div>

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

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No type errors

**Step 3: Commit**

```bash
git add frontend/src/components/transactions/TransactionFormModal.tsx
git commit -m "feat: integrate SearchableSelect and quick-create modals into transaction form"
```

---

### Task 6: Visual Testing and Polish

**Step 1: Start the dev server and test manually**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npm run dev`

**Step 2: Test scenarios**

Open the transaction form and verify:
1. Merchant SearchableSelect opens, search filters options, clear button works
2. Category SearchableSelect shows grouped hierarchy with emoji icons
3. Switching transaction type filters categories (EXPENSE/INCOME)
4. Selecting a merchant with default_category_id auto-fills category (when category is empty)
5. Selecting a merchant when category already set does NOT override
6. "新增商家" opens sub-modal, creating merchant auto-selects it
7. "新增分類" opens sub-modal, creating category auto-selects it
8. Click outside dropdown closes it
9. Click outside sub-modal closes it
10. Editing existing transaction pre-fills merchant/category correctly

**Step 3: Fix any visual or functional issues found**

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: polish searchable select styling and behavior"
```
