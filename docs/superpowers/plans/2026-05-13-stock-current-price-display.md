# Stock Current Price Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show current stock price freshness consistently on APP and Web dashboard, account list, and account detail pages.

**Architecture:** Keep the existing backend and API unchanged. Add small shared utilities for stock price update-time calculation and formatting, then consume them from Web and App pages so list/detail views use the same behavior.

**Tech Stack:** TypeScript, React, React Native / Expo, TanStack Query, Vitest, Vite, pnpm workspace.

---

## File Structure

- Modify `packages/shared/src/utils/stockCalculations.ts`
  - Add pure helpers:
    - `getLatestStockPriceUpdatedAt(accounts)`
    - `formatStockPriceUpdatedAt(value)`
  - Keep helpers independent of React and API calls.
- Modify `packages/shared/src/utils/__tests__/stockCalculations.test.ts`
  - Cover latest timestamp selection, null handling, non-stock filtering, and invalid timestamp handling.
- Modify `frontend/src/pages/AccountsPage.tsx`
  - Import shared helper.
  - Display one stock category update timestamp next to the `股票` heading.
- Modify `frontend/src/pages/AccountDetailPage.tsx`
  - Import shared helper.
  - Show update freshness under the `現價` value.
- Modify `app/app/(tabs)/accounts.tsx`
  - Group accounts by type in the App account list so the stock section can show the shared update timestamp.
- Modify `app/components/accounts/AccountCard.tsx`
  - Keep cards compact; no per-card timestamp.
- Modify `app/app/accounts/[id].tsx`
  - Import shared helper.
  - Show update freshness under the `現價` value.

---

### Task 1: Add Shared Stock Price Update-Time Helpers

**Files:**
- Modify: `packages/shared/src/utils/stockCalculations.ts`
- Test: `packages/shared/src/utils/__tests__/stockCalculations.test.ts`

- [ ] **Step 1: Write failing helper tests**

Update the import in `packages/shared/src/utils/__tests__/stockCalculations.test.ts`:

```ts
import {
  calculateStockDailyPerformance,
  calculateStockDailySummary,
  formatStockPriceUpdatedAt,
  getLatestStockPriceUpdatedAt,
} from '../stockCalculations'
```

Append these tests to the same file:

```ts
describe('getLatestStockPriceUpdatedAt', () => {
  it('returns the latest update time from stock accounts with prices', () => {
    const result = getLatestStockPriceUpdatedAt([
      stock({ id: 'tw-1', last_price_at: '2026-05-12T09:30:00Z' }),
      stock({ id: 'tw-2', last_price_at: '2026-05-13T08:15:00Z' }),
      stock({ id: 'tw-3', last_price_at: null }),
    ])

    expect(result).toBe('2026-05-13T08:15:00Z')
  })

  it('ignores non-stock accounts and stock accounts without update time', () => {
    const result = getLatestStockPriceUpdatedAt([
      stock({ type: 'BANK', last_price_at: '2026-05-13T08:15:00Z' }),
      stock({ type: 'STOCK', last_price_at: null }),
    ])

    expect(result).toBeNull()
  })

  it('ignores invalid update times', () => {
    const result = getLatestStockPriceUpdatedAt([
      stock({ id: 'bad', last_price_at: 'not-a-date' }),
      stock({ id: 'good', last_price_at: '2026-05-13T08:15:00Z' }),
    ])

    expect(result).toBe('2026-05-13T08:15:00Z')
  })
})

describe('formatStockPriceUpdatedAt', () => {
  it('formats an update time with zh-TW locale', () => {
    expect(formatStockPriceUpdatedAt('2026-05-13T08:15:00Z')).toMatch(/2026/)
  })

  it('returns null for null or invalid update time', () => {
    expect(formatStockPriceUpdatedAt(null)).toBeNull()
    expect(formatStockPriceUpdatedAt('not-a-date')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm --filter @zenbill/shared test -- stockCalculations
```

Expected: FAIL because `formatStockPriceUpdatedAt` and `getLatestStockPriceUpdatedAt` are not exported yet.

- [ ] **Step 3: Add helper implementations**

Append this code after `calculateStockDailySummary` in `packages/shared/src/utils/stockCalculations.ts`:

```ts
type StockPriceUpdatedAtFields = Pick<Account, 'type' | 'last_price_at'>

function parseTimestamp(value: string | null): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

export function getLatestStockPriceUpdatedAt(accounts: StockPriceUpdatedAtFields[]): string | null {
  let latestValue: string | null = null
  let latestTime = Number.NEGATIVE_INFINITY

  for (const account of accounts) {
    if (account.type !== 'STOCK') continue
    const time = parseTimestamp(account.last_price_at)
    if (time == null || time <= latestTime) continue
    latestTime = time
    latestValue = account.last_price_at
  }

  return latestValue
}

export function formatStockPriceUpdatedAt(value: string | null): string | null {
  if (parseTimestamp(value) == null || value == null) return null
  return new Date(value).toLocaleString('zh-TW')
}
```

- [ ] **Step 4: Run shared tests and verify they pass**

Run:

```bash
pnpm --filter @zenbill/shared test -- stockCalculations
```

Expected: PASS for all `stockCalculations` tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/shared/src/utils/stockCalculations.ts packages/shared/src/utils/__tests__/stockCalculations.test.ts
git commit -m "feat(shared): add stock price update time helpers"
```

---

### Task 2: Show Stock Update Time on Web Account List

**Files:**
- Modify: `frontend/src/pages/AccountsPage.tsx`

- [ ] **Step 1: Import the shared helpers**

Change the `@zenbill/shared` import in `frontend/src/pages/AccountsPage.tsx` to include the helpers:

```ts
import {
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useBanks,
  useBuyStock,
  useStockSearch,
  useRefreshStockPrices,
  calculateStockPnL,
  calculateAssetSummary,
  sortCurrencies,
  formatStockLabel,
  getLatestStockPriceUpdatedAt,
  formatStockPriceUpdatedAt,
} from '@zenbill/shared'
```

- [ ] **Step 2: Compute the heading update label inside each account type section**

Inside the account type map, after `const cfg = typeConfig[type]`, add:

```tsx
          const stockUpdatedAt = type === 'STOCK'
            ? formatStockPriceUpdatedAt(getLatestStockPriceUpdatedAt(list))
            : null
```

- [ ] **Step 3: Replace the section heading**

Replace the existing heading:

```tsx
              <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                {cfg.label}
              </h2>
```

with:

```tsx
              <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span>{cfg.label}</span>
                {stockUpdatedAt && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="normal-case tracking-normal">股價更新於 {stockUpdatedAt}</span>
                  </>
                )}
              </h2>
```

- [ ] **Step 4: Run Web build**

Run:

```bash
pnpm --filter frontend build
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/src/pages/AccountsPage.tsx
git commit -m "feat(web): show stock price update time on account list"
```

---

### Task 3: Show Stock Update Time on Web Account Detail

**Files:**
- Modify: `frontend/src/pages/AccountDetailPage.tsx`

- [ ] **Step 1: Import the formatter**

Change the `@zenbill/shared` import in `frontend/src/pages/AccountDetailPage.tsx` to include `formatStockPriceUpdatedAt`:

```ts
import {
  useAccount,
  useAccounts,
  useUpdateAccount,
  useBanks,
  useMerchants,
  useTransactions,
  useBatchDeferTransactions,
  getPreviousBillingCycle,
  useBuyStock,
  useSellStock,
  useRefreshStockPrices,
  calculateStockPnL,
  formatStockLabel,
  getBareStockSymbol,
  formatStockPriceUpdatedAt,
} from '@zenbill/shared'
```

- [ ] **Step 2: Compute the detail timestamp label**

After `const autoPayAccount = allAccounts?.find((a) => a.id === account.auto_pay_from_id)`, add:

```ts
  const stockPriceUpdatedAt = formatStockPriceUpdatedAt(account.last_price_at)
```

- [ ] **Step 3: Replace the `現價` field**

Replace:

```tsx
            <div>
              <span className="text-[var(--text-muted)] text-xs">現價</span>
              <p>{getCurrencySymbol(account.currency)}{account.last_price.toLocaleString()}</p>
            </div>
```

with:

```tsx
            <div>
              <span className="text-[var(--text-muted)] text-xs">現價</span>
              <p>{getCurrencySymbol(account.currency)}{account.last_price.toLocaleString()}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {stockPriceUpdatedAt ? `更新於 ${stockPriceUpdatedAt}` : '尚未更新'}
              </p>
            </div>
