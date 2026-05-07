# Multi-Currency Support & Currency Display Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Support all ISO 4217 currencies in personal accounts and shared ledgers, with correct currency symbol display everywhere.

**Architecture:** Create a shared currency data module (`app/constants/currencies.ts`) with the full ISO 4217 list and helper functions. Replace all hardcoded `$` symbols and the 4-item currency dropdown with this shared module. Fix the shared ledger creation form that's missing the required currency field.

**Tech Stack:** React Native / Expo, TypeScript, existing `SearchableSelect` component

---

### Task 1: Create currency data module

**Files:**
- Create: `app/constants/currencies.ts`

**Step 1: Create the currency constants file**

Create `app/constants/currencies.ts` with:

1. A `Currency` interface:
```ts
export interface Currency {
  code: string   // ISO 4217 (e.g. 'VND')
  name: string   // English name (e.g. 'Vietnamese Dong')
  symbol: string // Symbol (e.g. '₫')
  flag: string   // Country flag emoji (e.g. '🇻🇳')
}
```

2. A `CURRENCIES` array containing all ~160 ISO 4217 currencies. Include at minimum these commonly used ones near the top (sorted by usage priority):
   - TWD (NT$, 🇹🇼), USD ($, 🇺🇸), JPY (¥, 🇯🇵), EUR (€, 🇪🇺), VND (₫, 🇻🇳)
   - KRW (₩, 🇰🇷), THB (฿, 🇹🇭), CNY (¥, 🇨🇳), GBP (£, 🇬🇧), HKD (HK$, 🇭🇰)
   - SGD (S$, 🇸🇬), MYR (RM, 🇲🇾), PHP (₱, 🇵🇭), IDR (Rp, 🇮🇩), AUD (A$, 🇦🇺)
   - CAD (C$, 🇨🇦), CHF (CHF, 🇨🇭), SEK (kr, 🇸🇪), NZD (NZ$, 🇳🇿), INR (₹, 🇮🇳)
   - And all remaining ISO 4217 currencies alphabetically by code.

3. Helper functions:
```ts
// Lookup map for O(1) access
const currencyMap = new Map(CURRENCIES.map(c => [c.code, c]))

/** Get currency symbol, falls back to code if unknown */
export function getCurrencySymbol(code: string): string {
  return currencyMap.get(code)?.symbol ?? code
}

/** Format amount with currency symbol: "NT$1,234" or "₫50,000" */
export function formatCurrency(amount: number, code: string): string {
  const symbol = getCurrencySymbol(code)
  return `${symbol}${amount.toLocaleString()}`
}

/** Pre-built options for SearchableSelect */
export const currencySelectOptions: SelectOption[] = CURRENCIES.map(c => ({
  id: c.code,
  label: `${c.flag} ${c.code} - ${c.name}`,
}))
```

Import `SelectOption` from `../components/ui/selectTypes`.

**Step 2: Verify the file compiles**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit constants/currencies.ts 2>&1 | head -20`

If there are type errors, fix them.

**Step 3: Commit**

```bash
git add app/constants/currencies.ts
git commit -m "feat(app): add ISO 4217 currency data module with symbols and helpers"
```

---

### Task 2: Use currency module in account detail page

**Files:**
- Modify: `app/app/accounts/[id].tsx`

**Step 1: Replace hardcoded currency list and symbols**

In `app/app/accounts/[id].tsx`:

1. Add import:
```ts
import { getCurrencySymbol, currencySelectOptions } from '../../constants/currencies'
```

2. Remove line 29:
```ts
const currencyOptions = ['TWD', 'USD', 'JPY', 'EUR']
```

3. Line 182-183 — replace balance display:
```ts
// Before:
{account.currency === 'TWD' ? '$' : `${account.currency} `}
{account.balance.toLocaleString()}

// After:
{getCurrencySymbol(account.currency)}{account.balance.toLocaleString()}
```

4. Line 203 — replace SearchableSelect options:
```ts
// Before:
options={currencyOptions.map((c) => ({ id: c, label: c }))}

