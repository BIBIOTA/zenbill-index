# APP Searchable Select Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all native `Picker` components in the React Native APP with a searchable Bottom Sheet select supporting search, grouping, and inline quick-create.

**Architecture:** Build a reusable `SearchableSelect` component using `@gorhom/bottom-sheet` that mirrors the Web's `SearchableSelect` props interface (`SelectOption`). Add quick-create modals for merchants, categories, and accounts. Replace all 7 Picker instances across 3 pages.

**Tech Stack:** React Native, Expo, TypeScript, @gorhom/bottom-sheet, react-native-reanimated, react-native-gesture-handler, @zenbill/shared hooks

---

### Task 1: Install @gorhom/bottom-sheet and wrap layout

**Files:**
- Modify: `app/package.json`
- Modify: `app/app/_layout.tsx`

**Step 1: Install the package**

Run: `cd /Users/yuki/projects/zen-bill/app && npx expo install @gorhom/bottom-sheet`

Expected: Package added to package.json. Peer deps (reanimated, gesture-handler) already present.

**Step 2: Wrap root layout with GestureHandlerRootView**

In `app/app/_layout.tsx`, add import and wrap the return:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler'
```

Wrap the `QueryClientProvider` return block:

```tsx
return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack ...>
        {/* existing screens */}
      </Stack>
    </QueryClientProvider>
  </GestureHandlerRootView>
)
```

Also wrap the loading spinner return:

```tsx
if (!ready) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" />
      </View>
    </GestureHandlerRootView>
  )
}
```

**Step 3: Verify app still builds**

Run: `cd /Users/yuki/projects/zen-bill/app && npx expo export --platform ios --dev 2>&1 | tail -5`

If expo export isn't available, try: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add app/package.json app/app/_layout.tsx
# also add lockfile if changed (pnpm-lock.yaml or similar)
git commit -m "feat(app): install @gorhom/bottom-sheet and add GestureHandlerRootView"
```

---

### Task 2: Create SelectOption type and option builders

**Files:**
- Create: `app/components/ui/selectTypes.ts`
- Create: `app/components/transactions/accountOptions.ts`
- Create: `app/components/transactions/categoryOptions.ts`

**Step 1: Create shared SelectOption type**

Create `app/components/ui/selectTypes.ts`:

```typescript
export interface SelectOption {
  id: string
  label: string
  icon?: string
  group?: string
  indent?: boolean
}
```

**Step 2: Create accountOptions builder**

Create `app/components/transactions/accountOptions.ts`:

```typescript
import type { Account } from '@zenbill/shared'
import type { SelectOption } from '../ui/selectTypes'

const typeLabels: Record<string, string> = {
  CASH: '現金',
  BANK: '銀行',
  CREDIT: '信用卡',
  CRYPTO: '加密貨幣',
}

export function buildAccountOptions(
  accounts: Account[],
  excludeId?: string,
): SelectOption[] {
  const grouped = new Map<string, Account[]>()

  for (const acct of accounts) {
    if (acct.id === excludeId) continue
    const group = grouped.get(acct.type) ?? []
    group.push(acct)
    grouped.set(acct.type, group)
  }

  const result: SelectOption[] = []
  for (const [type, accts] of grouped) {
    if (accts.length === 0) continue
    result.push({ id: `group-${type}`, label: typeLabels[type] ?? type, group: typeLabels[type] ?? type })
    for (const acct of accts) {
      result.push({ id: acct.id, label: acct.name, indent: true })
    }
  }

  return result
}
```

**Step 3: Create categoryOptions builder**

Create `app/components/transactions/categoryOptions.ts`:

```typescript
import type { Category, CategoryType } from '@zenbill/shared'
import type { SelectOption } from '../ui/selectTypes'

export function buildCategoryOptions(
  categories: Category[],
  filterType?: CategoryType,
): SelectOption[] {
  const result: SelectOption[] = []

  for (const cat of categories) {
    if (filterType && cat.type !== filterType) continue
    if (cat.parent_id) continue

    if (cat.children && cat.children.length > 0) {
      result.push({ id: `group-${cat.id}`, label: cat.name, icon: cat.icon, group: cat.name })
      for (const child of cat.children) {
        result.push({ id: child.id, label: child.name, icon: child.icon, indent: true })
      }
    } else {
      result.push({ id: cat.id, label: cat.name, icon: cat.icon })
    }
  }

  return result
}
```

**Step 4: Verify types compile**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit 2>&1 | head -20`

**Step 5: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add app/components/ui/selectTypes.ts app/components/transactions/accountOptions.ts app/components/transactions/categoryOptions.ts
git commit -m "feat(app): add SelectOption type and option builders for accounts/categories"
```

---

### Task 3: Build SearchableSelect component

**Files:**
- Create: `app/components/ui/SearchableSelect.tsx`

**Step 1: Create the SearchableSelect component**

Create `app/components/ui/SearchableSelect.tsx`:

```tsx
import { useState, useCallback, useMemo, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, Keyboard } from 'react-native'
import BottomSheet, { BottomSheetView, BottomSheetBackdrop, BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { ChevronDown, Search, X, Plus } from 'lucide-react-native'
import { Colors } from '../../constants/theme'
import type { SelectOption } from './selectTypes'

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

export function SearchableSelect({
  value,
  options,
  placeholder,
  onChange,
  onCreateNew,
  createNewLabel = '新增',
  allowClear = true,
  testID,
}: SearchableSelectProps) {
  const [search, setSearch] = useState('')
  const bottomSheetRef = useRef<BottomSheet>(null)
  const searchInputRef = useRef<TextInput>(null)

  const snapPoints = useMemo(() => ['50%', '80%'], [])

  const selectedOption = options.find((o) => o.id === value && !o.group)
  const displayLabel = selectedOption
    ? `${selectedOption.icon ? selectedOption.icon + ' ' : ''}${selectedOption.label}`
    : ''

  const filtered = useMemo(() => {
    if (!search) return options
    const lower = search.toLowerCase()
    return options.filter((opt) => {
      if (opt.group) {
        const idx = options.indexOf(opt)
        for (let i = idx + 1; i < options.length && !options[i].group; i++) {
          if (options[i].label.toLowerCase().includes(lower)) return true
        }
        return false
      }
      return opt.label.toLowerCase().includes(lower)
    })
  }, [options, search])

  const handleOpen = useCallback(() => {
    Keyboard.dismiss()
    bottomSheetRef.current?.snapToIndex(0)
  }, [])

  const handleClose = useCallback(() => {
    setSearch('')
    bottomSheetRef.current?.close()
  }, [])

  const handleSelect = useCallback((id: string) => {
    onChange(id)
    handleClose()
  }, [onChange, handleClose])

  const handleClear = useCallback(() => {
    onChange(undefined)
  }, [onChange])

  const handleCreateNew = useCallback(() => {
    onCreateNew?.(search)
    handleClose()
  }, [onCreateNew, search, handleClose])

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
    ),
    [],
  )

  const renderItem = useCallback(({ item }: { item: SelectOption }) => {
    if (item.group) {
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {item.icon ? `${item.icon} ` : ''}{item.label}
          </Text>
        </View>
      )
    }

    const isSelected = item.id === value

    return (
      <TouchableOpacity
        style={{
          paddingHorizontal: item.indent ? 32 : 16,
          paddingVertical: 12,
          backgroundColor: isSelected ? '#f0fdf4' : 'transparent',
        }}
        onPress={() => handleSelect(item.id)}
        activeOpacity={0.6}
      >
        <Text style={{
          fontSize: 15,
          color: isSelected ? Colors.primary : Colors.text,
          fontWeight: isSelected ? '600' : '400',
        }}>
          {item.icon ? `${item.icon} ` : ''}{item.label}
        </Text>
      </TouchableOpacity>
    )
  }, [value, handleSelect])

  return (
    <>
      {/* Trigger button */}
      <TouchableOpacity
        testID={testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: Colors.border,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: '#ffffff',
        }}
        onPress={handleOpen}
        activeOpacity={0.7}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 16,
            color: selectedOption ? Colors.text : '#9ca3af',
          }}
          numberOfLines={1}
        >
          {displayLabel || placeholder}
        </Text>
        {allowClear && value && (
          <TouchableOpacity onPress={handleClear} hitSlop={8} style={{ marginRight: 8 }}>
            <X size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
        <ChevronDown size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onClose={() => setSearch('')}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetView style={{ flex: 1 }}>
          {/* Search input */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
            gap: 8,
          }}>
            <Search size={16} color={Colors.textSecondary} />
            <BottomSheetTextInput
              ref={searchInputRef}
              style={{
                flex: 1,
                fontSize: 15,
                paddingVertical: 8,
                color: Colors.text,
              }}
              placeholder="搜尋..."
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <X size={14} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Options list */}
          <FlatList
            data={filtered}
            keyExtractor={(item, index) => item.group ? `group-${index}` : item.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={{ padding: 16, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: Colors.textSecondary }}>找不到結果</Text>
              </View>
            }
          />

          {/* Create new button */}
          {onCreateNew && (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderTopWidth: 1,
                borderTopColor: Colors.border,
                gap: 6,
              }}
              onPress={handleCreateNew}
              activeOpacity={0.6}
            >
              <Plus size={16} color={Colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary }}>
                {createNewLabel}
              </Text>
            </TouchableOpacity>
          )}
        </BottomSheetView>
      </BottomSheet>
    </>
  )
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit 2>&1 | head -20`

