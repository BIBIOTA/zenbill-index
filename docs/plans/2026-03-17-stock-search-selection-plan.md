# Stock Search & Selection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual stock symbol entry with a search-driven selector that queries Yahoo Finance and auto-fills account fields.

**Architecture:** Add `Search` method to existing `stockprice.Provider` interface, expose via new `GET /accounts/stocks/search` endpoint, and replace the manual symbol+market input in `AccountQuickCreate` with a debounced search dropdown.

**Tech Stack:** Go (Gin, GORM), TypeScript (React Native, React Query), Yahoo Finance Search API

**Spec:** `docs/superpowers/specs/2026-03-17-stock-search-selection-design.md`

---

## Chunk 1: Backend — Provider Search Method

### Task 1: Add Search to Provider Interface & Yahoo Implementation

**Files:**
- Modify: `backend/pkg/stockprice/provider.go`

- [ ] **Step 1: Add `SearchResult` struct and `Search` to `Provider` interface**

After the existing `Quote` struct (line 20), add:

```go
// SearchResult holds a single stock search result.
type SearchResult struct {
	Symbol string
	Name   string
	Market string // "TW" or "US"
}
```

Update `Provider` interface (line 23) to:

```go
type Provider interface {
	GetQuote(ctx context.Context, symbol string) (*Quote, error)
	GetQuotes(ctx context.Context, symbols []string) (map[string]*Quote, error)
	Search(ctx context.Context, query string) ([]SearchResult, error)
}
```

- [ ] **Step 2: Add Yahoo search response struct and market mapping**

After the existing `chartResponse` struct (around line 54), add:

```go
type searchResponse struct {
	Quotes []struct {
		Symbol    string `json:"symbol"`
		ShortName string `json:"shortname"`
		QuoteType string `json:"quoteType"`
		Exchange  string `json:"exchange"`
	} `json:"quotes"`
}

// exchangeToMarket maps Yahoo Finance exchange codes to ZenBill market codes.
// Returns empty string for unsupported markets.
func exchangeToMarket(exchange string) string {
	switch exchange {
	case "TAI":
		return "TW"
	case "NMS", "NYQ", "NGM", "PCX":
		return "US"
	default:
		return ""
	}
}
```

- [ ] **Step 3: Implement `Search` method on `YahooProvider`**

Add after the existing `GetQuotes` method:

