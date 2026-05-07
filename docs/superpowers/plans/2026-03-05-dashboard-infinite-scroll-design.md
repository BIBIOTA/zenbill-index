# Dashboard Infinite Scroll Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable infinite scrolling on the APP Dashboard so users can browse their full transaction history by scrolling down, with type filtering.

**Architecture:** Convert Dashboard from `ScrollView` to `FlatList`. Dashboard widgets (stats, charts) become `ListHeaderComponent`. Transaction items are the FlatList data, loaded page-by-page via `useInfiniteQuery`. A type filter (pill buttons) sits between the charts and the transaction list.

**Tech Stack:** React Native FlatList, React Query v5 `useInfiniteQuery`, Expo Router, TypeScript

---

### Task 1: Add `useInfiniteTransactions` hook to shared package

**Files:**
- Modify: `packages/shared/src/hooks/useTransactions.ts` (append after existing code)
- Modify: `packages/shared/src/index.ts` (already re-exports via `*`)

**Step 1: Add the hook**

Append to `packages/shared/src/hooks/useTransactions.ts`:

```typescript
import { useInfiniteQuery } from '@tanstack/react-query'

export function useInfiniteTransactions(filters: Omit<TransactionFilters, 'page'> = {}) {
  const api = getApiClient()

  return useInfiniteQuery({
    queryKey: ['transactions', 'infinite', filters],
    queryFn: ({ pageParam = 1 }) => {
      const params = new URLSearchParams()
      Object.entries({ ...filters, page: pageParam, page_size: filters.page_size ?? 20 }).forEach(
        ([k, v]) => {
          if (v !== undefined && v !== '') params.set(k, String(v))
        }
      )
      const qs = params.toString()
      return api.get<PaginatedResponse<Transaction>>(`/transactions${qs ? `?${qs}` : ''}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, total_pages } = lastPage.pagination
      return page < total_pages ? page + 1 : undefined
    },
  })
}
```

Note: The existing `import { useQuery, useMutation, useQueryClient }` line needs `useInfiniteQuery` added to it. The existing type imports already include `PaginatedResponse` and `Transaction`.

**Step 2: Verify the import line**

Update the import at line 1 of `packages/shared/src/hooks/useTransactions.ts`:

```typescript
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
```

**Step 3: Verify export**

`packages/shared/src/index.ts` line 6 already has `export * from './hooks/useTransactions.ts'`, so `useInfiniteTransactions` will be automatically exported. No change needed.

**Step 4: Type check**

Run from monorepo root:
```bash
cd packages/shared && npx tsc --noEmit
```
Expected: No errors.

**Step 5: Commit**

```bash
git add packages/shared/src/hooks/useTransactions.ts
git commit -m "feat(shared): add useInfiniteTransactions hook"
```

---

### Task 2: Create `TransactionFilterChips` component

**Files:**
- Modify: `app/components/dashboard/RecentTransactions.tsx` (repurpose file)

**Step 1: Add `TransactionFilterChips` to the file**

Replace the entire content of `app/components/dashboard/RecentTransactions.tsx` with:

```typescript
import { View, Text, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import type { Transaction, TransactionType } from '@zenbill/shared'

// === Filter Chips ===

const FILTER_OPTIONS: { label: string; value: TransactionType | undefined }[] = [
  { label: '全部', value: undefined },
  { label: '支出', value: 'EXPENSE' },
  { label: '收入', value: 'INCOME' },
  { label: '轉帳', value: 'TRANSFER' },
]

interface FilterChipsProps {
  selected: TransactionType | undefined
  onSelect: (type: TransactionType | undefined) => void
}

export function TransactionFilterChips({ selected, onSelect }: FilterChipsProps) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 12 }}>交易紀錄</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {FILTER_OPTIONS.map((opt) => {
          const active = selected === opt.value
          return (
            <TouchableOpacity
              key={opt.label}
              onPress={() => onSelect(opt.value)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: active ? '#0f172a' : '#f1f5f9',
              }}
            >
              <Text style={{ fontSize: 13, color: active ? '#fff' : '#64748b', fontWeight: active ? '600' : '400' }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// === Transaction Row (extracted from old RecentTransactions) ===

function getTransactionLabel(t: Transaction): string {
  if (t.merchant?.name) return t.merchant.name
  if (t.note) return t.note
  if (t.category?.name) return t.category.name
  switch (t.type) {
    case 'TRANSFER': return '轉帳'
    case 'EXPENSE': return '支出'
    case 'INCOME': return '收入'
    case 'SETTLEMENT': return '結算'
    default: return '交易'
  }
}

function getAmountDisplay(t: Transaction): { text: string; color: string } {
  const formatted = Math.abs(t.amount).toLocaleString()
  switch (t.type) {
    case 'INCOME':
      return { text: `+$${formatted}`, color: '#16a34a' }
    case 'EXPENSE':
      return { text: `-$${formatted}`, color: '#ef4444' }
    case 'TRANSFER':
      return { text: `$${formatted}`, color: '#6b7280' }
    default:
      return { text: `$${formatted}`, color: '#0f172a' }
  }
}

function getTypeTag(type: string): { label: string; color: string; bg: string } | null {
  switch (type) {
    case 'TRANSFER': return { label: '轉帳', color: '#6b7280', bg: '#f3f4f6' }
    case 'SETTLEMENT': return { label: '結算', color: '#8b5cf6', bg: '#f5f3ff' }
    default: return null
  }
}

export function TransactionRow({ transaction: t }: { transaction: Transaction }) {
  const amount = getAmountDisplay(t)
  const tag = getTypeTag(t.type)
  return (
    <TouchableOpacity
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
      }}
      onPress={() => router.push(`/transactions/${t.id}/edit`)}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
            {getTransactionLabel(t)}
          </Text>
          {tag && (
            <View style={{
              backgroundColor: tag.bg,
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: 4,
            }}>
              <Text style={{ fontSize: 10, color: tag.color }}>{tag.label}</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
          {t.account?.name ? `${t.account.name} · ` : ''}{t.occurred_at.split('T')[0]}
        </Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: '600', color: amount.color }}>
        {amount.text}
      </Text>
    </TouchableOpacity>
  )
}
```

**Step 2: Commit**

```bash
git add app/components/dashboard/RecentTransactions.tsx
git commit -m "feat(app): split RecentTransactions into FilterChips + TransactionRow"
```

---

### Task 3: Convert Dashboard to FlatList with infinite scroll

**Files:**
- Modify: `app/app/(tabs)/index.tsx` (full rewrite)

**Step 1: Rewrite Dashboard**

Replace the entire content of `app/app/(tabs)/index.tsx` with:

```typescript
import { useState, useCallback, useMemo } from 'react'
import { View, Text, FlatList, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQueries } from '@tanstack/react-query'
import {
  useTransactionStats,
  useInfiniteTransactions,
  useInvoices,
  useSharedLedgers,
  getApiClient,
} from '@zenbill/shared'
import type { ApiResponse, SharedLedger, SharedLedgerSummary, Transaction, TransactionType } from '@zenbill/shared'
import { AssetSummary } from '../../components/dashboard/AssetSummary'
import { StatCard } from '../../components/dashboard/StatCard'
import { SpendingChart } from '../../components/dashboard/SpendingChart'
import { CategoryDonut } from '../../components/dashboard/CategoryDonut'
import { TransactionFilterChips, TransactionRow } from '../../components/dashboard/RecentTransactions'
import { LoadingScreen } from '../../components/ui/LoadingScreen'
import { FAB } from '../../components/ui/FAB'
import { router } from 'expo-router'

export default function DashboardPage() {
  const [typeFilter, setTypeFilter] = useState<TransactionType | undefined>(undefined)

  const stats = useTransactionStats(6)
  const { data: invRes } = useInvoices({ status: 'PENDING', page_size: 1 })
  const { data: ledgers } = useSharedLedgers()

  const {
    data: txPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteTransactions({
    page_size: 20,
    ...(typeFilter ? { type: typeFilter } : {}),
  })

  const api = getApiClient()
  const summaryQueries = useQueries({
    queries: (ledgers ?? ([] as SharedLedger[])).map((ledger) => ({
      queryKey: ['shared-ledgers', ledger.id, 'summary'] as const,
      queryFn: () =>
        api
          .get<ApiResponse<SharedLedgerSummary>>(`/shared-ledgers/${ledger.id}/summary`)
          .then((r) => r.data),
    })),
  })

  const totalReceivable = summaryQueries.reduce((sum, q) => {
    const balance = (q.data as SharedLedgerSummary | undefined)?.receivable_balance ?? 0
    return balance > 0 ? sum + balance : sum
  }, 0)

  const transactions = useMemo(
    () => txPages?.pages.flatMap((p) => p.data) ?? [],
    [txPages]
  )

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (stats.isLoading) return <LoadingScreen />

  const currentMonth = stats.data?.monthly?.[stats.data.monthly.length - 1]
  const pendingInvoices = invRes?.pagination?.total ?? 0

  const ListHeader = (
    <View>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>ZenBill</Text>

      <AssetSummary />

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <StatCard
          label="本月支出"
          value={`$${currentMonth?.expense?.toLocaleString() ?? '0'}`}
          accentColor="#ef4444"
        />
        <StatCard
          label="本月收入"
          value={`$${currentMonth?.income?.toLocaleString() ?? '0'}`}
          accentColor="#10b981"
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <StatCard
          label="待處理發票"
          value={`${pendingInvoices} 張`}
          accentColor="#f59e0b"
        />
        <StatCard
          label="待收款項"
          value={`$${totalReceivable.toLocaleString()}`}
          accentColor="#8b5cf6"
        />
      </View>

      <SpendingChart monthly={stats.data?.monthly ?? []} />

      <CategoryDonut categories={stats.data?.current_month_categories ?? []} />

      <TransactionFilterChips selected={typeFilter} onSelect={setTypeFilter} />
    </View>
  )

  const ListFooter = isFetchingNextPage ? (
    <ActivityIndicator style={{ paddingVertical: 20 }} color="#94a3b8" />
  ) : !hasNextPage && transactions.length > 0 ? (
    <Text style={{ textAlign: 'center', color: '#94a3b8', paddingVertical: 20, fontSize: 13 }}>
      沒有更多交易了
    </Text>
  ) : null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TransactionRow transaction={item} />}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={{ padding: 16 }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
      />
      <FAB testID="dashboard_fab" onPress={() => router.push('/transactions/new')} />
    </SafeAreaView>
  )
}
```

**Step 2: Verify the app compiles**

```bash
cd app && npx tsc --noEmit
```
Expected: No errors.

**Step 3: Manual test**

```bash
cd app && npx expo start
```
- Open on device/simulator
- Dashboard should show stats/charts, then filter chips, then transactions
- Scroll down past the last transaction — more should load automatically
- Tap a filter chip — list should reset and show only that type
- "沒有更多交易了" appears when all transactions are loaded
- Tapping a transaction still navigates to edit page

**Step 4: Commit**

```bash
git add app/app/\(tabs\)/index.tsx
git commit -m "feat(app): convert Dashboard to FlatList with infinite scroll and type filter"
```

---

### Task 4: Final verification and cleanup

**Step 1: Type check both packages**

```bash
cd packages/shared && npx tsc --noEmit
cd ../../app && npx tsc --noEmit
```

**Step 2: Check for unused imports**

Verify `app/app/(tabs)/index.tsx` no longer imports `ScrollView` or `useTransactions`.
Verify `RecentTransactions.tsx` no longer has the old `RecentTransactions` component (it's been replaced by `TransactionFilterChips` + `TransactionRow`).

**Step 3: Commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: cleanup unused imports"
```
