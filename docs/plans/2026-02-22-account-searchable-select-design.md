# Account Searchable Select Design

**Date:** 2026-02-22
**Goal:** Replace plain `<select>` with `SearchableSelect` for account selection in TransactionForm, with type-based grouping.

## Changes

### 1. New: `accountOptions.ts`

Path: `frontend/src/components/transactions/accountOptions.ts`

Utility function `buildAccountOptions(accounts)` that:
- Groups accounts by type: CASH → 現金, BANK → 銀行, CREDIT → 信用卡, CRYPTO → 加密貨幣
- Returns `SelectOption[]` with group headers and indented account items
- Follows same pattern as existing `buildCategoryOptions`

### 2. Modify: `TransactionForm.tsx`

Replace both account `<select>` elements (source account + transfer target account) with `SearchableSelect`:
- Use `buildAccountOptions(accounts)` for options
- No `onCreateNew` (accounts are managed in settings)
- Source account: `allowClear: false` (required field)
- Target account: `allowClear: true`

## Out of Scope

- No changes to `SearchableSelect.tsx` (already supports group/indent/search)
- No changes to `useAccounts.ts` (sorting unchanged)
- No backend changes (pure frontend UI)
