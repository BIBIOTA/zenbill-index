# Searchable Select + Quick Create Design

**Date:** 2026-02-22
**Status:** Approved

## Problem

Transaction form uses native `<select>` dropdowns for merchant/category selection. With 30-100 items each, this is cumbersome — no search, no inline creation, no hierarchy display, and merchant defaults are unused.

## Solution

Replace native `<select>` with a custom **SearchableSelect** component. Add **Quick Create** sub-modals for creating new merchants/categories without leaving the transaction form.

## Design

### 1. SearchableSelect Component

Reusable search-enabled dropdown at `frontend/src/components/ui/SearchableSelect.tsx`.

**Behavior:**
- Click trigger → expand dropdown panel, auto-focus search input
- Type → client-side fuzzy filter (case-insensitive `includes`)
- Click option → select and collapse
- Click outside → collapse
- Fixed "+" button at bottom of panel

**Props:**
```typescript
interface SearchableSelectProps {
  value: string | undefined
  options: { id: string; label: string; icon?: string; group?: string }[]
  placeholder: string
  onChange: (id: string | undefined) => void
  onCreateNew?: () => void
  allowClear?: boolean
}
```

### 2. Category Display

Categories have parent-child hierarchy and emoji icons. Render as:
- Parent categories as non-selectable group headers (bold, gray)
- Child categories indented with emoji icon
- Search matching a child shows its parent header
- Filter by transaction type (EXPENSE/INCOME)

### 3. Merchant Default Category Auto-Fill

When user selects a merchant with `default_category_id`:
- If category field is empty → auto-fill with default
- If category field already has a value → don't override

### 4. Quick Create Sub-Modals

**MerchantQuickCreate Modal:**
- Name (required)
- Default category (optional, uses SearchableSelect)
- Default account (optional)

**CategoryQuickCreate Modal:**
- Name (required)
- Type (EXPENSE/INCOME, pre-filled from current transaction type)
- Icon (emoji text input)
- Parent category (optional)

**After creation:** Auto-select the new item, close sub-modal, return to transaction form.

### 5. File Structure

```
frontend/src/components/
├── ui/
│   └── SearchableSelect.tsx       ← Shared searchable dropdown
├── transactions/
│   ├── TransactionFormModal.tsx    ← Modified: use SearchableSelect
│   ├── MerchantQuickCreate.tsx    ← New: merchant quick create modal
│   └── CategoryQuickCreate.tsx    ← New: category quick create modal
```

### 6. Scope Exclusions

- No backend API changes needed (existing CRUD endpoints suffice)
- No keyboard navigation / full a11y (can add later)
- No recent/frequent sorting (can add later)
- No drag-to-reorder or favorites
