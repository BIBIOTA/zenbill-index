# Merchant Defaults Auto-Learn

**Date:** 2026-02-23
**Status:** Approved

## Problem

When a user creates a transaction with a merchant, they manually select a category and account. If the same merchant is used again, the user has to re-select these fields. The merchant already has `default_category_id` and `default_account_id` fields, and the frontend already auto-fills from these — but they need to be manually set.

## Solution

Automatically learn merchant defaults from transaction creation. When a transaction is saved with a merchant, if the merchant's `default_category_id` or `default_account_id` is empty, auto-populate it from the transaction's values.

## Design

**Trigger:** `TransactionService.Create()` after successful transaction creation

**Logic:**
1. Transaction must have `merchant_id`
2. Query merchant's current `default_category_id` and `default_account_id`
3. Fill individually (not all-or-nothing):
   - If merchant's `default_category_id` is nil AND transaction has `category_id` → set it
   - If merchant's `default_account_id` is nil AND transaction has `account_id` → set it
4. If any field needs updating, call `MerchantRepository.Update()`
5. All within the same DB transaction

**Files to modify:**
- `backend/internal/usecase/transaction_service.go` — add auto-learn logic in `Create()`
- Inject `MerchantRepository` into `TransactionService` if not already present

**No changes needed:**
- Domain models (Merchant already has DefaultCategoryID, DefaultAccountID)
- API endpoints
- Frontend (already auto-fills from merchant defaults)

**Edge cases:**
- No merchant_id → no-op
- No category_id on transaction → don't update default_category_id
- Both defaults already set → no-op
- Update failure → log warning, don't fail the transaction
