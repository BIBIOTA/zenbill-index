# Stock Daily Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add daily stock performance to the APP and Web Dashboard stock investment section.

**Architecture:** Extend the existing stock price refresh pipeline so backend stock quotes carry previous close and day-change fields, persist those fields on stock accounts, and expose them through the existing accounts API. APP and Web reuse shared TypeScript calculation helpers to render daily P&L for each currency summary and each stock row.

**Tech Stack:** Go, Gin, GORM, PostgreSQL migrations, Yahoo Finance chart API, React Native/Expo, React/Vite, TypeScript, TanStack Query.

---

## Repo Boundaries

This workspace contains nested Git repositories.

- Root repo: `/Users/yuki/projects/zen-bill`
  - Owns `app/`, `packages/shared/`, `docs/`, and root package files.
- Backend repo: `/Users/yuki/projects/zen-bill/backend`
  - Owns backend Go code and migrations.
- Frontend repo: `/Users/yuki/projects/zen-bill/frontend`
  - Owns Web UI code.

Commit in the repo that owns the modified files. Do not mix backend and frontend changes into a root commit.

## File Structure

Backend:

- Modify `backend/pkg/stockprice/provider.go`
  - Extend `Quote`.
  - Parse `previousClose`, `chartPreviousClose`, `regularMarketChange`, and `regularMarketChangePercent`.
- Modify `backend/pkg/stockprice/provider_test.go`
  - Unit-test quote parsing without network calls.
- Modify `backend/internal/domain/account.go`
  - Add nullable daily performance fields to `Account`.
- Modify `backend/internal/domain/repository.go`
  - Update `UpdateStockPrice` signature to accept daily performance fields.
- Modify `backend/internal/repository/account_repository.go`
  - Persist nullable daily performance fields.
- Create `backend/migrations/20260512_add_stock_daily_performance.sql`
  - Add nullable account columns.
- Modify backend tests that implement `AccountRepository`
  - Update mock signatures in usecase tests.
- Modify `backend/internal/usecase/stock_service.go`
  - Copy quote daily fields into account values and repository update call.
- Modify `backend/internal/usecase/stock_service_test.go`
  - Verify refresh writes daily performance fields.

Shared:

- Modify `packages/shared/package.json`
  - Add `test` script and `vitest` dev dependency because existing tests already import `vitest`.
- Modify `packages/shared/src/types/index.ts`
  - Add nullable daily performance fields to `Account`.
- Modify `packages/shared/src/utils/stockCalculations.ts`
  - Add daily performance calculation helpers.
- Create `packages/shared/src/utils/__tests__/stockCalculations.test.ts`
  - Unit-test individual and summary calculations.

APP:

- Modify `app/app/(tabs)/index.tsx`
  - Render daily performance in `StockInvestmentSection`.
  - Add update timestamp at bottom, matching Web behavior.

Web:

- Modify `frontend/src/pages/DashboardPage.tsx`
  - Render daily performance in `StockInvestmentSection`.

## Task 1: Backend Quote Parsing

**Files:**
- Modify: `backend/pkg/stockprice/provider.go`
- Modify: `backend/pkg/stockprice/provider_test.go`

- [ ] **Step 1: Write failing quote parsing tests**

Add these tests to `backend/pkg/stockprice/provider_test.go` after `TestExchangeToMarket`:

