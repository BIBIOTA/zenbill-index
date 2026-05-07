# Stock Account Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add STOCK account type with Yahoo Finance real-time pricing, buy/sell operations, and dedicated frontend display sections.

**Architecture:** Extend the existing Account entity with stock-specific fields (same pattern as credit card fields). New StockService usecase handles buy/sell/price-refresh logic. Frontend adds a dedicated "Stock Investment" section on dashboard and STOCK category on accounts page.

**Tech Stack:** Go 1.25, GORM, Gin, `github.com/piquette/finance-go` (Yahoo Finance), React, React Native (Expo), `@zenbill/shared` types

**Design Doc:** `docs/plans/2026-03-15-stock-account-design.md`

---

## Task 1: Domain Model — Add Stock Fields to Account Entity

**Files:**
- Modify: `backend/internal/domain/account.go`

**Step 1: Add AccountTypeStock constant and stock fields**

Add after `AccountTypeCrypto`:

```go
AccountTypeStock  AccountType = "STOCK"  // 股票
```

Add stock-specific fields to the Account struct after the credit card fields block:

```go
// 股票專屬欄位 (Stock Specific Fields)
StockSymbol  string     `gorm:"type:varchar(20)" json:"stock_symbol,omitempty"`  // 股票代號 (e.g. "2330.TW", "AAPL")
StockMarket  string     `gorm:"type:varchar(5)" json:"stock_market,omitempty"`   // 市場 ("TW" / "US")
SharesHeld   float64    `gorm:"type:decimal(19,6);default:0" json:"shares_held"` // 持有股數
AvgCostPrice float64    `gorm:"type:decimal(19,4);default:0" json:"avg_cost_price"` // 平均成本
LastPrice    float64    `gorm:"type:decimal(19,4);default:0" json:"last_price"`  // 最新股價
LastPriceAt  *time.Time `json:"last_price_at"`                                   // 股價更新時間
```

**Step 2: Add domain methods**

```go
// IsStock checks if this account is a stock account
func (a *Account) IsStock() bool {
	return a.Type == AccountTypeStock
}

// MarketValue returns the current market value (shares × last price)
func (a *Account) MarketValue() float64 {
	return a.SharesHeld * a.LastPrice
}

// UnrealizedPnL returns the unrealized profit/loss
func (a *Account) UnrealizedPnL() float64 {
	return (a.LastPrice - a.AvgCostPrice) * a.SharesHeld
}

// UnrealizedPnLPercent returns the unrealized P&L as a percentage
func (a *Account) UnrealizedPnLPercent() float64 {
	if a.AvgCostPrice == 0 {
		return 0
	}
	return (a.LastPrice - a.AvgCostPrice) / a.AvgCostPrice * 100
}

// RecalculateAvgCost updates the weighted average cost after a buy
func (a *Account) RecalculateAvgCost(newShares, pricePerShare float64) {
	totalCost := a.SharesHeld*a.AvgCostPrice + newShares*pricePerShare
	a.SharesHeld += newShares
	if a.SharesHeld > 0 {
		a.AvgCostPrice = totalCost / a.SharesHeld
	}
}
```

**Step 3: Run build to verify compilation**

Run: `cd backend && go build ./...`
Expected: BUILD SUCCESS (may need CGO flags set)

**Step 4: Commit**

```bash
git add backend/internal/domain/account.go
git commit -m "feat(domain): add STOCK account type with stock-specific fields"
```

---

## Task 2: Domain Tests — Stock Account Methods

**Files:**
- Modify: `backend/internal/domain/account_test.go`

**Step 1: Write tests for new stock methods**

Append to `account_test.go`:

```go
func TestAccount_IsStock(t *testing.T) {
	account := &Account{
		ID:   uuid.New(),
		Type: AccountTypeStock,
	}
	if !account.IsStock() {
		t.Error("Expected account to be stock")
	}

	bankAccount := &Account{
		ID:   uuid.New(),
		Type: AccountTypeBank,
	}
	if bankAccount.IsStock() {
		t.Error("Expected bank account to not be stock")
	}
}

func TestAccount_MarketValue(t *testing.T) {
	account := &Account{
		SharesHeld: 100,
		LastPrice:  580.0,
	}
	expected := 58000.0
	if account.MarketValue() != expected {
		t.Errorf("Expected market value %.2f, got %.2f", expected, account.MarketValue())
	}
}

func TestAccount_UnrealizedPnL(t *testing.T) {
	account := &Account{
		SharesHeld:   100,
		AvgCostPrice: 500.0,
		LastPrice:    580.0,
	}
	expected := 8000.0 // (580 - 500) * 100
	if account.UnrealizedPnL() != expected {
		t.Errorf("Expected PnL %.2f, got %.2f", expected, account.UnrealizedPnL())
	}
}

func TestAccount_UnrealizedPnLPercent(t *testing.T) {
	account := &Account{
		SharesHeld:   100,
		AvgCostPrice: 500.0,
		LastPrice:    580.0,
	}
	expected := 16.0 // (580-500)/500 * 100
	if account.UnrealizedPnLPercent() != expected {
		t.Errorf("Expected PnL%% %.2f, got %.2f", expected, account.UnrealizedPnLPercent())
	}

	// Zero cost edge case
	zeroCost := &Account{AvgCostPrice: 0, LastPrice: 100, SharesHeld: 10}
	if zeroCost.UnrealizedPnLPercent() != 0 {
		t.Error("Expected 0% for zero cost")
	}
}

func TestAccount_RecalculateAvgCost(t *testing.T) {
	account := &Account{
		SharesHeld:   100,
		AvgCostPrice: 500.0,
	}
	// Buy 50 more shares at 600
	account.RecalculateAvgCost(50, 600.0)

	if account.SharesHeld != 150 {
		t.Errorf("Expected 150 shares, got %.2f", account.SharesHeld)
	}
	// (100*500 + 50*600) / 150 = 80000/150 ≈ 533.33
	expectedAvg := (100*500.0 + 50*600.0) / 150.0
	if account.AvgCostPrice != expectedAvg {
		t.Errorf("Expected avg cost %.4f, got %.4f", expectedAvg, account.AvgCostPrice)
	}
}
```

