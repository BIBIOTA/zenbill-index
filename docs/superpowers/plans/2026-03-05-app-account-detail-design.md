# App Account Detail Page Enhancement - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the app's account detail page to feature parity with the web version — account info display/edit, credit card billing cycle navigation, and per-period transaction filtering.

**Architecture:** Single file modification to `app/app/accounts/[id].tsx`. All hooks and utilities already exist in `@zenbill/shared`. UI components (Card, Input, SearchableSelect) already exist in `app/components/ui/`.

**Tech Stack:** React Native (Expo Router), TypeScript, @zenbill/shared hooks, @gorhom/bottom-sheet (via SearchableSelect)

---

## Context

**Current state:** `app/app/accounts/[id].tsx` (67 lines) shows only balance + flat list of 50 transactions.

**Target state:** Match web's `frontend/src/pages/AccountDetailPage.tsx` with:
1. Account info card (read + inline edit)
2. Credit card billing cycle navigator
3. Transaction filtering by billing period

**Key shared dependencies (all already exported from `@zenbill/shared`):**
- `useAccount(id)` — single account query
- `useUpdateAccount()` — mutation for editing
- `useAccounts()` — all accounts (for auto-pay select)
- `useBanks()` — bank list
- `useTransactions(filters)` — supports `start_date`, `end_date`, `page`, `page_size`
- `getBillingCycle(closingDay, offset)` — returns `{ startDate, endDate, label }`
- Types: `Account`, `CreateAccountInput`, `AccountType`

**Key app UI components:**
- `Card` — simple white rounded container
- `Input` — labeled text input with error state
- `SearchableSelect` — bottom-sheet searchable dropdown

---

### Task 1: Add imports, state, and data hooks

**Files:**
- Modify: `app/app/accounts/[id].tsx`

**Step 1: Replace the entire import block and hook setup**

Replace the current imports (lines 1-6) and the component's data-fetching section (lines 8-13) with expanded imports and state:

```tsx
import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, Switch } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import {
  useAccount, useUpdateAccount, useAccounts, useBanks, useTransactions,
  getBillingCycle,
} from '@zenbill/shared'
import type { CreateAccountInput, AccountType } from '@zenbill/shared'
import { Card } from '../../components/ui/Card'
import { LoadingScreen } from '../../components/ui/LoadingScreen'
import { FAB } from '../../components/ui/FAB'
import { SearchableSelect } from '../../components/ui/SearchableSelect'
import { Colors } from '../../constants/theme'

const TYPE_LABELS: Record<AccountType, string> = {
  CASH: '現金', BANK: '銀行帳戶', CREDIT: '信用卡', CRYPTO: '加密貨幣',
}

export default function AccountDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: account, isLoading } = useAccount(id!)
  const { data: banks } = useBanks()
  const { data: allAccounts } = useAccounts()
  const updateAccount = useUpdateAccount()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<CreateAccountInput>>({})
  const [cycleOffset, setCycleOffset] = useState(0)

  const isCreditWithCycle = account?.type === 'CREDIT' && account.closing_day != null
  const cycle = isCreditWithCycle ? getBillingCycle(account.closing_day!, cycleOffset) : null

  const txn = useTransactions({
    account_id: id,
    ...(cycle
      ? { start_date: cycle.startDate, end_date: cycle.endDate, page: 1, page_size: 200 }
      : { page: 1, page_size: 50 }),
  })
```

**Step 2: Add helper functions after the hooks**

Add these right after the `useTransactions` call, before the `if (isLoading)` check:

```tsx
  const transactions = txn.data?.data ?? []
  const hasMore = txn.data?.pagination
    ? txn.data.pagination.page < txn.data.pagination.total_pages
    : false

  const cycleExpenseTotal = cycle
    ? transactions.reduce((sum, tx) => {
        if (tx.type === 'EXPENSE') return sum + Math.abs(tx.amount)
        if (tx.type === 'INCOME') return sum - Math.abs(tx.amount)
        return sum
      }, 0)
    : 0

  const populateForm = () => {
    if (!account) return
    setForm({
      name: account.name,
      currency: account.currency,
      passbook_number: account.passbook_number,
      bank_id: account.bank_id ?? undefined,
      closing_day: account.closing_day ?? undefined,
      payment_due_day: account.payment_due_day ?? undefined,
      auto_pay_enabled: account.auto_pay_enabled,
      auto_pay_from_id: account.auto_pay_from_id ?? undefined,
    })
  }

  const startEdit = () => { populateForm(); setEditing(true) }
  const cancelEdit = () => { setEditing(false); setForm({}) }
  const saveEdit = () => {
    updateAccount.mutate(
      { id: account!.id, ...form },
      { onSuccess: () => setEditing(false) },
    )
  }
```