If there are import issues with `@gorhom/bottom-sheet` types (BottomSheetTextInput, BottomSheetBackdrop), check the installed version and adjust imports accordingly. The v5 API uses these named exports from the main package.

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add app/components/ui/SearchableSelect.tsx
git commit -m "feat(app): add SearchableSelect component with bottom sheet"
```

---

### Task 4: Build QuickCreate modals

**Files:**
- Create: `app/components/quickcreate/MerchantQuickCreate.tsx`
- Create: `app/components/quickcreate/CategoryQuickCreate.tsx`
- Create: `app/components/quickcreate/AccountQuickCreate.tsx`

**Step 1: Create MerchantQuickCreate**

Create `app/components/quickcreate/MerchantQuickCreate.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, Modal, Alert } from 'react-native'
import { useCreateMerchant } from '@zenbill/shared'
import { Colors } from '../../constants/theme'
import { Button } from '../ui/Button'

interface Props {
  visible: boolean
  initialName?: string
  onCreated: (merchant: { id: string }) => void
  onClose: () => void
}

export function MerchantQuickCreate({ visible, initialName, onCreated, onClose }: Props) {
  const [name, setName] = useState('')
  const createMut = useCreateMerchant()

  useEffect(() => {
    if (visible) setName(initialName ?? '')
  }, [visible, initialName])

  const handleSubmit = () => {
    if (!name.trim()) {
      Alert.alert('Error', '請輸入商家名稱')
      return
    }
    createMut.mutate({ name: name.trim() }, {
      onSuccess: (res) => {
        onCreated(res.data)
        setName('')
        onClose()
      },
      onError: (e) => Alert.alert('Error', e.message),
    })
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 16 }}>新增商家</Text>

          <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.textSecondary, marginBottom: 4 }}>名稱</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 20 }}
            placeholder="商家名稱"
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <TouchableOpacity onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, color: Colors.textSecondary }}>取消</Text>
            </TouchableOpacity>
            <Button title={createMut.isPending ? '建立中...' : '建立'} onPress={handleSubmit} loading={createMut.isPending} />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}
```

**Step 2: Create CategoryQuickCreate**

Create `app/components/quickcreate/CategoryQuickCreate.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, Modal, Alert } from 'react-native'
import { useCreateCategory } from '@zenbill/shared'
import type { CategoryType } from '@zenbill/shared'
import { Colors } from '../../constants/theme'
import { Button } from '../ui/Button'

