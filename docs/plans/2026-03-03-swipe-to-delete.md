# Swipe-to-Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace long-press delete with iOS-style swipe-to-delete across all list screens.

**Architecture:** Create a shared `SwipeableRow` component using `react-native-gesture-handler`'s `ReanimatedSwipeable` (already installed). Wrap each list item in `SwipeableRow`, remove `onLongPress` handlers.

**Tech Stack:** `react-native-gesture-handler` 2.30 (ReanimatedSwipeable), `react-native-reanimated` 4.2.1, `lucide-react-native` (Trash2 icon)

---

### Task 1: Create `SwipeableRow` Component

**Files:**
- Create: `app/components/ui/SwipeableRow.tsx`

**Step 1: Create the component**

```tsx
// app/components/ui/SwipeableRow.tsx
import { useRef, useCallback } from 'react'
import { View, Text, Alert } from 'react-native'
import { RectButton } from 'react-native-gesture-handler'
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated'
import { Trash2 } from 'lucide-react-native'
import { Colors } from '../../constants/theme'

const ACTION_WIDTH = 80

interface SwipeableRowProps {
  children: React.ReactNode
  onDelete: () => void
  confirmTitle?: string
  confirmMessage?: string
}

// Track the currently open swipeable so we can close it when another opens
let currentlyOpen: SwipeableMethods | null = null

function RightAction({ dragX }: { dragX: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: dragX.value < -20 ? 1 : 0,
  }))

  return (
    <Animated.View style={[{ width: ACTION_WIDTH, backgroundColor: Colors.error }, animatedStyle]}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Trash2 size={20} color="#ffffff" />
        <Text style={{ color: '#ffffff', fontSize: 12, marginTop: 2 }}>刪除</Text>
      </View>
    </Animated.View>
  )
}

export function SwipeableRow({
  children,
  onDelete,
  confirmTitle = '確認刪除',
  confirmMessage = '確定要刪除嗎？',
}: SwipeableRowProps) {
  const swipeableRef = useRef<SwipeableMethods>(null)

  const handleOpen = useCallback(() => {
    if (currentlyOpen && currentlyOpen !== swipeableRef.current) {
      currentlyOpen.close()
    }
    currentlyOpen = swipeableRef.current
  }, [])

  const handleClose = useCallback(() => {
    if (currentlyOpen === swipeableRef.current) {
      currentlyOpen = null
    }
  }, [])

  const handleDelete = useCallback(() => {
    Alert.alert(confirmTitle, confirmMessage, [
      { text: '取消', style: 'cancel', onPress: () => swipeableRef.current?.close() },
      { text: '刪除', style: 'destructive', onPress: () => {
        swipeableRef.current?.close()
        onDelete()
      }},
    ])
  }, [onDelete, confirmTitle, confirmMessage])

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={40}
      renderRightActions={(_progress, dragX) => (
        <RectButton style={{ width: ACTION_WIDTH }} onPress={handleDelete}>
          <RightAction dragX={dragX} />
        </RectButton>
      )}
      onSwipeableWillOpen={handleOpen}
      onSwipeableClose={handleClose}
    >
      {children}
    </ReanimatedSwipeable>
  )
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `SwipeableRow.tsx`

**Step 3: Commit**

```bash
git add app/components/ui/SwipeableRow.tsx
git commit -m "feat(app): add SwipeableRow component for swipe-to-delete"
```

---

### Task 2: Update Merchants Page

**Files:**
- Modify: `app/app/merchants/index.tsx`

**Step 1: Replace long-press with SwipeableRow**

Changes to `app/app/merchants/index.tsx`:

1. Add import at top:
```tsx
import { SwipeableRow } from '../../components/ui/SwipeableRow'
```

2. In the `merchants.map()` block (lines 152-181), wrap the `TouchableOpacity` with `SwipeableRow` and remove `onLongPress`:

Before:
```tsx
<TouchableOpacity
  key={m.id}
  style={{ ... }}
  onPress={() => startEdit(m)}
  onLongPress={() => handleDelete(m.id, m.name)}
>
```

After:
```tsx
<SwipeableRow
  key={m.id}
  onDelete={() => handleDelete(m.id, m.name)}
  confirmTitle="刪除商家"
  confirmMessage={`確定要刪除 "${m.name}" 嗎？`}
>
  <TouchableOpacity
    style={{ ... }}
    onPress={() => startEdit(m)}
  >
    ... content unchanged ...
  </TouchableOpacity>
