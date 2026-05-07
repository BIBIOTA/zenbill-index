# Stock Search Market Split Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split stock search into market-specific paths — Taiwan stocks use TWSE OpenAPI (Chinese names), US stocks use Yahoo Finance.

**Architecture:** New `TWSEProvider` in `pkg/stockprice/` fetches and caches TWSE data at startup. `StockHandler.SearchStocks` routes by `market` query param. Frontend adds market chip selector before search box.

**Tech Stack:** Go (net/http, sync.RWMutex), React Native, React, TanStack Query

**Spec:** `docs/superpowers/specs/2026-03-17-stock-search-market-split-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `backend/pkg/stockprice/twse_provider.go` | TWSE data fetch, cache, search |
| Create | `backend/pkg/stockprice/twse_provider_test.go` | Unit tests for TWSEProvider |
| Modify | `backend/pkg/stockprice/provider.go` | Add `SearchUS` method to YahooProvider |
| Modify | `backend/internal/delivery/http/stock_handler.go` | Add `market` param, route to correct provider |
| Modify | `backend/cmd/api/main.go:173-176` | Wire TWSEProvider into StockHandler |
| Modify | `packages/shared/src/hooks/useAccounts.ts:101-111` | Add `market` param to `useStockSearch` |
| Modify | `app/components/quickcreate/AccountQuickCreate.tsx` | Add market chips UI |
| Modify | `frontend/src/pages/AccountsPage.tsx` | Add market chips UI |

---

## Task 1: TWSEProvider — data fetch and search

**Files:**
- Create: `backend/pkg/stockprice/twse_provider.go`
- Create: `backend/pkg/stockprice/twse_provider_test.go`

### Step 1: Write failing tests

- [ ] Create `backend/pkg/stockprice/twse_provider_test.go` with tests for:
  - `TestTWSEProvider_Search_ByCode` — search "2330" returns 台積電
  - `TestTWSEProvider_Search_ByName` — search "台積" returns 台積電
  - `TestTWSEProvider_Search_PrefixMatch` — search "005" returns 0050, 0056, etc.
  - `TestTWSEProvider_Search_MaxResults` — returns at most 10 results
  - `TestTWSEProvider_Search_Empty` — search with no match returns empty slice

Use `httptest.NewServer` to mock the two TWSE endpoints. The mock should return JSON arrays with `公司代號`/`公司簡稱` (stocks) and `基金代號`/`基金簡稱` (ETFs).

```go
package stockprice

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTestTWSEServer() *httptest.Server {
	stocks := []map[string]string{
		{"公司代號": "2330", "公司簡稱": "台積電"},
		{"公司代號": "2412", "公司簡稱": "中華電"},
		{"公司代號": "2890", "公司簡稱": "永豐金"},
		{"公司代號": "2891", "公司簡稱": "中信金"},
	}
	etfs := []map[string]string{
		{"基金代號": "0050", "基金簡稱": "元大台灣50"},
		{"基金代號": "0056", "基金簡稱": "元大高股息"},
		{"基金代號": "00878", "基金簡稱": "國泰永續高股息"},
		{"基金代號": "00926", "基金簡稱": "凱基環球趨勢"},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/stocks", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(stocks)
	})
	mux.HandleFunc("/etfs", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(etfs)
	})
	return httptest.NewServer(mux)
}

func TestTWSEProvider_Search_ByCode(t *testing.T) {
	srv := newTestTWSEServer()
	defer srv.Close()

	p := NewTWSEProviderWithURLs(srv.URL+"/stocks", srv.URL+"/etfs")
	if err := p.refresh(context.Background()); err != nil {
		t.Fatalf("refresh: %v", err)
	}

	results, err := p.Search(context.Background(), "2330")
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Symbol != "2330" || results[0].Name != "台積電" || results[0].Market != "TW" {
		t.Errorf("unexpected result: %+v", results[0])
	}
}

func TestTWSEProvider_Search_ByName(t *testing.T) {
	srv := newTestTWSEServer()
	defer srv.Close()

	p := NewTWSEProviderWithURLs(srv.URL+"/stocks", srv.URL+"/etfs")
	p.refresh(context.Background())

	results, _ := p.Search(context.Background(), "台積")
	if len(results) != 1 || results[0].Symbol != "2330" {
		t.Errorf("expected 台積電, got %+v", results)
	}
}

