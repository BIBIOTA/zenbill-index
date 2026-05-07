# APP Invoice Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add invoice-to-transaction import flow in the mobile app, matching the web's full flow (match → prefill → quick-create merchant → rule prompt).

**Architecture:** Modify 3 existing files (`invoices.tsx`, `new.tsx`, `TransactionForm.tsx`) and create 1 new component (`RuleCreatePrompt.tsx`). Data flows via expo-router search params (JSON-stringified defaultValues). All API hooks already exist in `@zenbill/shared`.

**Tech Stack:** React Native, Expo Router, @gorhom/bottom-sheet, @zenbill/shared hooks

---

### Task 1: Add RuleCreatePrompt Bottom Sheet Component

**Files:**
- Create: `app/components/invoices/RuleCreatePrompt.tsx`

**Step 1: Create the RuleCreatePrompt component**

```typescript
// app/components/invoices/RuleCreatePrompt.tsx
import { useCallback, useMemo, useRef } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet'
import { useCreateRule } from '@zenbill/shared'
import { Colors } from '../../constants/theme'
import { notifySuccess } from '../../lib/haptics'

interface Props {
  visible: boolean
  sellerName: string
  merchantId: string
  merchantName: string
  onDone: () => void
}

export function RuleCreatePrompt({ visible, sellerName, merchantId, merchantName, onDone }: Props) {
  const createRule = useCreateRule()
  const bottomSheetRef = useRef<BottomSheet>(null)
  const snapPoints = useMemo(() => [240], [])

  const handleCreate = () => {
    createRule.mutate(
      { merchant_id: merchantId, keyword: sellerName, match_type: 'CONTAINS', priority: 0 },
      {
        onSuccess: () => {
          notifySuccess()
          onDone()
        },
      },
    )
  }

  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    [],
  )

  if (!visible) return null

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onDone}
      backdropComponent={renderBackdrop}
    >
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>建立商家規則</Text>
        <Text style={{ fontSize: 14, color: '#374151', lineHeight: 22, marginBottom: 8 }}>
          是否將發票商家「<Text style={{ fontWeight: '600' }}>{sellerName}</Text>」自動對應到商家「<Text style={{ fontWeight: '600' }}>{merchantName}</Text>」？
        </Text>
        <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 20 }}>
          建立後，未來同樣商家名稱的發票將自動匹配。
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
          <TouchableOpacity
            onPress={onDone}
            style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
          >
            <Text style={{ fontSize: 14, color: '#6b7280' }}>跳過</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleCreate}
            disabled={createRule.isPending}
            style={{
              paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
              backgroundColor: Colors.primary, opacity: createRule.isPending ? 0.5 : 1,
            }}
          >
            {createRule.isPending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={{ fontSize: 14, color: '#ffffff', fontWeight: '600' }}>建立規則</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  )
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill && npx tsc --noEmit --project app/tsconfig.json 2>&1 | head -20`
Expected: No errors related to RuleCreatePrompt

**Step 3: Commit**

```bash
git add app/components/invoices/RuleCreatePrompt.tsx
git commit -m "feat(app): add RuleCreatePrompt bottom sheet component"
```

---

### Task 2: Update TransactionForm to Accept Invoice Import Props

**Files:**
- Modify: `app/components/transactions/TransactionForm.tsx`

**Step 1: Extend Props interface and initial state**

In `app/components/transactions/TransactionForm.tsx`, change the Props interface and initial state setup.

Old code (lines 25-42):
```typescript
interface Props {
  transaction?: Transaction
  defaultAccountId?: string
}

export function TransactionForm({ transaction, defaultAccountId }: Props) {
  const isEdit = !!transaction

  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'EXPENSE')
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '')
  const [accountId, setAccountId] = useState(transaction?.account_id ?? defaultAccountId ?? '')
  const [targetAccountId, setTargetAccountId] = useState(transaction?.target_account_id ?? '')
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? '')
  const [merchantId, setMerchantId] = useState(transaction?.merchant_id ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')
  const [occurredAt, setOccurredAt] = useState(
    transaction?.occurred_at?.split('T')[0] ?? new Date().toISOString().split('T')[0]
  )
```