interface Props {
  visible: boolean
  initialName?: string
  defaultType?: CategoryType
  onCreated: (category: { id: string }) => void
  onClose: () => void
}

export function CategoryQuickCreate({ visible, initialName, defaultType, onCreated, onClose }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<CategoryType>(defaultType ?? 'EXPENSE')
  const [icon, setIcon] = useState('')
  const createMut = useCreateCategory()

  useEffect(() => {
    if (visible) {
      setName(initialName ?? '')
      setType(defaultType ?? 'EXPENSE')
      setIcon('')
    }
  }, [visible, initialName, defaultType])

  const handleSubmit = () => {
    if (!name.trim()) {
      Alert.alert('Error', '請輸入分類名稱')
      return
    }
    createMut.mutate({ name: name.trim(), type, icon: icon || undefined }, {
      onSuccess: (res) => {
        onCreated(res.data)
        onClose()
      },
      onError: (e) => Alert.alert('Error', e.message),
    })
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 16 }}>新增分類</Text>

          <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.textSecondary, marginBottom: 4 }}>名稱</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 }}
            placeholder="分類名稱"
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.textSecondary, marginBottom: 4 }}>圖示 (Emoji)</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 }}
            placeholder="例如: 🍔"
            value={icon}
            onChangeText={setIcon}
          />

          <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.textSecondary, marginBottom: 4 }}>類型</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            {(['EXPENSE', 'INCOME'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                  backgroundColor: type === t ? Colors.primary : '#f3f4f6',
                }}
                onPress={() => setType(t)}
              >
                <Text style={{ fontWeight: '600', color: type === t ? '#fff' : '#4b5563' }}>
                  {t === 'EXPENSE' ? '支出' : '收入'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <TouchableOpacity onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, color: Colors.textSecondary }}>取消</Text>
            </TouchableOpacity>
            <Button title={createMut.isPending ? '建立中...' : '建立'} onPress={handleSubmit} loading={createMut.isPending} />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}
```

**Step 3: Create AccountQuickCreate**

Create `app/components/quickcreate/AccountQuickCreate.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, Modal, Alert } from 'react-native'
import { useCreateAccount } from '@zenbill/shared'
import type { AccountType } from '@zenbill/shared'
import { Colors } from '../../constants/theme'
import { Button } from '../ui/Button'

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'CASH', label: '現金' },
  { value: 'BANK', label: '銀行' },
  { value: 'CREDIT', label: '信用卡' },
  { value: 'CRYPTO', label: '加密貨幣' },
]

interface Props {
  visible: boolean
  initialName?: string
  onCreated: (account: { id: string }) => void
  onClose: () => void
}

export function AccountQuickCreate({ visible, initialName, onCreated, onClose }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('BANK')
  const createMut = useCreateAccount()

  useEffect(() => {
    if (visible) {
      setName(initialName ?? '')
      setType('BANK')
    }
  }, [visible, initialName])

  const handleSubmit = () => {
    if (!name.trim()) {
      Alert.alert('Error', '請輸入帳戶名稱')
      return
    }
    createMut.mutate({ name: name.trim(), type }, {
      onSuccess: (res) => {
        onCreated(res.data)
        onClose()
      },
      onError: (e) => Alert.alert('Error', e.message),
    })
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 16 }}>新增帳戶</Text>

          <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.textSecondary, marginBottom: 4 }}>名稱</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 }}
            placeholder="帳戶名稱"
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.textSecondary, marginBottom: 4 }}>類型</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {ACCOUNT_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
                  backgroundColor: type === t.value ? Colors.primary : '#f3f4f6',
                }}
                onPress={() => setType(t.value)}
              >
                <Text style={{ fontWeight: '500', color: type === t.value ? '#fff' : '#4b5563' }}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <TouchableOpacity onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, color: Colors.textSecondary }}>取消</Text>
            </TouchableOpacity>
            <Button title={createMut.isPending ? '建立中...' : '建立'} onPress={handleSubmit} loading={createMut.isPending} />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}