**Step 2: Run tests**

Run: `cd backend && go test ./internal/domain/... -v -run "TestAccount_IsStock|TestAccount_MarketValue|TestAccount_UnrealizedPnL|TestAccount_RecalculateAvgCost"`
Expected: PASS (all new tests)

**Step 3: Commit**

```bash
git add backend/internal/domain/account_test.go
git commit -m "test(domain): add stock account method tests"
```

---

## Task 3: Repository — Add FindStocksByUserID Method

**Files:**
- Modify: `backend/internal/domain/repository.go` (interface)
- Modify: `backend/internal/repository/account_repository.go` (implementation)

**Step 1: Add interface method to AccountRepository**

In `backend/internal/domain/repository.go`, add to the `AccountRepository` interface:

```go
// Stock specific
FindStocksByUserID(ctx context.Context, userID uuid.UUID) ([]Account, error)
```

**Step 2: Implement in repository**

In `backend/internal/repository/account_repository.go`, add:

```go
// FindStocksByUserID finds all STOCK accounts with shares > 0 for a user
func (r *AccountRepositoryImpl) FindStocksByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Account, error) {
	var accounts []domain.Account
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND type = ? AND shares_held > 0", userID, domain.AccountTypeStock).
		Order("created_at ASC").
		Find(&accounts).Error
	if err != nil {
		return nil, err
	}
	return accounts, nil
}
```

**Step 3: Update all MockAccountRepository implementations**

Any existing mock of `AccountRepository` (e.g., in `backend/internal/usecase/transaction_service_test.go` and other test files) needs the new method stub. Search for `MockAccountRepository` across the codebase and add:

```go
func (m *MockAccountRepository) FindStocksByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Account, error) {
	args := m.Called(ctx, userID)
	return args.Get(0).([]domain.Account), args.Error(1)
}
```

**Step 4: Run build**

Run: `cd backend && go build ./...`
Expected: BUILD SUCCESS

**Step 5: Commit**

```bash
git add backend/internal/domain/repository.go backend/internal/repository/account_repository.go
git add -u  # catch mock updates in test files
git commit -m "feat(repo): add FindStocksByUserID for stock account queries"
```

---

## Task 4: Stock Price Provider — Yahoo Finance Integration

**Files:**
- Create: `backend/pkg/stockprice/provider.go`

**Step 1: Add finance-go dependency**

Run: `cd backend && go get github.com/piquette/finance-go`

**Step 2: Create stock price provider**

```go
package stockprice

import (
	"context"
	"fmt"
	"time"

	"github.com/piquette/finance-go/quote"
)

// Quote holds the price data for a single stock.
type Quote struct {
	Symbol    string
	Price     float64
	Currency  string
	UpdatedAt time.Time
}

// Provider fetches real-time stock quotes.
type Provider interface {
	GetQuote(ctx context.Context, symbol string) (*Quote, error)
	GetQuotes(ctx context.Context, symbols []string) (map[string]*Quote, error)
}

// YahooProvider implements Provider using Yahoo Finance.
type YahooProvider struct{}

// NewYahooProvider creates a new Yahoo Finance provider.
func NewYahooProvider() *YahooProvider {
	return &YahooProvider{}
}

// GetQuote fetches a single stock quote.
func (p *YahooProvider) GetQuote(_ context.Context, symbol string) (*Quote, error) {
	q, err := quote.Get(symbol)
	if err != nil {
		return nil, fmt.Errorf("fetch quote for %s: %w", symbol, err)
	}
	if q == nil {
		return nil, fmt.Errorf("no quote data for %s", symbol)
	}
	return &Quote{
		Symbol:    symbol,
		Price:     q.RegularMarketPrice,
		Currency:  q.CurrencyID,
		UpdatedAt: time.Now(),
	}, nil
}

// GetQuotes fetches multiple stock quotes. Returns partial results on individual failures.
func (p *YahooProvider) GetQuotes(ctx context.Context, symbols []string) (map[string]*Quote, error) {
	results := make(map[string]*Quote, len(symbols))
	for _, sym := range symbols {
		q, err := p.GetQuote(ctx, sym)
		if err != nil {
			continue // skip failed quotes, return partial results
		}
		results[sym] = q
	}
	if len(results) == 0 && len(symbols) > 0 {
		return nil, fmt.Errorf("failed to fetch any quotes")
	}
	return results, nil
}
```

**Step 3: Run build**

Run: `cd backend && go build ./pkg/stockprice/...`
Expected: BUILD SUCCESS

**Step 4: Commit**

```bash
git add backend/pkg/stockprice/
git commit -m "feat(stockprice): add Yahoo Finance quote provider"
```

---

## Task 5: StockService Usecase — Buy, Sell, RefreshPrices

**Files:**
- Create: `backend/internal/usecase/stock_service.go`

**Step 1: Create StockService**

