# APP Searchable Select with Bottom Sheet

**Date:** 2026-03-03
**Goal:** Replace all native `Picker` components in the APP with a searchable Bottom Sheet select, supporting search, grouping, and inline quick-create for accounts, merchants, and categories.

## Context

The APP currently uses `@react-native-picker/picker` which provides no search, grouping, or create-new functionality. The Web frontend already has a `SearchableSelect` component with all these features. This design brings the APP to feature parity.

## Approach

Use `@gorhom/bottom-sheet` (peer deps already present: reanimated + gesture-handler) to build a `SearchableSelect` component that opens a half-screen bottom sheet with search input and scrollable option list.

## Component Design

### `SearchableSelect` (`app/components/ui/SearchableSelect.tsx`)

**Props** (matches Web's `SelectOption` interface):

```typescript
interface SelectOption {
  id: string
  label: string
  icon?: string
  group?: string    // Group header (non-selectable)
  indent?: boolean  // Sub-item indentation
}

interface SearchableSelectProps {
  value: string | undefined
  options: SelectOption[]
  placeholder: string
  onChange: (id: string | undefined) => void
  onCreateNew?: (searchTerm: string) => void
  createNewLabel?: string
  allowClear?: boolean
  testID?: string
}
```

**Behavior:**
1. Renders as a touchable row showing selected value (or placeholder)
2. On press, opens a Bottom Sheet (~50% screen height)
3. Top: search input with auto-focus + keyboard
4. Middle: FlatList with group headers, indented sub-items, selected-item highlight
5. Bottom: optional "+ Create New" button
6. Selecting an item closes the sheet and calls `onChange`
7. Supports drag-to-dismiss gesture

### `QuickCreateModal` (`app/components/ui/QuickCreateModal.tsx`)

Modal for inline creation of accounts, merchants, and categories.

- **Merchant:** name field only
- **Account:** name + type picker (BANK/CREDIT/CASH/CRYPTO)
- **Category:** name + icon + type (EXPENSE/INCOME) + optional parent

### Option Builders

Shared utilities mirroring Web's pattern:

- `app/components/transactions/accountOptions.ts` — groups accounts by type
- `app/components/transactions/categoryOptions.ts` — groups categories by parent/child hierarchy

## Affected Pages

| Page | Pickers | Quick Create |
|------|---------|-------------|
| `TransactionForm.tsx` | account, target account, category, merchant (4) | account, category, merchant |
| `rules/index.tsx` | match type, merchant (2) | merchant |
| `shared-ledgers/.../expenses/new.tsx` | category (1) | no (static list) |

**Total: 7 Pickers to replace**

## Dependency Changes

```
+ @gorhom/bottom-sheet
- @react-native-picker/picker (remove after migration)
```

## Testing

- Visual verification on iOS simulator
- Verify search filtering works correctly
- Verify group headers display properly
- Verify quick-create flow (create → auto-select new item)
- Verify keyboard avoidance in Bottom Sheet