```

**Step 4: Verify compile**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit 2>&1 | head -20`

**Step 5: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add app/components/quickcreate/
git commit -m "feat(app): add QuickCreate modals for merchant, category, and account"
```

---

### Task 5: Replace Pickers in TransactionForm

**Files:**
- Modify: `app/components/transactions/TransactionForm.tsx`

**Step 1: Update imports**

Replace:
```tsx
import { Picker } from '@react-native-picker/picker'
```

With:
```tsx
import { SearchableSelect } from '../ui/SearchableSelect'
import { buildAccountOptions } from './accountOptions'
import { buildCategoryOptions } from './categoryOptions'
import { MerchantQuickCreate } from '../quickcreate/MerchantQuickCreate'
import { CategoryQuickCreate } from '../quickcreate/CategoryQuickCreate'
import { AccountQuickCreate } from '../quickcreate/AccountQuickCreate'
```

**Step 2: Add quick-create state and option builders**

After the existing state declarations (around line 46, after `flatCategories`), add:

```tsx
const [showMerchantCreate, setShowMerchantCreate] = useState(false)
const [showCategoryCreate, setShowCategoryCreate] = useState(false)
const [showAccountCreate, setShowAccountCreate] = useState(false)
const [createSearchTerm, setCreateSearchTerm] = useState('')

const accountOptions = buildAccountOptions(accounts ?? [])
const targetAccountOptions = buildAccountOptions(accounts ?? [], accountId)
const categoryOptions = buildCategoryOptions(
  categories ?? [],
  type === 'INCOME' ? 'INCOME' : 'EXPENSE',
)
const merchantOptions = (merchants ?? []).map((m) => ({ id: m.id, label: m.name }))
```

Remove the old `flatCategories` line since `buildCategoryOptions` handles hierarchy.

**Step 3: Replace account picker (lines 148-157)**

Replace the Account picker block:

```tsx
{/* Account picker */}
<Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 }}>帳戶</Text>
<View style={{ marginBottom: 16 }}>
  <SearchableSelect
    testID="txn_account_picker"
    value={accountId || undefined}
    options={accountOptions}
    placeholder="選擇帳戶"
    onChange={(id) => setAccountId(id ?? '')}
    onCreateNew={(term) => { setCreateSearchTerm(term); setShowAccountCreate(true) }}
    createNewLabel="新增帳戶"
    allowClear={false}
  />
</View>
```

**Step 4: Replace target account picker (lines 159-171)**

Replace:

```tsx
{/* Target account for transfers */}
{type === 'TRANSFER' && (
  <>
    <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 }}>目標帳戶</Text>
    <View style={{ marginBottom: 16 }}>
      <SearchableSelect
        testID="txn_target_account_picker"
        value={targetAccountId || undefined}
        options={targetAccountOptions}
        placeholder="選擇目標帳戶"
        onChange={(id) => setTargetAccountId(id ?? '')}
        allowClear
      />
    </View>
  </>
)}
```

**Step 5: Replace category picker (lines 174-189)**

Replace:

```tsx
{/* Category picker */}
{type !== 'TRANSFER' && (
  <>
    <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 }}>分類</Text>
    <View style={{ marginBottom: 16 }}>
      <SearchableSelect
        testID="txn_category_picker"
        value={categoryId || undefined}
        options={categoryOptions}
        placeholder="選擇分類"
        onChange={(id) => setCategoryId(id ?? '')}
        onCreateNew={(term) => { setCreateSearchTerm(term); setShowCategoryCreate(true) }}
        createNewLabel="新增分類"
        allowClear
      />
    </View>
  </>
)}
```

**Step 6: Replace merchant picker (lines 191-204)**

Replace:

```tsx
{/* Merchant picker */}
{type === 'EXPENSE' && (
  <>
    <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 }}>商家</Text>
    <View style={{ marginBottom: 16 }}>
      <SearchableSelect
        testID="txn_merchant_picker"
        value={merchantId || undefined}
        options={merchantOptions}
        placeholder="選擇商家 (可選)"
        onChange={(id) => setMerchantId(id ?? '')}
        onCreateNew={(term) => { setCreateSearchTerm(term); setShowMerchantCreate(true) }}
        createNewLabel="新增商家"
        allowClear
      />
    </View>
  </>
)}
```

**Step 7: Add QuickCreate modals before closing `</ScrollView>`**

Add right before `</ScrollView>`:

```tsx
<MerchantQuickCreate
  visible={showMerchantCreate}
  initialName={createSearchTerm}
  onCreated={(m) => setMerchantId(m.id)}
  onClose={() => setShowMerchantCreate(false)}