func TestTWSEProvider_Search_PrefixMatch(t *testing.T) {
	srv := newTestTWSEServer()
	defer srv.Close()

	p := NewTWSEProviderWithURLs(srv.URL+"/stocks", srv.URL+"/etfs")
	p.refresh(context.Background())

	results, _ := p.Search(context.Background(), "005")
	if len(results) != 2 { // 0050, 0056
		t.Errorf("expected 2 results, got %d: %+v", len(results), results)
	}
}

func TestTWSEProvider_Search_MaxResults(t *testing.T) {
	srv := newTestTWSEServer()
	defer srv.Close()

	p := NewTWSEProviderWithURLs(srv.URL+"/stocks", srv.URL+"/etfs")
	p.refresh(context.Background())

	// Search broad pattern that matches many
	results, _ := p.Search(context.Background(), "2")
	if len(results) > 10 {
		t.Errorf("expected max 10 results, got %d", len(results))
	}
}

func TestTWSEProvider_Search_Empty(t *testing.T) {
	srv := newTestTWSEServer()
	defer srv.Close()

	p := NewTWSEProviderWithURLs(srv.URL+"/stocks", srv.URL+"/etfs")
	p.refresh(context.Background())

	results, _ := p.Search(context.Background(), "ZZZZZ")
	if len(results) != 0 {
		t.Errorf("expected 0 results, got %d", len(results))
	}
}
```

- [ ] Run tests to verify they fail:

```bash
cd backend && go test ./pkg/stockprice/... -run TestTWSE -v
```

Expected: compilation error — `NewTWSEProviderWithURLs` not defined.

### Step 2: Implement TWSEProvider

- [ ] Create `backend/pkg/stockprice/twse_provider.go`:

```go
package stockprice

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	twseStockURL = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
	twseETFURL   = "https://openapi.twse.com.tw/v1/opendata/t187ap47_L"
)

type twseStock struct {
	Code string
	Name string
}

// TWSEProvider provides Taiwan stock search using TWSE OpenAPI data cached in memory.
type TWSEProvider struct {
	stockURL string
	etfURL   string
	client   *http.Client
	logger   *slog.Logger

	mu     sync.RWMutex
	stocks []twseStock // sorted slice for iteration
}

// NewTWSEProvider creates a TWSEProvider with default TWSE URLs.
// Call Start() to begin background refresh.
func NewTWSEProvider(logger *slog.Logger) *TWSEProvider {
	return NewTWSEProviderWithURLs(twseStockURL, twseETFURL).withLogger(logger)
}

// NewTWSEProviderWithURLs creates a TWSEProvider with custom URLs (for testing).
func NewTWSEProviderWithURLs(stockURL, etfURL string) *TWSEProvider {
	return &TWSEProvider{
		stockURL: stockURL,
		etfURL:   etfURL,
		client:   &http.Client{Timeout: 30 * time.Second},
		logger:   slog.Default(),
	}
}

func (p *TWSEProvider) withLogger(logger *slog.Logger) *TWSEProvider {
	if logger != nil {
		p.logger = logger
	}
	return p
}

// Start begins initial fetch and background refresh every 24 hours.
// Non-blocking: initial fetch runs in a goroutine.
func (p *TWSEProvider) Start(ctx context.Context) {
	go func() {
		if err := p.refresh(ctx); err != nil {
			p.logger.Warn("TWSE initial fetch failed, retrying in 1 minute", "error", err)
			time.Sleep(1 * time.Minute)
			if err := p.refresh(ctx); err != nil {
				p.logger.Error("TWSE retry fetch failed", "error", err)
			}
		}

		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := p.refresh(ctx); err != nil {
					p.logger.Warn("TWSE refresh failed, keeping stale cache", "error", err)
				}
			}
		}
	}()
}

func (p *TWSEProvider) refresh(ctx context.Context) error {
	stocks, err := p.fetchStocks(ctx)
	if err != nil {
		return fmt.Errorf("fetch stocks: %w", err)
	}
	etfs, err := p.fetchETFs(ctx)
	if err != nil {
		return fmt.Errorf("fetch ETFs: %w", err)
	}

	combined := make([]twseStock, 0, len(stocks)+len(etfs))
	combined = append(combined, stocks...)
	combined = append(combined, etfs...)

	p.mu.Lock()
	p.stocks = combined
	p.mu.Unlock()

	p.logger.Info("TWSE cache refreshed", "stocks", len(stocks), "etfs", len(etfs))
	return nil
}

