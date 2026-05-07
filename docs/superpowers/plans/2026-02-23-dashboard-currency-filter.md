# Dashboard Currency Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix dashboard stats to only aggregate TWD transactions, preventing incorrect sums that mix TWD/JPY/USD amounts.

**Architecture:** Add a JOIN to accounts table and WHERE filter on `accounts.currency = 'TWD'` in the existing `GetMonthlyStats` repository method. No domain type changes, no frontend changes needed — the response shape stays identical, just the numbers become correct.

**Tech Stack:** Go (GORM), PostgreSQL

---

## Problem

The `GetMonthlyStats` SQL queries sum `transactions.amount` without checking the account's currency. A USD balance adjustment of $53,851 is mixed into TWD totals, inflating the dashboard numbers.

**Current SQL (monthly):**
```sql
SELECT to_char(occurred_at, 'YYYY-MM') as month, type as tx_type, SUM(amount) as total
FROM transactions
WHERE user_id = ? AND occurred_at >= ?
GROUP BY month, tx_type
```

**Fixed SQL (monthly):**
```sql
SELECT to_char(occurred_at, 'YYYY-MM') as month, type as tx_type, SUM(amount) as total
FROM transactions
JOIN accounts ON accounts.id = transactions.account_id
WHERE user_id = ? AND occurred_at >= ? AND accounts.currency = 'TWD'
GROUP BY month, tx_type
```

Same pattern for the category breakdown query.

---

### Task 1: Fix monthly aggregation query

**Files:**
- Modify: `backend/internal/repository/transaction_repository.go:136-142`

**Step 1: Add JOIN and WHERE filter to monthly query**

Change the monthly aggregation GORM chain from:

```go
	err := r.db.WithContext(ctx).
		Model(&domain.Transaction{}).
		Select("to_char(occurred_at, 'YYYY-MM') as month, type as tx_type, COALESCE(SUM(amount), 0) as total").
		Where("user_id = ? AND occurred_at >= ?", userID, startMonth).
		Group("month, tx_type").
		Order("month ASC").
		Find(&rows).Error
```

To:

```go
	err := r.db.WithContext(ctx).
		Model(&domain.Transaction{}).
		Joins("JOIN accounts ON accounts.id = transactions.account_id").
		Select("to_char(occurred_at, 'YYYY-MM') as month, type as tx_type, COALESCE(SUM(amount), 0) as total").
		Where("transactions.user_id = ? AND occurred_at >= ? AND accounts.currency = 'TWD'", userID, startMonth).
		Group("month, tx_type").
		Order("month ASC").
		Find(&rows).Error
```

Key changes:
- Added `.Joins("JOIN accounts ON accounts.id = transactions.account_id")`
- Added `AND accounts.currency = 'TWD'` to WHERE
- Prefixed `user_id` with `transactions.` to avoid ambiguity (both tables have `user_id`)

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`

---

### Task 2: Fix category breakdown query

**Files:**
- Modify: `backend/internal/repository/transaction_repository.go:181-189`

**Step 1: Add JOIN and WHERE filter to category query**

The category query already JOINs categories. Add the accounts JOIN too.

Change from:

```go
	err = r.db.WithContext(ctx).
		Model(&domain.Transaction{}).
		Select("transactions.category_id, categories.name as category_name, COALESCE(SUM(transactions.amount), 0) as total").
		Joins("LEFT JOIN categories ON categories.id = transactions.category_id").
		Where("transactions.user_id = ? AND transactions.type = ? AND transactions.occurred_at >= ?",
			userID, domain.TransactionTypeExpense, currentMonthStart).
		Group("transactions.category_id, categories.name").
		Order("total DESC").
		Find(&catRows).Error
```

To:

```go
	err = r.db.WithContext(ctx).
		Model(&domain.Transaction{}).
		Joins("JOIN accounts ON accounts.id = transactions.account_id").
		Select("transactions.category_id, categories.name as category_name, COALESCE(SUM(transactions.amount), 0) as total").
		Joins("LEFT JOIN categories ON categories.id = transactions.category_id").
		Where("transactions.user_id = ? AND transactions.type = ? AND transactions.occurred_at >= ? AND accounts.currency = 'TWD'",
			userID, domain.TransactionTypeExpense, currentMonthStart).
		Group("transactions.category_id, categories.name").
		Order("total DESC").
		Find(&catRows).Error
```

Key changes:
- Added `.Joins("JOIN accounts ON accounts.id = transactions.account_id")` before the SELECT
- Added `AND accounts.currency = 'TWD'` to WHERE

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`

---

### Task 3: Verify in browser

**Step 1: Wait for air hot-reload and check logs**

```bash
docker logs zenbill_api --tail 10
```

Verify the new SQL includes `JOIN accounts` and `accounts.currency = 'TWD'`.

**Step 2: Check the dashboard**

Open `http://localhost:5173` and verify:
- 本月支出 should be ~$80,284 (TWD only, was $127,786 with mixed currencies)
- 本月收入 should be ~$338,441 (TWD only, was $442,962 which included JPY income)
- 支出趨勢 should show lower numbers (USD excluded)
- 分類佔比 should not include the USD balance adjustment

**Step 3: Commit**

```bash
cd /Users/yuki/projects/zen-bill/backend
git add internal/repository/transaction_repository.go
git commit -m "fix(stats): filter dashboard aggregation to TWD currency only

JOIN accounts table and add currency = 'TWD' filter to prevent
mixing TWD/JPY/USD amounts in monthly and category stats."
```
