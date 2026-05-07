# Credit Card Transfer Default Account — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When switching to TRANSFER type in the transaction form (from a credit card account), auto-populate source as the linked bank account and target as the credit card.

**Architecture:** The web TransactionForm already has swap logic in the type selector click handler. The mobile TransactionForm lacks this. Both account detail pages need a dedicated "繳卡費" shortcut that navigates with pre-populated transfer defaults.

**Tech Stack:** React Native (Expo Router), React (React Router), TypeScript

---

### Task 1: Add swap logic to Mobile TransactionForm type selector

**Files:**
- Modify: `app/components/transactions/TransactionForm.tsx:169-188`

The web TransactionForm already swaps source/target when switching to TRANSFER type if the current account is a CREDIT card with `auto_pay_from_id`. The mobile form just does `setType(t.value)`. Add the same swap logic.

**Step 1: Add `accounts` data awareness**

The mobile TransactionForm already has `const { data: accounts } = useAccounts()` at line 73. Good — no change needed.

**Step 2: Update the type selector onPress handler**

Replace the simple `onPress={() => setType(t.value)}` with logic that handles TRANSFER swap:

```tsx
onPress={() => {
  setType(t.value)
  if (t.value === 'TRANSFER' && accountId && !targetAccountId) {
    const currentAccount = accounts?.find((a) => a.id === accountId)
    if (currentAccount?.type === 'CREDIT' && currentAccount.auto_pay_from_id) {
      setTargetAccountId(accountId)
      setAccountId(currentAccount.auto_pay_from_id)
    }
  }
}}
```

**Step 3: Verify the build**

Run: `cd app && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add app/components/transactions/TransactionForm.tsx
git commit -m "feat(app): auto-swap source/target when switching to TRANSFER on credit card"
```

---

### Task 2: Add "繳卡費" shortcut on Mobile account detail page

**Files:**
- Modify: `app/app/accounts/[id].tsx:386-393`

Add a second FAB or modify the existing FAB to offer a "繳卡費" (pay bill) shortcut for credit card accounts. The simplest approach: add a "繳卡費" button in the billing cycle card that navigates with pre-populated transfer params.

**Step 1: Add the "繳卡費" button inside the billing cycle card**

After the cycle expense display (around line 340), add a button:

```tsx
{isCredit && (
  <TouchableOpacity
    style={s.payBillBtn}
    onPress={() => {
      const params: Record<string, string> = { account_id: id! }
      if (account.auto_pay_from_id) {
        params.defaultValues = JSON.stringify({
          type: 'TRANSFER',
          account_id: account.auto_pay_from_id,
        })
        params.account_id = account.auto_pay_from_id
        params.target_account_id = id!
      } else {
        params.defaultValues = JSON.stringify({ type: 'TRANSFER' })
      }
      router.push({ pathname: '/transactions/new', params })
    }}
  >
    <Text style={s.payBillBtnText}>繳卡費</Text>
  </TouchableOpacity>
)}
```

**Step 2: Add styles**

```tsx
payBillBtn: {
  marginTop: 8,
  backgroundColor: Colors.primary,
  borderRadius: 8,
  paddingVertical: 8,
  alignItems: 'center',
},
payBillBtnText: {
  color: '#ffffff',
  fontSize: 13,
  fontWeight: '600',
},
```

**Step 3: Update mobile `new.tsx` to accept `target_account_id` param**

In `app/app/transactions/new.tsx`, add `target_account_id` to the search params and pass it to the form:

```tsx
const params = useLocalSearchParams<{
  account_id?: string
  target_account_id?: string  // NEW
  invoiceId?: string
  defaultValues?: string
  sellerName?: string
}>()
```

**Step 4: Update mobile TransactionForm Props and initial state**

Add `defaultTargetAccountId` prop and use it in initial state:

```tsx
interface Props {
  transaction?: Transaction
  defaultAccountId?: string
  defaultTargetAccountId?: string  // NEW
  invoiceId?: string
  defaultValues?: InvoiceDefaults
  sellerName?: string
}
```

