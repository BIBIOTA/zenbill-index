# Shared Expense Personal Accounting Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users optionally record shared expenses to their personal accounts with merchant auto-fill for category and account.

**Architecture:** Extend existing `CreateSharedExpense` flow to pass `merchant_id` and `personal_category_id` through to the personal `Transaction`. Frontend adds a "record to personal" toggle with merchant/category/account selectors. No schema changes needed — `Transaction` already has `category_id` and `merchant_id` columns.

**Tech Stack:** Go (Gin, GORM), React (Web), React Native (Expo), TanStack Query, shared monorepo types.

**Design doc:** `docs/plans/2026-03-03-shared-expense-personal-accounting-design.md`

---

## Task 1: Backend — Add merchant_id and personal_category_id to shared expense creation

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go:14-25` (CreateSharedExpenseInput struct)
- Modify: `backend/internal/usecase/shared_expense_service.go:120-138` (Transaction creation in Create method)
- Modify: `backend/internal/delivery/http/shared_expense_handler.go:68-79` (createSharedExpenseRequest struct)
- Modify: `backend/internal/delivery/http/shared_expense_handler.go:161-180` (input building + UUID parsing)
- Test: `backend/internal/usecase/shared_expense_service_test.go`

### Step 1: Write the failing test

Add to `backend/internal/usecase/shared_expense_service_test.go`:

```go
func TestSharedExpenseService_Create_WithMerchantAndCategory(t *testing.T) {
	expenseRepo := new(MockSharedExpenseRepository)
	ledgerRepo := new(MockSharedLedgerRepository)
	txRepo := new(MockTransactionRepository)
	acctRepo := new(MockAccountRepository)
	svc := newTestSharedExpenseService(expenseRepo, ledgerRepo, txRepo, acctRepo)

	ownerID := uuid.New()
	paymentAcctID := uuid.New()
	merchantID := uuid.New()
	categoryID := uuid.New()
	ledgerID := uuid.New()

	ledger := &domain.SharedLedger{
		ID:      ledgerID,
		OwnerID: ownerID,
	}

	ledgerRepo.On("FindByID", mock.Anything, ledgerID).Return(ledger, nil)

	// Expect EXPENSE transaction with merchant and category set
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Type == domain.TransactionTypeExpense &&
			tx.Amount == 500.0 &&
			tx.AccountID == paymentAcctID &&
			tx.MerchantID != nil && *tx.MerchantID == merchantID &&
			tx.CategoryID != nil && *tx.CategoryID == categoryID
	})).Return(nil).Once()

	acctRepo.On("UpdateBalance", mock.Anything, paymentAcctID, -500.0).Return(nil)

	expenseRepo.On("Create", mock.Anything, mock.MatchedBy(func(e *domain.SharedExpense) bool {
		return e.LedgerID == ledgerID &&
			e.TotalAmount == 500.0 &&
			e.ExpenseTransactionID != nil
	})).Return(nil)

	input := CreateSharedExpenseInput{
		Date:               time.Now(),
		Category:           "food",
		Description:        "Lunch",
		PayerName:          "Owner",
		TotalAmount:        500.0,
		SplitMethod:        domain.SplitMethodEqual,
		PaymentAccountID:   &paymentAcctID,
		MerchantID:         &merchantID,
		PersonalCategoryID: &categoryID,
	}

	expense, err := svc.Create(context.Background(), ledgerID, ownerID, input)

	assert.NoError(t, err)
	assert.NotNil(t, expense)
	txRepo.AssertExpectations(t)
}
```

### Step 2: Run test to verify it fails

Run: `cd backend && go test ./internal/usecase/ -run TestSharedExpenseService_Create_WithMerchantAndCategory -v`
Expected: FAIL — `CreateSharedExpenseInput` has no `MerchantID` or `PersonalCategoryID` fields.

### Step 3: Add fields to CreateSharedExpenseInput

In `backend/internal/usecase/shared_expense_service.go`, add two fields after `PaymentAccountID` (line 24):

```go
type CreateSharedExpenseInput struct {
	Date             time.Time
	Category         string
	Description      string
	PayerName        string
	PaidByOwner      *bool
	TotalAmount      float64
	SplitMethod      domain.SplitMethod
	OwnerAmount      float64
	PartnerAmount    float64
	PaymentAccountID *uuid.UUID
	MerchantID         *uuid.UUID // personal transaction merchant
	PersonalCategoryID *uuid.UUID // personal transaction category
}
```

### Step 4: Pass fields to Transaction in Create method

In `backend/internal/usecase/shared_expense_service.go`, update the transaction creation block (around line 123-131). Change:

```go
expenseTx := &domain.Transaction{
	ID:         uuid.New(),
	UserID:     userID,
	AccountID:  *input.PaymentAccountID,
	Type:       domain.TransactionTypeExpense,
	Amount:     input.TotalAmount,
	OccurredAt: input.Date,
	Note:       fmt.Sprintf("共同記帳: %s", input.Description),
}
```

To:

```go
expenseTx := &domain.Transaction{
	ID:         uuid.New(),
	UserID:     userID,
	AccountID:  *input.PaymentAccountID,
	Type:       domain.TransactionTypeExpense,
	Amount:     input.TotalAmount,
	OccurredAt: input.Date,
	Note:       fmt.Sprintf("共同記帳: %s", input.Description),
	CategoryID: input.PersonalCategoryID,
	MerchantID: input.MerchantID,
}
```

### Step 5: Run test to verify it passes

Run: `cd backend && go test ./internal/usecase/ -run TestSharedExpenseService_Create_WithMerchantAndCategory -v`
Expected: PASS

### Step 6: Update handler to parse new fields

In `backend/internal/delivery/http/shared_expense_handler.go`:

Add fields to `createSharedExpenseRequest` (after line 78):

```go
type createSharedExpenseRequest struct {
	Date               string  `json:"date" binding:"required"`
	Category           string  `json:"category" binding:"required"`
	Description        string  `json:"description" binding:"required"`
	PayerName          string  `json:"payer_name" binding:"required"`
	PaidByOwner        *bool   `json:"paid_by_owner"`
	TotalAmount        float64 `json:"total_amount" binding:"required"`
	SplitMethod        string  `json:"split_method" binding:"required"`
	OwnerAmount        float64 `json:"owner_amount"`
	PartnerAmount      float64 `json:"partner_amount"`
	PaymentAccountID   *string `json:"payment_account_id"`
	MerchantID         *string `json:"merchant_id"`
	PersonalCategoryID *string `json:"personal_category_id"`
}
```

Add UUID parsing after the PaymentAccountID block (after line 180), before the `Create` call:

```go
if req.MerchantID != nil {
	id, err := uuid.Parse(*req.MerchantID)
	if err != nil {
		BadRequest(c, "invalid merchant_id")
		return
	}
	input.MerchantID = &id
}