```go
package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"github.com/yukiota/zenbill/pkg/stockprice"
)

// StockService handles stock buy/sell operations and price refresh.
type StockService struct {
	acctRepo      domain.AccountRepository
	txRepo        domain.TransactionRepository
	txMgr         domain.TxManager
	priceProvider stockprice.Provider
	logger        *slog.Logger

	// Rate limiting: userID → last refresh time
	mu            sync.Mutex
	lastRefresh   map[uuid.UUID]time.Time
}

// NewStockService creates a new StockService.
func NewStockService(
	acctRepo domain.AccountRepository,
	txRepo domain.TransactionRepository,
	txMgr domain.TxManager,
	priceProvider stockprice.Provider,
	logger *slog.Logger,
) *StockService {
	return &StockService{
		acctRepo:      acctRepo,
		txRepo:        txRepo,
		txMgr:         txMgr,
		priceProvider: priceProvider,
		logger:        logger,
		lastRefresh:   make(map[uuid.UUID]time.Time),
	}
}

// BuyRequest holds the parameters for a stock purchase.
type BuyRequest struct {
	UserID        uuid.UUID
	AccountID     *uuid.UUID // nil = create new account
	StockSymbol   string
	StockMarket   string     // "TW" or "US"
	Shares        float64
	PricePerShare float64
	FromAccountID uuid.UUID  // funding source (bank/cash)
}

// SellRequest holds the parameters for a stock sale.
type SellRequest struct {
	UserID      uuid.UUID
	AccountID   uuid.UUID
	Shares      float64
	PricePerShare float64
	ToAccountID uuid.UUID // receiving account (bank/cash)
}

// Buy executes a stock purchase within a DB transaction.
func (s *StockService) Buy(ctx context.Context, req BuyRequest) (*domain.Account, error) {
	totalAmount := req.Shares * req.PricePerShare

	currency := "TWD"
	if req.StockMarket == "US" {
		currency = "USD"
	}

	var stockAccount *domain.Account

	run := func(repos domain.TxRepos) error {
		// 1. Get or create stock account
		if req.AccountID != nil {
			acct, err := repos.AccountRepo.FindByID(ctx, *req.AccountID)
			if err != nil {
				return fmt.Errorf("find stock account: %w", err)
			}
			if acct.Type != domain.AccountTypeStock {
				return fmt.Errorf("account %s is not a stock account", req.AccountID)
			}
			stockAccount = acct
		} else {
			stockAccount = &domain.Account{
				UserID:       req.UserID,
				Name:         req.StockSymbol,
				Type:         domain.AccountTypeStock,
				Currency:     currency,
				StockSymbol:  req.StockSymbol,
				StockMarket:  req.StockMarket,
				SharesHeld:   0,
				AvgCostPrice: 0,
			}
			if err := repos.AccountRepo.Create(ctx, stockAccount); err != nil {
				return fmt.Errorf("create stock account: %w", err)
			}
		}

		// 2. Update stock account: recalculate avg cost, add shares, set balance
		stockAccount.RecalculateAvgCost(req.Shares, req.PricePerShare)
		stockAccount.Balance = stockAccount.SharesHeld * req.PricePerShare
		if err := repos.AccountRepo.Update(ctx, stockAccount); err != nil {
			return fmt.Errorf("update stock account: %w", err)
		}

		// 3. Deduct from funding account
		if err := repos.AccountRepo.UpdateBalance(ctx, req.FromAccountID, -totalAmount); err != nil {
			return fmt.Errorf("deduct from funding account: %w", err)
		}

		// 4. Create transfer transaction (from bank → stock)
		tx := &domain.Transaction{
			UserID:          req.UserID,
			AccountID:       req.FromAccountID,
			TargetAccountID: &stockAccount.ID,
			Type:            domain.TransactionTypeTransfer,
			Amount:          totalAmount,
			OccurredAt:      time.Now(),
			Note:            fmt.Sprintf("Buy %g shares of %s @ %.2f", req.Shares, req.StockSymbol, req.PricePerShare),
		}
		if err := repos.TransactionRepo.Create(ctx, tx); err != nil {
			return fmt.Errorf("create buy transaction: %w", err)
		}

		return nil
	}

	if s.txMgr != nil {
		if err := s.txMgr.WithTransaction(ctx, run); err != nil {
			return nil, err
		}
	} else {
		repos := domain.TxRepos{AccountRepo: s.acctRepo, TransactionRepo: s.txRepo}
		if err := run(repos); err != nil {
			return nil, err
		}
	}

	return stockAccount, nil
}

// Sell executes a stock sale within a DB transaction.
func (s *StockService) Sell(ctx context.Context, req SellRequest) (*domain.Account, error) {
	totalAmount := req.Shares * req.PricePerShare

	var stockAccount *domain.Account

	run := func(repos domain.TxRepos) error {
		// 1. Get stock account
		acct, err := repos.AccountRepo.FindByID(ctx, req.AccountID)
		if err != nil {
			return fmt.Errorf("find stock account: %w", err)
		}
		if acct.Type != domain.AccountTypeStock {
			return fmt.Errorf("account %s is not a stock account", req.AccountID)
		}
		if acct.SharesHeld < req.Shares {
			return fmt.Errorf("insufficient shares: have %.6f, selling %.6f", acct.SharesHeld, req.Shares)
		}
		stockAccount = acct

		// 2. Update stock account: reduce shares, recalculate balance
		stockAccount.SharesHeld -= req.Shares
		if stockAccount.SharesHeld == 0 {
			stockAccount.Balance = 0
		} else {
			stockAccount.Balance = stockAccount.SharesHeld * stockAccount.LastPrice
		}
		if err := repos.AccountRepo.Update(ctx, stockAccount); err != nil {
			return fmt.Errorf("update stock account: %w", err)
		}

		// 3. Credit receiving account
		if err := repos.AccountRepo.UpdateBalance(ctx, req.ToAccountID, totalAmount); err != nil {
			return fmt.Errorf("credit receiving account: %w", err)
		}

		// 4. Create transfer transaction (stock → bank)
		tx := &domain.Transaction{
			UserID:          req.UserID,
			AccountID:       req.AccountID,
			TargetAccountID: &req.ToAccountID,
			Type:            domain.TransactionTypeTransfer,
			Amount:          totalAmount,
			OccurredAt:      time.Now(),
			Note:            fmt.Sprintf("Sell %g shares of %s @ %.2f", req.Shares, stockAccount.StockSymbol, req.PricePerShare),
		}
		if err := repos.TransactionRepo.Create(ctx, tx); err != nil {
			return fmt.Errorf("create sell transaction: %w", err)
		}

		return nil
	}

	if s.txMgr != nil {
		if err := s.txMgr.WithTransaction(ctx, run); err != nil {
			return nil, err
		}
	} else {
		repos := domain.TxRepos{AccountRepo: s.acctRepo, TransactionRepo: s.txRepo}
		if err := run(repos); err != nil {
			return nil, err
		}
	}

	return stockAccount, nil
}

// RefreshPrices fetches latest prices for all user's stock accounts.
// Rate limited to once per 60 seconds per user.
func (s *StockService) RefreshPrices(ctx context.Context, userID uuid.UUID) ([]domain.Account, error) {
	// Rate limit check
	s.mu.Lock()
	if last, ok := s.lastRefresh[userID]; ok && time.Since(last) < 60*time.Second {
		s.mu.Unlock()
		// Return current data without fetching
		return s.acctRepo.FindStocksByUserID(ctx, userID)
	}
	s.lastRefresh[userID] = time.Now()
	s.mu.Unlock()

	stocks, err := s.acctRepo.FindStocksByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("find stock accounts: %w", err)
	}
	if len(stocks) == 0 {
		return stocks, nil
	}

	// Collect symbols
	symbols := make([]string, len(stocks))
	for i, s := range stocks {
		symbols[i] = s.StockSymbol
	}

	// Fetch quotes
	quotes, err := s.priceProvider.GetQuotes(ctx, symbols)
	if err != nil {
		s.logger.Warn("failed to fetch stock prices, returning cached data", "error", err)
		return stocks, nil
	}

	// Update each account
	now := time.Now()
	for i := range stocks {
		q, ok := quotes[stocks[i].StockSymbol]
		if !ok {
			continue
		}
		stocks[i].LastPrice = q.Price
		stocks[i].LastPriceAt = &now
		stocks[i].Balance = stocks[i].SharesHeld * q.Price
		if err := s.acctRepo.Update(ctx, &stocks[i]); err != nil {
			s.logger.Error("failed to update stock price",
				"symbol", stocks[i].StockSymbol, "error", err)
		}
	}

	return stocks, nil
}
```

