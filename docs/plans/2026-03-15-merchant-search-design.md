# Merchant List Search

## Summary

Add a search bar to the merchant management page (`app/merchants/index.tsx`) that filters merchants by name in real time.

## Design

**Location:** Fixed search bar between the "新增商家" button and the merchant list.

**Behavior:**
- `TextInput` with `Search` icon (lucide-react-native) on the left
- Filters `merchants` array by `name.toLowerCase().includes(search.toLowerCase())`
- Clear button (X icon) appears when input is non-empty
- Shows "找不到符合的商家" `EmptyState` when no matches
- Search bar only appears when there are merchants (hidden on empty state)

**Implementation:**
- Pure client-side filtering — no API changes needed
- Single file change: `app/app/merchants/index.tsx`
- Add `useState` for search text, `useMemo` for filtered list
- Style consistent with `SearchableSelect` search bar (border, colors, icon sizing)

## Scope

- 1 file modified
- No backend changes
- No new components or dependencies