func (p *TWSEProvider) fetchStocks(ctx context.Context) ([]twseStock, error) {
	type entry struct {
		Code string `json:"公司代號"`
		Name string `json:"公司簡稱"`
	}
	var entries []entry
	if err := p.fetchJSON(ctx, p.stockURL, &entries); err != nil {
		return nil, err
	}
	result := make([]twseStock, 0, len(entries))
	for _, e := range entries {
		if e.Code != "" && e.Name != "" {
			result = append(result, twseStock{Code: strings.TrimSpace(e.Code), Name: strings.TrimSpace(e.Name)})
		}
	}
	return result, nil
}

func (p *TWSEProvider) fetchETFs(ctx context.Context) ([]twseStock, error) {
	type entry struct {
		Code string `json:"基金代號"`
		Name string `json:"基金簡稱"`
	}
	var entries []entry
	if err := p.fetchJSON(ctx, p.etfURL, &entries); err != nil {
		return nil, err
	}
	result := make([]twseStock, 0, len(entries))
	for _, e := range entries {
		if e.Code != "" && e.Name != "" {
			result = append(result, twseStock{Code: strings.TrimSpace(e.Code), Name: strings.TrimSpace(e.Name)})
		}
	}
	return result, nil
}

func (p *TWSEProvider) fetchJSON(ctx context.Context, url string, target interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("fetch %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("fetch %s: HTTP %d", url, resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read %s: %w", url, err)
	}
	return json.Unmarshal(body, target)
}

// Search finds stocks matching query by code prefix or name substring. Max 10 results.
func (p *TWSEProvider) Search(_ context.Context, query string) ([]SearchResult, error) {
	if query == "" {
		return nil, nil
	}
	query = strings.TrimSpace(query)
	queryLower := strings.ToLower(query)

	p.mu.RLock()
	defer p.mu.RUnlock()

	var results []SearchResult
	for _, s := range p.stocks {
		if strings.HasPrefix(strings.ToLower(s.Code), queryLower) || strings.Contains(strings.ToLower(s.Name), queryLower) {
			results = append(results, SearchResult{
				Symbol: s.Code,
				Name:   s.Name,
				Market: "TW",
			})
			if len(results) >= 10 {
				break
			}
		}
	}
	return results, nil
}
```

- [ ] Run tests to verify they pass:

```bash
cd backend && go test ./pkg/stockprice/... -run TestTWSE -v
```

Expected: all 5 tests PASS.

- [ ] Commit:

```bash
cd backend && git add pkg/stockprice/twse_provider.go pkg/stockprice/twse_provider_test.go
git commit -m "feat(stockprice): add TWSEProvider for Taiwan stock search with Chinese names"
```

---

## Task 2: Yahoo Search — US-only filtering

**Files:**
- Modify: `backend/pkg/stockprice/provider.go:165-216`

### Step 1: Add SearchUS method

- [ ] Add `SearchUS` method to `YahooProvider` that calls `Search` then filters to US market only:

```go
// SearchUS queries Yahoo Finance and returns only US market EQUITY/ETF results.
func (p *YahooProvider) SearchUS(ctx context.Context, query string) ([]SearchResult, error) {
	results, err := p.Search(ctx, query)
	if err != nil {
		return nil, err
	}
	usOnly := make([]SearchResult, 0, len(results))
	for _, r := range results {
		if r.Market == "US" {
			usOnly = append(usOnly, r)
		}
	}
	return usOnly, nil
}
```

Add this after the existing `Search` method (after line 216).

- [ ] Verify build:

```bash
cd backend && go build ./pkg/stockprice/...
```

- [ ] Commit:

```bash
git add pkg/stockprice/provider.go
git commit -m "feat(stockprice): add SearchUS to YahooProvider for US-only filtering"
```

---

## Task 3: StockHandler — market-based routing

**Files:**
- Modify: `backend/internal/delivery/http/stock_handler.go` (StockHandler struct + SearchStocks + NewStockHandler)
- Modify: `backend/cmd/api/main.go:173-176` (wire TWSEProvider)

### Step 1: Update StockHandler to hold both providers

- [ ] Add `twseProvider` field to `StockHandler` struct and update `NewStockHandler`:

```go
// StockHandler handles stock-specific HTTP requests.
type StockHandler struct {
	stockService  *usecase.StockService
	priceProvider stockprice.Provider
	twseProvider  *stockprice.TWSEProvider
	logger        *slog.Logger
}

