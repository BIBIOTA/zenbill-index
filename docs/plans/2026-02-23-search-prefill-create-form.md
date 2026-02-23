# Search Term Auto-Fill for Create Forms — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a user searches for a merchant/category that doesn't exist and clicks "Create", auto-fill the search term into the create form's name field.

**Architecture:** Widen the `onCreateNew` callback in `SearchableSelect` to pass the current search string. Consumer components capture that string in state and pass it as `initialName` to QuickCreate modals. Modals use `useEffect` to pre-fill name on open.

**Tech Stack:** React, TypeScript, Tailwind CSS (frontend only, no backend changes)

---

### Task 1: Update SearchableSelect to pass search term

**Files:**
- Modify: `frontend/src/components/ui/SearchableSelect.tsx:17,136-137`

**Step 1: Change the `onCreateNew` prop type**

In `SearchableSelectProps` interface (line 17), change:

```typescript
// Before
onCreateNew?: () => void

// After
onCreateNew?: (searchTerm: string) => void
```

**Step 2: Pass search text in the create button onClick**

In the create button (line 136), change:

```typescript
// Before
onClick={() => { onCreateNew(); setIsOpen(false); setSearch('') }}

// After
onClick={() => { onCreateNew(search); setIsOpen(false); setSearch('') }}
```

**Step 3: Verify no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -30`

Expected: Type errors in TransactionForm.tsx (callers still pass `() => void` — we fix those in Task 3).

**Step 4: Commit**

```bash
git add frontend/src/components/ui/SearchableSelect.tsx
git commit -m "feat: pass search term in SearchableSelect onCreateNew callback"
```

---

### Task 2: Add `initialName` prop to MerchantQuickCreate and CategoryQuickCreate

**Files:**
- Modify: `frontend/src/components/transactions/MerchantQuickCreate.tsx`
- Modify: `frontend/src/components/transactions/CategoryQuickCreate.tsx`

**Step 1: Update MerchantQuickCreate**

Add `initialName` to Props interface:

```typescript
interface Props {
  open: boolean
  initialName?: string          // ← add this
  transactionType?: CategoryType
  onCreated: (merchantId: string) => void
  onClose: () => void
}
```

Add to destructure:

```typescript
export default function MerchantQuickCreate({ open, initialName, transactionType, onCreated, onClose }: Props) {
```

Add `useEffect` to pre-fill name when modal opens (after the existing hooks, before `if (!open)`):

```typescript
useEffect(() => {
  if (open && initialName) {
    setForm((prev) => ({ ...prev, name: initialName }))
  }
}, [open, initialName])
```

**Step 2: Update CategoryQuickCreate**

Same pattern. Add `initialName` to Props:

```typescript
interface Props {
  open: boolean
  initialName?: string          // ← add this
  defaultType?: CategoryType
  onCreated: (categoryId: string) => void
  onClose: () => void
}
```

Add to destructure:

```typescript
export default function CategoryQuickCreate({ open, initialName, defaultType, onCreated, onClose }: Props) {
```

Add `useEffect`:

```typescript
useEffect(() => {
  if (open && initialName) {
    setForm((prev) => ({ ...prev, name: initialName }))
  }
}, [open, initialName])
```

**Step 3: Commit**

```bash
git add frontend/src/components/transactions/MerchantQuickCreate.tsx frontend/src/components/transactions/CategoryQuickCreate.tsx
git commit -m "feat: add initialName prop to MerchantQuickCreate and CategoryQuickCreate"
```

---

### Task 3: Wire up TransactionForm to pass search terms

**Files:**
- Modify: `frontend/src/components/transactions/TransactionForm.tsx:61-62,168,182,260-271`

**Step 1: Add state for search terms**

After the existing `showCategoryCreate` state (line 62), add:

```typescript
const [merchantSearchTerm, setMerchantSearchTerm] = useState('')
const [categorySearchTerm, setCategorySearchTerm] = useState('')
```

**Step 2: Update merchant SearchableSelect onCreateNew**

Change line 168 from:

```typescript
onCreateNew={() => setShowMerchantCreate(true)}
```

To:

```typescript
onCreateNew={(term) => { setMerchantSearchTerm(term); setShowMerchantCreate(true) }}
```

**Step 3: Update category SearchableSelect onCreateNew**

Change line 182 from:

```typescript
onCreateNew={() => setShowCategoryCreate(true)}
```

To:

```typescript
onCreateNew={(term) => { setCategorySearchTerm(term); setShowCategoryCreate(true) }}
```

**Step 4: Pass initialName to MerchantQuickCreate**

Change MerchantQuickCreate (around line 260) to add `initialName`:

```tsx
<MerchantQuickCreate
  open={showMerchantCreate}
  initialName={merchantSearchTerm}
  transactionType={categoryTypeFilter}
  onCreated={(id) => handleMerchantChange(id)}
  onClose={() => setShowMerchantCreate(false)}
/>
```

**Step 5: Pass initialName to CategoryQuickCreate**

Change CategoryQuickCreate (around line 266) to add `initialName`:

```tsx
<CategoryQuickCreate
  open={showCategoryCreate}
  initialName={categorySearchTerm}
  defaultType={categoryTypeFilter ?? 'EXPENSE'}
  onCreated={(id) => setForm((prev) => ({ ...prev, category_id: id }))}
  onClose={() => setShowCategoryCreate(false)}
/>
```

**Step 6: Verify TypeScript passes**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

**Step 7: Commit**

```bash
git add frontend/src/components/transactions/TransactionForm.tsx
git commit -m "feat: wire search term auto-fill in TransactionForm quick-create modals"
```

---

### Task 4: Wire up MerchantsPage to pass search text to create form

**Files:**
- Modify: `frontend/src/pages/MerchantsPage.tsx:26,40`

**Step 1: Pre-fill form name from search when opening modal**

Change the "新增商家" button onClick (line 40) from:

```typescript
onClick={() => setShowForm(true)}
```

To:

```typescript
onClick={() => { setForm({ name: search }); setShowForm(true) }}
```

This uses the existing `search` state (line 15) and `form` state (line 17) — no new state needed.

**Step 2: Verify TypeScript passes**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/pages/MerchantsPage.tsx
git commit -m "feat: auto-fill search text into merchant create form on MerchantsPage"
```

---

### Task 5: Manual verification

**Step 1: Start dev server**

Run: `cd frontend && npm run dev`

**Step 2: Test TransactionForm merchant flow**

1. Go to transaction create page
2. In merchant SearchableSelect, type "測試商家ABC"
3. See "找不到結果" message
4. Click "+ 新增商家" button
5. Verify MerchantQuickCreate modal opens with "測試商家ABC" pre-filled in name field
6. Close modal without creating

**Step 3: Test TransactionForm category flow**

1. In category SearchableSelect, type "新分類XYZ"
2. Click "+ 新增分類" button
3. Verify CategoryQuickCreate modal opens with "新分類XYZ" pre-filled in name field
4. Close modal without creating

**Step 4: Test MerchantsPage flow**

1. Go to /merchants page
2. Type "不存在的商家" in search bar
3. Click "新增商家" button (top right)
4. Verify modal opens with "不存在的商家" pre-filled in name field
5. Close modal without creating

**Step 5: Test empty search**

1. In TransactionForm, click "+ 新增商家" without typing anything
2. Verify modal opens with empty name field (no regression)

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: search term auto-fill for merchant/category create forms"
```

(Only if there were any fixups needed during testing. Otherwise skip.)
