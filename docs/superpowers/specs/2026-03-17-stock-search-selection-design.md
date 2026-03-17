# Stock Search & Selection for Account Creation

**Date:** 2026-03-17
**Status:** Approved
**Branch:** feat/stock-account

## Summary

When creating a stock account, users can search for stocks by symbol or company name. The system queries Yahoo Finance, displays matching results, and auto-fills account fields upon selection. This replaces manual symbol entry with a search-driven workflow.

## Requirements

1. **Search mode:** Exact match first, then fuzzy search (handled by Yahoo Finance Search API)
2. **Result display:** Symbol, company name, latest price
3. **Auto-fill on selection:** Account name (company name) only; price left for user input
4. **API architecture:** Backend proxy — frontend calls ZenBill backend, backend calls Yahoo Finance
5. **Trigger:** Debounce ~500ms after input, minimum 1 character
6. **Market scope:** Cross-market search (TW + US), results show market labels

## Backend Design

### New Endpoint

```
GET /accounts/stocks/search?q={query}
```

**Response:**
```json
{
  "results": [
    { "symbol": "2330.TW", "name": "台積電", "market": "TW", "price": 580.0 },
    { "symbol": "AAPL", "name": "Apple Inc.", "market": "US", "price": 189.5 }
  ]
}
```

### Provider Interface Extension

Add `Search` method to `pkg/stockprice/provider.go`:

```go
type SearchResult struct {
    Symbol   string
    Name     string
    Market   string  // "TW", "US", "OTHER"
    Price    float64
}

type Provider interface {
    GetQuote(ctx context.Context, symbol string) (*Quote, error)
    GetQuotes(ctx context.Context, symbols []string) (map[string]*Quote, error)
    Search(ctx context.Context, query string) ([]SearchResult, error)
}
```

### Yahoo Finance Search Implementation

Call `https://query2.finance.yahoo.com/v1/finance/search?q={query}&quotesCount=10&newsCount=0`.

Filter results: only `quoteType == "EQUITY"`.

### Market Mapping

Yahoo `exchange` field to ZenBill market:
- `"TAI"` → `"TW"`
- `"NMS"`, `"NYQ"`, `"NGM"`, `"PCX"` → `"US"`
- Others → `"OTHER"`

### Symbol Handling

Yahoo returns suffixed symbols (e.g., `2330.TW`). Store as-is in `Account.StockSymbol`, consistent with existing `YahooProvider.GetQuote()` usage.

### Cache Strategy

- No server-side cache — search freshness matters, debounce limits request volume
- Frontend uses React Query `staleTime: 30_000` (30s) for same-query dedup

### Error Handling

- Yahoo API failure → return empty array + 200 (don't block user)
- Empty/invalid query → return empty array

## Frontend Design

### Search UI in AccountQuickCreate

Replace the manual `stock_symbol` text input + TW/US toggle with a **search-driven selector**:

1. User types in search box (e.g., "2330" or "台積")
2. Debounce 500ms → call `GET /accounts/stocks/search?q=...`
3. Dropdown appears below input with results:
   ```
   2330.TW   台積電      TWD 580.0
   AAPL      Apple Inc.  USD 189.5
   ```
4. User taps a result → auto-fill:
   - `stock_symbol` ← selected symbol
   - `stock_market` ← selected market
   - Account name ← company name
   - Currency ← TWD (TW) / USD (US)
   - Price field remains empty for user input
5. Selected stock shows as chip (symbol + name), clearable with X button

**Removed UI elements:**
- TW/US market toggle buttons (market now derived from search result)

**State indicators:**
- Searching → loading spinner
- No results → "找不到相關股票"
- Error → silent (no error message shown)

### Shared Layer Changes

**New type** in `packages/shared/src/types/index.ts`:
```typescript
export interface StockSearchResult {
  symbol: string   // "2330.TW"
  name: string     // "台積電"
  market: string   // "TW" | "US" | "OTHER"
  price: number    // latest price, 0 if unavailable
}
```

**New hook** in `packages/shared/src/hooks/useAccounts.ts`:
```typescript
export function useStockSearch(query: string) {
  return useQuery({
    queryKey: ['stock-search', query],
    queryFn: () => api.get('/accounts/stocks/search', { params: { q: query } }),
    enabled: query.length >= 1,
    staleTime: 30_000,
  })
}
```

### Impact on Existing Code

- `BuyStockInput` — no changes needed; `stock_symbol` and `stock_market` already exist
- Account name — changes from default `stock_symbol` to `name` from search result; user can still edit
- Buy/Sell flow — unchanged; search only affects the account creation step