**Step 3: Verify it compiles**

Run from the `app/` directory:
```bash
cd app && npx tsc --noEmit --pretty 2>&1 | head -30
```

**Step 4: Commit**
```bash
git add app/app/accounts/\[id\].tsx
git commit -m "feat(app): add imports and state for account detail enhancement"
```

---

### Task 2: Header card with edit button

**Files:**
- Modify: `app/app/accounts/[id].tsx`

**Step 1: Replace the header Card**

Replace the existing header card (the `<Card style={{ marginBottom: 16 }}>` block showing just balance) with:

```tsx
        <Card style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              {editing ? (
                <TextInput
                  value={form.name ?? ''}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                  style={{
                    fontSize: 18, fontWeight: 'bold', flex: 1,
                    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
                    paddingHorizontal: 10, paddingVertical: 4,
                  }}
                />
              ) : (
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{account.name}</Text>
              )}
            </View>
            {editing ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={saveEdit}
                  disabled={updateAccount.isPending}
                  style={{
                    backgroundColor: Colors.primary, borderRadius: 8,
                    paddingHorizontal: 12, paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                    {updateAccount.isPending ? '儲存中...' : '儲存'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={cancelEdit}
                  style={{
                    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
                    borderWidth: 1, borderColor: Colors.border,
                  }}
                >
                  <Text style={{ fontSize: 13, color: Colors.textSecondary }}>取消</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={startEdit}
                style={{
                  borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
                  borderWidth: 1, borderColor: Colors.border,
                }}
              >
                <Text style={{ fontSize: 13, color: Colors.textSecondary }}>編輯</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={{ fontSize: 14, color: '#6b7280' }}>{TYPE_LABELS[account.type] ?? account.type}</Text>
          <Text style={{ fontSize: 28, fontWeight: 'bold', marginTop: 4 }}>
            {account.currency === 'TWD' ? '$' : `${account.currency} `}
            {account.balance.toLocaleString()}
          </Text>
        </Card>
```

**Step 2: Verify it compiles**
```bash
cd app && npx tsc --noEmit --pretty 2>&1 | head -30
```

**Step 3: Commit**
```bash
git add app/app/accounts/\[id\].tsx
git commit -m "feat(app): add header card with edit button to account detail"
```

---

### Task 3: Account info card (read + edit mode)

**Files:**
- Modify: `app/app/accounts/[id].tsx`

**Step 1: Add account info card between header card and transaction section**

Insert this block right after the header `</Card>` and before the `<Text style={{ fontSize: 16, fontWeight: '600' ...}}>交易紀錄</Text>` line:

```tsx
        {/* Account Info */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            帳戶資訊
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {/* Type (read-only) */}
            <View style={{ width: '45%' }}>
              <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2 }}>類型</Text>
              <Text style={{ fontSize: 14 }}>{TYPE_LABELS[account.type] ?? account.type}</Text>
            </View>
            {/* Currency */}
            <View style={{ width: '45%' }}>
              <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2 }}>幣別</Text>
              <Text style={{ fontSize: 14 }}>{editing ? (form.currency ?? 'TWD') : account.currency}</Text>
            </View>
            {/* Bank (BANK + CREDIT only) */}
            {(account.type === 'BANK' || account.type === 'CREDIT') && (
              <>
                <View style={{ width: '45%' }}>
                  <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2 }}>銀行</Text>
                  {editing ? (
                    <SearchableSelect
                      value={form.bank_id}
                      options={(banks ?? []).map((b) => ({ id: b.id, label: `${b.code} ${b.name}` }))}
                      placeholder="選擇銀行"
                      onChange={(v) => setForm({ ...form, bank_id: v })}
                      allowClear
                    />
                  ) : (
                    <Text style={{ fontSize: 14 }}>
                      {banks?.find((b) => b.id === account.bank_id)?.name ?? '-'}
                    </Text>
                  )}
                </View>
                <View style={{ width: '45%' }}>
                  <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2 }}>帳號</Text>
                  {editing ? (
                    <TextInput
                      value={form.passbook_number ?? ''}
                      onChangeText={(v) => setForm({ ...form, passbook_number: v })}
                      placeholder="帳號"
                      style={{
                        borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
                        paddingHorizontal: 10, paddingVertical: 6, fontSize: 14,
                      }}
                    />
                  ) : (
                    <Text style={{ fontSize: 14 }}>{account.passbook_number || '-'}</Text>
                  )}
                </View>
              </>
            )}
            {/* Credit card specific fields */}
            {account.type === 'CREDIT' && (
              <>
                <View style={{ width: '45%' }}>
                  <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2 }}>結帳日</Text>
                  {editing ? (
                    <TextInput
                      value={form.closing_day != null ? String(form.closing_day) : ''}
                      onChangeText={(v) => setForm({ ...form, closing_day: v ? Number(v) : undefined })}
                      keyboardType="number-pad"
                      placeholder="1-28"
                      style={{
                        borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
                        paddingHorizontal: 10, paddingVertical: 6, fontSize: 14,
                      }}
                    />
                  ) : (
                    <Text style={{ fontSize: 14 }}>
                      {account.closing_day ? `每月 ${account.closing_day} 日` : '-'}
                    </Text>
                  )}
                </View>
                <View style={{ width: '45%' }}>
                  <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2 }}>繳款日</Text>
                  {editing ? (
                    <TextInput
                      value={form.payment_due_day != null ? String(form.payment_due_day) : ''}
                      onChangeText={(v) => setForm({ ...form, payment_due_day: v ? Number(v) : undefined })}
                      keyboardType="number-pad"
                      placeholder="1-28"
                      style={{
                        borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
                        paddingHorizontal: 10, paddingVertical: 6, fontSize: 14,
                      }}
                    />
                  ) : (
                    <Text style={{ fontSize: 14 }}>
                      {account.payment_due_day ? `每月 ${account.payment_due_day} 日` : '-'}
                    </Text>
                  )}
                </View>
                <View style={{ width: '45%' }}>
                  <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2 }}>繳款帳戶</Text>
                  {editing ? (
                    <SearchableSelect
                      value={form.auto_pay_from_id}
                      options={(allAccounts ?? []).filter((a) => a.type === 'BANK').map((a) => ({ id: a.id, label: a.name }))}
                      placeholder="未設定"
                      onChange={(v) => setForm({ ...form, auto_pay_from_id: v })}
                      allowClear
                    />
                  ) : (
                    <Text style={{ fontSize: 14 }}>
                      {allAccounts?.find((a) => a.id === account.auto_pay_from_id)?.name ?? '-'}
                    </Text>
                  )}
                </View>
                <View style={{ width: '45%' }}>
                  <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2 }}>自動扣款</Text>
                  {editing ? (
                    <Switch
                      value={form.auto_pay_enabled ?? false}
                      onValueChange={(v) => setForm({ ...form, auto_pay_enabled: v })}
                      trackColor={{ true: Colors.primary }}
                    />
                  ) : (
                    <Text style={{ fontSize: 14 }}>{account.auto_pay_enabled ? '開啟' : '關閉'}</Text>
                  )}
                </View>
              </>
            )}
            {/* Created date (read-only) */}
            <View style={{ width: '45%' }}>
              <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2 }}>建立日期</Text>
              <Text style={{ fontSize: 14 }}>{new Date(account.created_at).toLocaleDateString('zh-TW')}</Text>
            </View>
          </View>
        </Card>
```

**Step 2: Verify it compiles**
```bash
cd app && npx tsc --noEmit --pretty 2>&1 | head -30
```

**Step 3: Commit**
```bash
git add app/app/accounts/\[id\].tsx
git commit -m "feat(app): add account info card with edit mode"
```

---

### Task 4: Billing cycle navigator and transaction filtering