```go
// Search queries Yahoo Finance for stocks matching the given query.
// Only returns EQUITY results from TW and US markets.
func (p *YahooProvider) Search(ctx context.Context, query string) ([]SearchResult, error) {
	u := fmt.Sprintf(
		"https://query2.finance.yahoo.com/v1/finance/search?q=%s&quotesCount=10&newsCount=0&listsCount=0",
		url.QueryEscape(query),
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, fmt.Errorf("create search request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("search stocks: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read search response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("search stocks: HTTP %d", resp.StatusCode)
	}

	var sr searchResponse
	if err := json.Unmarshal(body, &sr); err != nil {
		return nil, fmt.Errorf("parse search response: %w", err)
	}

	var results []SearchResult
	for _, q := range sr.Quotes {
		if q.QuoteType != "EQUITY" {
			continue
		}
		market := exchangeToMarket(q.Exchange)
		if market == "" {
			continue
		}
		results = append(results, SearchResult{
			Symbol: q.Symbol,
			Name:   q.ShortName,
			Market: market,
		})
	}

	return results, nil
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd backend && go build ./pkg/stockprice/...`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/stockprice/provider.go
git commit -m "feat(stockprice): add Search method to Provider interface"
```

### Task 2: Update Mock Provider in Tests

**Files:**
- Modify: `backend/internal/usecase/stock_service_test.go`

- [ ] **Step 1: Add `Search` method to `MockPriceProvider`**

After the existing `GetQuotes` mock (line 37), add:

```go
func (m *MockPriceProvider) Search(ctx context.Context, query string) ([]stockprice.SearchResult, error) {
	args := m.Called(ctx, query)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]stockprice.SearchResult), args.Error(1)
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `cd backend && go test ./internal/usecase/... -v -run TestStock`
Expected: All 5 existing stock tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/internal/usecase/stock_service_test.go
git commit -m "test(usecase): add Search to MockPriceProvider"
```

### Task 3: Add Search Unit Tests for Yahoo Provider

**Files:**
- Create: `backend/pkg/stockprice/provider_test.go`

- [ ] **Step 1: Write test for `exchangeToMarket` mapping**

```go
package stockprice

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestExchangeToMarket(t *testing.T) {
	tests := []struct {
		exchange string
		want     string
	}{
		{"TAI", "TW"},
		{"NMS", "US"},
		{"NYQ", "US"},
		{"NGM", "US"},
		{"PCX", "US"},
		{"LSE", ""},
		{"TYO", ""},
		{"", ""},
	}
	for _, tt := range tests {
		t.Run(tt.exchange, func(t *testing.T) {
			assert.Equal(t, tt.want, exchangeToMarket(tt.exchange))
		})
	}
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd backend && go test ./pkg/stockprice/... -v -run TestExchangeToMarket`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/pkg/stockprice/provider_test.go
git commit -m "test(stockprice): add exchangeToMarket unit tests"
```

---

## Chunk 2: Backend — HTTP Handler & Route

### Task 4: Add Search Handler

**Files:**
- Modify: `backend/internal/delivery/http/stock_handler.go`

- [ ] **Step 1: Add `priceProvider` field to `StockHandler`**

The handler needs direct access to the provider for search (search doesn't go through `StockService` since it has no business logic beyond proxying).

Update the struct and constructor:

```go
type StockHandler struct {
	stockService  *usecase.StockService
	priceProvider stockprice.Provider
	logger        *slog.Logger
}

func NewStockHandler(stockService *usecase.StockService, priceProvider stockprice.Provider, logger *slog.Logger) *StockHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &StockHandler{stockService: stockService, priceProvider: priceProvider, logger: logger}
}
```

Add the import for `stockprice`:

```go
import (
	"log/slog"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/usecase"
	"github.com/yukiota/zenbill/pkg/stockprice"
)
```

- [ ] **Step 2: Add `SearchStocks` handler method**

Add after the `RefreshPrices` method:

```go
type stockSearchResponse struct {
	Symbol string `json:"symbol"`
	Name   string `json:"name"`
	Market string `json:"market"`
}

// SearchStocks handles GET /accounts/stocks/search?q=...
func (h *StockHandler) SearchStocks(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		Success(c, []stockSearchResponse{})
		return
	}

	results, err := h.priceProvider.Search(c.Request.Context(), query)
	if err != nil {
		h.logger.Warn("stock search failed, returning empty results", "query", query, "error", err)
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

- [ ] **Step 3: Register the search route**

Update `RegisterRoutes` to add the GET route:

```go
func (h *StockHandler) RegisterRoutes(r *gin.RouterGroup) {
	stocks := r.Group("/accounts/stocks")
	{
		stocks.GET("/search", h.SearchStocks)
		stocks.POST("/buy", h.BuyStock)
		stocks.POST("/sell", h.SellStock)
		stocks.POST("/refresh-prices", h.RefreshPrices)
	}
}
```

- [ ] **Step 4: Update `NewStockHandler` call in `cmd/api/main.go`**

Find the line (around line 176):
```go
stockHandler := httpdelivery.NewStockHandler(stockService, logger.Get())
```

Change to:
```go
stockHandler := httpdelivery.NewStockHandler(stockService, priceProvider, logger.Get())
```

- [ ] **Step 5: Verify compilation**

Run: `cd backend && go build ./...`
Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
git add backend/internal/delivery/http/stock_handler.go backend/cmd/api/main.go
git commit -m "feat(http): add GET /accounts/stocks/search endpoint"
```

---

## Chunk 3: Frontend — Shared Types & Hook

### Task 5: Add StockSearchResult Type and useStockSearch Hook

**Files:**
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/hooks/useAccounts.ts`

- [ ] **Step 1: Add `StockSearchResult` type**

In `packages/shared/src/types/index.ts`, after the `SellStockInput` interface (line 62), add:

```typescript
export interface StockSearchResult {
  symbol: string
  name: string
  market: 'TW' | 'US'
}
```

- [ ] **Step 2: Add `useStockSearch` hook**

In `packages/shared/src/hooks/useAccounts.ts`:

Add `StockSearchResult` to the type import (line 3):
```typescript
import type { Account, ApiResponse, CreateAccountInput, BuyStockInput, SellStockInput, StockSearchResult } from '../types/index.ts'
```

Add the hook after `useSellStock` (at end of file):

```typescript
export function useStockSearch(query: string) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['stock-search', query],
    queryFn: () =>
      api.get<ApiResponse<StockSearchResult[]>>('/accounts/stocks/search', { params: { q: query } })
        .then((r) => r.data.data),
    enabled: query.length >= 1,
    staleTime: 30_000,
  })
}
```

- [ ] **Step 3: Export the new hook from shared barrel**

Check if there's a barrel export file. If `useStockSearch` is already exported via the `useAccounts.ts` re-export, no change needed. Verify the shared package's index file exports it.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/index.ts packages/shared/src/hooks/useAccounts.ts
git commit -m "feat(shared): add StockSearchResult type and useStockSearch hook"
```