New code:
```typescript
export interface InvoiceDefaults {
  type?: TransactionType
  amount?: number
  amountStr?: string
  occurred_at?: string
  note?: string
  merchant_id?: string
  category_id?: string
  account_id?: string
}

interface Props {
  transaction?: Transaction
  defaultAccountId?: string
  invoiceId?: string
  defaultValues?: InvoiceDefaults
  sellerName?: string
}

export function TransactionForm({ transaction, defaultAccountId, invoiceId, defaultValues, sellerName }: Props) {
  const isEdit = !!transaction

  const [type, setType] = useState<TransactionType>(
    transaction?.type ?? defaultValues?.type ?? 'EXPENSE'
  )
  const [amount, setAmount] = useState(
    transaction ? String(transaction.amount)
    : defaultValues?.amountStr ?? (defaultValues?.amount ? String(defaultValues.amount) : '')
  )
  const [accountId, setAccountId] = useState(
    transaction?.account_id ?? defaultValues?.account_id ?? defaultAccountId ?? ''
  )
  const [targetAccountId, setTargetAccountId] = useState(transaction?.target_account_id ?? '')
  const [categoryId, setCategoryId] = useState(
    transaction?.category_id ?? defaultValues?.category_id ?? ''
  )
  const [merchantId, setMerchantId] = useState(
    transaction?.merchant_id ?? defaultValues?.merchant_id ?? ''
  )
  const [note, setNote] = useState(
    transaction?.note ?? defaultValues?.note ?? ''
  )
  const [occurredAt, setOccurredAt] = useState(
    transaction?.occurred_at?.split('T')[0] ?? defaultValues?.occurred_at ?? new Date().toISOString().split('T')[0]
  )
```

**Step 2: Add auto-open MerchantQuickCreate for invoice import**

After the existing `useState` declarations (after line 55 `const [createSearchTerm, setCreateSearchTerm] = useState('')`), add:

```typescript
  // Auto-open merchant quick-create when importing invoice with no match
  const [didAutoOpenMerchant, setDidAutoOpenMerchant] = useState(false)
  useEffect(() => {
    if (sellerName && !defaultValues?.merchant_id && !isEdit && !didAutoOpenMerchant) {
      setCreateSearchTerm(sellerName)
      setShowMerchantCreate(true)
      setDidAutoOpenMerchant(true)
    }
  }, [sellerName, defaultValues?.merchant_id, isEdit, didAutoOpenMerchant])
```

Add `useEffect` to the import at the top of the file:
```typescript
import { useState, useEffect } from 'react'
```

**Step 3: Add invoice_id to submit payload and RuleCreatePrompt logic**

Add `useMerchants` to the shared imports (it's already imported — verify it's in the destructured list). Also add `useCreateRule` is NOT needed here — it's inside RuleCreatePrompt.

Add import for RuleCreatePrompt at the top:
```typescript
import { RuleCreatePrompt } from '../invoices/RuleCreatePrompt'
```

Add state for rule prompt (after existing state declarations):
```typescript
  const [showRulePrompt, setShowRulePrompt] = useState(false)
```

Replace the `handleSubmit` function (lines 65-93) with:

```typescript
  const shouldPromptRule = () => {
    if (!invoiceId || !sellerName || !merchantId) return false
    const merchant = merchants?.find((m) => m.id === merchantId)
    return !!merchant && merchant.name !== sellerName
  }

  const handleSubmit = () => {
    if (!amount || !accountId) {
      Alert.alert('Error', '請填寫金額和帳戶')
      return
    }

    const input: CreateTransactionInput = {
      type,
      amount: parseFloat(amount),
      account_id: accountId,
      occurred_at: `${occurredAt}T00:00:00Z`,
      ...(type === 'TRANSFER' && targetAccountId ? { target_account_id: targetAccountId } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(merchantId ? { merchant_id: merchantId } : {}),
      ...(note ? { note } : {}),
      ...(invoiceId ? { invoice_id: invoiceId } : {}),
    }

    const onSuccess = () => {
      notifySuccess()
      if (shouldPromptRule()) {
        setShowRulePrompt(true)
      } else {
        router.back()
      }
    }

    if (isEdit) {
      updateMut.mutate({ id: transaction.id, ...input }, {
        onSuccess,
        onError: (e) => Alert.alert('Error', e.message),
      })
    } else {
      createMut.mutate(input, {
        onSuccess,
        onError: (e) => Alert.alert('Error', e.message),
      })
    }
  }
```

