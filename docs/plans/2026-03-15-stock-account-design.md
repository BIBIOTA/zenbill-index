# Stock Account Feature Design

**Date:** 2026-03-15
**Status:** Approved

## Summary

Add a new `STOCK` account type to ZenBill. Each stock holding is represented as an individual account (e.g., "台積電 2330.TW", "AAPL"). Users manually record buy/sell transactions, and the system fetches real-time prices from Yahoo Finance to calculate market value.

## Requirements

- Support US stocks and Taiwan stocks
- Real-time price via Yahoo Finance on page load
- Overview page: dedicated "Stock Investment" section with total market value, per-stock P&L
- Web account page: STOCK category with create/buy/sell flows
- Transactions record the cash flow (bank ↔ stock account)
- Account stores holding info (shares, avg cost, last price)

## §1: Domain Model Changes

### New Account Type

```
AccountTypeStock AccountType = "STOCK"
```

### Account New Fields

| Field | Type | Description |
|-------|------|-------------|
| `stock_symbol` | string | Stock ticker, e.g. "2330.TW", "AAPL" |
| `stock_market` | string | "TW" / "US" |
| `shares_held` | float64 | Number of shares held (supports fractional) |
| `avg_cost_price` | float64 | Weighted average cost per share |
| `last_price` | float64 | Latest stock price from Yahoo Finance |
| `last_price_at` | *time.Time | When last_price was fetched |

### Derived Values (Not Stored)

- **Market value (balance)** = `shares_held × last_price`
- **Unrealized P&L** = `(last_price - avg_cost_price) × shares_held`
- **P&L percentage** = `(last_price - avg_cost_price) / avg_cost_price × 100`

### Currency Logic

- Taiwan stocks: `Currency = "TWD"`, `StockMarket = "TW"`
- US stocks: `Currency = "USD"`, `StockMarket = "US"`
- Leverages existing multi-currency asset calculation

### Buy/Sell Impact on Account

| Operation | Transaction | Account Update |
|-----------|------------|----------------|
| Buy 100 shares @ $580 | Bank → Stock, amount 58,000 | `SharesHeld += 100`, recalculate `AvgCostPrice` |
| Sell 50 shares @ $600 | Stock → Bank, amount 30,000 | `SharesHeld -= 50`, `AvgCostPrice` unchanged |
| Price update | No transaction | `LastPrice` updated, `Balance` recalculated |

### AvgCostPrice Formula (Weighted Average)

```
new_avg = (old_shares × old_avg + new_shares × buy_price) / (old_shares + new_shares)
```

## §2: Stock Price Service (Backend)

### Yahoo Finance Integration

Use Go library (`github.com/piquette/finance-go`) to fetch quotes.

```
quote("2330.TW") → { Price: 580.0, Currency: "TWD" }
quote("AAPL")    → { Price: 195.5, Currency: "USD" }
```

### StockPriceService (Usecase Layer)

```go
type StockPriceService struct {
    accountRepo domain.AccountRepository
}

func (s *StockPriceService) RefreshPrices(ctx, userID) error {
    // 1. Query all STOCK accounts with SharesHeld > 0
    // 2. Collect StockSymbols, batch call Yahoo Finance
    // 3. Update LastPrice, LastPriceAt, Balance
    // 4. Return updated results
}
```

### API Endpoint

```
POST /accounts/stocks/refresh-prices
```

- Frontend calls on page load
- Returns updated account list with latest market values
- If Yahoo Finance is unavailable, returns cached prices (LastPrice + LastPriceAt)

### Safeguards

- **Rate limiting**: Same user can only trigger actual fetch once per 60 seconds
- **Graceful degradation**: On API failure, keep existing LastPrice; frontend shows "Updated X minutes ago"

## §3: Frontend Display

### Overview Page — Dedicated "Stock Investment" Section

```
┌─ 股票投資 ─────────────────────────────┐
│  總市值  TWD 1,250,000 │ USD 15,800    │
│  總損益  +TWD 82,000 (+7.0%)           │
│                                         │
│  ┌─ 台積電 2330.TW ──────────────────┐ │
│  │  100 股 │ $580.0 │ 市值 $58,000   │ │
│  │  成本 $498.0 │ +$8,200 (+16.5%)   │ │
│  └────────────────────────────────────┘ │
│  ┌─ AAPL ────────────────────────────┐ │
│  │  50 股 │ $195.5 │ 市值 $9,775     │ │
│  │  成本 $178.0 │ +$875 (+9.8%)      │ │
│  └────────────────────────────────────┘ │
│                                         │
│  股價更新於 2 分鐘前          [重新整理] │
└─────────────────────────────────────────┘
```

**Per-stock card:**
- Stock name + ticker
- Shares held, latest price, market value
- Avg cost, unrealized P&L (amount + percentage)
- Green for gain, red for loss

**Section header:**
- Total market value by currency
- Total unrealized P&L

### Web Account Page

- Account list: new STOCK category
- Create form: enter stock ticker + market (TW/US), system auto-fetches stock name
- Detail page: full holding info + transaction history (buy/sell)

### Page Load Flow

```
Enter overview page
  → Render with cached data (LastPrice)
  → Simultaneously call POST /accounts/stocks/refresh-prices
  → On response: update UI + show "Updated just now"
```

## §4: Buy/Sell Operations

### Buy Stock

**Entry 1 — New stock account + first purchase:**
1. Account page → Add account → Type "Stock"
2. Enter ticker (e.g. `2330`), select market (TW/US)
3. System auto-fetches stock name → account name (e.g. "台積電 2330.TW")
4. Enter shares, price per share, select funding account (bank/cash)
5. Create account + create buy Transaction + update bank balance

**Entry 2 — Add to existing position:**
1. Stock account detail → "Buy" button
2. Enter shares, price, select funding account
3. Create Transaction + update SharesHeld & AvgCostPrice + deduct from funding account

### Sell Stock

1. Stock account detail → "Sell" button
2. Enter shares (≤ held), price, select receiving account
3. Create Transaction + update SharesHeld + credit receiving account
4. If fully sold (SharesHeld = 0), account remains but market value = 0

### API Endpoints

```
POST /accounts/stocks/buy
{
  "stock_symbol": "2330.TW",
  "stock_market": "TW",
  "shares": 100,
  "price_per_share": 580.0,
  "from_account_id": "uuid-of-bank-account",
  "account_id": "uuid-of-stock-account"  // optional, null = create new account
}

POST /accounts/stocks/sell
{
  "account_id": "uuid-of-stock-account",
  "shares": 50,
  "price_per_share": 600.0,
  "to_account_id": "uuid-of-bank-account"
}
```

Both operations execute within a DB transaction (stock account update + bank balance update + Transaction record) to ensure ACID.

## Architecture Decision: Approach A (Extend Account Model)

Chose to add stock-specific fields directly to the Account entity, following the existing pattern where credit card accounts have type-specific fields (`closing_day`, `payment_due_day`). This minimizes changes and reuses existing CRUD, Transaction, and frontend grouping logic.
