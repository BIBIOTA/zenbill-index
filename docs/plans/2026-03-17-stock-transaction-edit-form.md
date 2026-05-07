# Stock Transaction Edit Form Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the edit transaction form for stock accounts show stock-specific fields (shares, price per share, from/to account) instead of the generic transaction form (merchant, category, etc.)

**Architecture:** When a user taps a stock account's transaction to edit, detect the transaction belongs to a STOCK account and render a `StockTransactionDetail` component instead of the generic `TransactionForm`. This component parses shares/price from the note field, displays stock-specific info in read-only format, and allows editing only date and note (since changing shares/price requires complex recalculation of avg_cost_price and shares_held on the account).

**Tech Stack:** React Native (app), React (frontend/web), TypeScript, shared hooks from `packages/shared`

---

## Background

### Current Behavior
- **Add (buy/sell):** Stock account detail page shows a stock-specific form with fields: 股數, 每股價格, 扣款/入帳帳戶
- **Edit:** Clicking a stock transaction navigates to the generic `TransactionForm` which shows: Type (EXPENSE/INCOME/TRANSFER), Amount, Merchant, Category, Account, Target Account, Date, Note
- These are completely mismatched UIs

### How Stock Transactions Are Stored
The backend `StockService.Buy()` / `StockService.Sell()` creates transactions with:
- **Type:** `TRANSFER` (with cash flow) or `INCOME` (buy without cash flow, recording existing holdings)
- **Note:** `"Buy 100 shares of 2330 @ 500.00"` or `"Sell 50 shares of 2330 @ 600.00"`
- **Amount:** total amount (shares × price_per_share)
- No dedicated `shares` or `price_per_share` fields on Transaction

### Design Decision: Read-Only Stock Fields
Editing shares/price would require:
1. Reversing the old transaction's effect on shares_held and avg_cost_price
2. Recalculating with new values
3. The backend has no "edit stock transaction" API

Therefore, stock-specific fields (shares, price, total) are **read-only**. Users who need to change these should delete and re-create. Date and note remain editable.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/shared/src/utils/stockTransaction.ts` | Create | Parse stock transaction note to extract shares/price/action |
| `app/components/transactions/StockTransactionDetail.tsx` | Create | App: stock transaction detail/edit component |
| `app/app/transactions/[id]/edit.tsx` | Modify | App: route to StockTransactionDetail for stock transactions |
| `frontend/src/components/transactions/StockTransactionDetail.tsx` | Create | Web: stock transaction detail/edit component |
| `frontend/src/pages/TransactionFormPage.tsx` | Modify | Web: route to StockTransactionDetail for stock transactions |

---

## Chunk 1: Shared Utility — Parse Stock Transaction Note

### Task 1: Create stock transaction note parser

**Files:**
- Create: `packages/shared/src/utils/stockTransaction.ts`

- [ ] **Step 1: Write the parser utility**

```typescript
// packages/shared/src/utils/stockTransaction.ts

export interface StockTransactionInfo {
  action: 'buy' | 'sell'
  shares: number
  symbol: string
  pricePerShare: number
  isExistingHolding: boolean  // "計入既有持股" pattern
}

/**
 * Parse stock transaction info from the note field.
 * Expected formats:
 *   "Buy 100 shares of 2330 @ 500.00"
 *   "Buy 100 shares of 2330 @ 500.00 (計入既有持股)"
 *   "Sell 50 shares of 2330 @ 600.00"
 */
export function parseStockTransactionNote(note: string): StockTransactionInfo | null {
  const match = note.match(/^(Buy|Sell)\s+([\d.]+)\s+shares\s+of\s+(\S+)\s+@\s+([\d.]+)/)
  if (!match) return null
  return {
    action: match[1].toLowerCase() as 'buy' | 'sell',
    shares: Number(match[2]),
    symbol: match[3],
    pricePerShare: Number(match[4]),
    isExistingHolding: note.includes('計入既有持股'),
  }
}
```

- [ ] **Step 2: Write unit tests**

Create: `packages/shared/src/utils/__tests__/stockTransaction.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { parseStockTransactionNote } from '../stockTransaction'