**Step 4: Add RuleCreatePrompt to the render output**

At the bottom of the `return` JSX, after the `AccountQuickCreate` component (before the closing `</ScrollView>`), add:

```tsx
      {sellerName && merchantId && (
        <RuleCreatePrompt
          visible={showRulePrompt}
          sellerName={sellerName}
          merchantId={merchantId}
          merchantName={merchants?.find((m) => m.id === merchantId)?.name ?? ''}
          onDone={() => {
            setShowRulePrompt(false)
            router.back()
          }}
        />
      )}
```

**Step 5: Update submit button label**

Find the submit `Button` component (line 249-254) and update the title:
```tsx
      <Button
        testID="txn_submit_button"
        title={isEdit ? '儲存修改' : invoiceId ? '從發票建立' : '新增交易'}
        onPress={handleSubmit}
        loading={createMut.isPending || updateMut.isPending}
      />
```

**Step 6: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill && npx tsc --noEmit --project app/tsconfig.json 2>&1 | head -20`
Expected: No errors

**Step 7: Commit**

```bash
git add app/components/transactions/TransactionForm.tsx
git commit -m "feat(app): add invoice import support to TransactionForm"
```

---

### Task 3: Update transactions/new.tsx to Pass Invoice Params

**Files:**
- Modify: `app/app/transactions/new.tsx`

**Step 1: Update the page to read and pass invoice params**

Replace the entire file content:

```typescript
import { Stack, useLocalSearchParams } from 'expo-router'
import { TransactionForm } from '../../components/transactions/TransactionForm'
import type { InvoiceDefaults } from '../../components/transactions/TransactionForm'

export default function NewTransactionPage() {
  const params = useLocalSearchParams<{
    account_id?: string
    invoiceId?: string
    defaultValues?: string
    sellerName?: string
  }>()

  let parsedDefaults: InvoiceDefaults | undefined
  if (params.defaultValues) {
    try {
      parsedDefaults = JSON.parse(params.defaultValues)
    } catch {
      // ignore parse errors
    }
  }

  const title = params.invoiceId ? '從發票建立交易' : '新增交易'

  return (
    <>
      <Stack.Screen options={{ title }} />
      <TransactionForm
        defaultAccountId={params.account_id}
        invoiceId={params.invoiceId}
        defaultValues={parsedDefaults}
        sellerName={params.sellerName}
      />
    </>
  )
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill && npx tsc --noEmit --project app/tsconfig.json 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add app/app/transactions/new.tsx
git commit -m "feat(app): pass invoice import params to TransactionForm"
```

---

### Task 4: Add Import Button to Invoice List

**Files:**
- Modify: `app/app/(tabs)/invoices.tsx`

**Step 1: Add import logic and button to invoices page**

Add new imports at the top of the file:

```typescript
import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import {
  useInvoices, useSyncInvoices, useSyncStatus,
  useUpdateInvoiceStatus, useBatchUpdateInvoiceStatus,
  useMatchInvoice,
} from '@zenbill/shared'
import type { Invoice, InvoiceStatus } from '@zenbill/shared'
import { Button } from '../../components/ui/Button'
import { LoadingScreen } from '../../components/ui/LoadingScreen'
import { EmptyState } from '../../components/ui/EmptyState'
import { Colors } from '../../constants/theme'
```

Key changes: add `router` from expo-router, add `useMatchInvoice` to shared imports, add `ActivityIndicator` to RN imports.

Inside the component function, after existing hooks (after line 41 `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())`), add:

```typescript
  const matchInvoice = useMatchInvoice()
  const [importingId, setImportingId] = useState<string | null>(null)

  const formatInvoiceNote = (inv: Invoice): string => {
    const items = inv.raw_details?.Details
    if (!items || items.length === 0) return inv.invoice_number
    return items
      .map((item) => {
        const qty = Number(item.quantity) > 1 ? ` x${item.quantity}` : ''
        return `${item.item}${qty} $${Number(item.unitPrice).toLocaleString()}`
      })
      .join('\n')
  }

  const handleImport = async (inv: Invoice) => {
    setImportingId(inv.id)
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
      router.push({
        pathname: '/transactions/new',
        params: {
          invoiceId: inv.id,
          defaultValues: JSON.stringify({
            ...baseDefaults,
            ...(match.merchant_id ? { merchant_id: match.merchant_id } : {}),
            ...(match.category_id ? { category_id: match.category_id } : {}),
            ...(match.account_id ? { account_id: match.account_id } : {}),
          }),
          sellerName: inv.seller_name,
        },
      })
    } catch {
      // Match failed — navigate with base defaults only
      router.push({
        pathname: '/transactions/new',
        params: {
          invoiceId: inv.id,
          defaultValues: JSON.stringify(baseDefaults),
          sellerName: inv.seller_name,
        },
      })
    } finally {
      setImportingId(null)
    }
  }