if req.PersonalCategoryID != nil {
	id, err := uuid.Parse(*req.PersonalCategoryID)
	if err != nil {
		BadRequest(c, "invalid personal_category_id")
		return
	}
	input.PersonalCategoryID = &id
}
```

### Step 7: Run all existing tests to verify nothing is broken

Run: `cd backend && go test ./internal/usecase/ -v`
Expected: ALL PASS (existing tests don't set the new fields, which default to nil — matching current behavior).

### Step 8: Commit

```bash
cd backend && git add internal/usecase/shared_expense_service.go internal/usecase/shared_expense_service_test.go internal/delivery/http/shared_expense_handler.go
git commit -m "feat(backend): support merchant and category on shared expense personal transaction"
```

---

## Task 2: Shared types — Add merchant_id and personal_category_id to CreateSharedExpenseInput

**Files:**
- Modify: `packages/shared/src/types/index.ts:292-303`

### Step 1: Add fields to TypeScript interface

In `packages/shared/src/types/index.ts`, update `CreateSharedExpenseInput`:

```typescript
export interface CreateSharedExpenseInput {
  date: string
  category: string
  description: string
  payer_name: string
  paid_by_owner: boolean
  total_amount: number
  split_method: SplitMethod
  owner_amount?: number
  partner_amount?: number
  payment_account_id?: string
  merchant_id?: string
  personal_category_id?: string
}
```

### Step 2: Verify TypeScript compiles

Run: `cd packages/shared && npx tsc --noEmit`
Expected: PASS (new optional fields, no breaking changes).

### Step 3: Commit

```bash
git add packages/shared/src/types/index.ts
git commit -m "feat(shared): add merchant_id and personal_category_id to CreateSharedExpenseInput"
```

---

## Task 3: Web — Add "計入個人記帳" toggle with merchant auto-fill

**Files:**
- Modify: `frontend/src/pages/SharedExpenseFormPage.tsx`

**Dependencies:** Task 2 (shared types)

### Step 1: Add imports for merchants, categories, and quick-create components

At the top of `SharedExpenseFormPage.tsx`, update imports:

```typescript
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useSharedLedger, useCreateSharedExpense, useAccounts, useMerchants, useCategories } from '@zenbill/shared'
import { useAuthStore } from '@/stores/auth'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { buildCategoryOptions } from '@/components/transactions/categoryOptions'
import { buildAccountOptions } from '@/components/transactions/accountOptions'
import MerchantQuickCreate from '@/components/transactions/MerchantQuickCreate'
import type { SplitMethod, ExpenseCategory } from '@zenbill/shared'
```

### Step 2: Add state variables and data hooks

After the existing state variables (line 62), add:

```typescript
const [recordPersonal, setRecordPersonal] = useState(false)
const [merchantId, setMerchantId] = useState<string | undefined>()
const [personalCategoryId, setPersonalCategoryId] = useState<string | undefined>()
const [showMerchantCreate, setShowMerchantCreate] = useState(false)
const [merchantSearchTerm, setMerchantSearchTerm] = useState('')
```

Add data hooks near the existing `useAccounts()` call:

```typescript
const { data: merchants } = useMerchants()
const { data: categories } = useCategories()
```

### Step 3: Add merchant auto-fill handler and reset logic

After state variables:

```typescript
// Reset personal accounting fields when payer switches to partner
useEffect(() => {
  if (!payerIsCurrentUser) {
    setRecordPersonal(false)
    setMerchantId(undefined)
    setPersonalCategoryId(undefined)
    setPaymentAccountId(undefined)
  }
}, [payerIsCurrentUser])

