# Dashboard Stats Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the dashboard page so that monthly expense, income, spending trend, and category breakdown display real data instead of mock/incorrect calculations.

**Architecture:** Add a single `GET /transactions/stats` backend endpoint that performs SQL aggregation and returns all dashboard statistics in one response. The frontend DashboardPage replaces its current broken logic (only 5 transactions, no date filter) and mock data with a single `useTransactionStats()` hook calling this endpoint.

**Tech Stack:** Go (Gin, GORM), PostgreSQL SQL aggregation, React (TanStack Query), Recharts

---

## Problem Summary

| Item | Current State | Root Cause |
|------|--------------|------------|
| 本月支出 | Only sums 5 most recent txns | `useTransactions({ page_size: 5 })` with no date filter |
| 本月收入 | Always $0 | Same — 5 recent txns happen to all be EXPENSE/TRANSFER |
| 支出趨勢 | Hardcoded 1-6月 mock data | `DashboardPage.tsx:48-55` |
| 分類佔比 | Hardcoded mock categories | `DashboardPage.tsx:57-63` |
| 待處理發票 | Correct | Uses `pagination.total` properly |

## Design Decision

**Why a backend stats endpoint?**
- Avoids fetching all transactions to the frontend just to sum them
- SQL `SUM()` + `GROUP BY` is efficient and correct
- Single API call provides everything the dashboard needs
- Scales as transaction count grows

**API Design:**

```
GET /transactions/stats?months=6
```

Response:
```json
{
  "code": 200,
  "message": "ok",
  "data": {
    "monthly": [
      { "month": "2026-02", "expense": 32150, "income": 50000 },
      { "month": "2026-01", "expense": 28400, "income": 50000 },
      ...
    ],
    "current_month_categories": [
      { "category_id": "uuid", "category_name": "餐飲", "total": 12000 },
      { "category_id": null, "category_name": "未分類", "total": 4000 },
      ...
    ]
  }
}
```

---

### Task 1: Add domain types for transaction stats

**Files:**
- Modify: `backend/internal/domain/transaction.go`

**Step 1: Add stats types to domain**

Add at the end of `backend/internal/domain/transaction.go`:

```go
// MonthlySummary holds aggregated expense/income for a single month.
type MonthlySummary struct {
	Month   string  `json:"month"`   // "2026-02"
	Expense float64 `json:"expense"`
	Income  float64 `json:"income"`
}

// CategorySummary holds aggregated spending for a single category in the current month.
type CategorySummary struct {
	CategoryID   *uuid.UUID `json:"category_id"`
	CategoryName string     `json:"category_name"`
	Total        float64    `json:"total"`
}

// TransactionStats is the response payload for dashboard statistics.
type TransactionStats struct {
	Monthly                 []MonthlySummary  `json:"monthly"`
	CurrentMonthCategories  []CategorySummary `json:"current_month_categories"`
}
```

**Step 2: Commit**

```bash
git add backend/internal/domain/transaction.go
git commit -m "feat(domain): add TransactionStats types for dashboard aggregation"
```

---

### Task 2: Add repository interface method

**Files:**
- Modify: `backend/internal/domain/repository.go`

**Step 1: Add method to TransactionRepository interface**

Add inside the `TransactionRepository` interface (before the closing `}`):

```go
	// GetMonthlyStats returns monthly expense/income totals for the last N months
	// and category breakdown for the current month.
	GetMonthlyStats(ctx context.Context, userID uuid.UUID, months int) (*TransactionStats, error)
```

**Step 2: Commit**

```bash
git add backend/internal/domain/repository.go
git commit -m "feat(domain): add GetMonthlyStats to TransactionRepository interface"
```

---

### Task 3: Implement repository method

**Files:**
- Modify: `backend/internal/repository/transaction_repository.go`

**Step 1: Implement GetMonthlyStats**

Add this method to `TransactionRepositoryImpl`:

```go
// GetMonthlyStats returns monthly expense/income totals and current month category breakdown.
func (r *TransactionRepositoryImpl) GetMonthlyStats(ctx context.Context, userID uuid.UUID, months int) (*domain.TransactionStats, error) {
	now := time.Now()
	// First day of (months-1) months ago
	startMonth := time.Date(now.Year(), now.Month()-time.Month(months-1), 1, 0, 0, 0, 0, now.Location())

	// 1. Monthly expense/income aggregation
	type monthlyRow struct {
		Month   string  `gorm:"column:month"`
		TxType  string  `gorm:"column:tx_type"`
		Total   float64 `gorm:"column:total"`
	}
	var rows []monthlyRow
	err := r.db.WithContext(ctx).
		Model(&domain.Transaction{}).
		Select("to_char(occurred_at, 'YYYY-MM') as month, type as tx_type, COALESCE(SUM(amount), 0) as total").
		Where("user_id = ? AND occurred_at >= ?", userID, startMonth).
		Group("month, tx_type").
		Order("month ASC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}

	// Build monthly map
	monthMap := make(map[string]*domain.MonthlySummary)
	for i := 0; i < months; i++ {
		m := time.Date(now.Year(), now.Month()-time.Month(months-1-i), 1, 0, 0, 0, 0, now.Location())
		key := m.Format("2006-01")
		monthMap[key] = &domain.MonthlySummary{Month: key}
	}
	for _, r := range rows {
		s, ok := monthMap[r.Month]
		if !ok {
			continue
		}
		switch domain.TransactionType(r.TxType) {
		case domain.TransactionTypeExpense:
			s.Expense = r.Total
		case domain.TransactionTypeIncome:
			s.Income = r.Total
		}
	}
	monthly := make([]domain.MonthlySummary, 0, months)
	for i := 0; i < months; i++ {
		m := time.Date(now.Year(), now.Month()-time.Month(months-1-i), 1, 0, 0, 0, 0, now.Location())
		key := m.Format("2006-01")
		monthly = append(monthly, *monthMap[key])
	}

	// 2. Current month category breakdown (EXPENSE only)
	currentMonthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	type categoryRow struct {
		CategoryID   *string `gorm:"column:category_id"`
		CategoryName *string `gorm:"column:category_name"`
		Total        float64 `gorm:"column:total"`
	}
	var catRows []categoryRow
	err = r.db.WithContext(ctx).
		Model(&domain.Transaction{}).
		Select("transactions.category_id, categories.name as category_name, COALESCE(SUM(transactions.amount), 0) as total").
		Joins("LEFT JOIN categories ON categories.id = transactions.category_id").
		Where("transactions.user_id = ? AND transactions.type = ? AND transactions.occurred_at >= ?",
			userID, domain.TransactionTypeExpense, currentMonthStart).
		Group("transactions.category_id, categories.name").
		Order("total DESC").
		Find(&catRows).Error
	if err != nil {
		return nil, err
	}

	categories := make([]domain.CategorySummary, 0, len(catRows))
	for _, cr := range catRows {
		name := "未分類"
		if cr.CategoryName != nil {
			name = *cr.CategoryName
		}
		var catID *uuid.UUID
		if cr.CategoryID != nil {
			parsed, err := uuid.Parse(*cr.CategoryID)
			if err == nil {
				catID = &parsed
			}
		}
		categories = append(categories, domain.CategorySummary{
			CategoryID:   catID,
			CategoryName: name,
			Total:        cr.Total,
		})
	}

	return &domain.TransactionStats{
		Monthly:                monthly,
		CurrentMonthCategories: categories,
	}, nil
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`

**Step 3: Commit**

```bash
git add backend/internal/repository/transaction_repository.go
git commit -m "feat(repo): implement GetMonthlyStats with SQL aggregation"
```

---

### Task 4: Add HTTP handler for stats endpoint

**Files:**
- Modify: `backend/internal/delivery/http/transaction_handler.go`

**Step 1: Add GetStats handler method**

Add this method to `TransactionHandler`:

```go
// GetStats godoc
// @Summary      取得交易統計
// @Description  取得月度支出/收入統計與本月分類佔比
// @Tags         交易
// @Produce      json
// @Param        months  query     int  false  "月數"  default(6) maximum(12)
// @Success      200  {object}  Response{data=domain.TransactionStats}
// @Failure      500  {object}  Response
// @Router       /transactions/stats [get]
func (h *TransactionHandler) GetStats(c *gin.Context) {
	ctx := c.Request.Context()
	userID := getUserID(c)

	months, _ := strconv.Atoi(c.DefaultQuery("months", "6"))
	if months < 1 || months > 12 {
		months = 6
	}

	stats, err := h.txRepo.GetMonthlyStats(ctx, userID, months)
	if err != nil {
		h.logger.ErrorContext(ctx, "Failed to get transaction stats", "error", err)
		InternalServerError(c, "failed to get transaction stats")
		return
	}

	Success(c, stats)
}
```

**Step 2: Register the route**

In the `RegisterRoutes` method, add BEFORE the `/:id` routes (to avoid route conflict):

```go
func (h *TransactionHandler) RegisterRoutes(r *gin.RouterGroup) {
	transactions := r.Group("/transactions")
	{
		transactions.GET("", h.ListTransactions)
		transactions.POST("", h.CreateTransaction)
		transactions.GET("/stats", h.GetStats)      // ← ADD THIS LINE
		transactions.GET("/:id", h.GetTransaction)
		transactions.PUT("/:id", h.UpdateTransaction)
		transactions.DELETE("/:id", h.DeleteTransaction)
	}
}
```

**Step 3: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`

**Step 4: Commit**

```bash
git add backend/internal/delivery/http/transaction_handler.go
git commit -m "feat(api): add GET /transactions/stats endpoint for dashboard"
```

---

### Task 5: Add frontend hook and types

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/hooks/useTransactionStats.ts`

**Step 1: Add TypeScript types**

Add at end of `frontend/src/types/index.ts`:

```typescript
// === Transaction Stats ===
export interface MonthlySummary {
  month: string
  expense: number
  income: number
}

export interface CategorySummary {
  category_id: string | null
  category_name: string
  total: number
}

export interface TransactionStats {
  monthly: MonthlySummary[]
  current_month_categories: CategorySummary[]
}
```

**Step 2: Create the hook**

Create `frontend/src/hooks/useTransactionStats.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ApiResponse, TransactionStats } from '@/types'

export function useTransactionStats(months = 6) {
  return useQuery({
    queryKey: ['transaction-stats', months],
    queryFn: () =>
      api.get<ApiResponse<TransactionStats>>(`/transactions/stats?months=${months}`),
    select: (res) => res.data,
  })
}
```

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/hooks/useTransactionStats.ts
git commit -m "feat(frontend): add useTransactionStats hook and types"
```

---

### Task 6: Update DashboardPage to use real data

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

**Step 1: Replace mock data with real stats**

Replace the entire file content with:

```tsx
import { TrendingDown, TrendingUp, FileText } from 'lucide-react'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransactionStats } from '@/hooks/useTransactionStats'
import { useInvoices } from '@/hooks/useInvoices'
import { useTransactions } from '@/hooks/useTransactions'
import { SpendingChart } from '@/components/dashboard/SpendingChart'
import { CategoryDonut } from '@/components/dashboard/CategoryDonut'
import { RecentTransactions } from '@/components/dashboard/RecentTransactions'
import { StatCard } from '@/components/dashboard/StatCard'

const CATEGORY_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#f97316']