**Step 2: Run build**

Run: `cd backend && go build ./internal/usecase/...`
Expected: BUILD SUCCESS

**Step 3: Commit**

```bash
git add backend/internal/usecase/stock_service.go
git commit -m "feat(usecase): add StockService with buy, sell, and price refresh"
```

---

## Task 6: StockService Tests

**Files:**
- Create: `backend/internal/usecase/stock_service_test.go`

**Step 1: Write tests with mock repositories**

```go
package usecase

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/yukiota/zenbill/internal/domain"
	"github.com/yukiota/zenbill/pkg/stockprice"
)

// --- Mock Price Provider ---

type MockPriceProvider struct {
	mock.Mock
}

func (m *MockPriceProvider) GetQuote(ctx context.Context, symbol string) (*stockprice.Quote, error) {
	args := m.Called(ctx, symbol)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*stockprice.Quote), args.Error(1)
}

func (m *MockPriceProvider) GetQuotes(ctx context.Context, symbols []string) (map[string]*stockprice.Quote, error) {
	args := m.Called(ctx, symbols)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(map[string]*stockprice.Quote), args.Error(1)
}

func TestStockService_Buy_NewAccount(t *testing.T) {
	acctRepo := new(MockAccountRepository)
	txRepo := new(MockTransactionRepository)
	provider := new(MockPriceProvider)
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	svc := NewStockService(acctRepo, txRepo, nil, provider, logger)

	userID := uuid.New()
	fromAcctID := uuid.New()

	// Mock: create stock account
	acctRepo.On("Create", mock.Anything, mock.MatchedBy(func(a *domain.Account) bool {
		return a.Type == domain.AccountTypeStock && a.StockSymbol == "2330.TW"
	})).Return(nil)

	// Mock: update stock account after buy
	acctRepo.On("Update", mock.Anything, mock.MatchedBy(func(a *domain.Account) bool {
		return a.SharesHeld == 100 && a.AvgCostPrice == 580.0
	})).Return(nil)

	// Mock: deduct from bank
	acctRepo.On("UpdateBalance", mock.Anything, fromAcctID, -58000.0).Return(nil)

	// Mock: create transaction
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Amount == 58000.0 && tx.Type == domain.TransactionTypeTransfer
	})).Return(nil)

	result, err := svc.Buy(ctx(), BuyRequest{
		UserID:        userID,
		StockSymbol:   "2330.TW",
		StockMarket:   "TW",
		Shares:        100,
		PricePerShare: 580.0,
		FromAccountID: fromAcctID,
	})

	assert.NoError(t, err)
	assert.Equal(t, domain.AccountTypeStock, result.Type)
	assert.Equal(t, float64(100), result.SharesHeld)
	assert.Equal(t, 580.0, result.AvgCostPrice)
	acctRepo.AssertExpectations(t)
	txRepo.AssertExpectations(t)
}

func TestStockService_Sell(t *testing.T) {
	acctRepo := new(MockAccountRepository)
	txRepo := new(MockTransactionRepository)
	provider := new(MockPriceProvider)
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	svc := NewStockService(acctRepo, txRepo, nil, provider, logger)

	userID := uuid.New()
	stockAcctID := uuid.New()
	toAcctID := uuid.New()

	stockAcct := &domain.Account{
		ID:           stockAcctID,
		Type:         domain.AccountTypeStock,
		StockSymbol:  "AAPL",
		SharesHeld:   100,
		AvgCostPrice: 178.0,
		LastPrice:    195.0,
		Balance:      19500.0,
	}

	acctRepo.On("FindByID", mock.Anything, stockAcctID).Return(stockAcct, nil)
	acctRepo.On("Update", mock.Anything, mock.MatchedBy(func(a *domain.Account) bool {
		return a.SharesHeld == 50
	})).Return(nil)
	acctRepo.On("UpdateBalance", mock.Anything, toAcctID, 10000.0).Return(nil)
	txRepo.On("Create", mock.Anything, mock.MatchedBy(func(tx *domain.Transaction) bool {
		return tx.Amount == 10000.0
	})).Return(nil)

	result, err := svc.Sell(ctx(), SellRequest{
		UserID:        userID,
		AccountID:     stockAcctID,
		Shares:        50,
		PricePerShare: 200.0,
		ToAccountID:   toAcctID,
	})

	assert.NoError(t, err)
	assert.Equal(t, float64(50), result.SharesHeld)
	acctRepo.AssertExpectations(t)
}

func TestStockService_Sell_InsufficientShares(t *testing.T) {
	acctRepo := new(MockAccountRepository)
	txRepo := new(MockTransactionRepository)
	provider := new(MockPriceProvider)
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	svc := NewStockService(acctRepo, txRepo, nil, provider, logger)

	stockAcctID := uuid.New()
	stockAcct := &domain.Account{
		ID:         stockAcctID,
		Type:       domain.AccountTypeStock,
		SharesHeld: 10,
	}
	acctRepo.On("FindByID", mock.Anything, stockAcctID).Return(stockAcct, nil)

	_, err := svc.Sell(ctx(), SellRequest{
		AccountID:     stockAcctID,
		Shares:        50,
		PricePerShare: 100,
		ToAccountID:   uuid.New(),
	})

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "insufficient shares")
}

func TestStockService_RefreshPrices(t *testing.T) {
	acctRepo := new(MockAccountRepository)
	txRepo := new(MockTransactionRepository)
	provider := new(MockPriceProvider)
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	svc := NewStockService(acctRepo, txRepo, nil, provider, logger)

	userID := uuid.New()
	stocks := []domain.Account{
		{ID: uuid.New(), StockSymbol: "2330.TW", SharesHeld: 100, LastPrice: 570},
		{ID: uuid.New(), StockSymbol: "AAPL", SharesHeld: 50, LastPrice: 190},
	}

	acctRepo.On("FindStocksByUserID", mock.Anything, userID).Return(stocks, nil)
	provider.On("GetQuotes", mock.Anything, []string{"2330.TW", "AAPL"}).Return(
		map[string]*stockprice.Quote{
			"2330.TW": {Symbol: "2330.TW", Price: 580.0, UpdatedAt: time.Now()},
			"AAPL":    {Symbol: "AAPL", Price: 195.5, UpdatedAt: time.Now()},
		}, nil,
	)
	// Update calls for each stock
	acctRepo.On("Update", mock.Anything, mock.Anything).Return(nil).Times(2)

	result, err := svc.RefreshPrices(ctx(), userID)

	assert.NoError(t, err)
	assert.Len(t, result, 2)
	assert.Equal(t, 580.0, result[0].LastPrice)
	assert.Equal(t, 58000.0, result[0].Balance)
	assert.Equal(t, 195.5, result[1].LastPrice)
	provider.AssertExpectations(t)
}

func ctx() context.Context {
	return context.Background()
}
```