const handleMerchantChange = (id: string | undefined, merchantData?: { default_category_id?: string | null; default_account_id?: string | null }) => {
  setMerchantId(id)
  if (id) {
    const merchant = merchantData ?? merchants?.find((m) => m.id === id)
    if (!personalCategoryId && merchant?.default_category_id) {
      setPersonalCategoryId(merchant.default_category_id)
    }
    if (!paymentAccountId && merchant?.default_account_id) {
      setPaymentAccountId(merchant.default_account_id)
    }
  }
}
```

Build options for selectors:

```typescript
const merchantOptions = (merchants ?? []).map((m) => ({ id: m.id, label: m.name }))
const personalCategoryOptions = buildCategoryOptions(categories ?? [], 'EXPENSE')
const personalAccountOptions = buildAccountOptions(accounts ?? [])
```

### Step 4: Replace existing PaymentAccount section with toggle + full personal block

Replace the current payment account section (lines 254-266):

```html
{/* Payment account */}
{payerIsCurrentUser && (
  <div>
    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">付款帳戶</label>
    <SearchableSelect ... />
  </div>
)}
```

With:

```tsx
{/* Record to personal accounting */}
{payerIsCurrentUser && (
  <div className="space-y-3">
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={recordPersonal}
        onChange={(e) => {
          setRecordPersonal(e.target.checked)
          if (!e.target.checked) {
            setMerchantId(undefined)
            setPersonalCategoryId(undefined)
            setPaymentAccountId(undefined)
          }
        }}
        className="w-4 h-4 rounded border-[var(--border-subtle)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
      />
      <span className="text-xs font-medium text-[var(--text-secondary)]">計入個人記帳</span>
    </label>

    {recordPersonal && (
      <div className="space-y-3 pl-6 border-l-2 border-[var(--border-subtle)]">
        {/* Merchant */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">商家</label>
          <SearchableSelect
            value={merchantId}
            options={merchantOptions}
            placeholder="選擇商家（選填）"
            onChange={handleMerchantChange}
            onCreateNew={(term) => { setMerchantSearchTerm(term); setShowMerchantCreate(true) }}
            createNewLabel="新增商家"
            allowClear
          />
        </div>
        {/* Personal Category */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">個人分類</label>
          <SearchableSelect
            value={personalCategoryId}
            options={personalCategoryOptions}
            placeholder="選擇分類（選填）"
            onChange={(id) => setPersonalCategoryId(id)}
            allowClear
          />
        </div>
        {/* Payment Account */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">付款帳戶</label>
          <SearchableSelect
            value={paymentAccountId}
            options={personalAccountOptions}
            placeholder="選擇付款帳戶"
            onChange={(id) => setPaymentAccountId(id)}
            allowClear
          />
        </div>
      </div>
    )}
  </div>
)}
```

### Step 5: Add MerchantQuickCreate modal

Before the closing `</form>` tag, add:

```tsx
<MerchantQuickCreate
  open={showMerchantCreate}
  initialName={merchantSearchTerm}
  transactionType="EXPENSE"
  onCreated={(merchant) => handleMerchantChange(merchant.id, merchant)}
  onClose={() => setShowMerchantCreate(false)}
/>
```

### Step 6: Update submit handler to include new fields

In `handleSubmit`, update the section that sets `payment_account_id` (lines 115-117):

Replace:
```typescript
if (payerIsCurrentUser && paymentAccountId) {
  input.payment_account_id = paymentAccountId
}
```

With:
```typescript
if (payerIsCurrentUser && recordPersonal) {
  if (paymentAccountId) input.payment_account_id = paymentAccountId
  if (merchantId) input.merchant_id = merchantId
  if (personalCategoryId) input.personal_category_id = personalCategoryId
}
```

### Step 7: Verify web build

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

### Step 8: Manual test in browser

1. Navigate to a shared ledger → New Expense
2. Select payer = "我" → toggle "計入個人記帳" appears
3. Toggle ON → merchant/category/account selectors appear
4. Select a merchant with defaults → category and account auto-fill
5. Switch payer to partner → toggle disappears, fields reset
6. Submit with toggle ON → verify personal transaction created with merchant + category

### Step 9: Commit

```bash
git add frontend/src/pages/SharedExpenseFormPage.tsx
git commit -m "feat(web): add personal accounting toggle with merchant auto-fill to shared expenses"
```

---

## Task 4: App — Add "計入個人記帳" toggle with merchant auto-fill

**Files:**
- Modify: `app/app/shared-ledgers/[id]/expenses/new.tsx`

**Dependencies:** Task 2 (shared types)

### Step 1: Add imports

Update imports at top of file:

```typescript
import { useState, useEffect } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, Stack, router } from 'expo-router'
import { SearchableSelect } from '../../../../components/ui/SearchableSelect'
import type { SelectOption } from '../../../../components/ui/selectTypes'
import { useSharedLedger, useCreateSharedExpense, useAccounts, useMerchants, useCategories } from '@zenbill/shared'
import type { SplitMethod } from '@zenbill/shared'
import { Button } from '../../../../components/ui/Button'
import { Colors } from '../../../../constants/theme'
import { notifySuccess } from '../../../../lib/haptics'
import MerchantQuickCreate from '../../../../components/transactions/MerchantQuickCreate'
```

### Step 2: Add state variables and data hooks

After existing state (line 43), add:

```typescript
const [recordPersonal, setRecordPersonal] = useState(false)
const [merchantId, setMerchantId] = useState<string | undefined>()
const [personalCategoryId, setPersonalCategoryId] = useState<string | undefined>()
const [paymentAccountId, setPaymentAccountId] = useState<string | undefined>()
const [showMerchantCreate, setShowMerchantCreate] = useState(false)
const [merchantSearchTerm, setMerchantSearchTerm] = useState('')

const { data: merchants } = useMerchants()
const { data: categories } = useCategories()
```

Add computed values and handlers:

```typescript
const isOwner = ledger?.owner_id === /* need user ID */
// Note: check how app gets current user — may need useAuthStore or similar

const payerIsCurrentUser = paidByOwner // simplified: owner perspective

useEffect(() => {
  if (!payerIsCurrentUser) {
    setRecordPersonal(false)
    setMerchantId(undefined)
    setPersonalCategoryId(undefined)
    setPaymentAccountId(undefined)
  }
}, [payerIsCurrentUser])

const handleMerchantChange = (id: string | undefined) => {
  setMerchantId(id)
  if (id) {
    const merchant = merchants?.find((m) => m.id === id)
    if (!personalCategoryId && merchant?.default_category_id) {
      setPersonalCategoryId(merchant.default_category_id)
    }
    if (!paymentAccountId && merchant?.default_account_id) {
      setPaymentAccountId(merchant.default_account_id)
    }
  }
}

const merchantOptions: SelectOption[] = (merchants ?? []).map((m) => ({ id: m.id, label: m.name }))
const personalCategoryOptions: SelectOption[] = (categories ?? [])
  .filter((c) => c.type === 'EXPENSE' && !c.children?.length)
  .map((c) => ({ id: c.id, label: c.name }))
const accountOptions: SelectOption[] = (accounts ?? []).map((a) => ({ id: a.id, label: a.name }))
```

**Important:** Check how the app determines the current user. Look at `/app/stores/` or authentication hooks. The `payerIsCurrentUser` logic may need to match the web version pattern (`(isOwner && paidByOwner) || (!isOwner && !paidByOwner)`). Adjust accordingly.

### Step 3: Add personal accounting toggle + fields to JSX

After the payer selector section (after line 131), before the split method section:

```tsx
{/* Record to personal accounting */}
{payerIsCurrentUser && (
  <View style={{ marginBottom: 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: recordPersonal ? 12 : 0 }}>
      <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151' }}>計入個人記帳</Text>
      <Switch
        value={recordPersonal}
        onValueChange={(val) => {
          setRecordPersonal(val)
          if (!val) {
            setMerchantId(undefined)
            setPersonalCategoryId(undefined)
            setPaymentAccountId(undefined)
          }
        }}
        trackColor={{ true: Colors.primary }}
      />
    </View>

    {recordPersonal && (
      <View style={{ paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: '#e5e7eb', gap: 12 }}>
        {/* Merchant */}
        <View>
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>商家</Text>
          <SearchableSelect
            value={merchantId}
            options={merchantOptions}
            placeholder="選擇商家（選填）"
            onChange={handleMerchantChange}
            onCreateNew={(term) => { setMerchantSearchTerm(term); setShowMerchantCreate(true) }}
            createNewLabel="新增商家"
            allowClear
          />
        </View>
        {/* Personal Category */}
        <View>
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>個人分類</Text>
          <SearchableSelect
            value={personalCategoryId}
            options={personalCategoryOptions}
            placeholder="選擇分類（選填）"
            onChange={(id) => setPersonalCategoryId(id)}
            allowClear
          />
        </View>
        {/* Payment Account */}
        <View>
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>付款帳戶</Text>
          <SearchableSelect
            value={paymentAccountId}
            options={accountOptions}
            placeholder="選擇帳戶"
            onChange={(id) => setPaymentAccountId(id)}
            allowClear
          />
        </View>
      </View>
    )}
  </View>
)}
```

### Step 4: Add MerchantQuickCreate modal

Before the closing `</ScrollView>`, add:

```tsx
<MerchantQuickCreate
  visible={showMerchantCreate}
  initialName={merchantSearchTerm}
  onCreated={(merchant) => {
    setMerchantId(merchant.id)
    if (!personalCategoryId && merchant.default_category_id) {
      setPersonalCategoryId(merchant.default_category_id)
    }
    if (!paymentAccountId && merchant.default_account_id) {
      setPaymentAccountId(merchant.default_account_id)
    }
  }}
  onClose={() => setShowMerchantCreate(false)}
/>
```

**Note:** Check the exact props of the app's MerchantQuickCreate component — it may use `visible` instead of `open`, and the `onCreated` callback signature may differ from web. Check `app/components/transactions/MerchantQuickCreate.tsx` for the exact interface.

### Step 5: Update submit handler

Update `handleSubmit` to include personal fields:

```typescript
const handleSubmit = () => {
  if (!description.trim() || !amount) {
    Alert.alert('Error', '請填寫描述和金額')
    return
  }

  createMut.mutate({
    description: description.trim(),
    total_amount: parseFloat(amount),
    category,
    split_method: splitMethod,
    payer_name: paidByOwner ? 'owner' : 'partner',
    paid_by_owner: paidByOwner,
    date: `${date}T00:00:00Z`,
    ...(splitMethod === 'CUSTOM' ? {
      owner_amount: parseFloat(ownerAmount) || 0,
      partner_amount: parseFloat(partnerAmount) || 0,
    } : {}),
    ...(payerIsCurrentUser && recordPersonal ? {
      ...(paymentAccountId ? { payment_account_id: paymentAccountId } : {}),
      ...(merchantId ? { merchant_id: merchantId } : {}),
      ...(personalCategoryId ? { personal_category_id: personalCategoryId } : {}),
    } : {}),
  }, {
    onSuccess: () => { notifySuccess(); router.back() },
    onError: (e) => Alert.alert('Error', e.message),
  })
}
```

### Step 6: Verify app builds

Run: `cd app && npx expo export --platform ios --output-dir /tmp/app-check 2>&1 | head -20` or `npx tsc --noEmit`
Expected: PASS (or adjust based on project's build check command).

### Step 7: Manual test on device/simulator

Same test steps as web Task 3 Step 8.

### Step 8: Commit

```bash
git add app/app/shared-ledgers/\[id\]/expenses/new.tsx
git commit -m "feat(app): add personal accounting toggle with merchant auto-fill to shared expenses"
```

---

## Task 5: Verify end-to-end and final commit

### Step 1: Run all backend tests

Run: `cd backend && go test ./... -v`
Expected: ALL PASS

### Step 2: Verify web TypeScript

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

### Step 3: Verify app TypeScript

Run: `cd app && npx tsc --noEmit`
Expected: PASS

### Step 4: Manual E2E verification

1. **Web:** Create shared expense with personal toggle ON → verify transaction in personal ledger has correct merchant + category + account
2. **App:** Same flow
3. **Web:** Create shared expense with toggle OFF → verify no personal transaction created
4. **Web:** Switch payer to partner → verify toggle hidden and no personal fields sent

### Step 5: Final commit (if any cleanup needed)

```bash
git add -A
git commit -m "chore: cleanup after shared expense personal accounting integration"
```