```go
func TestParseChartQuote_WithDailyPerformance(t *testing.T) {
	body := []byte(`{
		"chart": {
			"result": [{
				"meta": {
					"currency": "TWD",
					"symbol": "2330.TW",
					"regularMarketPrice": 580.0,
					"previousClose": 570.0,
					"regularMarketChange": 10.0,
					"regularMarketChangePercent": 1.7544
				}
			}],
			"error": null
		}
	}`)

	q, err := parseChartQuote("2330.TW", body, time.Date(2026, 5, 12, 9, 30, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("parseChartQuote returned error: %v", err)
	}

	if q.Symbol != "2330.TW" {
		t.Fatalf("Symbol = %q, want 2330.TW", q.Symbol)
	}
	if q.Price != 580.0 {
		t.Fatalf("Price = %v, want 580.0", q.Price)
	}
	if q.Currency != "TWD" {
		t.Fatalf("Currency = %q, want TWD", q.Currency)
	}
	if q.PreviousClosePrice == nil || *q.PreviousClosePrice != 570.0 {
		t.Fatalf("PreviousClosePrice = %v, want 570.0", q.PreviousClosePrice)
	}
	if q.DayChange == nil || *q.DayChange != 10.0 {
		t.Fatalf("DayChange = %v, want 10.0", q.DayChange)
	}
	if q.DayChangePercent == nil || *q.DayChangePercent != 1.7544 {
		t.Fatalf("DayChangePercent = %v, want 1.7544", q.DayChangePercent)
	}
}

func TestParseChartQuote_UsesChartPreviousCloseFallbackAndComputesChange(t *testing.T) {
	body := []byte(`{
		"chart": {
			"result": [{
				"meta": {
					"currency": "USD",
					"symbol": "AAPL",
					"regularMarketPrice": 195.0,
					"chartPreviousClose": 190.0
				}
			}],
			"error": null
		}
	}`)

	q, err := parseChartQuote("AAPL", body, time.Date(2026, 5, 12, 14, 30, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("parseChartQuote returned error: %v", err)
	}

	if q.PreviousClosePrice == nil || *q.PreviousClosePrice != 190.0 {
		t.Fatalf("PreviousClosePrice = %v, want 190.0", q.PreviousClosePrice)
	}
	if q.DayChange == nil || *q.DayChange != 5.0 {
		t.Fatalf("DayChange = %v, want 5.0", q.DayChange)
	}
	if q.DayChangePercent == nil || *q.DayChangePercent < 2.6315 || *q.DayChangePercent > 2.6316 {
		t.Fatalf("DayChangePercent = %v, want about 2.6316", q.DayChangePercent)
	}
}

func TestParseChartQuote_MissingPreviousCloseKeepsDailyFieldsNil(t *testing.T) {
	body := []byte(`{
		"chart": {
			"result": [{
				"meta": {
					"currency": "USD",
					"symbol": "AAPL",
					"regularMarketPrice": 195.0
				}
			}],
			"error": null
		}
	}`)

	q, err := parseChartQuote("AAPL", body, time.Date(2026, 5, 12, 14, 30, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("parseChartQuote returned error: %v", err)
	}

	if q.PreviousClosePrice != nil {
		t.Fatalf("PreviousClosePrice = %v, want nil", *q.PreviousClosePrice)
	}
	if q.DayChange != nil {
		t.Fatalf("DayChange = %v, want nil", *q.DayChange)
	}
	if q.DayChangePercent != nil {
		t.Fatalf("DayChangePercent = %v, want nil", *q.DayChangePercent)
	}
}
```

Update imports in `provider_test.go`:

```go
import (
	"testing"
	"time"
)
```

- [ ] **Step 2: Run the quote tests to verify they fail**

Run:

```bash
cd backend && go test ./pkg/stockprice/... -run 'TestParseChartQuote|TestExchangeToMarket' -v
```

Expected: FAIL with `undefined: parseChartQuote`.

- [ ] **Step 3: Implement quote parsing**

In `backend/pkg/stockprice/provider.go`, replace `Quote` with:

```go
// Quote holds the price data for a single stock.
type Quote struct {
	Symbol             string
	Price              float64
	Currency           string
	UpdatedAt          time.Time
	PreviousClosePrice *float64
	DayChange          *float64
	DayChangePercent   *float64
}
```

Replace `chartResponse` with:

```go
type chartResponse struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Currency                   string   `json:"currency"`
				Symbol                     string   `json:"symbol"`
				RegularMarketPrice        float64  `json:"regularMarketPrice"`
				PreviousClose             *float64 `json:"previousClose"`
				ChartPreviousClose        *float64 `json:"chartPreviousClose"`
				RegularMarketChange       *float64 `json:"regularMarketChange"`
				RegularMarketChangePercent *float64 `json:"regularMarketChangePercent"`
			} `json:"meta"`
		} `json:"result"`
		Error *struct {
			Code        string `json:"code"`
			Description string `json:"description"`
		} `json:"error"`
	} `json:"chart"`
}
```

Add this helper below `chartResponse`:

```go
func parseChartQuote(symbol string, body []byte, updatedAt time.Time) (*Quote, error) {
	var cr chartResponse
	if err := json.Unmarshal(body, &cr); err != nil {
		return nil, fmt.Errorf("parse response for %s: %w", symbol, err)
	}
	if cr.Chart.Error != nil {
		return nil, fmt.Errorf("fetch quote for %s: %s", symbol, cr.Chart.Error.Description)
	}
	if len(cr.Chart.Result) == 0 {
		return nil, fmt.Errorf("no chart data for %s", symbol)
	}

	meta := cr.Chart.Result[0].Meta
	previousClose := meta.PreviousClose
	if previousClose == nil {
		previousClose = meta.ChartPreviousClose
	}

	dayChange := meta.RegularMarketChange
	dayChangePercent := meta.RegularMarketChangePercent
	if previousClose != nil && *previousClose != 0 {
		if dayChange == nil {
			computed := meta.RegularMarketPrice - *previousClose
			dayChange = &computed
		}
		if dayChangePercent == nil && dayChange != nil {
			computed := *dayChange / *previousClose * 100
			dayChangePercent = &computed
		}
	}

	return &Quote{
		Symbol:             symbol,
		Price:              meta.RegularMarketPrice,
		Currency:           meta.Currency,
		UpdatedAt:          updatedAt,
		PreviousClosePrice: previousClose,
		DayChange:          dayChange,
		DayChangePercent:   dayChangePercent,
	}, nil
}
```

In `GetQuote`, replace the inline unmarshal block from `var cr chartResponse` through the `return &Quote{...}` with:

```go
return parseChartQuote(symbol, body, time.Now())
```

Run `gofmt`:

```bash
cd backend && gofmt -w pkg/stockprice/provider.go pkg/stockprice/provider_test.go
```

- [ ] **Step 4: Run quote tests to verify they pass**

Run:

```bash
cd backend && go test ./pkg/stockprice/... -run 'TestParseChartQuote|TestExchangeToMarket' -v
```

Expected: PASS.

- [ ] **Step 5: Commit backend quote parsing**

Run:

```bash
cd backend
git add pkg/stockprice/provider.go pkg/stockprice/provider_test.go
git commit -m "feat(stockprice): parse daily performance fields"
```

## Task 2: Backend Account Persistence

**Files:**
- Modify: `backend/internal/domain/account.go`
- Modify: `backend/internal/domain/repository.go`
- Modify: `backend/internal/repository/account_repository.go`
- Modify: `backend/internal/usecase/transaction_service_test.go`
- Modify: `backend/internal/usecase/payment_reminder_service_test.go`
- Create: `backend/migrations/20260512_add_stock_daily_performance.sql`

- [ ] **Step 1: Update the Account domain model**

In `backend/internal/domain/account.go`, add fields after `LastPrice`:

```go
	PreviousClosePrice *float64   `gorm:"type:decimal(19,4)" json:"previous_close_price"`
	DayChange          *float64   `gorm:"type:decimal(19,4)" json:"day_change"`
	DayChangePercent   *float64   `gorm:"type:decimal(9,4)" json:"day_change_percent"`
```

Keep `LastPriceAt` immediately after these fields:

```go
	LastPriceAt        *time.Time `json:"last_price_at"`
```

- [ ] **Step 2: Update repository interface**

In `backend/internal/domain/repository.go`, replace:

```go
	UpdateStockPrice(ctx context.Context, id uuid.UUID, lastPrice float64, lastPriceAt time.Time, balance float64) error
```

with:

```go
	UpdateStockPrice(ctx context.Context, id uuid.UUID, lastPrice float64, lastPriceAt time.Time, balance float64, previousClosePrice, dayChange, dayChangePercent *float64) error
```

- [ ] **Step 3: Update GORM repository persistence**

In `backend/internal/repository/account_repository.go`, replace `UpdateStockPrice` with:

```go
// UpdateStockPrice updates only price-related columns for a stock account
func (r *AccountRepositoryImpl) UpdateStockPrice(
	ctx context.Context,
	id uuid.UUID,
	lastPrice float64,
	lastPriceAt time.Time,
	balance float64,
	previousClosePrice, dayChange, dayChangePercent *float64,
) error {
	return r.db.WithContext(ctx).
		Model(&domain.Account{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"last_price":           lastPrice,
			"last_price_at":        lastPriceAt,
			"balance":              balance,
			"previous_close_price": previousClosePrice,
			"day_change":           dayChange,
			"day_change_percent":   dayChangePercent,
		}).Error
}
```

- [ ] **Step 4: Update test mocks**

In `backend/internal/usecase/transaction_service_test.go`, replace the mock method with:

```go
func (m *MockAccountRepository) UpdateStockPrice(ctx context.Context, id uuid.UUID, lastPrice float64, lastPriceAt time.Time, balance float64, previousClosePrice, dayChange, dayChangePercent *float64) error {
	args := m.Called(ctx, id, lastPrice, lastPriceAt, balance, previousClosePrice, dayChange, dayChangePercent)
	return args.Error(0)
}
```

In `backend/internal/usecase/payment_reminder_service_test.go`, replace the reminder mock method with:

```go
func (m *mockAccountRepoForReminder) UpdateStockPrice(_ context.Context, _ uuid.UUID, _ float64, _ time.Time, _ float64, _, _, _ *float64) error {
	return nil
}
```

- [ ] **Step 5: Add migration**

Create `backend/migrations/20260512_add_stock_daily_performance.sql`:

```sql
ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS previous_close_price DECIMAL(19,4),
    ADD COLUMN IF NOT EXISTS day_change DECIMAL(19,4),
    ADD COLUMN IF NOT EXISTS day_change_percent DECIMAL(9,4);
```

- [ ] **Step 6: Run backend compile-focused tests**

Run:

```bash
cd backend && go test ./internal/domain/... ./internal/usecase/... -run TestStockService_RefreshPrices -v
```

Expected: FAIL in `stock_service.go` because `UpdateStockPrice` is still called with the old signature.

- [ ] **Step 7: Commit persistence interface changes**

This commit is allowed to fail the usecase test because Task 3 completes the service behavior.

Run:

```bash
cd backend
gofmt -w internal/domain/account.go internal/domain/repository.go internal/repository/account_repository.go internal/usecase/transaction_service_test.go internal/usecase/payment_reminder_service_test.go
git add internal/domain/account.go internal/domain/repository.go internal/repository/account_repository.go internal/usecase/transaction_service_test.go internal/usecase/payment_reminder_service_test.go migrations/20260512_add_stock_daily_performance.sql
git commit -m "feat(accounts): add stock daily performance fields"
```

## Task 3: Backend RefreshPrices Writes Daily Performance

**Files:**
- Modify: `backend/internal/usecase/stock_service.go`
- Modify: `backend/internal/usecase/stock_service_test.go`

- [ ] **Step 1: Update failing RefreshPrices test expectations**

In `backend/internal/usecase/stock_service_test.go`, replace `TestStockService_RefreshPrices` with:

```go
func TestStockService_RefreshPrices(t *testing.T) {
	acctRepo := new(MockAccountRepository)
	txRepo := new(MockTransactionRepository)
	provider := new(MockPriceProvider)
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	svc := NewStockService(acctRepo, txRepo, nil, provider, logger)

	userID := uuid.New()
	twID := uuid.New()
	usID := uuid.New()
	stocks := []domain.Account{
		{ID: twID, StockSymbol: "2330", StockMarket: "TW", SharesHeld: 100, LastPrice: 570},
		{ID: usID, StockSymbol: "AAPL", StockMarket: "US", SharesHeld: 50, LastPrice: 190},
	}

	twPreviousClose := 570.0
	twDayChange := 10.0
	twDayChangePercent := 1.7544
	usPreviousClose := 190.0
	usDayChange := 5.5
	usDayChangePercent := 2.8947

	acctRepo.On("FindStocksByUserID", mock.Anything, userID).Return(stocks, nil)
	provider.On("GetQuotes", mock.Anything, []string{"2330.TW", "AAPL"}).Return(
		map[string]*stockprice.Quote{
			"2330.TW": {
				Symbol:             "2330.TW",
				Price:              580.0,
				UpdatedAt:          time.Now(),
				PreviousClosePrice: &twPreviousClose,
				DayChange:          &twDayChange,
				DayChangePercent:   &twDayChangePercent,
			},
			"AAPL": {
				Symbol:             "AAPL",
				Price:              195.5,
				UpdatedAt:          time.Now(),
				PreviousClosePrice: &usPreviousClose,
				DayChange:          &usDayChange,
				DayChangePercent:   &usDayChangePercent,
			},
		}, nil,
	)
	acctRepo.On("UpdateStockPrice", mock.Anything, twID, 580.0, mock.AnythingOfType("time.Time"), 58000.0, &twPreviousClose, &twDayChange, &twDayChangePercent).Return(nil).Once()
	acctRepo.On("UpdateStockPrice", mock.Anything, usID, 195.5, mock.AnythingOfType("time.Time"), 9775.0, &usPreviousClose, &usDayChange, &usDayChangePercent).Return(nil).Once()

	result, err := svc.RefreshPrices(context.Background(), userID)

	assert.NoError(t, err)
	assert.Len(t, result, 2)
	assert.Equal(t, 580.0, result[0].LastPrice)
	assert.Equal(t, 58000.0, result[0].Balance)
	assert.Equal(t, &twPreviousClose, result[0].PreviousClosePrice)
	assert.Equal(t, &twDayChange, result[0].DayChange)
	assert.Equal(t, &twDayChangePercent, result[0].DayChangePercent)
	assert.Equal(t, 195.5, result[1].LastPrice)
	assert.Equal(t, &usPreviousClose, result[1].PreviousClosePrice)
	assert.Equal(t, &usDayChange, result[1].DayChange)
	assert.Equal(t, &usDayChangePercent, result[1].DayChangePercent)
	provider.AssertExpectations(t)
	acctRepo.AssertExpectations(t)
}
```