**Step 2: Run tests**

Run: `cd backend && go test ./internal/usecase/ -v -run "TestStockService"`
Expected: PASS (all 4 tests)

**Step 3: Commit**

```bash
git add backend/internal/usecase/stock_service_test.go
git commit -m "test(usecase): add StockService unit tests for buy, sell, and refresh"
```

---

## Task 7: HTTP Handler — Stock Endpoints

**Files:**
- Create: `backend/internal/delivery/http/stock_handler.go`

**Step 1: Create stock handler with buy/sell/refresh endpoints**

```go
package http

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"github.com/yukiota/zenbill/internal/usecase"
	"log/slog"
)

// StockHandler handles stock-specific HTTP requests.
type StockHandler struct {
	stockService *usecase.StockService
	logger       *slog.Logger
}

// NewStockHandler creates a new StockHandler.
func NewStockHandler(stockService *usecase.StockService, logger *slog.Logger) *StockHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &StockHandler{stockService: stockService, logger: logger}
}

type buyStockRequest struct {
	StockSymbol   string  `json:"stock_symbol" binding:"required"`
	StockMarket   string  `json:"stock_market" binding:"required"`
	Shares        float64 `json:"shares" binding:"required,gt=0"`
	PricePerShare float64 `json:"price_per_share" binding:"required,gt=0"`
	FromAccountID string  `json:"from_account_id" binding:"required"`
	AccountID     *string `json:"account_id"` // optional, null = create new
}

type sellStockRequest struct {
	AccountID     string  `json:"account_id" binding:"required"`
	Shares        float64 `json:"shares" binding:"required,gt=0"`
	PricePerShare float64 `json:"price_per_share" binding:"required,gt=0"`
	ToAccountID   string  `json:"to_account_id" binding:"required"`
}

// BuyStock handles POST /accounts/stocks/buy
func (h *StockHandler) BuyStock(c *gin.Context) {
	ctx := c.Request.Context()
	userID := getUserID(c)

	var req buyStockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	if req.StockMarket != "TW" && req.StockMarket != "US" {
		BadRequest(c, "stock_market must be TW or US")
		return
	}

	fromAcctID, err := uuid.Parse(req.FromAccountID)
	if err != nil {
		BadRequest(c, "invalid from_account_id")
		return
	}

	buyReq := usecase.BuyRequest{
		UserID:        userID,
		StockSymbol:   req.StockSymbol,
		StockMarket:   req.StockMarket,
		Shares:        req.Shares,
		PricePerShare: req.PricePerShare,
		FromAccountID: fromAcctID,
	}

	if req.AccountID != nil {
		id, err := uuid.Parse(*req.AccountID)
		if err != nil {
			BadRequest(c, "invalid account_id")
			return
		}
		buyReq.AccountID = &id
	}

	account, err := h.stockService.Buy(ctx, buyReq)
	if err != nil {
		h.logger.ErrorContext(ctx, "Failed to buy stock", "error", err)
		InternalServerError(c, err.Error())
		return
	}

	SuccessWithMessage(c, "stock purchased", account)
}

// SellStock handles POST /accounts/stocks/sell
func (h *StockHandler) SellStock(c *gin.Context) {
	ctx := c.Request.Context()
	userID := getUserID(c)

	var req sellStockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	acctID, err := uuid.Parse(req.AccountID)
	if err != nil {
		BadRequest(c, "invalid account_id")
		return
	}

	toAcctID, err := uuid.Parse(req.ToAccountID)
	if err != nil {
		BadRequest(c, "invalid to_account_id")
		return
	}

	account, err := h.stockService.Sell(ctx, usecase.SellRequest{
		UserID:        userID,
		AccountID:     acctID,
		Shares:        req.Shares,
		PricePerShare: req.PricePerShare,
		ToAccountID:   toAcctID,
	})
	if err != nil {
		h.logger.ErrorContext(ctx, "Failed to sell stock", "error", err)
		InternalServerError(c, err.Error())
		return
	}

	SuccessWithMessage(c, "stock sold", account)
}

// RefreshPrices handles POST /accounts/stocks/refresh-prices
func (h *StockHandler) RefreshPrices(c *gin.Context) {
	ctx := c.Request.Context()
	userID := getUserID(c)

	stocks, err := h.stockService.RefreshPrices(ctx, userID)
	if err != nil {
		h.logger.ErrorContext(ctx, "Failed to refresh stock prices", "error", err)
		InternalServerError(c, "failed to refresh stock prices")
		return
	}

	Success(c, stocks)
}

// RegisterRoutes registers stock routes on the given router group.
func (h *StockHandler) RegisterRoutes(r *gin.RouterGroup) {
	stocks := r.Group("/accounts/stocks")
	{
		stocks.POST("/buy", h.BuyStock)
		stocks.POST("/sell", h.SellStock)
		stocks.POST("/refresh-prices", h.RefreshPrices)
	}
}
```

