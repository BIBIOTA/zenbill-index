# APP Date Picker Design

## Problem
APP transaction form uses plain TextInput for date entry, requiring manual YYYY-MM-DD typing. Web version has native date picker.

## Solution
Bottom Sheet calendar picker using existing `@gorhom/bottom-sheet`. No new dependencies.

### New File
- `app/components/ui/DatePickerSheet.tsx` - Reusable Bottom Sheet calendar component

### Modified File
- `app/components/transactions/TransactionForm.tsx` - Replace TextInput with Pressable + DatePickerSheet

### DatePickerSheet Props
```ts
{ visible: boolean, value: string, onSelect: (date: string) => void, onClose: () => void }
```

### Interaction
1. Tap date field -> Bottom Sheet slides up with calendar showing selected month
2. Arrow buttons to navigate months
3. Tap date -> calls onSelect -> auto-close

### Visual
- 7x6 grid calendar, week header (Sun-Sat)
- Today: light circle background
- Selected: accent color circle
- Non-current-month days: gray
- Consistent with existing SearchableSelect styling