// After:
options={currencySelectOptions}
```

5. Line 343 — billing cycle expense total:
```ts
// Before:
${cycleExpenseTotal.toLocaleString()}

// After:
{getCurrencySymbol(account.currency)}{cycleExpenseTotal.toLocaleString()}
```

6. Line 477 — transaction row amounts:
```ts
// Before:
{t.type === 'INCOME' ? '+' : t.type === 'TRANSFER' ? '' : '-'}$
{Math.abs(t.amount).toLocaleString()}

// After:
{t.type === 'INCOME' ? '+' : t.type === 'TRANSFER' ? '' : '-'}{getCurrencySymbol(account.currency)}
{Math.abs(t.amount).toLocaleString()}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add app/app/accounts/[id].tsx
git commit -m "feat(app): use currency module in account detail page"
```

---

### Task 3: Fix AccountCard currency symbol

**Files:**
- Modify: `app/components/accounts/AccountCard.tsx`

**Step 1: Replace hardcoded symbol**

1. Add import:
```ts
import { getCurrencySymbol } from '../../constants/currencies'
```

2. Line 27-29 — replace balance display:
```ts
// Before:
{account.currency === 'TWD' ? '$' : `${account.currency} `}
{account.balance.toLocaleString()}

// After:
{getCurrencySymbol(account.currency)}{account.balance.toLocaleString()}
```

**Step 2: Commit**

```bash
git add app/components/accounts/AccountCard.tsx
git commit -m "fix(app): use correct currency symbol in AccountCard"
```

---

### Task 4: Fix AssetSummary currency symbols

**Files:**
- Modify: `app/components/dashboard/AssetSummary.tsx`

**Step 1: Replace all hardcoded `$` in asset summary**

1. Add import:
```ts
import { getCurrencySymbol } from '../../constants/currencies'
```

2. Lines 49, 55, 61 — replace `$` with `{getCurrencySymbol(cur)}`:
```ts
// Before (3 places):
${assets.toLocaleString()}
${liabilities.toLocaleString()}
${net.toLocaleString()}

// After:
{getCurrencySymbol(cur)}{assets.toLocaleString()}
{getCurrencySymbol(cur)}{liabilities.toLocaleString()}
{getCurrencySymbol(cur)}{net.toLocaleString()}
```

3. Line 69 — empty state:
```ts
// Before:
$0