---

## Chunk 4: Frontend — AccountQuickCreate Search UI

### Task 6: Replace Manual Symbol Input with Search Selector

**Files:**
- Modify: `app/components/quickcreate/AccountQuickCreate.tsx`

This is the largest change. We replace the stock symbol text input + TW/US market toggle with a debounced search input and dropdown list.

- [ ] **Step 1: Update imports**

Replace the import line (line 3):
```typescript
import { useCreateAccount, useAccounts, useBanks, useBuyStock } from '@zenbill/shared'
```
With:
```typescript
import { useCreateAccount, useAccounts, useBanks, useBuyStock, useStockSearch } from '@zenbill/shared'
```

Replace the type import (line 4):
```typescript
import type { AccountType, CreateAccountInput, BuyStockInput } from '@zenbill/shared'
```
With:
```typescript
import type { AccountType, CreateAccountInput, BuyStockInput, StockSearchResult } from '@zenbill/shared'
```

Add `useCallback` to the React import (line 1):
```typescript
import { useState, useEffect, useCallback } from 'react'
```

Add `ActivityIndicator` to the RN import (line 2):
```typescript
import { View, Text, TextInput, TouchableOpacity, Modal, Alert, ScrollView, Switch, ActivityIndicator } from 'react-native'
```

- [ ] **Step 2: Add search state and debounce logic**

Inside the component, after the existing `stockForm` state (line 42-48), add:

```typescript
const [searchQuery, setSearchQuery] = useState('')
const [debouncedQuery, setDebouncedQuery] = useState('')
const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null)
const [showResults, setShowResults] = useState(false)

// Debounce search query (500ms)
useEffect(() => {
  const timer = setTimeout(() => setDebouncedQuery(searchQuery), 500)
  return () => clearTimeout(timer)
}, [searchQuery])

const { data: searchResults, isLoading: isSearching } = useStockSearch(debouncedQuery)
```

- [ ] **Step 3: Add stock selection handler**

After the `handleTypeChange` function, add:

```typescript
const handleSelectStock = useCallback((stock: StockSearchResult) => {
  setSelectedStock(stock)
  setShowResults(false)
  setSearchQuery('')
  setStockForm((prev) => ({
    ...prev,
    stock_symbol: stock.symbol,
    stock_market: stock.market as 'TW' | 'US',
  }))
  setForm((prev) => ({
    ...prev,
    name: stock.name,
    currency: stock.market === 'TW' ? 'TWD' : 'USD',
  }))
}, [])

const handleClearStock = useCallback(() => {
  setSelectedStock(null)
  setSearchQuery('')
  setStockForm((prev) => ({ ...prev, stock_symbol: '', stock_market: 'TW' }))
  setForm((prev) => ({ ...prev, name: '', currency: 'TWD' }))
}, [])
```

- [ ] **Step 4: Reset search state on modal open and type change**

Update the `useEffect` that resets on `visible` (line 54-64) to also reset search state:

```typescript
useEffect(() => {
  if (visible) {
    setForm({
      name: initialName ?? '',
      type: 'BANK',
      currency: 'TWD',
      balance: 0,
    })
    setStockForm({ stock_symbol: '', stock_market: 'TW', shares: 0, price_per_share: 0, from_account_id: '' })
    setSearchQuery('')
    setDebouncedQuery('')
    setSelectedStock(null)
    setShowResults(false)
  }
}, [visible, initialName])
```

Update `handleTypeChange` to also reset search state when switching to STOCK:

```typescript
const handleTypeChange = (type: AccountType) => {
  setForm({
    name: form.name,
    type,
    currency: type === 'STOCK' ? 'TWD' : form.currency,
    balance: form.balance,
    bank_id: undefined,
    closing_day: undefined,
    payment_due_day: undefined,
    auto_pay_enabled: undefined,
    auto_pay_from_id: undefined,
  })
  if (type === 'STOCK') {
    setStockForm({ stock_symbol: '', stock_market: 'TW', shares: 0, price_per_share: 0, from_account_id: '' })
    setSearchQuery('')
    setDebouncedQuery('')
    setSelectedStock(null)
    setShowResults(false)
  }
}
```

- [ ] **Step 5: Remove manual `.TW` suffix in `handleSubmit`**

Replace the stock submission block in `handleSubmit` (lines 67-87):

```typescript
const handleSubmit = () => {
  if (form.type === 'STOCK') {
    if (!stockForm.stock_symbol.trim()) {
      Alert.alert('Error', '請先搜尋並選擇股票')
      return
    }
    buyStock.mutate({
      stock_symbol: stockForm.stock_symbol,
      stock_market: stockForm.stock_market,
      shares: stockForm.shares,
      price_per_share: stockForm.price_per_share,
      ...(stockForm.from_account_id ? { from_account_id: stockForm.from_account_id } : {}),
    } as BuyStockInput, {
      onSuccess: () => {
        onCreated({ id: '' })
        onClose()
      },
      onError: (e) => Alert.alert('Error', e.message),
    })
    return
  }

  // ... rest unchanged
```

Note: The symbol is now sent as-is (e.g., `2330.TW`) since it already comes with the suffix from Yahoo search results. The manual `stockForm.stock_market === 'TW' ? \`${stockForm.stock_symbol}.TW\` : stockForm.stock_symbol` logic is removed.

- [ ] **Step 6: Replace the stock-specific fields JSX**

Replace the entire `{isStock && (...)}` block (lines 153-224) with:

```tsx
{isStock && (
  <>
    {/* Stock Search */}
    <Text style={labelStyle}>搜尋股票</Text>
    {selectedStock ? (
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#f0f9ff', borderRadius: 10, padding: 12, marginBottom: 12,
        borderWidth: 1, borderColor: Colors.primary + '40',
      }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: Colors.text }}>
            {selectedStock.symbol}
          </Text>
          <Text style={{ fontSize: 13, color: Colors.textSecondary, marginTop: 2 }}>
            {selectedStock.name} · {selectedStock.market === 'TW' ? '台股' : '美股'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleClearStock} style={{ padding: 4 }}>
          <Text style={{ fontSize: 18, color: Colors.textSecondary }}>✕</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput
            style={[inputStyle, { flex: 1, marginBottom: 0 }]}
            placeholder="輸入代號或名稱，例：2330、台積電、AAPL"
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text)
              setShowResults(true)
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isSearching && (
            <ActivityIndicator size="small" color={Colors.primary} style={{ position: 'absolute', right: 12 }} />
          )}
        </View>
        {showResults && debouncedQuery.length >= 1 && (
          <View style={{
            borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
            marginTop: 4, maxHeight: 200, overflow: 'hidden',
          }}>
            {isSearching ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : searchResults && searchResults.length > 0 ? (
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {searchResults.map((stock) => (
                  <TouchableOpacity
                    key={stock.symbol}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 14, paddingVertical: 10,
                      borderBottomWidth: 1, borderBottomColor: Colors.border + '60',
                    }}
                    onPress={() => handleSelectStock(stock)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.text }}>
                        {stock.symbol}
                      </Text>
                      <Text style={{ fontSize: 12, color: Colors.textSecondary }}>
                        {stock.name}
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: stock.market === 'TW' ? '#dbeafe' : '#fef3c7',
                      paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4,
                    }}>
                      <Text style={{
                        fontSize: 11, fontWeight: '500',
                        color: stock.market === 'TW' ? '#1d4ed8' : '#92400e',
                      }}>
                        {stock.market === 'TW' ? '台股' : '美股'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={{ padding: 16, textAlign: 'center', color: Colors.textSecondary, fontSize: 13 }}>
                找不到相關股票
              </Text>
            )}
          </View>
        )}
      </View>
    )}

    {/* Shares & Price */}
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={labelStyle}>股數</Text>
        <TextInput
          style={inputStyle}
          placeholder="例：100"
          value={stockForm.shares ? String(stockForm.shares) : ''}
          onChangeText={(text) => setStockForm((prev) => ({ ...prev, shares: text ? Number(text) : 0 }))}
          keyboardType="numeric"
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={labelStyle}>買入價格</Text>
        <TextInput
          style={inputStyle}
          placeholder="例：580"
          value={stockForm.price_per_share ? String(stockForm.price_per_share) : ''}
          onChangeText={(text) => setStockForm((prev) => ({ ...prev, price_per_share: text ? Number(text) : 0 }))}
          keyboardType="numeric"
        />
      </View>
    </View>

    {/* Funding Account */}
    <Text style={labelStyle}>扣款帳戶</Text>
    <View style={{ marginBottom: 12 }}>
      <SearchableSelect
        value={stockForm.from_account_id || undefined}
        options={(accounts ?? [])
          .filter((a) => a.type === 'BANK' || a.type === 'CASH')
          .map((a) => ({ id: a.id, label: `${a.name} (${a.balance.toLocaleString()})` }))}
        placeholder="請選擇扣款帳戶"
        onChange={(val) => setStockForm((prev) => ({ ...prev, from_account_id: val ?? '' }))}
        allowClear
        useNativeModal
      />
    </View>
  </>
)}
```

- [ ] **Step 7: Verify the app compiles**

Run: `cd app && npx expo export --platform ios --no-minify 2>&1 | head -20` (or equivalent quick check)
Expected: No TypeScript errors

- [ ] **Step 8: Commit**

```bash
git add app/components/quickcreate/AccountQuickCreate.tsx
git commit -m "feat(app): replace manual stock input with search-driven selector"
```

---

## Chunk 5: Verification & Cleanup

### Task 7: Run All Backend Tests

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && go test ./... -v -count=1 2>&1 | tail -30`
Expected: All tests PASS (including the 5 existing stock tests + new `exchangeToMarket` tests)

- [ ] **Step 2: Run linter**

Run: `cd backend && golangci-lint run`
Expected: No errors

### Task 8: Manual Smoke Test Checklist

This task documents what to verify manually (not automated):

- [ ] **Step 1: Start backend and test search endpoint**

```bash
# In backend/
go run cmd/api/main.go
# In another terminal:
curl "http://localhost:8080/api/v1/accounts/stocks/search?q=2330" -H "Authorization: Bearer <token>"
```

Expected: JSON response with `2330.TW` in results, market `TW`

- [ ] **Step 2: Test edge cases**

```bash
# Empty query → empty results
curl "http://localhost:8080/api/v1/accounts/stocks/search?q=" -H "Authorization: Bearer <token>"

# Fuzzy name search
curl "http://localhost:8080/api/v1/accounts/stocks/search?q=apple" -H "Authorization: Bearer <token>"
```

- [ ] **Step 3: Test mobile UI**

1. Open the app → Accounts tab → FAB → 新增帳戶 → 選 "股票"
2. Type "2330" → verify dropdown appears with results
3. Tap "台積電" → verify symbol, market, name, currency auto-fill
4. Tap ✕ → verify fields clear
5. Type "apple" → verify US stocks appear
6. Select AAPL → verify currency changes to USD
7. Fill shares + price → submit → verify account created

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