```

**Step 2: Add the import button to each invoice card**

Replace the invoice card's right-side `<View>` (the one with amount + status badge, lines 163-176) with a version that includes an import button for PENDING invoices:

```tsx
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 15, fontWeight: 'bold' }}>${inv.total_amount.toLocaleString()}</Text>
                  <View style={{
                    backgroundColor: STATUS_COLORS[inv.status] + '20',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 8,
                    marginTop: 4,
                  }}>
                    <Text style={{ fontSize: 11, color: STATUS_COLORS[inv.status], fontWeight: '600' }}>
                      {STATUS_LABELS[inv.status]}
                    </Text>
                  </View>
                  {inv.status === 'PENDING' && (
                    <TouchableOpacity
                      testID={`invoice_import_${inv.id}`}
                      onPress={(e) => {
                        e.stopPropagation?.()
                        handleImport(inv)
                      }}
                      disabled={importingId === inv.id}
                      style={{
                        marginTop: 6,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        backgroundColor: Colors.primary,
                        borderRadius: 6,
                        opacity: importingId === inv.id ? 0.5 : 1,
                      }}
                    >
                      {importingId === inv.id ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={{ fontSize: 12, color: '#ffffff', fontWeight: '600' }}>匯入</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
```

**Step 3: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill && npx tsc --noEmit --project app/tsconfig.json 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add app/app/\(tabs\)/invoices.tsx
git commit -m "feat(app): add invoice import button with match + navigate flow"
```

---

### Task 5: Manual Testing & Final Verification

**Step 1: Type-check the entire app**

Run: `cd /Users/yuki/projects/zen-bill && npx tsc --noEmit --project app/tsconfig.json`
Expected: No errors

**Step 2: Verify expo builds**

Run: `cd /Users/yuki/projects/zen-bill/app && npx expo export --platform ios --dump-sourcemap 2>&1 | tail -5`
Expected: Export completes without errors

**Step 3: Manual test checklist (on device/simulator)**

Test the following scenarios:
1. **Invoice list** — PENDING invoices show "匯入" button, PROCESSED/IGNORED do not
2. **Import tap** — Shows loading spinner, then navigates to transaction form
3. **Prefilled form** — Amount, date, note, merchant, category, account are prefilled from match
4. **No match** — MerchantQuickCreate auto-opens with seller name
5. **Save transaction** — Creates transaction with invoice_id
6. **Rule prompt** — After save, if seller_name != merchant_name, bottom sheet appears
7. **Create rule** — Creates CONTAINS rule, then navigates back
8. **Skip rule** — Tapping "跳過" navigates back without creating rule
9. **Selection still works** — Tapping invoice card (not import button) still toggles selection
10. **Batch actions still work** — Batch process/ignore still functional

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(app): address issues found during invoice import testing"
```