// After:
{getCurrencySymbol('TWD')}0
```

**Step 2: Commit**

```bash
git add app/components/dashboard/AssetSummary.tsx
git commit -m "fix(app): use correct currency symbols in AssetSummary"
```

---

### Task 5: Fix RecentTransactions currency symbols

**Files:**
- Modify: `app/components/dashboard/RecentTransactions.tsx`

**Step 1: Update getAmountDisplay to accept currency code**

The `Transaction` type should have an `account` field with currency. Check the type — if `t.account?.currency` is available, use it. Otherwise fall back to `'TWD'`.

1. Add import:
```ts
import { getCurrencySymbol } from '../../constants/currencies'
```

2. Update `getAmountDisplay` function (lines 63-75):
```ts
function getAmountDisplay(t: Transaction): { text: string; color: string } {
  const formatted = Math.abs(t.amount).toLocaleString()
  const sym = getCurrencySymbol(t.account?.currency ?? 'TWD')
  switch (t.type) {
    case 'INCOME':
      return { text: `+${sym}${formatted}`, color: '#16a34a' }
    case 'EXPENSE':
      return { text: `-${sym}${formatted}`, color: '#ef4444' }
    case 'TRANSFER':
      return { text: `${sym}${formatted}`, color: '#6b7280' }
    default:
      return { text: `${sym}${formatted}`, color: '#0f172a' }
  }
}
```

**Step 2: Commit**

```bash
git add app/components/dashboard/RecentTransactions.tsx
git commit -m "fix(app): use correct currency symbol in RecentTransactions"
```

---

### Task 6: Fix shared ledger detail currency symbols

**Files:**
- Modify: `app/app/shared-ledgers/[id].tsx`

**Step 1: Replace all hardcoded `$` with ledger currency**

1. Add import:
```ts
import { getCurrencySymbol } from '../../constants/currencies'
```

2. Replace all `$` in the summary card (lines 187, 191, 195, 202) and expense rows (line 536):

```ts
// Use a local variable after the loading guard:
const sym = getCurrencySymbol(ledger.currency)
```

Then replace each `$` with `{sym}`:
- Line 187: `${summary.data.total_expenses.toLocaleString()}` → `{sym}{summary.data.total_expenses.toLocaleString()}`
- Line 191: `${summary.data.owner_share.toLocaleString()}` → `{sym}{summary.data.owner_share.toLocaleString()}`
- Line 195: `${summary.data.partner_share.toLocaleString()}` → `{sym}{summary.data.partner_share.toLocaleString()}`
- Line 202: `${Math.abs(summary.data.receivable_balance).toLocaleString()}` → `{sym}{Math.abs(summary.data.receivable_balance).toLocaleString()}`
- Line 536: `${e.total_amount.toLocaleString()}` → `{sym}{e.total_amount.toLocaleString()}`

**Step 2: Commit**

```bash
git add app/app/shared-ledgers/[id].tsx
git commit -m "fix(app): use correct currency symbol in shared ledger detail"
```

---

### Task 7: Add currency selector to shared ledger creation (bug fix)

**Files:**
- Modify: `app/app/(tabs)/shared-ledgers.tsx`

**Step 1: Add currency field to creation form**

1. Add imports:
```ts
import { SearchableSelect } from '../../components/ui/SearchableSelect'
import { currencySelectOptions, getCurrencySymbol } from '../../constants/currencies'
```

2. Add state for currency (after line 16):
```ts
const [currency, setCurrency] = useState('TWD')
```

3. Include currency in the mutate call (line 22):
```ts
// Before:
createMut.mutate({ name: name.trim(), partner_name: partnerName.trim() }, {

// After:
createMut.mutate({ name: name.trim(), partner_name: partnerName.trim(), currency }, {
```

4. Reset currency on success (line 23):
```ts
onSuccess: () => { setName(''); setPartnerName(''); setCurrency('TWD'); setShowForm(false) },
```

5. Add `SearchableSelect` between partner name input and the create button (after line 55):
```tsx
<SearchableSelect
  value={currency}
  options={currencySelectOptions}
  placeholder="選擇幣別"
  onChange={setCurrency}
  allowClear={false}
/>
```

Wrap it in a `<View style={{ marginBottom: 12 }}>` to match the spacing of other inputs.

6. Also update the ledger list item to show the currency symbol properly (line 79):
```ts
// Before:
與 {l.partner_name} | {l.currency}

// After:
與 {l.partner_name} | {getCurrencySymbol(l.currency)} {l.currency}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add app/app/(tabs)/shared-ledgers.tsx
git commit -m "fix(app): add missing currency selector to shared ledger creation"
```

---

### Task 8: Verify and visual check

**Step 1: Run TypeScript check on the whole app**

```bash
cd /Users/yuki/projects/zen-bill/app && npx tsc --noEmit
```

Expected: No errors.

**Step 2: Start the dev server and test manually**

```bash
cd /Users/yuki/projects/zen-bill/app && npx expo start
```

Verify:
- [ ] Account detail page shows correct currency symbol for non-TWD accounts
- [ ] Currency selector in account edit shows full ISO 4217 list with search
- [ ] Shared ledger creation form has currency picker
- [ ] Shared ledger detail shows correct currency symbol
- [ ] Dashboard asset summary shows correct symbols per currency group
- [ ] Dashboard recent transactions show correct symbols

**Step 3: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix(app): address visual issues from multi-currency support"
```
