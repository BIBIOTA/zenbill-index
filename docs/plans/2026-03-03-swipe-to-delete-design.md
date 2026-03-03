# Swipe-to-Delete Design

**Date:** 2026-03-03
**Status:** Approved

## Problem

All list screens use `onLongPress` → `Alert.alert` for deletion. This pattern is not discoverable and unintuitive — users expect iOS-style swipe-to-delete.

## Decision

Replace long-press delete with left-swipe-to-delete across 4 screens. Use `react-native-gesture-handler`'s `ReanimatedSwipeable` + `react-native-reanimated` (both already installed).

## Design

### Shared Component: `SwipeableRow`

**Location:** `app/components/ui/SwipeableRow.tsx`

**API:**
```tsx
<SwipeableRow onDelete={() => handleDelete(item.id)}>
  <YourListItemContent />
</SwipeableRow>
```

**Behavior:**
- Left swipe → reveals red delete button (80px wide) on right side
- Delete button shows Trash2 icon + "刪除" text
- Tap delete → `Alert.alert` confirmation → calls `onDelete` on confirm
- Row auto-closes after action
- Only one row open at a time (opening new row closes previous)

### Affected Screens

| Screen | File | Change |
|--------|------|--------|
| Merchants | `app/merchants/index.tsx` | Remove `onLongPress`, wrap with `SwipeableRow` |
| Rules | `app/rules/index.tsx` | Same |
| Categories | `app/categories/index.tsx` | Same |
| Shared Ledger | `app/shared-ledgers/[id].tsx` | Same |

### Not Affected

- `(tabs)/invoices.tsx` — keeps `onLongPress` for multi-select (not delete)

### Tech Stack

- `ReanimatedSwipeable` from `react-native-gesture-handler/ReanimatedSwipeable`
- `react-native-reanimated` for animations
- `Trash2` icon from `lucide-react-native`
- `GestureHandlerRootView` already configured in `_layout.tsx`