// NewStockHandler creates a new StockHandler.
func NewStockHandler(stockService *usecase.StockService, priceProvider stockprice.Provider, twseProvider *stockprice.TWSEProvider, logger *slog.Logger) *StockHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &StockHandler{stockService: stockService, priceProvider: priceProvider, twseProvider: twseProvider, logger: logger}
}
```

### Step 2: Update SearchStocks to route by market

- [ ] Replace the `SearchStocks` method:

```go
// SearchStocks handles GET /accounts/stocks/search?q=...&market=TW|US
func (h *StockHandler) SearchStocks(c *gin.Context) {
	query := c.Query("q")
	market := c.Query("market")

	if market != "TW" && market != "US" {
		BadRequest(c, "market must be TW or US")
		return
	}

	if query == "" {
		Success(c, []stockSearchResponse{})
		return
	}

	var results []stockprice.SearchResult
	var err error

	if market == "TW" {
		results, err = h.twseProvider.Search(c.Request.Context(), query)
	} else {
		yahooProvider, ok := h.priceProvider.(*stockprice.YahooProvider)
		if !ok {
			h.logger.Error("price provider is not YahooProvider, cannot search US stocks")
			Success(c, []stockSearchResponse{})
			return
		}
		results, err = yahooProvider.SearchUS(c.Request.Context(), query)
	}

	if err != nil {
		h.logger.Warn("stock search failed, returning empty results", "query", query, "market", market, "error", err)
		Success(c, []stockSearchResponse{})
		return
	}

	resp := make([]stockSearchResponse, len(results))
	for i, r := range results {
		resp[i] = stockSearchResponse{
			Symbol: r.Symbol,
			Name:   r.Name,
			Market: r.Market,
		}
	}

	Success(c, resp)
}
```

### Step 3: Update DI in main.go

- [ ] In `backend/cmd/api/main.go`, around lines 173-176, update to create and start TWSEProvider:

Find:
```go
	// Stock service
	priceProvider := stockprice.NewYahooProvider()
	stockService := usecase.NewStockService(accountRepo, txRepo, txMgr, priceProvider, logger.Get())
	stockHandler := httpdelivery.NewStockHandler(stockService, priceProvider, logger.Get())
```

Replace with:
```go
	// Stock service
	priceProvider := stockprice.NewYahooProvider()
	twseProvider := stockprice.NewTWSEProvider(logger.Get())
	twseProvider.Start(context.Background())
	stockService := usecase.NewStockService(accountRepo, txRepo, txMgr, priceProvider, logger.Get())
	stockHandler := httpdelivery.NewStockHandler(stockService, priceProvider, twseProvider, logger.Get())
```

### Step 4: Build and verify

- [ ] Build the entire backend:

```bash
cd backend && CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include" CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib" go build ./...
```

Expected: no errors.

- [ ] Commit:

```bash
git add internal/delivery/http/stock_handler.go cmd/api/main.go
git commit -m "feat(stock): route search by market — TW uses TWSE, US uses Yahoo"
```

---

## Task 4: Shared hook — add market parameter

**Files:**
- Modify: `packages/shared/src/hooks/useAccounts.ts:101-111`

### Step 1: Update useStockSearch

- [ ] Change the `useStockSearch` function to accept a `market` parameter:

Find (lines 101-111):
```typescript
export function useStockSearch(query: string) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['stock-search', query],
    queryFn: () =>
      api.get<ApiResponse<StockSearchResult[]>>('/accounts/stocks/search', { params: { q: query } })
        .then((r) => r.data),
    enabled: query.length >= 1,
    staleTime: 30_000,
  })
}
```

Replace with:
```typescript
export function useStockSearch(query: string, market: 'TW' | 'US' = 'TW') {
  const api = getApiClient()
  return useQuery({
    queryKey: ['stock-search', query, market],
    queryFn: () =>
      api.get<ApiResponse<StockSearchResult[]>>('/accounts/stocks/search', { params: { q: query, market } })
        .then((r) => r.data),
    enabled: query.length >= 1,
    staleTime: 30_000,
  })
}
```

- [ ] Commit:

```bash
git add packages/shared/src/hooks/useAccounts.ts
git commit -m "feat(shared): add market parameter to useStockSearch hook"
```

---

## Task 5: APP — market chips UI

**Files:**
- Modify: `app/components/quickcreate/AccountQuickCreate.tsx`

### Step 1: Add market state and chips

- [ ] Add `stockMarket` state next to existing `stockForm` state (around line 42):

After:
```typescript
  const [showResults, setShowResults] = useState(false)
```

Add:
```typescript
  const [stockMarket, setStockMarket] = useState<'TW' | 'US'>('TW')
```

- [ ] In the `useEffect` that resets on `visible` (line 67-81), add reset for `stockMarket`:

After `setShowResults(false)` add:
```typescript
      setStockMarket('TW')
