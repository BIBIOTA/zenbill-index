# Search Term Auto-Fill for Create Forms

**Date:** 2026-02-23
**Status:** Approved

## Problem

When searching for a merchant/category that doesn't exist, clicking "Create" opens a form with an empty name field. The user has to retype the name they just searched for.

## Solution

Pass the search term through callbacks/props so create forms auto-fill the name field.

## Changes

### 1. SearchableSelect.tsx

Change `onCreateNew` signature from `() => void` to `(searchTerm: string) => void`. Pass current search text when create button is clicked.

### 2. MerchantQuickCreate.tsx

Add `initialName?: string` prop. When modal opens with an initialName, pre-fill the name field via useEffect.

### 3. CategoryQuickCreate.tsx

Same as MerchantQuickCreate — add `initialName?: string` prop with useEffect pre-fill.

### 4. TransactionForm.tsx

Add state to capture search terms from SearchableSelect callbacks. Pass as `initialName` to QuickCreate modals.

### 5. MerchantsPage.tsx

When clicking "新增商家" button, pass current search bar text to the create form's name field.

### 6. CategoriesPage.tsx

No changes needed — no search bar exists currently.