Initialize `targetAccountId` with:
```tsx
const [targetAccountId, setTargetAccountId] = useState(
  transaction?.target_account_id ?? defaultTargetAccountId ?? ''
)
```

Also update `InvoiceDefaults` to include `type`:
```tsx
export interface InvoiceDefaults {
  type?: TransactionType
  // ... existing fields
}
```

And initialize `type` from defaults:
```tsx
const [type, setType] = useState<TransactionType>(
  transaction?.type ?? defaultValues?.type ?? 'EXPENSE'
)
```

This is already the case (line 49-51). Good.

**Step 5: Wire up in new.tsx**

```tsx
<TransactionForm
  defaultAccountId={params.account_id}
  defaultTargetAccountId={params.target_account_id}  // NEW
  invoiceId={params.invoiceId}
  defaultValues={parsedDefaults}
  sellerName={params.sellerName}
/>
```

**Step 6: Verify the build**

Run: `cd app && npx tsc --noEmit`

**Step 7: Commit**

```bash
git add app/app/accounts/[id].tsx app/app/transactions/new.tsx app/components/transactions/TransactionForm.tsx
git commit -m "feat(app): add pay-bill shortcut on credit card detail page"
```

---

### Task 3: Add "繳卡費" shortcut on Web account detail page

**Files:**
- Modify: `frontend/src/pages/AccountDetailPage.tsx:134-136, 288-295`

**Step 1: Add `openPayBill` function**

After `openCreateTx` (line 134), add:

```tsx
const openPayBill = () => {
  const defaultValues: Record<string, string> = {
    type: 'TRANSFER',
    account_id: account.auto_pay_from_id ?? id!,
    ...(account.auto_pay_from_id ? { target_account_id: id } : {}),
  }
  navigate('/transactions/new', { state: { defaultValues } })
}
```

**Step 2: Add the "繳卡費" button next to "新增交易"**

In the transaction header section (around line 290-295), add a button before the existing one:

```tsx
<div className="flex items-center gap-2">
  {account.type === 'CREDIT' && (
    <button
      onClick={openPayBill}
      className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] text-[11px] font-medium hover:bg-[var(--color-accent)] hover:text-white transition-colors"
    >
      繳卡費
    </button>
  )}
  <button
    onClick={openCreateTx}
    className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-[var(--color-accent)] text-white text-[11px] font-medium hover:opacity-90"
  >
    <Plus className="w-3 h-3" /> 新增交易
  </button>
</div>
```

**Step 3: Update web TransactionForm to handle `target_account_id` in defaultValues**

The web form initializes from `defaultValues` at line 68-69. The `defaultValues` type is `Partial<FormData>`. Since `FormData` extends `CreateTransactionInput` which already has `target_account_id`, this should work automatically — just ensure the `openPayBill` passes it correctly.

Verify that `target_account_id` from `defaultValues` is spread into the initial form state via `{ ...makeEmptyForm(), ...defaultValues }`.

**Step 4: Verify the build**

Run: `cd frontend && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add frontend/src/pages/AccountDetailPage.tsx
git commit -m "feat(web): add pay-bill shortcut on credit card detail page"
```

---

### Task 4: Manual testing

**Test cases:**

1. **Mobile — Credit card with auto_pay_from_id:**
   - Go to credit card detail → tap "繳卡費"
   - Form should open with type=TRANSFER, source=bank account, target=credit card

2. **Mobile — Credit card without auto_pay_from_id:**
   - Go to credit card detail → tap "繳卡費"
   - Form should open with type=TRANSFER, source=credit card, target=empty

3. **Mobile — Type switch in form:**
   - Go to credit card detail → tap FAB (new transaction)
   - Switch type to TRANSFER
   - Source should swap to bank account, target should be credit card

4. **Web — Same 3 scenarios**

5. **Regression — Non-credit accounts:**
   - Go to bank account detail → no "繳卡費" button visible
   - FAB/button creates normal transaction

**Step 1: Commit final**

```bash
git commit --allow-empty -m "test: verify credit card transfer defaults work on both platforms"
```