/>
<CategoryQuickCreate
  visible={showCategoryCreate}
  initialName={createSearchTerm}
  defaultType={type === 'INCOME' ? 'INCOME' : 'EXPENSE'}
  onCreated={(c) => setCategoryId(c.id)}
  onClose={() => setShowCategoryCreate(false)}
/>
<AccountQuickCreate
  visible={showAccountCreate}
  initialName={createSearchTerm}
  onCreated={(a) => setAccountId(a.id)}
  onClose={() => setShowAccountCreate(false)}
/>
```

**Step 8: Verify compile**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit 2>&1 | head -20`

**Step 9: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add app/components/transactions/TransactionForm.tsx
git commit -m "feat(app): replace TransactionForm Pickers with SearchableSelect"
```

---

### Task 6: Replace Pickers in Rules page

**Files:**
- Modify: `app/app/rules/index.tsx`

**Step 1: Update imports**

Replace:
```tsx
import { Picker } from '@react-native-picker/picker'
```

With:
```tsx
import { SearchableSelect } from '../../components/ui/SearchableSelect'
import type { SelectOption } from '../../components/ui/selectTypes'
import { MerchantQuickCreate } from '../../components/quickcreate/MerchantQuickCreate'
```

**Step 2: Add match type options and quick-create state**

After the `MATCH_TYPE_LABELS` constant (line 15), add:

```tsx
const MATCH_TYPE_OPTIONS: SelectOption[] = [
  { id: 'CONTAINS', label: '包含' },
  { id: 'EXACT', label: '完全匹配' },
  { id: 'REGEX', label: '正規表達式' },
]
```

Inside the `RulesPage` component, after existing state declarations, add:

```tsx
const [showMerchantCreate, setShowMerchantCreate] = useState(false)
const [createSearchTerm, setCreateSearchTerm] = useState('')

const merchantOptions: SelectOption[] = (merchants ?? []).map((m) => ({ id: m.id, label: m.name }))
```

**Step 3: Replace match type Picker (lines 67-73)**

Replace:

```tsx
<View style={{ marginBottom: 12 }}>
  <SearchableSelect
    value={matchType}
    options={MATCH_TYPE_OPTIONS}
    placeholder="匹配類型"
    onChange={(id) => setMatchType((id as MatchType) ?? 'CONTAINS')}
    allowClear={false}
  />
</View>
```

**Step 4: Replace merchant Picker (lines 74-79)**

Replace:

```tsx
<View style={{ marginBottom: 12 }}>
  <SearchableSelect
    value={merchantId || undefined}
    options={merchantOptions}
    placeholder="選擇商家"
    onChange={(id) => setMerchantId(id ?? '')}
    onCreateNew={(term) => { setCreateSearchTerm(term); setShowMerchantCreate(true) }}
    createNewLabel="新增商家"
    allowClear={false}
  />
</View>
```

**Step 5: Add MerchantQuickCreate modal**

Add before the closing `</View>` of the page (before line 110):

```tsx
<MerchantQuickCreate
  visible={showMerchantCreate}
  initialName={createSearchTerm}
  onCreated={(m) => setMerchantId(m.id)}
  onClose={() => setShowMerchantCreate(false)}