describe('parseStockTransactionNote', () => {
  it('parses a standard buy note', () => {
    const result = parseStockTransactionNote('Buy 100 shares of 2330 @ 500.00')
    expect(result).toEqual({
      action: 'buy',
      shares: 100,
      symbol: '2330',
      pricePerShare: 500,
      isExistingHolding: false,
    })
  })

  it('parses a standard sell note', () => {
    const result = parseStockTransactionNote('Sell 50 shares of AAPL @ 150.25')
    expect(result).toEqual({
      action: 'sell',
      shares: 50,
      symbol: 'AAPL',
      pricePerShare: 150.25,
      isExistingHolding: false,
    })
  })

  it('parses buy with existing holding suffix', () => {
    const result = parseStockTransactionNote('Buy 2000 shares of 0050.TW @ 52.50 (計入既有持股)')
    expect(result).toEqual({
      action: 'buy',
      shares: 2000,
      symbol: '0050.TW',
      pricePerShare: 52.5,
      isExistingHolding: true,
    })
  })

  it('parses fractional shares', () => {
    const result = parseStockTransactionNote('Buy 0.5 shares of AAPL @ 150.00')
    expect(result).toEqual({
      action: 'buy',
      shares: 0.5,
      symbol: 'AAPL',
      pricePerShare: 150,
      isExistingHolding: false,
    })
  })

  it('returns null for non-matching notes', () => {
    expect(parseStockTransactionNote('Some random note')).toBeNull()
    expect(parseStockTransactionNote('')).toBeNull()
    expect(parseStockTransactionNote('Transfer to savings')).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests**

Run: `cd packages/shared && npx vitest run src/utils/__tests__/stockTransaction.test.ts`
Expected: All 5 tests pass

- [ ] **Step 4: Export from shared package**

Add to `packages/shared/src/index.ts`:
```typescript
export { parseStockTransactionNote } from './utils/stockTransaction.ts'
export type { StockTransactionInfo } from './utils/stockTransaction.ts'
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/utils/stockTransaction.ts packages/shared/src/utils/__tests__/stockTransaction.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add stock transaction note parser utility with tests"
```

---

## Chunk 2: App — Stock Transaction Detail Component

### Task 2: Create StockTransactionDetail for React Native

**Files:**
- Create: `app/components/transactions/StockTransactionDetail.tsx`

- [ ] **Step 1: Create the component**

This component shows:
- Action badge (買入/賣出) — read-only
- Shares — read-only
- Price per share — read-only
- Total amount — read-only
- From/To account — read-only
- Date — editable
- Note — editable
- Save and Delete buttons

```typescript
// app/components/transactions/StockTransactionDetail.tsx
import { useState } from 'react'
import { View, Text, TextInput, ScrollView, Alert } from 'react-native'
import { router } from 'expo-router'
import {
  useAccounts,
  useUpdateTransaction,
  useDeleteTransaction,
  parseStockTransactionNote,
} from '@zenbill/shared'
import type { Transaction } from '@zenbill/shared'
import { Button } from '../ui/Button'
import { DatePickerSheet } from '../ui/DatePickerSheet'
import { Colors } from '../../constants/theme'
import { getCurrencySymbol } from '../../constants/currencies'
import { notifySuccess, notifyWarning } from '../../lib/haptics'

interface Props {
  transaction: Transaction
}

export function StockTransactionDetail({ transaction }: Props) {
  const stockInfo = parseStockTransactionNote(transaction.note)
  const { data: accounts } = useAccounts()
  const updateMut = useUpdateTransaction()
  const deleteMut = useDeleteTransaction()

  const [occurredAt, setOccurredAt] = useState(
    transaction.occurred_at?.split('T')[0] ?? new Date().toISOString().split('T')[0]
  )
  const [note, setNote] = useState(transaction.note ?? '')

  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]))
  const sourceAccount = accountMap.get(transaction.account_id)
  const targetAccount = transaction.target_account_id
    ? accountMap.get(transaction.target_account_id)
    : null

  const totalAmount = transaction.amount
  const currency = sourceAccount?.currency ?? 'TWD'

  const handleSave = () => {
    updateMut.mutate(
      {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        account_id: transaction.account_id,
        target_account_id: transaction.target_account_id ?? undefined,
        occurred_at: `${occurredAt}T00:00:00Z`,
        note,
      },
      {
        onSuccess: () => {
          notifySuccess()
          router.back()
        },
        onError: (e) => Alert.alert('Error', e.message),
      }
    )
  }

  const handleDelete = () => {
    notifyWarning()
    Alert.alert('確認刪除', '刪除此筆交易不會自動調整股票帳戶的持股數和成本，確定要刪除嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: () =>
          deleteMut.mutate(transaction.id, {
            onSuccess: () => {
              notifySuccess()
              router.back()
            },
            onError: (e) => Alert.alert('Error', e.message),
          }),
      },
    ])
  }

  const isBuy = stockInfo?.action === 'buy'

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#ffffff' }} contentContainerStyle={{ padding: 16 }}>
      {/* Action Badge */}
      <View style={{
        alignSelf: 'flex-start',
        backgroundColor: isBuy ? '#dcfce7' : '#fee2e2',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginBottom: 16,
      }}>
        <Text style={{
          fontSize: 14,
          fontWeight: '600',
          color: isBuy ? '#16a34a' : '#dc2626',
        }}>
          {isBuy ? '買入' : '賣出'}
          {stockInfo?.isExistingHolding ? '（計入既有持股）' : ''}
        </Text>
      </View>

      {/* Stock Info (read-only) */}
      {stockInfo && (
        <>
          <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 2 }}>股票代號</Text>
          <Text style={{ fontSize: 16, fontWeight: '500', marginBottom: 12 }}>{stockInfo.symbol}</Text>

          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 2 }}>股數</Text>
              <Text style={{ fontSize: 16, fontWeight: '500' }}>{stockInfo.shares.toLocaleString()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 2 }}>每股價格</Text>
              <Text style={{ fontSize: 16, fontWeight: '500' }}>
                {getCurrencySymbol(currency)}{stockInfo.pricePerShare.toLocaleString()}
              </Text>
            </View>
          </View>
        </>
      )}

      <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 2 }}>總金額</Text>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>
        {getCurrencySymbol(currency)}{totalAmount.toLocaleString()}
      </Text>

      {/* Accounts (read-only) */}
      {transaction.type === 'TRANSFER' && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 2 }}>
            {isBuy ? '扣款帳戶' : '入帳帳戶'}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '500' }}>
            {isBuy
              ? sourceAccount?.name ?? '(未知帳戶)'
              : targetAccount?.name ?? '(未知帳戶)'}
          </Text>
          <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: 8, marginBottom: 2 }}>
            股票帳戶
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '500' }}>
            {isBuy
              ? targetAccount?.name ?? '(未知帳戶)'
              : sourceAccount?.name ?? '(未知帳戶)'}
          </Text>
        </View>
      )}

      {transaction.type === 'INCOME' && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 2 }}>股票帳戶</Text>
          <Text style={{ fontSize: 14, fontWeight: '500' }}>
            {sourceAccount?.name ?? '(未知帳戶)'}
          </Text>
        </View>
      )}

      {/* Read-only hint */}
      <View style={{
        backgroundColor: '#f0f9ff',
        borderRadius: 8,
        padding: 10,
        marginBottom: 16,
      }}>
        <Text style={{ fontSize: 12, color: '#0369a1' }}>
          股數和價格為唯讀。如需修改，請刪除此筆交易後重新操作買入/賣出。
        </Text>
      </View>

      {/* Date (editable) */}
      <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 }}>日期</Text>
      <DatePickerSheet value={occurredAt} onSelect={setOccurredAt} />

      {/* Note (editable) */}
      <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 }}>備註</Text>
      <TextInput
        style={{
          borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
          paddingHorizontal: 16, paddingVertical: 12, fontSize: 16,
          marginBottom: 24,
        }}
        placeholder="備註"
        value={note}
        onChangeText={setNote}
      />

      {/* Save */}
      <Button
        title="儲存修改"
        onPress={handleSave}
        loading={updateMut.isPending}
      />

      {/* Delete */}
      <Button
        title="刪除交易"
        variant="danger"
        onPress={handleDelete}
        loading={deleteMut.isPending}
        style={{ marginTop: 12 }}
      />
    </ScrollView>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/transactions/StockTransactionDetail.tsx
git commit -m "feat(app): add StockTransactionDetail component for stock transactions"
```

### Task 3: Wire up StockTransactionDetail in edit route (App)

**Files:**
- Modify: `app/app/transactions/[id]/edit.tsx`

- [ ] **Step 1: Update edit page to detect stock transactions**

Replace current content with:

```typescript
import { Stack, useLocalSearchParams } from 'expo-router'
import { useTransaction, useAccounts } from '@zenbill/shared'
import { TransactionForm } from '../../../components/transactions/TransactionForm'
import { StockTransactionDetail } from '../../../components/transactions/StockTransactionDetail'
import { LoadingScreen } from '../../../components/ui/LoadingScreen'

export default function EditTransactionPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: transaction, isLoading: txLoading } = useTransaction(id)
  const { data: accounts, isLoading: acctLoading } = useAccounts()

  if (txLoading || acctLoading) return <LoadingScreen />
  if (!transaction) return null

  // Check if this transaction belongs to a stock account
  const account = accounts?.find((a) => a.id === transaction.account_id)
  const targetAccount = transaction.target_account_id
    ? accounts?.find((a) => a.id === transaction.target_account_id)
    : null
  const isStockTransaction =
    account?.type === 'STOCK' || targetAccount?.type === 'STOCK'

  if (isStockTransaction) {
    return (
      <>
        <Stack.Screen options={{ title: '股票交易詳情' }} />
        <StockTransactionDetail transaction={transaction} />
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: '編輯交易' }} />
      <TransactionForm transaction={transaction} />
    </>
  )
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `cd app && npx expo export --platform ios --no-minify 2>&1 | head -20` (or equivalent type-check)

- [ ] **Step 3: Commit**

```bash
git add app/app/transactions/[id]/edit.tsx
git commit -m "feat(app): route stock transactions to StockTransactionDetail"
```

---

## Chunk 3: Web — Stock Transaction Detail Component

### Task 4: Create StockTransactionDetail for Web

**Files:**
- Create: `frontend/src/components/transactions/StockTransactionDetail.tsx`

- [ ] **Step 1: Create the web component**

```typescript
// frontend/src/components/transactions/StockTransactionDetail.tsx
import { useState } from 'react'
import {
  useAccounts,
  useUpdateTransaction,
  useDeleteTransaction,
  parseStockTransactionNote,
} from '@zenbill/shared'
import type { Transaction } from '@zenbill/shared'
import { getCurrencySymbol } from '@/constants/currencies'

interface Props {
  transaction: Transaction
  onDone: () => void
}

export default function StockTransactionDetail({ transaction, onDone }: Props) {
  const stockInfo = parseStockTransactionNote(transaction.note)
  const { data: accounts } = useAccounts()
  const updateTx = useUpdateTransaction()
  const deleteTx = useDeleteTransaction()

  const [occurredAt, setOccurredAt] = useState(
    new Date(transaction.occurred_at).toISOString().slice(0, 10)
  )
  const [note, setNote] = useState(transaction.note ?? '')

  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]))
  const sourceAccount = accountMap.get(transaction.account_id)
  const targetAccount = transaction.target_account_id
    ? accountMap.get(transaction.target_account_id)
    : null

  const currency = sourceAccount?.currency ?? 'TWD'
  const isBuy = stockInfo?.action === 'buy'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateTx.mutate(
      {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        account_id: transaction.account_id,
        target_account_id: transaction.target_account_id ?? undefined,
        occurred_at: new Date(occurredAt).toISOString(),
        note,
      },
      { onSuccess: onDone }
    )
  }

  const handleDelete = () => {
    if (!confirm('刪除此筆交易不會自動調整股票帳戶的持股數和成本，確定要刪除嗎？')) return
    deleteTx.mutate(transaction.id, { onSuccess: onDone })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg md:max-w-none">
      {/* Action Badge */}
      <div className="flex items-center gap-2">
        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-lg ${
          isBuy ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
        }`}>
          {isBuy ? '買入' : '賣出'}
          {stockInfo?.isExistingHolding ? '（計入既有持股）' : ''}
        </span>
      </div>

      {/* Stock Info (read-only) */}
      {stockInfo && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">股票代號</label>
            <p className="text-sm font-medium">{stockInfo.symbol}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">股數</label>
            <p className="text-sm font-medium">{stockInfo.shares.toLocaleString()}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">每股價格</label>
            <p className="text-sm font-medium">{getCurrencySymbol(currency)}{stockInfo.pricePerShare.toLocaleString()}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">總金額</label>
            <p className="text-sm font-bold">{getCurrencySymbol(currency)}{transaction.amount.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Account Info (read-only) */}
      {transaction.type === 'TRANSFER' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {isBuy ? '扣款帳戶' : '入帳帳戶'}
            </label>
            <p className="text-sm">{isBuy ? sourceAccount?.name : targetAccount?.name ?? '-'}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">股票帳戶</label>
            <p className="text-sm">{isBuy ? targetAccount?.name : sourceAccount?.name ?? '-'}</p>
          </div>
        </div>
      )}

      {transaction.type === 'INCOME' && (
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">股票帳戶</label>
          <p className="text-sm">{sourceAccount?.name ?? '-'}</p>
        </div>
      )}

      {/* Read-only hint */}
      <div className="bg-blue-500/10 text-blue-400 text-xs rounded-lg px-3 py-2">
        股數和價格為唯讀。如需修改，請刪除此筆交易後重新操作買入/賣出。
      </div>

      {/* Date (editable) */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">日期</label>
        <input
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      {/* Note (editable) */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">備註</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)] resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteTx.isPending}
            className="h-8 px-4 rounded-lg text-xs font-medium text-red-400 hover:bg-red-400/10 disabled:opacity-50"
          >
            {deleteTx.isPending ? '刪除中...' : '刪除'}
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onDone} className="h-8 px-4 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button type="submit" disabled={updateTx.isPending} className="h-8 px-4 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
            {updateTx.isPending ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/transactions/StockTransactionDetail.tsx
git commit -m "feat(frontend): add StockTransactionDetail component for stock transactions"
```

### Task 5: Wire up StockTransactionDetail in web edit page

**Files:**
- Modify: `frontend/src/pages/TransactionFormPage.tsx`

- [ ] **Step 1: Read TransactionFormPage.tsx to understand current structure**

Read the file and identify where the edit transaction flow renders `TransactionForm`.

- [ ] **Step 2: Add stock transaction detection and routing**

Import `StockTransactionDetail` and `useAccounts`. When editing a transaction, check if it belongs to a stock account. If so, render `StockTransactionDetail` instead of `TransactionForm`.

Replace the full file content with:

```typescript
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTransaction, useAccounts } from '@zenbill/shared'
import TransactionForm from '@/components/transactions/TransactionForm'
import StockTransactionDetail from '@/components/transactions/StockTransactionDetail'

export default function TransactionFormPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  const invoiceId = searchParams.get('invoiceId') ?? undefined
  const isEditing = !!id

  const { data: transaction, isLoading } = useTransaction(id)
  const { data: accounts } = useAccounts()

  const routeState = location.state as { defaultValues?: Record<string, unknown>; sellerName?: string } | null
  const defaultValues = routeState?.defaultValues
  const sellerName = routeState?.sellerName

  const handleDone = () => navigate(-1)

  // Detect stock transaction by checking if either account is a stock account
  const isStockTransaction = (() => {
    if (!isEditing || !transaction || !accounts) return false
    const account = accounts.find((a) => a.id === transaction.account_id)
    const targetAccount = transaction.target_account_id
      ? accounts.find((a) => a.id === transaction.target_account_id)
      : null
    return account?.type === 'STOCK' || targetAccount?.type === 'STOCK'
  })()

  const title = isStockTransaction
    ? '股票交易詳情'
    : isEditing ? '編輯交易' : invoiceId ? '從發票建立交易' : '新增交易'

  if (isEditing && isLoading) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={handleDone}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-bold">{title}</h1>
      </div>

      {isStockTransaction && transaction ? (
        <StockTransactionDetail transaction={transaction} onDone={handleDone} />
      ) : (
        <TransactionForm
          editingTransaction={isEditing ? transaction : undefined}
          defaultValues={defaultValues}
          invoiceId={invoiceId}
          sellerName={sellerName}
          onDone={handleDone}
        />
      )}
    </div>
  )
}
```

**Key differences from current file:**
- Import `useAccounts` and `StockTransactionDetail`
- Add `isStockTransaction` detection using account type
- Dynamic title: '股票交易詳情' for stock transactions
- Conditionally render `StockTransactionDetail` vs `TransactionForm`
- Page layout shell (back button, title) is preserved for both paths

- [ ] **Step 3: Verify the web app compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TransactionFormPage.tsx
git commit -m "feat(frontend): route stock transactions to StockTransactionDetail"
```

---

## Chunk 4: Manual Verification

### Task 6: Manual verification checklist

- [ ] **Step 1: Verify App stock transaction edit flow**

1. Open a stock account detail page in the app
2. Tap on an existing stock transaction
3. Confirm: shows StockTransactionDetail with action badge, shares, price, total amount
4. Confirm: date and note are editable
5. Confirm: "股數和價格為唯讀" hint is visible
6. Edit the note, save, confirm it persists

- [ ] **Step 2: Verify Web stock transaction edit flow**

1. Open a stock account detail page in the web app
2. Click edit on an existing stock transaction
3. Confirm: shows StockTransactionDetail instead of generic TransactionForm
4. Confirm: same fields as app version

- [ ] **Step 3: Verify non-stock transactions are unaffected**

1. Open a bank/credit/cash account
2. Click edit on a transaction
3. Confirm: generic TransactionForm still shows (merchant, category, etc.)

- [ ] **Step 4: Final commit if any fixes needed**