```

- [ ] **Step 4: Run Web build**

Run:

```bash
pnpm --filter frontend build
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/src/pages/AccountDetailPage.tsx
git commit -m "feat(web): show stock price update time on account detail"
```

---

### Task 4: Show Stock Update Time on App Account List

**Files:**
- Modify: `app/app/(tabs)/accounts.tsx`
- Modify: `app/components/accounts/AccountCard.tsx`

- [ ] **Step 1: Import shared helpers and account type**

In `app/app/(tabs)/accounts.tsx`, replace:

```ts
import { useAccounts, useRefreshStockPrices } from '@zenbill/shared'
```

with:

```ts
import {
  formatStockPriceUpdatedAt,
  getLatestStockPriceUpdatedAt,
  useAccounts,
  useRefreshStockPrices,
} from '@zenbill/shared'
import type { Account, AccountType } from '@zenbill/shared'
```

- [ ] **Step 2: Add account type labels and ordering**

After the imports in `app/app/(tabs)/accounts.tsx`, add:

```ts
const ACCOUNT_TYPE_ORDER: AccountType[] = ['CASH', 'BANK', 'CRYPTO', 'STOCK', 'CREDIT']

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: '現金',
  BANK: '銀行',
  CREDIT: '信用卡',
  CRYPTO: '加密貨幣',
  STOCK: '股票',
}
```

- [ ] **Step 3: Group accounts and compute stock update time**

Inside `AccountsPage`, after the `useEffect` block and before `if (isLoading)`, add:

```ts
  const grouped = (accounts ?? []).reduce<Record<AccountType, Account[]>>((acc, account) => {
    acc[account.type].push(account)
    return acc
  }, {
    CASH: [],
    BANK: [],
    CREDIT: [],
    CRYPTO: [],
    STOCK: [],
  })

  const stockUpdatedAt = formatStockPriceUpdatedAt(getLatestStockPriceUpdatedAt(grouped.STOCK))
```

- [ ] **Step 4: Replace the account list rendering**

Replace:

```tsx
        {!accounts?.length ? (
          <EmptyState title="尚無帳戶" description="點擊右下角按鈕新增帳戶" />
        ) : (
          accounts.map((a) => <AccountCard key={a.id} account={a} testID={`account_card_${a.id}`} />)
        )}
```

with:

```tsx
        {!accounts?.length ? (
          <EmptyState title="尚無帳戶" description="點擊右下角按鈕新增帳戶" />
        ) : (
          ACCOUNT_TYPE_ORDER.map((type) => {
            const list = grouped[type] ?? []
            if (list.length === 0) return null
            const subtitle = type === 'STOCK' && stockUpdatedAt ? ` · 股價更新於 ${stockUpdatedAt}` : ''

            return (
              <View key={type} style={{ marginBottom: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 8 }}>
                  {ACCOUNT_TYPE_LABELS[type]}{subtitle}
                </Text>
                {list.map((a) => (
                  <AccountCard key={a.id} account={a} testID={`account_card_${a.id}`} />
                ))}
              </View>
            )
          })
        )}