```

- [ ] Update `useStockSearch` call (line 60) to pass market:

```typescript
  const { data: searchResults, isLoading: isSearching } = useStockSearch(debouncedQuery, stockMarket)
```

- [ ] In `handleSelectStock` callback (line 147-161), remove the line that sets `stock_market` from search result and set currency from `stockMarket` state:

```typescript
  const handleSelectStock = useCallback((stock: StockSearchResult) => {
    setSelectedStock(stock)
    setShowResults(false)
    setSearchQuery('')
    setStockForm((prev) => ({
      ...prev,
      stock_symbol: stock.symbol,
      stock_market: stockMarket,
    }))
    setForm((prev) => ({
      ...prev,
      name: stock.name,
      currency: stockMarket === 'TW' ? 'TWD' : 'USD',
    }))
  }, [stockMarket])
```

- [ ] In `handleTypeChange` (line 126-145), also reset `stockMarket`:

After `setShowResults(false)` add:
```typescript
      setStockMarket('TW')
```

- [ ] Add market chips UI. Inside the `{isStock && ( ... )}` block (line 197), add before `{/* Stock Search */}`:

```tsx
                {/* Market Selection */}
                <Text style={labelStyle}>市場</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  {([['TW', '台股'], ['US', '美股']] as const).map(([value, label]) => (
                    <TouchableOpacity
                      key={value}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
                        backgroundColor: stockMarket === value ? Colors.primary : '#f3f4f6',
                      }}
                      onPress={() => {
                        setStockMarket(value)
                        setSelectedStock(null)
                        setSearchQuery('')
                        setDebouncedQuery('')
                        setShowResults(false)
                        setStockForm(prev => ({ ...prev, stock_symbol: '', stock_market: value }))
                        setForm(prev => ({ ...prev, name: '', currency: value === 'TW' ? 'TWD' : 'USD' }))
                      }}
                    >
                      <Text style={{ fontWeight: '500', color: stockMarket === value ? '#fff' : '#4b5563' }}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
```

### Step 2: Verify

- [ ] Run TypeScript check:

```bash
cd packages/shared && npx tsc --noEmit 2>&1 | grep -v "existing errors" || true
```

Verify no NEW errors related to `useStockSearch` or `stockMarket`.

- [ ] Commit:

```bash
git add app/components/quickcreate/AccountQuickCreate.tsx
git commit -m "feat(app): add market selector chips for stock account creation"
```

---

## Task 6: Web — market chips UI

**Files:**
- Modify: `frontend/src/pages/AccountsPage.tsx`

### Step 1: Add market state and chips

- [ ] Add `stockMarket` state. Find existing stock-related states (around lines 38-51) and add:

```typescript
  const [stockMarket, setStockMarket] = useState<'TW' | 'US'>('TW')
```

- [ ] Update `useStockSearch` call (line 51) to pass market:

```typescript
  const { data: stockSearchResults, isLoading: isStockSearching } = useStockSearch(debouncedStockQuery, stockMarket)
```

- [ ] In the form reset (inside `handleSubmit` `onSuccess`, around line 108), add:

```typescript
          setStockMarket('TW')
```

- [ ] Find the stock search JSX section (where `form.type === 'STOCK'` conditional renders search UI). Add market chips before the search input, similar style to the account type chips already in the form. When a chip is clicked:
  - Set `stockMarket`
  - Clear `selectedStock`, `stockSearchQuery`, `debouncedStockQuery`, `showStockResults`
  - Update `form.stock_market` and `form.currency`

- [ ] In `handleSelectStock`, set `stock_market` from `stockMarket` state instead of from search result.

### Step 2: Verify

- [ ] Run frontend type check:

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] Commit:

```bash
git add frontend/src/pages/AccountsPage.tsx
git commit -m "feat(web): add market selector chips for stock account creation"
```

---

## Task 7: End-to-end verification

- [ ] Start the backend (or use dev environment) and test:
  - `GET /accounts/stocks/search?q=2330&market=TW` → returns `{symbol: "2330", name: "台積電", market: "TW"}`
  - `GET /accounts/stocks/search?q=AAPL&market=US` → returns `{symbol: "AAPL", name: "Apple Inc.", market: "US"}`
  - `GET /accounts/stocks/search?q=2330&market=US` → returns empty (2330 is not US)
  - `GET /accounts/stocks/search?q=test` (no market) → returns 400

- [ ] Run all backend tests:

```bash
cd backend && CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include" CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib" go test ./... -v
```

- [ ] Final commit with any fixes if needed.