**Step 2: Update CreateAccount handler to accept STOCK type**

In `backend/internal/delivery/http/account_handler.go`, update the type validation switch:

```go
case domain.AccountTypeBank, domain.AccountTypeCredit, domain.AccountTypeCash, domain.AccountTypeCrypto, domain.AccountTypeStock:
```

**Step 3: Run build**

Run: `cd backend && go build ./...`
Expected: BUILD SUCCESS

**Step 4: Commit**

```bash
git add backend/internal/delivery/http/stock_handler.go backend/internal/delivery/http/account_handler.go
git commit -m "feat(http): add stock buy/sell/refresh-prices endpoints"
```

---

## Task 8: Wire Up DI — Register StockHandler in main.go

**Files:**
- Modify: `backend/cmd/api/main.go`

**Step 1: Add stock service and handler to DI**

Find where other handlers are instantiated and add:

```go
// Stock service
priceProvider := stockprice.NewYahooProvider()
stockService := usecase.NewStockService(acctRepo, txRepo, txMgr, priceProvider, logger.Get())
stockHandler := httpdelivery.NewStockHandler(stockService, logger.Get())
```

Add import for `"github.com/yukiota/zenbill/pkg/stockprice"`.

Find where routes are registered and add:

```go
stockHandler.RegisterRoutes(protected)
```

**Step 2: Run build**

Run: `cd backend && go build ./cmd/api/...`
Expected: BUILD SUCCESS

**Step 3: Commit**

```bash
git add backend/cmd/api/main.go
git commit -m "feat(api): wire up StockService and StockHandler in DI"
```