Add this test below it:

```go
func TestStockService_RefreshPrices_AllowsMissingDailyPerformance(t *testing.T) {
	acctRepo := new(MockAccountRepository)
	txRepo := new(MockTransactionRepository)
	provider := new(MockPriceProvider)
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	svc := NewStockService(acctRepo, txRepo, nil, provider, logger)

	userID := uuid.New()
	stockID := uuid.New()
	stocks := []domain.Account{
		{ID: stockID, StockSymbol: "AAPL", StockMarket: "US", SharesHeld: 10, LastPrice: 190},
	}

	acctRepo.On("FindStocksByUserID", mock.Anything, userID).Return(stocks, nil)
	provider.On("GetQuotes", mock.Anything, []string{"AAPL"}).Return(
		map[string]*stockprice.Quote{
			"AAPL": {Symbol: "AAPL", Price: 195.0, UpdatedAt: time.Now()},
		}, nil,
	)
	acctRepo.On("UpdateStockPrice", mock.Anything, stockID, 195.0, mock.AnythingOfType("time.Time"), 1950.0, (*float64)(nil), (*float64)(nil), (*float64)(nil)).Return(nil).Once()

	result, err := svc.RefreshPrices(context.Background(), userID)

	assert.NoError(t, err)
	assert.Len(t, result, 1)
	assert.Equal(t, 195.0, result[0].LastPrice)
	assert.Nil(t, result[0].PreviousClosePrice)
	assert.Nil(t, result[0].DayChange)
	assert.Nil(t, result[0].DayChangePercent)
	acctRepo.AssertExpectations(t)
	provider.AssertExpectations(t)
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend && go test ./internal/usecase/... -run 'TestStockService_RefreshPrices' -v
```

Expected: FAIL because `RefreshPrices` does not set daily fields or call `UpdateStockPrice` with the new arguments.

- [ ] **Step 3: Implement service daily field propagation**

In `backend/internal/usecase/stock_service.go`, replace the update block inside the `for i := range stocks` loop with:

```go
		stocks[i].LastPrice = q.Price
		stocks[i].LastPriceAt = &now
		stocks[i].PreviousClosePrice = q.PreviousClosePrice
		stocks[i].DayChange = q.DayChange
		stocks[i].DayChangePercent = q.DayChangePercent
		stocks[i].Balance = stocks[i].SharesHeld * q.Price
		if err := s.acctRepo.UpdateStockPrice(
			ctx,
			stocks[i].ID,
			q.Price,
			now,
			stocks[i].Balance,
			q.PreviousClosePrice,
			q.DayChange,
			q.DayChangePercent,
		); err != nil {
			s.logger.Error("failed to update stock price",
				"symbol", stocks[i].StockSymbol, "error", err)
		}
```

Run `gofmt`:

```bash
cd backend && gofmt -w internal/usecase/stock_service.go internal/usecase/stock_service_test.go
```

- [ ] **Step 4: Run usecase stock tests**

Run:

```bash
cd backend && go test ./internal/usecase/... -run 'TestStockService' -v
```

Expected: PASS.

- [ ] **Step 5: Run stockprice tests**

Run:

```bash
cd backend && go test ./pkg/stockprice/... -v
```

Expected: PASS.

- [ ] **Step 6: Commit backend refresh behavior**

Run:

```bash
cd backend
git add internal/usecase/stock_service.go internal/usecase/stock_service_test.go
git commit -m "feat(stocks): persist refreshed daily performance"
```

## Task 4: Shared Types And Calculations

**Files:**
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/utils/stockCalculations.ts`
- Create: `packages/shared/src/utils/__tests__/stockCalculations.test.ts`

- [ ] **Step 1: Add shared test script and Vitest dependency**

Replace `packages/shared/package.json` with:

```json
{
  "name": "@zenbill/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.90.21",
    "zustand": "^5.0.11"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^3.0.0"
  },
  "peerDependencies": {
    "react": ">=18"
  }
}
```

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` updates with `vitest`.

- [ ] **Step 2: Add Account daily fields to shared type**

In `packages/shared/src/types/index.ts`, add these fields after `last_price: number`:

```ts
  previous_close_price: number | null
  day_change: number | null
  day_change_percent: number | null
```