export default function DashboardPage() {
  const { data: accounts } = useAccounts()
  const { data: stats } = useTransactionStats(6)
  const { data: txRes } = useTransactions({ page_size: 5 })
  const { data: invRes } = useInvoices({ status: 'PENDING', page_size: 1 })

  const transactions = txRes?.data ?? []
  const pendingInvoices = invRes?.pagination?.total ?? 0

  // Current month stats from the last entry in monthly array
  const currentMonth = stats?.monthly?.[stats.monthly.length - 1]
  const monthlyExpense = currentMonth?.expense ?? 0
  const monthlyIncome = currentMonth?.income ?? 0

  // Spending trend chart data
  const spendingData = (stats?.monthly ?? []).map((m) => ({
    name: `${parseInt(m.month.split('-')[1], 10)}月`,
    amount: m.expense,
  }))

  // Category donut data
  const categoryData = (stats?.current_month_categories ?? []).map((c, i) => ({
    name: c.category_name,
    value: c.total,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }))

  const summaryByCurrency = (accounts ?? []).reduce<Record<string, { assets: number; liabilities: number }>>((acc, a) => {
    const cur = a.currency || 'TWD'
    acc[cur] ??= { assets: 0, liabilities: 0 }
    if (a.type === 'CREDIT') {
      if (a.balance < 0) {
        acc[cur].liabilities += -a.balance
      } else {
        acc[cur].assets += a.balance
      }
    } else {
      acc[cur].assets += a.balance
    }
    return acc
  }, {})

  const currencies = Object.keys(summaryByCurrency).sort((a, b) => {
    if (a === 'TWD') return -1
    if (b === 'TWD') return 1
    return a.localeCompare(b)
  })

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-lg font-bold">Dashboard</h1>

      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-4">
        {currencies.map((cur, i) => {
          const { assets, liabilities } = summaryByCurrency[cur]
          const net = assets - liabilities
          return (
            <div key={cur} className={i > 0 ? 'mt-3 pt-3 border-t border-[var(--border-subtle)]' : ''}>
              {currencies.length > 1 && (
                <p className="text-xs font-semibold text-[var(--text-muted)] mb-2">{cur}</p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[11px] text-[var(--text-muted)]">資產</p>
                  <p className="text-sm font-bold tabular-nums text-emerald-400">${assets.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--text-muted)]">負債</p>
                  <p className="text-sm font-bold tabular-nums text-amber-400">${liabilities.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--text-muted)]">淨資產</p>
                  <p className="text-lg font-bold tabular-nums">${net.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )
        })}
        {currencies.length === 0 && (
          <p className="text-2xl font-bold">$0</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          title="本月支出"
          value={`$${monthlyExpense.toLocaleString()}`}
          icon={TrendingDown}
          accent="#ef4444"
        />
        <StatCard
          title="本月收入"
          value={`$${monthlyIncome.toLocaleString()}`}
          icon={TrendingUp}
          accent="#10b981"
        />
        <StatCard
          title="待處理發票"
          value={String(pendingInvoices)}
          subtitle="張"
          icon={FileText}
          accent="#f59e0b"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SpendingChart data={spendingData} />
        <CategoryDonut data={categoryData} />
      </div>

      <RecentTransactions transactions={transactions} />
    </div>
  )
}
```

Key changes:
- Replaced `useTransactions({ page_size: 5 })` for stats calculation → `useTransactionStats(6)`
- Kept `useTransactions({ page_size: 5 })` only for `RecentTransactions` component
- Removed all mock data
- `monthlyExpense` / `monthlyIncome` now come from backend aggregation
- `spendingData` mapped from `stats.monthly`
- `categoryData` mapped from `stats.current_month_categories`

**Step 2: Verify frontend compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "fix(dashboard): replace mock data with real stats from backend API"
```

---

### Task 7: Manual verification in browser

**Step 1: Verify backend is running and endpoint works**

```bash
# Test the new endpoint (replace TOKEN with a valid JWT)
curl -s http://localhost:8080/api/v1/transactions/stats?months=6 \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: JSON with `monthly` array (6 entries) and `current_month_categories` array.

**Step 2: Verify dashboard in browser**

Open `http://localhost:5173` and check:
- 本月支出 shows a real number matching the sum of EXPENSE transactions in Feb 2026
- 本月收入 shows a real number (or $0 if no income this month)
- 支出趨勢 chart shows real monthly data for the last 6 months
- 分類佔比 donut shows real category breakdown with correct proportions
- 待處理發票 still shows 35 (unchanged)

**Step 3: Final commit (if any adjustments needed)**

```bash
git add -A
git commit -m "fix(dashboard): adjustments from manual verification"
```