---

## Task 9: Database Migration

**Files:**
- Modify: `backend/cmd/migrate/main.go` (if Account is not already in migration list)

**Step 1: Run migration**

Since GORM AutoMigrate handles schema changes on the Account model, just run the migration tool:

Run: `cd backend && go run cmd/migrate/main.go`

Or if running via Docker:

Run: `docker exec -it zenbill_api /app/migrate`

This will add the new columns (`stock_symbol`, `stock_market`, `shares_held`, `avg_cost_price`, `last_price`, `last_price_at`) to the `accounts` table.

**Step 2: Verify columns exist**

Run: `docker exec -it zenbill_db psql -U zenbill -d zenbill_db -c "\d accounts" | grep stock`
Expected: Shows `stock_symbol`, `stock_market`, `shares_held`, `avg_cost_price`, `last_price`, `last_price_at` columns

**Step 3: Commit (if any migration file changes)**

```bash
git add -u
git commit -m "chore(migrate): run migration to add stock fields to accounts"
```

---

## Task 10: Shared Types — Add Stock Fields to TypeScript

**Files:**
- Modify: `packages/shared/src/types/index.ts`

**Step 1: Update AccountType**

Change:
```typescript
export type AccountType = 'BANK' | 'CREDIT' | 'CASH' | 'CRYPTO'
```
To:
```typescript
export type AccountType = 'BANK' | 'CREDIT' | 'CASH' | 'CRYPTO' | 'STOCK'
```

**Step 2: Add stock fields to Account interface**

Add after `auto_pay_enabled`:
```typescript
  // Stock fields
  stock_symbol: string
  stock_market: string  // "TW" | "US"
  shares_held: number
  avg_cost_price: number
  last_price: number
  last_price_at: string | null
```

**Step 3: Add stock API types**

```typescript
// === Stock ===
export interface BuyStockInput {
  stock_symbol: string
  stock_market: 'TW' | 'US'
  shares: number
  price_per_share: number
  from_account_id: string
  account_id?: string  // optional, null = create new
}

export interface SellStockInput {
  account_id: string
  shares: number
  price_per_share: number
  to_account_id: string
}
```

**Step 4: Commit**

```bash
git add packages/shared/src/types/index.ts
git commit -m "feat(shared): add STOCK account type and stock API types"
```

---

## Task 11: Shared Hooks — Add Stock API Hooks

**Files:**
- Modify: `packages/shared/src/hooks/useAccounts.ts`
- Modify: `packages/shared/src/index.ts` (if new exports needed)

**Step 1: Add stock API hooks**

Add to `useAccounts.ts`:

```typescript
export function useRefreshStockPrices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<ApiResponse<Account[]>>('/accounts/stocks/refresh-prices').then(r => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useBuyStock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BuyStockInput) =>
      api.post<ApiResponse<Account>>('/accounts/stocks/buy', input).then(r => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useSellStock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SellStockInput) =>
      api.post<ApiResponse<Account>>('/accounts/stocks/sell', input).then(r => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
```

**Step 2: Add imports for new types**

Make sure `BuyStockInput` and `SellStockInput` are imported from `../types`.

**Step 3: Update sortAccounts to include STOCK**

Find the `sortAccounts` function and add STOCK to the type order (after CRYPTO, before CREDIT):

```typescript
const typeOrder: Record<AccountType, number> = {
  CASH: 0,
  BANK: 1,
  CRYPTO: 2,
  STOCK: 3,
  CREDIT: 4,
}
```

**Step 4: Export new hooks from index.ts**

Ensure `useRefreshStockPrices`, `useBuyStock`, `useSellStock`, `BuyStockInput`, `SellStockInput` are exported.

