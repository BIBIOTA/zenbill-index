# Stock Search Market Split Design

**Date:** 2026-03-17
**Status:** Approved

## Problem

Stock search currently uses Yahoo Finance for all markets, which returns English names for Taiwan stocks (e.g., "Taiwan Semiconductor Manufacturing Company Limited" instead of "台積電"). Users need correct Chinese names for TW stocks and a clear market separation in the UI.

## Solution

Split stock search into two market-specific paths:
- **台股 (TW):** Use TWSE OpenAPI for stock/ETF name lookup with Chinese names
- **美股 (US):** Use Yahoo Finance, filtered to US EQUITY/ETF only

## Backend Changes

### New: `TWSEProvider` (`pkg/stockprice/twse_provider.go`)

Responsibilities:
- On init, fetch two TWSE OpenAPI endpoints and build in-memory lookup maps:
  - `https://openapi.twse.com.tw/v1/opendata/t187ap03_L` (上市股票, fields: `公司代號`, `公司簡稱`)
  - `https://openapi.twse.com.tw/v1/opendata/t187ap47_L` (上市ETF/基金, fields: `基金代號`, `基金簡稱`)
- Store as `map[string]StockInfo` keyed by stock code, where `StockInfo` contains code and Chinese short name
- Provide `Search(ctx, query) ([]SearchResult, error)`: match query against code (prefix) and name (contains), return up to 10 results with `Market: "TW"`
- Auto-refresh every 24 hours via background goroutine
- Thread-safe (sync.RWMutex)

### Modified: `SearchStocks` endpoint (`delivery/http/stock_handler.go`)

- Add `market` query parameter: `GET /accounts/stocks/search?q=...&market=TW|US`
- `market=TW` → delegate to `TWSEProvider.Search()`
- `market=US` → delegate to `YahooProvider.Search()`, filter results to US market EQUITY/ETF only
- `market` is required; return 400 if missing

### Modified: `YahooProvider.Search()` (`pkg/stockprice/provider.go`)

- Add filtering option to restrict results to US market only (exclude TW/TWO results)
- No structural changes to the provider interface

### Unchanged

- `StockService.Buy()`, `BuyRequest`, `SellRequest` — no changes
- `RefreshPrices` — continues using Yahoo for price updates (all markets)
- `Provider` interface for `GetQuotes` — unchanged

## Frontend Changes (APP + Web)

### UI Flow Change

Current:
```
Select STOCK type → Search box appears → Type query → Results (mixed TW/US)
```

New:
```
Select STOCK type → Market chips [台股] [美股] → Search box appears → Type query → Results (market-specific)
```

### Shared Hook Change (`packages/shared`)

- `useStockSearch(query, market)` — add `market` parameter to the hook
- API call becomes: `GET /accounts/stocks/search?q=${query}&market=${market}`

### APP (`app/components/quickcreate/AccountQuickCreate.tsx`)

- Add market selection state: `const [stockMarket, setStockMarket] = useState<'TW' | 'US'>('TW')`
- Render two chips before search box (similar to account type chips)
- Pass `stockMarket` to `useStockSearch`
- On market change: clear search query and selected stock
- `stockForm.stock_market` auto-set from `stockMarket` selection (no longer from search result)

### Web (`frontend/src/pages/AccountsPage.tsx`)

- Same changes as APP: market chips, pass market to search hook, clear on market change

### Unchanged

- `formatStockLabel`, `AccountCard`, `StockInvestmentSection` — no changes
- Account detail pages (buy more / sell) — no changes (market already known from existing account)

## Data Flow

```
User selects 台股
  → useStockSearch("2330", "TW")
  → GET /accounts/stocks/search?q=2330&market=TW
  → TWSEProvider.Search("2330")
  → Returns: [{Symbol: "2330", Name: "台積電", Market: "TW"}]

User selects 美股
  → useStockSearch("AAPL", "US")
  → GET /accounts/stocks/search?q=AAPL&market=US
  → YahooProvider.Search("AAPL") filtered to US
  → Returns: [{Symbol: "AAPL", Name: "Apple Inc.", Market: "US"}]
```

## Error Handling

- TWSE API fetch failure on startup: log warning, retry after 1 minute, allow search to return empty results until cache is populated
- TWSE API refresh failure: keep stale cache, log warning, retry next cycle
- Yahoo search failure: return empty results (existing behavior)

## Testing

- `TWSEProvider`: unit test with mock HTTP responses, verify search matching logic
- `SearchStocks` handler: test market routing (TW → TWSE, US → Yahoo)
- Frontend: verify market chip selection, search parameter passing