**Files:**
- Modify: `app/app/accounts/[id].tsx`

**Step 1: Add billing cycle navigator before transaction list**

Insert between the `交易紀錄` title and the transaction map. Replace the transaction section (from `<Text style={{ fontSize: 16, fontWeight: '600' ...}}>交易紀錄</Text>` through the end of the map + FAB) with:

```tsx
        <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 12 }}>交易紀錄</Text>

        {/* Billing cycle navigator (credit cards with closing_day) */}
        {cycle && (
          <Card style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <TouchableOpacity
                onPress={() => setCycleOffset((o) => o - 1)}
                style={{ padding: 8 }}
              >
                <Text style={{ fontSize: 18, color: Colors.textSecondary }}>{'◀'}</Text>
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600' }}>{cycle.label}</Text>
                <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: 2 }}>
                  本期支出{' '}
                  <Text style={{ color: Colors.error, fontWeight: '600' }}>
                    ${cycleExpenseTotal.toLocaleString()}
                  </Text>
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCycleOffset((o) => o + 1)}
                style={{ padding: 8 }}
              >
                <Text style={{ fontSize: 18, color: Colors.textSecondary }}>{'▶'}</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {transactions.length === 0 ? (
          <Text style={{ fontSize: 14, color: Colors.textSecondary, textAlign: 'center', paddingVertical: 24 }}>
            尚無交易紀錄
          </Text>
        ) : (
          transactions.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
              }}
              onPress={() => router.push(`/transactions/${t.id}/edit`)}
            >
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                  {t.note || 'Untitled'}
                </Text>
                <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  {t.occurred_at.split('T')[0]}
                </Text>
              </View>
              <Text style={{
                fontSize: 14, fontWeight: '600',
                color: t.type === 'INCOME' ? '#16a34a' : '#0f172a',
              }}>
                {t.type === 'INCOME' ? '+' : t.type === 'TRANSFER' ? '' : '-'}
                ${Math.abs(t.amount).toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))
        )}

        {/* Load more (non-credit-card accounts only) */}
        {!cycle && hasMore && (
          <TouchableOpacity
            onPress={() => {/* TODO: increment page */}}
            style={{ paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, color: Colors.primary }}>載入更多</Text>
          </TouchableOpacity>
        )}
```

Note: The "load more" for non-cycle accounts needs a `txPage` state to work. We need to add `const [txPage, setTxPage] = useState(1)` to the state section (Task 1), and update the `useTransactions` call's `page_size` to `txPage * 50`. The load more button should call `setTxPage((p) => p + 1)`.

**Step 2: Add txPage state and wire up load-more**

In the state section (added in Task 1), add after `cycleOffset`:
```tsx
  const [txPage, setTxPage] = useState(1)
```

Update the `useTransactions` call's non-cycle branch:
```tsx
      : { page: 1, page_size: txPage * 50 }),
```

Update the load more button's `onPress`:
```tsx
            onPress={() => setTxPage((p) => p + 1)}
```

**Step 3: Verify it compiles**
```bash
cd app && npx tsc --noEmit --pretty 2>&1 | head -30
```

**Step 4: Commit**
```bash
git add app/app/accounts/\[id\].tsx
git commit -m "feat(app): add billing cycle navigator and transaction filtering"
```

---

### Task 5: Manual verification on device/simulator

**Step 1: Start the dev server**
```bash
cd app && npx expo start
```

**Step 2: Test on simulator or device**

Verify the following scenarios:
- [ ] Navigate to a **CASH** account — shows header + account info (type, currency, created date) + transactions
- [ ] Navigate to a **BANK** account — shows bank + account number fields in account info
- [ ] Navigate to a **CREDIT** account with `closing_day` set — shows billing cycle navigator + credit card fields
- [ ] Tap left/right arrows — billing cycle changes, transactions update
- [ ] Tap 編輯 — fields become editable
- [ ] Edit account name → 儲存 — name updates
- [ ] Edit → 取消 — reverts to original
- [ ] Non-credit account — "載入更多" button works

**Step 3: Final commit (if any fixes needed)**
```bash
git add -A
git commit -m "fix(app): account detail page adjustments after manual testing"
```