**Step 5: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add stock API hooks (buy, sell, refresh-prices)"
```

---

## Task 12: Web Dashboard — Stock Investment Section

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

**Step 1: Add stock section to dashboard**

Import the refresh hook:
```typescript
import { useAccounts, useRefreshStockPrices } from '@zenbill/shared'
```

Add a `StockInvestmentSection` component within DashboardPage (or as a separate component in the same file):

```tsx
function StockInvestmentSection({ accounts }: { accounts: Account[] }) {
  const stockAccounts = accounts.filter(a => a.type === 'STOCK' && a.shares_held > 0)
  const refreshPrices = useRefreshStockPrices()

  if (stockAccounts.length === 0) return null

  // Group by currency for totals
  const byCurrency = stockAccounts.reduce((acc, s) => {
    const cur = s.currency
    if (!acc[cur]) acc[cur] = { marketValue: 0, totalCost: 0 }
    acc[cur].marketValue += s.shares_held * s.last_price
    acc[cur].totalCost += s.shares_held * s.avg_cost_price
    return acc
  }, {} as Record<string, { marketValue: number; totalCost: number }>)

  const lastUpdated = stockAccounts
    .filter(s => s.last_price_at)
    .sort((a, b) => new Date(b.last_price_at!).getTime() - new Date(a.last_price_at!).getTime())[0]
    ?.last_price_at

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">股票投資</h2>
        <button
          onClick={() => refreshPrices.mutate()}
          disabled={refreshPrices.isPending}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          {refreshPrices.isPending ? '更新中...' : '重新整理'}
        </button>
      </div>

      {/* Currency totals */}
      <div className="flex gap-6 mb-4">
        {Object.entries(byCurrency).map(([cur, { marketValue, totalCost }]) => {
          const pnl = marketValue - totalCost
          const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0
          return (
            <div key={cur}>
              <div className="text-sm text-zinc-400">總市值 {cur}</div>
              <div className="text-xl font-bold text-zinc-100">
                {getCurrencySymbol(cur)}{formatCurrency(marketValue, cur)}
              </div>
              <div className={`text-sm ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {pnl >= 0 ? '+' : ''}{getCurrencySymbol(cur)}{formatCurrency(Math.abs(pnl), cur)}
                ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
              </div>
            </div>
          )
        })}
      </div>

      {/* Stock cards */}
      <div className="space-y-3">
        {stockAccounts.map(stock => {
          const pnl = (stock.last_price - stock.avg_cost_price) * stock.shares_held
          const pnlPct = stock.avg_cost_price > 0
            ? ((stock.last_price - stock.avg_cost_price) / stock.avg_cost_price) * 100
            : 0
          return (
            <div key={stock.id} className="bg-zinc-800/50 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-zinc-100">{stock.name}</div>
                  <div className="text-sm text-zinc-400">
                    {stock.shares_held} 股 │ {getCurrencySymbol(stock.currency)}{stock.last_price.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-zinc-100">
                    {getCurrencySymbol(stock.currency)}{formatCurrency(stock.balance, stock.currency)}
                  </div>
                  <div className={`text-sm ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pnl >= 0 ? '+' : ''}{getCurrencySymbol(stock.currency)}{formatCurrency(Math.abs(pnl), stock.currency)}
                    ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {lastUpdated && (
        <div className="mt-3 text-xs text-zinc-500">
          股價更新於 {new Date(lastUpdated).toLocaleString('zh-TW')}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Add StockInvestmentSection to dashboard layout**

Place it after the Quick Stats grid and before the charts:

```tsx
<StockInvestmentSection accounts={accounts ?? []} />
```

**Step 3: Trigger price refresh on page load**

Add to DashboardPage:
```tsx
const refreshPrices = useRefreshStockPrices()

useEffect(() => {
  refreshPrices.mutate()
}, [])
```

**Step 4: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat(web): add Stock Investment section to dashboard"
```

---

## Task 13: Web Accounts Page — STOCK Category + Create Form

**Files:**
- Modify: `frontend/src/pages/AccountsPage.tsx`

**Step 1: Add STOCK to typeConfig**

```typescript
STOCK: { label: '股票', icon: TrendingUp, color: 'rose-400', border: 'border-t-rose-400' },
```

Import `TrendingUp` from `lucide-react`.

**Step 2: Add STOCK to account type selector in create form**

Add stock option to the type buttons alongside BANK, CREDIT, CASH.

**Step 3: Add stock-specific fields to create form**

When type === 'STOCK', show:
- Stock symbol input (text, e.g. "2330" or "AAPL")
- Market selector (TW / US radio buttons)
- Initial shares (number)
- Price per share (number)
- Funding account selector (filtered to BANK/CASH accounts)

**Step 4: Handle stock account creation**

When submitting a STOCK account, call `useBuyStock()` instead of `useCreateAccount()` — this creates the account + first transaction atomically.

**Step 5: Add stock-specific display on account cards**

For STOCK accounts, show:
- Stock symbol badge
- Shares held × last price = market value
- Unrealized P&L with color

**Step 6: Commit**

```bash
git add frontend/src/pages/AccountsPage.tsx
git commit -m "feat(web): add STOCK category and create form to accounts page"
```

---

## Task 14: Mobile Dashboard — Stock Investment Section

**Files:**
- Modify: `app/app/(tabs)/index.tsx`

**Step 1: Add StockInvestmentSection component**

Similar to web version but using React Native components (View, Text, Pressable). Use the same data logic as Task 12.

**Step 2: Add to dashboard layout**

Place after AssetSummary and Quick Stats.

**Step 3: Trigger price refresh on mount**

```tsx
const refreshPrices = useRefreshStockPrices()
useFocusEffect(useCallback(() => { refreshPrices.mutate() }, []))
```

**Step 4: Commit**

```bash
git add app/app/(tabs)/index.tsx
git commit -m "feat(app): add Stock Investment section to mobile dashboard"
```

---

## Task 15: Mobile Accounts — STOCK Display

**Files:**
- Modify: `app/components/accounts/AccountCard.tsx`
- Modify: `app/app/(tabs)/accounts.tsx`

**Step 1: Update AccountCard to display stock info**

When `account.type === 'STOCK'`, show:
- Stock symbol
- Shares held + last price
- P&L indicator (green/red)

**Step 2: Update accounts tab to include STOCK in grouping**

Add STOCK label: `'股票'` and appropriate icon.

**Step 3: Commit**

```bash
git add app/components/accounts/AccountCard.tsx app/app/(tabs)/accounts.tsx
git commit -m "feat(app): add STOCK display to mobile accounts"
```

---

## Task 16: Final Verification & Cleanup

**Step 1: Run all backend tests**

Run: `cd backend && go test ./... -v`
Expected: ALL PASS

**Step 2: Run lint**

Run: `cd backend && golangci-lint run`
Expected: No errors

**Step 3: Build check**

Run: `cd backend && go build ./...`
Expected: BUILD SUCCESS

**Step 4: Verify frontend builds**

Run: `cd frontend && npm run build` (or equivalent)
Run: `cd app && npx expo export --platform web` (or equivalent)
Expected: No TypeScript errors

**Step 5: Final commit (if any cleanup needed)**

```bash
git add -u
git commit -m "chore: final cleanup for stock account feature"
```
