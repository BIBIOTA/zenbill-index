# Running Balance for Date Range Queries

**Date:** 2026-02-23
**Status:** Approved
**Branch:** feat/running-balance

## Problem

Credit card account detail page has two viewing modes:
1. **Normal mode** (account_id only) — shows running balance ✅
2. **Billing cycle mode** (account_id + date range) — no running balance ❌

Both modes should display running balance (actual account balance after each transaction).

## Design

### Algorithm

The existing running balance algorithm works by:
1. Starting from the current account balance
2. Subtracting the effective amount of all transactions newer than the current page
3. Walking through each transaction on the page, calculating the balance

For date range queries, the same approach applies:
1. Start from current account balance
2. Subtract effective amount of all transactions **after** the date range end
3. That gives us the balance at the end of the date range
4. Handle pagination within the date range using offset-based sum (same as existing)
5. Walk through page transactions applying effectiveAmount

### Changes by Layer

#### 1. Domain — `internal/domain/repository.go`
Add to `TransactionRepository` interface:
- `SumEffectiveAmountAfterDateRange(ctx, accountID, endDate)` — sums effective amount of transactions with `occurred_at > endDate`
- `CountByAccountIDAndDateRange(ctx, accountID, startDate, endDate)` — count for pagination

#### 2. Repository — `internal/repository/transaction_repository.go`
Implement:
- `SumEffectiveAmountAfterDateRange` — SQL CASE expression (same pattern as `SumEffectiveAmountForAccount`) filtered by `occurred_at > endDate`
- `CountByAccountIDAndDateRange` — simple COUNT query

#### 3. Service — `internal/usecase/transaction_service.go`
Add:
- `ListByAccountWithBalanceAndDateRange(ctx, accountID, accountBalance, startDate, endDate, limit, offset)`
- Uses `FindByAccountIDAndDateRange` for transactions (needs pagination support added)
- Uses `SumEffectiveAmountAfterDateRange` + `SumEffectiveAmountForAccount` within range for offset
- Same running balance walk as existing method

#### 4. Handler — `internal/delivery/http/transaction_handler.go`
- Billing cycle path: fetch account, call `ListByAccountWithBalanceAndDateRange` instead of raw repo call

### Running Balance Semantics

- Shows actual account balance (can be negative for credit cards)
- Consistent with normal mode display
- No special treatment for credit card accounts