</SwipeableRow>
```

Note: Move `key` from `TouchableOpacity` to `SwipeableRow`. Remove `onLongPress`. The `handleDelete` function stays but is now called via `SwipeableRow`'s Alert instead. Since `SwipeableRow` already shows its own Alert, simplify `handleDelete` to just call `deleteMut.mutate(id)` directly:

Update `handleDelete`:
```tsx
const handleDelete = (id: string) => {
  deleteMut.mutate(id)
}
```

And pass the confirm text via `SwipeableRow` props.

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 3: Commit**

```bash
git add app/app/merchants/index.tsx
git commit -m "feat(app): replace long-press with swipe-to-delete on merchants page"
```

---

### Task 3: Update Rules Page

**Files:**
- Modify: `app/app/rules/index.tsx`

**Step 1: Replace long-press with SwipeableRow**

Changes to `app/app/rules/index.tsx`:

1. Add import:
```tsx
import { SwipeableRow } from '../../components/ui/SwipeableRow'
```

2. Simplify `handleDelete` — remove Alert (SwipeableRow handles it):
```tsx
const handleDelete = (id: string) => {
  deleteMut.mutate(id)
}
```

3. In `rules.map()` (lines 107-125), wrap `TouchableOpacity` with `SwipeableRow`:

Before:
```tsx
<TouchableOpacity
  key={r.id}
  style={{ ... }}
  onLongPress={() => handleDelete(r.id)}
>
```

After:
```tsx
<SwipeableRow
  key={r.id}
  onDelete={() => handleDelete(r.id)}
  confirmTitle="刪除規則"
  confirmMessage="確定要刪除此規則嗎？"
>
  <TouchableOpacity
    style={{ ... }}
  >
    ... content unchanged ...
  </TouchableOpacity>
</SwipeableRow>
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 3: Commit**

```bash
git add app/app/rules/index.tsx
git commit -m "feat(app): replace long-press with swipe-to-delete on rules page"
```

---

### Task 4: Update Categories Page

**Files:**
- Modify: `app/app/categories/index.tsx`

**Step 1: Replace long-press with SwipeableRow**

Changes to `app/app/categories/index.tsx`:

1. Add import:
```tsx
import { SwipeableRow } from '../../components/ui/SwipeableRow'
```

2. Simplify `handleDelete`:
```tsx
const handleDelete = (id: string) => {
  deleteMut.mutate(id)
}
```

3. Update `renderCategory` function (lines 35-54). Wrap the `TouchableOpacity` with `SwipeableRow`:

Before:
```tsx
const renderCategory = (cat: ..., indent = false) => (
  <TouchableOpacity
    key={cat.id}
    style={{ ... }}
    onLongPress={() => handleDelete(cat.id, cat.name)}
  >
    <Text ...>{cat.icon} {cat.name}</Text>
  </TouchableOpacity>
)
```

After:
```tsx
const renderCategory = (cat: ..., indent = false) => (
  <SwipeableRow
    key={cat.id}
    onDelete={() => handleDelete(cat.id)}
    confirmTitle="刪除分類"
    confirmMessage={`確定要刪除 "${cat.name}" 嗎？`}
  >
    <View
      style={{
        backgroundColor: '#ffffff',
        padding: 14,
        paddingLeft: indent ? 32 : 14,
        borderRadius: 12,
        marginBottom: 4,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Text style={{ fontSize: 15 }}>{cat.icon} {cat.name}</Text>
    </View>
  </SwipeableRow>
)
```

Note: Change `TouchableOpacity` to `View` since categories don't have an onPress action — they only had `onLongPress` for delete.

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 3: Commit**

```bash
git add app/app/categories/index.tsx
git commit -m "feat(app): replace long-press with swipe-to-delete on categories page"
```

---

### Task 5: Update Shared Ledger Detail Page

**Files:**
- Modify: `app/app/shared-ledgers/[id].tsx`

**Step 1: Replace long-press with SwipeableRow**

Changes to `app/app/shared-ledgers/[id].tsx`:

1. Add import:
```tsx
import { SwipeableRow } from '../../components/ui/SwipeableRow'
```

2. Simplify `handleDelete`:
```tsx
const handleDelete = (expenseId: string) => {
  deleteMut.mutate(expenseId)
}
```

3. In `expenses.data?.data?.map()` (lines 79-102), wrap `TouchableOpacity` with `SwipeableRow`:

Before:
```tsx
<TouchableOpacity
  key={e.id}
  style={{ ... }}
  onLongPress={() => handleDelete(e.id)}
>
```

After:
```tsx
<SwipeableRow
  key={e.id}
  onDelete={() => handleDelete(e.id)}
  confirmTitle="刪除支出"
  confirmMessage="確定要刪除這筆支出嗎？"
>
  <View
    style={{
      backgroundColor: '#ffffff',
      padding: 14,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: '#f1f5f9',
    }}
  >
    ... content unchanged ...
  </View>
</SwipeableRow>
```

Note: Change `TouchableOpacity` to `View` since shared expense items don't have an onPress action — they only had `onLongPress`.

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 3: Commit**

```bash
git add "app/app/shared-ledgers/[id].tsx"
git commit -m "feat(app): replace long-press with swipe-to-delete on shared ledger page"
```

---

### Task 6: Manual Testing

**Step 1: Start the dev server**

Run: `cd /Users/yuki/projects/zen-bill/app && npx expo start`

**Step 2: Test each screen**

Open the app in simulator/device and verify on each screen:
- [ ] Merchants: left-swipe shows red delete button, tap triggers Alert, confirm deletes
- [ ] Rules: same behavior
- [ ] Categories: same behavior
- [ ] Shared Ledger expenses: same behavior
- [ ] Only one row open at a time (opening new closes old)
- [ ] Invoices page: long-press multi-select still works (not changed)

**Step 3: Final commit if any fixes needed**