```

- [ ] **Step 5: Confirm `AccountCard` stays compact**

Open `app/components/accounts/AccountCard.tsx` and confirm no timestamp is added. The stock section should remain:

```tsx
            {account.type === 'STOCK' && account.shares_held > 0 && (
              <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {account.shares_held} 股 · {getCurrencySymbol(account.currency)}{account.last_price?.toLocaleString()}
                {account.avg_cost_price > 0 && (() => {
                  const pnlPct = ((account.last_price - account.avg_cost_price) / account.avg_cost_price) * 100
                  return (
                    <Text style={{ color: pnlPct >= 0 ? '#10b981' : '#ef4444' }}>
                      {' '}{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                    </Text>
                  )
                })()}
              </Text>
            )}
```

- [ ] **Step 6: Run App typecheck**

Run:

```bash
pnpm --filter app exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add 'app/app/(tabs)/accounts.tsx' app/components/accounts/AccountCard.tsx
git commit -m "feat(app): show stock price update time on account list"
```

---

### Task 5: Show Stock Update Time on App Account Detail

**Files:**
- Modify: `app/app/accounts/[id].tsx`

- [ ] **Step 1: Import the formatter**

Change the `@zenbill/shared` import in `app/app/accounts/[id].tsx` to include `formatStockPriceUpdatedAt`:

```ts
import {
  useAccount,
  useAccounts,
  useUpdateAccount,
  useBanks,
  useTransactions,
  useBuyStock,
  useSellStock,
  useRefreshStockPrices,
  calculateStockPnL,
  formatStockLabel,
  getBareStockSymbol,
  formatStockPriceUpdatedAt,
} from '@zenbill/shared'
```

- [ ] **Step 2: Compute the detail timestamp label**

After `const autoPayAccount = allAccounts?.find((a) => a.id === account.auto_pay_from_id)`, add:

```ts
  const stockPriceUpdatedAt = formatStockPriceUpdatedAt(account.last_price_at)
```

- [ ] **Step 3: Replace the `現價` field**

Replace:

```tsx
              <View style={s.infoItem}>
                <Text style={s.infoLabel}>現價</Text>
                <Text style={s.infoValue}>{getCurrencySymbol(account.currency)}{account.last_price.toLocaleString()}</Text>
              </View>
```

with:

```tsx
              <View style={s.infoItem}>
                <Text style={s.infoLabel}>現價</Text>
                <Text style={s.infoValue}>{getCurrencySymbol(account.currency)}{account.last_price.toLocaleString()}</Text>
                <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {stockPriceUpdatedAt ? `更新於 ${stockPriceUpdatedAt}` : '尚未更新'}
                </Text>
              </View>
```

- [ ] **Step 4: Run App typecheck**

Run:

```bash
pnpm --filter app exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add 'app/app/accounts/[id].tsx'
git commit -m "feat(app): show stock price update time on account detail"
```

---

### Task 6: Final Verification and Cleanup

**Files:**
- Read: `docs/superpowers/specs/2026-05-13-stock-current-price-display-design.md`
- Verify modified files from Tasks 1-5.

- [ ] **Step 1: Run shared tests**

Run:

```bash
pnpm --filter @zenbill/shared test -- stockCalculations
```

Expected: PASS.

- [ ] **Step 2: Run Web build**

Run:

```bash
pnpm --filter frontend build
```

Expected: PASS.

- [ ] **Step 3: Run App typecheck**

Run:

```bash
pnpm --filter app exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: only intentional uncommitted files are present. If Tasks 1-5 were committed individually, `git diff --stat HEAD` should be empty.

- [ ] **Step 5: Manual UI verification**

Start the Web app:

```bash
pnpm dev:web
```

Open the accounts and account detail pages with stock data and verify:

- Web dashboard still shows stock current price and dashboard-level update time.
- Web account list shows `股票 · 股價更新於 ...` once in the stock section.
- Web stock account detail shows `更新於 ...` under `現價`.
- When `last_price_at` is null, Web account list omits the stock heading timestamp and Web detail shows `尚未更新`.

Start the App:

```bash
pnpm dev:app
```

Open the accounts and account detail pages with stock data and verify:

- App dashboard still shows stock current price and dashboard-level update time.
- App account list shows `股票 · 股價更新於 ...` once in the stock section.
- App stock account detail shows `更新於 ...` under `現價`.
- On narrow screens, the stock heading and timestamp wrap cleanly without overlapping card content.

- [ ] **Step 6: Final commit if verification changed files**

If final verification caused any small follow-up edits, commit them:

```bash
git add packages/shared/src/utils/stockCalculations.ts packages/shared/src/utils/__tests__/stockCalculations.test.ts frontend/src/pages/AccountsPage.tsx frontend/src/pages/AccountDetailPage.tsx 'app/app/(tabs)/accounts.tsx' app/components/accounts/AccountCard.tsx 'app/app/accounts/[id].tsx'
git commit -m "fix: polish stock price update time display"
```

If there are no follow-up edits, do not create an empty commit.

---

## Self-Review

- Spec coverage: Tasks cover the shared helper, Web account list, Web account detail, App account list, App account detail, and verification. Dashboard behavior is explicitly preserved because the existing dashboard already displays stock price and update time.
- Placeholder scan: No deferred requirements or undefined implementation placeholders remain.
- Type consistency: Helper names are consistent across tests and all consumers: `getLatestStockPriceUpdatedAt` and `formatStockPriceUpdatedAt`.
