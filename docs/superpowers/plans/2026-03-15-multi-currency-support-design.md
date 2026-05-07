# Multi-Currency Support & Currency Display Fix

**Date:** 2026-03-15
**Scope:** Frontend only (mobile app)

## Problem

1. Currency selector only has 4 options (TWD, USD, JPY, EUR) — no VND or other currencies
2. Shared ledger creation missing currency field (bug: backend requires it but app doesn't send it)
3. Currency symbols hardcoded as `$` everywhere — incorrect for JPY (¥), EUR (€), VND (₫), etc.

## Design

### 1. Shared Currency Data Module

**New file:** `app/constants/currencies.ts`

- Complete ISO 4217 currency list (~160 currencies)
- Each entry: `{ code, name, symbol, flag }` (e.g. `{ code: 'VND', name: 'Vietnamese Dong', symbol: '₫', flag: '🇻🇳' }`)
- Helper functions:
  - `getCurrencySymbol(code: string): string` — returns symbol or code as fallback
  - `formatCurrency(amount: number, code: string): string` — formatted display string
  - `currencySelectOptions`: pre-built `SelectOption[]` for `SearchableSelect`
    - Label format: `🇻🇳 VND - Vietnamese Dong`

### 2. Currency Selection (Personal Accounts + Shared Ledgers)

**Modified:** `app/app/accounts/[id].tsx`
- Remove hardcoded `currencyOptions = ['TWD', 'USD', 'JPY', 'EUR']`
- Import shared currency list, feed into existing `SearchableSelect`

**Modified:** `app/app/(tabs)/shared-ledgers.tsx`
- Add currency field to shared ledger creation form (fix missing field bug)
- Use same `SearchableSelect` with shared currency list
- Default to TWD

### 3. Currency Symbol Display Fix

Replace hardcoded `$` with `getCurrencySymbol(code)` in:

- `app/components/accounts/AccountCard.tsx` — account card balance
- `app/app/accounts/[id].tsx` — account detail balance
- `app/components/dashboard/AssetSummary.tsx` — asset summary sections
- `app/components/dashboard/RecentTransactions.tsx` — transaction amounts
- `app/app/shared-ledgers/[id].tsx` — shared ledger amounts

### 4. Out of Scope

- No exchange rate conversion changes
- No backend changes (already supports any currency string)
- No dashboard TWD aggregation logic changes

## Files Changed

| File | Action | Change |
|------|--------|--------|
| `app/constants/currencies.ts` | **New** | ISO 4217 currency data + helpers |
| `app/app/accounts/[id].tsx` | Modify | Use shared currency list |
| `app/app/(tabs)/shared-ledgers.tsx` | Modify | Add currency selector to creation form |
| `app/components/accounts/AccountCard.tsx` | Modify | Fix currency symbol |
| `app/components/dashboard/AssetSummary.tsx` | Modify | Fix currency symbol |
| `app/components/dashboard/RecentTransactions.tsx` | Modify | Fix currency symbol |
| `app/app/shared-ledgers/[id].tsx` | Modify | Fix currency symbol |