Keep `last_price_at: string | null` after them.

- [ ] **Step 3: Write failing shared calculation tests**

Create `packages/shared/src/utils/__tests__/stockCalculations.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Account } from '../../types'
import {
  calculateStockDailyPerformance,
  calculateStockDailySummary,
} from '../stockCalculations'

function stock(overrides: Partial<Account>): Account {
  return {
    id: 'stock-1',
    user_id: 'user-1',
    name: '台積電',
    type: 'STOCK',
    currency: 'TWD',
    balance: 58000,
    bank_id: null,
    passbook_number: '',
    closing_day: null,
    payment_due_day: null,
    auto_pay_from_id: null,
    auto_pay_enabled: false,
    stock_symbol: '2330.TW',
    stock_market: 'TW',
    shares_held: 100,
    avg_cost_price: 500,
    last_price: 580,
    previous_close_price: 570,
    day_change: 10,
    day_change_percent: 1.7544,
    last_price_at: '2026-05-12T09:30:00Z',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-12T09:30:00Z',
    ...overrides,
  }
}

describe('calculateStockDailyPerformance', () => {
  it('calculates daily pnl from day change and shares', () => {
    expect(calculateStockDailyPerformance(stock({}))).toEqual({
      pnl: 1000,
      pnlPercent: 1.7544,
      previousMarketValue: 57000,
    })
  })

  it('returns null when previous close is missing', () => {
    expect(calculateStockDailyPerformance(stock({ previous_close_price: null }))).toBeNull()
  })

  it('returns null when day change is missing', () => {
    expect(calculateStockDailyPerformance(stock({ day_change: null }))).toBeNull()
  })
})

describe('calculateStockDailySummary', () => {
  it('aggregates only stocks with complete daily performance data', () => {
    const result = calculateStockDailySummary([
      stock({ id: 'tw-1', currency: 'TWD', shares_held: 100, previous_close_price: 570, day_change: 10 }),
      stock({ id: 'tw-2', currency: 'TWD', shares_held: 10, previous_close_price: 100, day_change: -2 }),
      stock({ id: 'tw-3', currency: 'TWD', shares_held: 10, previous_close_price: null, day_change: 3 }),
    ])

    expect(result).toEqual({
      pnl: 980,
      pnlPercent: 1.6896551724137931,
      previousMarketValue: 58000,
      includedCount: 2,
    })
  })

  it('returns null when no stock has complete daily performance data', () => {
    expect(calculateStockDailySummary([
      stock({ previous_close_price: null }),
      stock({ day_change: null }),
    ])).toBeNull()
  })
})
```

- [ ] **Step 4: Run shared tests to verify they fail**

Run:

```bash
pnpm --filter @zenbill/shared test
```

Expected: FAIL with missing exported functions.

- [ ] **Step 5: Implement shared calculation helpers**

In `packages/shared/src/utils/stockCalculations.ts`, add after `calculateStockPnL`:

```ts
export interface StockDailyPerformance {
  pnl: number
  pnlPercent: number
  previousMarketValue: number
}

export interface StockDailySummary extends StockDailyPerformance {
  includedCount: number
}

type DailyStockFields = Pick<
  Account,
  'shares_held' | 'previous_close_price' | 'day_change' | 'day_change_percent'
>

export function calculateStockDailyPerformance(account: DailyStockFields): StockDailyPerformance | null {
  if (
    account.previous_close_price == null ||
    account.day_change == null ||
    account.previous_close_price <= 0
  ) {
    return null
  }

  const previousMarketValue = account.previous_close_price * account.shares_held
  const pnl = account.day_change * account.shares_held
  const pnlPercent = account.day_change_percent ?? (pnl / previousMarketValue) * 100

  return { pnl, pnlPercent, previousMarketValue }
}

export function calculateStockDailySummary(accounts: DailyStockFields[]): StockDailySummary | null {
  let pnl = 0
  let previousMarketValue = 0
  let includedCount = 0

  for (const account of accounts) {
    const daily = calculateStockDailyPerformance(account)
    if (!daily) continue
    pnl += daily.pnl
    previousMarketValue += daily.previousMarketValue
    includedCount += 1
  }

  if (includedCount === 0 || previousMarketValue <= 0) return null

  return {
    pnl,
    pnlPercent: (pnl / previousMarketValue) * 100,
    previousMarketValue,
    includedCount,
  }
}
```

- [ ] **Step 6: Run shared tests and typecheck**

Run:

```bash
pnpm --filter @zenbill/shared test
pnpm --filter @zenbill/shared typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit shared calculations**

Run:

```bash
git add packages/shared/package.json packages/shared/src/types/index.ts packages/shared/src/utils/stockCalculations.ts packages/shared/src/utils/__tests__/stockCalculations.test.ts pnpm-lock.yaml
git commit -m "feat(shared): calculate stock daily performance"
```

## Task 5: Web Dashboard Daily Performance UI

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Update Web imports**

In `frontend/src/pages/DashboardPage.tsx`, add these imports from `@zenbill/shared`:

```ts
  calculateStockDailyPerformance,
  calculateStockDailySummary,
```

The shared import block should include both names next to `calculateStockPnL`.

- [ ] **Step 2: Add Web display helpers**

Inside `StockInvestmentSection`, after `lastUpdated`, add:

```ts
  const formatSignedMoney = (currency: string, value: number) => {
    const sign = value > 0 ? '+' : value < 0 ? '-' : ''
    return `${sign}${getCurrencySymbol(currency)}${Math.abs(value).toLocaleString()}`
  }

  const performanceClass = (value: number | null) => {
    if (value == null || value === 0) return 'text-[var(--text-muted)]'
    return value > 0 ? 'text-emerald-400' : 'text-red-400'
  }
```

- [ ] **Step 3: Render daily summary for each currency**

In the `Object.entries(byCurrency).map(...)` currency block, before `return`, add:

```ts
          const daily = calculateStockDailySummary(stockAccounts.filter(s => (s.currency || 'TWD') === cur))
```

Inside the currency summary `<div key={cur}>`, after the existing cumulative P&L `<p>`, add:

```tsx
              <p className={`text-xs tabular-nums ${performanceClass(daily?.pnl ?? null)}`}>
                今日 {daily
                  ? `${formatSignedMoney(cur, daily.pnl)} (${daily.pnlPercent >= 0 ? '+' : ''}${daily.pnlPercent.toFixed(1)}%)`
                  : '--'}
              </p>
```

- [ ] **Step 4: Render daily performance for each stock**

Inside `stockAccounts.map(stock => { ... })`, after:

```ts
          const { pnl, pnlPercent } = calculateStockPnL(stock)
```

add:

```ts
          const daily = calculateStockDailyPerformance(stock)
```

Inside the stock row right-hand `<div className="text-right">`, after the existing cumulative P&L `<p>`, add:

```tsx
                <p className={`text-xs tabular-nums ${performanceClass(daily?.pnl ?? null)}`}>
                  今日 {daily
                    ? `${formatSignedMoney(stock.currency, daily.pnl)} (${daily.pnlPercent >= 0 ? '+' : ''}${daily.pnlPercent.toFixed(1)}%)`
                    : '--'}
                </p>
```

- [ ] **Step 5: Run Web build**

Run:

```bash
cd frontend && pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit Web UI**

Run:

```bash
cd frontend
git add src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): show stock daily performance"
```

## Task 6: APP Dashboard Daily Performance UI

**Files:**
- Modify: `app/app/(tabs)/index.tsx`

- [ ] **Step 1: Update APP imports**

In `app/app/(tabs)/index.tsx`, add these imports from `@zenbill/shared`:

```ts
  calculateStockPnL,
  calculateStockDailyPerformance,
  calculateStockDailySummary,
```

APP currently calculates cumulative P&L inline. This task switches it to the shared helper for consistency.

- [ ] **Step 2: Add APP display helpers**

Inside `StockInvestmentSection`, after `const refreshPrices = useRefreshStockPrices()`, add:

```ts
  const formatSignedMoney = (currency: string, value: number) => {
    const sign = value > 0 ? '+' : value < 0 ? '-' : ''
    return `${sign}${getCurrencySymbol(currency)}${Math.abs(value).toLocaleString()}`
  }

  const performanceColor = (value: number | null) => {
    if (value == null || value === 0) return '#94a3b8'
    return value > 0 ? '#10b981' : '#ef4444'
  }

  const lastUpdated = stockAccounts
    .filter(s => s.last_price_at)
    .sort((a, b) => new Date(b.last_price_at!).getTime() - new Date(a.last_price_at!).getTime())[0]
    ?.last_price_at
```

- [ ] **Step 3: Render APP daily summary for each currency**

In `Object.entries(byCurrency).map(([cur, { marketValue, totalCost }]) => { ... })`, before `return`, add:

```ts
        const daily = calculateStockDailySummary(stockAccounts.filter(s => (s.currency || 'TWD') === cur))
```

After the existing cumulative P&L `<Text>`, add:

```tsx
            <Text style={{ fontSize: 12, color: performanceColor(daily?.pnl ?? null) }}>
              今日 {daily
                ? `${formatSignedMoney(cur, daily.pnl)} (${daily.pnlPercent >= 0 ? '+' : ''}${daily.pnlPercent.toFixed(1)}%)`
                : '--'}
            </Text>
```

- [ ] **Step 4: Render APP daily performance for each stock**

Inside `stockAccounts.map(stock => { ... })`, replace the inline cumulative P&L calculation:

```ts
        const pnl = (stock.last_price - stock.avg_cost_price) * stock.shares_held
        const pnlPct = stock.avg_cost_price > 0
          ? ((stock.last_price - stock.avg_cost_price) / stock.avg_cost_price) * 100
          : 0
```

with:

```ts
        const { pnl, pnlPercent } = calculateStockPnL(stock)
        const daily = calculateStockDailyPerformance(stock)
```

Replace `pnlPct` in the cumulative percentage text with `pnlPercent`:

```tsx
                {pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
```

After the cumulative percentage `<Text>`, add:

```tsx
              <Text style={{ fontSize: 11, color: performanceColor(daily?.pnl ?? null) }}>
                今日 {daily
                  ? `${formatSignedMoney(stock.currency, daily.pnl)} (${daily.pnlPercent >= 0 ? '+' : ''}${daily.pnlPercent.toFixed(1)}%)`
                  : '--'}
              </Text>
```

- [ ] **Step 5: Add APP update timestamp**

Before the closing `</View>` of `StockInvestmentSection`, after the stock account list, add:

```tsx
      {lastUpdated && (
        <Text style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
          股價更新於 {new Date(lastUpdated).toLocaleString('zh-TW')}
        </Text>
      )}
```

- [ ] **Step 6: Run APP TypeScript check**

APP has no package-local `typecheck` script. Run TypeScript directly:

```bash
cd app && pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit APP UI**

Run:

```bash
git add app/app/\(tabs\)/index.tsx
git commit -m "feat(app): show stock daily performance"
```

## Task 7: End-To-End Verification

**Files:**
- No planned file changes.

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
cd backend && go test ./pkg/stockprice/... ./internal/domain/... ./internal/usecase/... -run 'TestParseChartQuote|TestExchangeToMarket|TestStockService' -v
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

Run:

```bash
cd backend && go build ./...
```

Expected: PASS. If this fails because local CGO flags for Tesseract/Leptonica are missing, set:

```bash
export CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include"
export CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib"
```

Then rerun `cd backend && go build ./...`.

- [ ] **Step 3: Run shared tests and typecheck**

Run:

```bash
pnpm --filter @zenbill/shared test
pnpm --filter @zenbill/shared typecheck
```

Expected: PASS.

- [ ] **Step 4: Run Web build**

Run:

```bash
cd frontend && pnpm build
```

Expected: PASS.

- [ ] **Step 5: Run APP TypeScript check**

Run:

```bash
cd app && pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Manual verification with seeded or real stock data**

Use an account response containing a stock with:

```json
{
  "type": "STOCK",
  "currency": "TWD",
  "shares_held": 100,
  "avg_cost_price": 500,
  "last_price": 580,
  "previous_close_price": 570,
  "day_change": 10,
  "day_change_percent": 1.7544,
  "last_price_at": "2026-05-12T09:30:00Z"
}
```

Expected UI:

- Currency summary shows total market value and cumulative P&L as before.
- Currency summary adds `今日 +$1,000 (+1.8%)`.
- Stock row adds `今日 +$1,000 (+1.8%)`.
- Positive values are green.
- If `previous_close_price`, `day_change`, and `day_change_percent` are `null`, the same locations show `今日 --`.

## Self-Review

Spec coverage:

- Backend quote parsing maps Yahoo fields into `Quote`: Task 1.
- Nullable account persistence and migration: Task 2.
- `RefreshPrices` writes daily performance while preserving cached fallback behavior: Task 3.
- Shared individual and summary calculations: Task 4.
- Web and APP stock investment sections show summary and row-level daily performance: Tasks 5 and 6.
- Verification commands and manual UI checks: Task 7.

Placeholder scan:

- The plan contains no placeholder markers, open-ended implementation steps, or unspecified test expectations.

Type consistency:

- Backend field names are `PreviousClosePrice`, `DayChange`, `DayChangePercent`.
- JSON and TypeScript field names are `previous_close_price`, `day_change`, `day_change_percent`.
- Shared helper names are `calculateStockDailyPerformance` and `calculateStockDailySummary`.