/>
```

**Step 6: Verify compile**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit 2>&1 | head -20`

**Step 7: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add app/app/rules/index.tsx
git commit -m "feat(app): replace Rules page Pickers with SearchableSelect"
```

---

### Task 7: Replace Picker in SharedLedger expenses page

**Files:**
- Modify: `app/app/shared-ledgers/[id]/expenses/new.tsx`

**Step 1: Update imports**

Replace:
```tsx
import { Picker } from '@react-native-picker/picker'
```

With:
```tsx
import { SearchableSelect } from '../../../../components/ui/SearchableSelect'
import type { SelectOption } from '../../../../components/ui/selectTypes'
```

**Step 2: Convert CATEGORIES to SelectOption format**

Replace the `CATEGORIES` constant:

```tsx
const CATEGORY_OPTIONS: SelectOption[] = [
  { id: 'food', label: '餐飲' },
  { id: 'transport', label: '交通' },
  { id: 'accommodation', label: '住宿' },
  { id: 'ticket', label: '票券' },
  { id: 'supplies', label: '用品' },
  { id: 'other', label: '其他' },
]
```

**Step 3: Replace category Picker (lines 101-106)**

Replace:

```tsx
<Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 }}>分類</Text>
<View style={{ marginBottom: 16 }}>
  <SearchableSelect
    value={category}
    options={CATEGORY_OPTIONS}
    placeholder="選擇分類"
    onChange={(id) => setCategory(id ?? 'food')}
    allowClear={false}
  />
</View>
```

**Step 4: Verify compile**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit 2>&1 | head -20`

**Step 5: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add app/app/shared-ledgers/\[id\]/expenses/new.tsx
git commit -m "feat(app): replace SharedLedger expense Picker with SearchableSelect"
```

---

### Task 8: Remove @react-native-picker/picker dependency

**Files:**
- Modify: `app/package.json`

**Step 1: Verify no remaining Picker imports**

Run: `cd /Users/yuki/projects/zen-bill && grep -r "@react-native-picker/picker" app/ --include="*.tsx" --include="*.ts"`

Expected: No results (all Pickers replaced).

**Step 2: Uninstall the package**

Run: `cd /Users/yuki/projects/zen-bill/app && npm uninstall @react-native-picker/picker` (or `pnpm remove` / `yarn remove` depending on package manager)

Check which package manager: `ls /Users/yuki/projects/zen-bill/pnpm-lock.yaml /Users/yuki/projects/zen-bill/yarn.lock /Users/yuki/projects/zen-bill/package-lock.json 2>/dev/null`

**Step 3: Verify app still compiles**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
cd /Users/yuki/projects/zen-bill
git add app/package.json
# add lockfile too
git commit -m "chore(app): remove @react-native-picker/picker dependency"
```

---

### Task 9: Visual verification on simulator

**Step 1: Start dev server**

Run: `cd /Users/yuki/projects/zen-bill/app && npx expo start`

**Step 2: Test TransactionForm**

- Open "新增交易" screen
- Tap each field (帳戶, 分類, 商家): verify bottom sheet opens with search
- Type to search: verify filtering works
- Select an item: verify it closes and shows selected value
- Test "新增商家" button: verify modal opens, create works, and new item is selected
- Test "新增分類" button: same
- Test "新增帳戶" button: same
- Switch to TRANSFER type: verify 目標帳戶 appears and works
- Switch to INCOME: verify category options filter to income type

**Step 3: Test Rules page**

- Open 規則引擎
- Tap "新增規則"
- Test match type selector
- Test merchant selector with search
- Test "新增商家" from merchant selector

**Step 4: Test SharedLedger expenses**

- Open shared ledger → 新增支出
- Test category selector

**Step 5: Edge cases**

- Verify bottom sheet drag-to-close works
- Verify keyboard doesn't obscure the search input
- Verify backdrop tap closes the sheet
- Verify clear button (X) works on optional fields
