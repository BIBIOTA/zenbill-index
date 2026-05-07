# 台幣淨資產趨勢 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 6-month TWD net asset trend line chart to the dashboard, positioned above SpendingChart.

**Architecture:** Backend computes monthly net asset by summing current TWD account balances, then subtracting monthly net changes (income - expense) backwards. Frontend renders a green-themed line chart identical in structure to SpendingChart.

**Tech Stack:** Go/Gin/GORM (backend), React Native + react-native-svg (frontend), TanStack Query (data fetching)

---

## Design Summary

- 從當前 TWD 帳戶餘額反推過去 6 個月的月底淨資產
- 轉帳不影響淨資產（同幣別帳戶間互轉抵消）
- 綠色系折線圖，支援觸控 tooltip

---

### Task 1: Backend — Domain types for net asset trend

**Files:**
- Modify: `backend/internal/domain/account.go`

**Step 1: Add MonthlyNetAsset struct**

Add to the end of `backend/internal/domain/account.go`:

```go
// MonthlyNetAsset holds the net asset value at the end of a month.
type MonthlyNetAsset struct {
	Month    string  `json:"month"`     // "2026-03"
	NetAsset float64 `json:"net_asset"`
}
```

**Step 2: Commit**

```bash
git add backend/internal/domain/account.go
git commit -m "feat: add MonthlyNetAsset domain type"
```

---

### Task 2: Backend — Add GetNetAssetTrend to AccountRepository interface

**Files:**
- Modify: `backend/internal/domain/repository.go:75-84` (AccountRepository interface)

**Step 1: Add method to interface**

Add before the closing `}` of `AccountRepository` interface:

```go
	// GetNetAssetTrend returns monthly net asset values by reverse-computing from current balances
	GetNetAssetTrend(ctx context.Context, userID uuid.UUID, months int) ([]MonthlyNetAsset, error)
```

**Step 2: Commit**

```bash
git add backend/internal/domain/repository.go
git commit -m "feat: add GetNetAssetTrend to AccountRepository interface"
```

---

### Task 3: Backend — Implement GetNetAssetTrend in repository

**Files:**
- Modify: `backend/internal/repository/account_repository.go`

**Step 1: Add the implementation**

Add to `AccountRepositoryImpl`:

```go
// GetNetAssetTrend computes monthly net asset values for TWD accounts.
// It sums current balances, then reverse-computes past month-end values
// by subtracting each month's net change (income - expense).
func (r *AccountRepositoryImpl) GetNetAssetTrend(ctx context.Context, userID uuid.UUID, months int) ([]domain.MonthlyNetAsset, error) {
	// 1. Get current total TWD balance
	var currentBalance struct {
		Total float64 `gorm:"column:total"`
	}
	err := r.db.WithContext(ctx).
		Model(&domain.Account{}).
		Select("COALESCE(SUM(balance), 0) as total").
		Where("user_id = ? AND currency = 'TWD'", userID).
		Scan(&currentBalance).Error
	if err != nil {
		return nil, err
	}

	// 2. Get monthly net changes (income - expense) for TWD accounts
	now := time.Now()
	startMonth := time.Date(now.Year(), now.Month()-time.Month(months-1), 1, 0, 0, 0, 0, now.Location())

	type monthlyChange struct {
		Month  string  `gorm:"column:month"`
		TxType string  `gorm:"column:tx_type"`
		Total  float64 `gorm:"column:total"`
	}
	var rows []monthlyChange
	err = r.db.WithContext(ctx).
		Model(&domain.Transaction{}).
		Joins("JOIN accounts ON accounts.id = transactions.account_id").
		Select("to_char(transactions.occurred_at, 'YYYY-MM') as month, transactions.type as tx_type, COALESCE(SUM(transactions.amount), 0) as total").
		Where("transactions.user_id = ? AND transactions.occurred_at >= ? AND accounts.currency = 'TWD' AND transactions.type IN ('EXPENSE', 'INCOME')",
			userID, startMonth).
		Group("month, tx_type").
		Order("month ASC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}

	// 3. Build monthly net change map
	type netChange struct {
		income  float64
		expense float64
	}
	changeMap := make(map[string]*netChange)
	for _, row := range rows {
		nc, ok := changeMap[row.Month]
		if !ok {
			nc = &netChange{}
			changeMap[row.Month] = nc
		}
		switch domain.TransactionType(row.TxType) {
		case domain.TransactionTypeIncome:
			nc.income = row.Total
		case domain.TransactionTypeExpense:
			nc.expense = row.Total
		}
	}

	// 4. Generate month keys (oldest to newest)
	monthKeys := make([]string, months)
	for i := 0; i < months; i++ {
		m := time.Date(now.Year(), now.Month()-time.Month(months-1-i), 1, 0, 0, 0, 0, now.Location())
		monthKeys[i] = m.Format("2006-01")
	}

	// 5. Reverse-compute: start from current balance, work backwards
	result := make([]domain.MonthlyNetAsset, months)
	balance := currentBalance.Total
	for i := months - 1; i >= 0; i-- {
		result[i] = domain.MonthlyNetAsset{
			Month:    monthKeys[i],
			NetAsset: balance,
		}
		// Subtract this month's net change to get previous month-end
		if nc, ok := changeMap[monthKeys[i]]; ok {
			balance = balance - nc.income + nc.expense
		}
	}

	return result, nil
}
```

Note: Need to add `"time"` to the imports and `domain.Transaction` model reference. The import for `domain` is already present.

**Step 2: Verify it compiles**

```bash
cd backend && go build ./...
```

**Step 3: Commit**

```bash
git add backend/internal/repository/account_repository.go
git commit -m "feat: implement GetNetAssetTrend in account repository"
```

---

### Task 4: Backend — Add HTTP handler for net asset trend

**Files:**
- Modify: `backend/internal/delivery/http/account_handler.go`

**Step 1: Add the handler method**

Add after `DeleteAccount` and before `RegisterRoutes`:

```go
// GetNetAssetTrend godoc
// @Summary      取得淨資產趨勢
// @Description  取得過去 N 個月的台幣淨資產趨勢
// @Tags         帳戶
// @Produce      json
// @Param        months  query     int  false  "月數 (預設 6)"
// @Success      200     {object}  Response{data=[]domain.MonthlyNetAsset}
// @Failure      500     {object}  Response
// @Router       /accounts/net-asset-trend [get]
func (h *AccountHandler) GetNetAssetTrend(c *gin.Context) {
	ctx := c.Request.Context()
	userID := getUserID(c)

	months := 6
	if m := c.Query("months"); m != "" {
		if parsed, err := strconv.Atoi(m); err == nil && parsed > 0 && parsed <= 24 {
			months = parsed
		}
	}

	trend, err := h.accountRepo.GetNetAssetTrend(ctx, userID, months)
	if err != nil {
		h.logger.ErrorContext(ctx, "Failed to get net asset trend", "error", err)
		InternalServerError(c, "failed to get net asset trend")
		return
	}

	Success(c, trend)
}
```

**Step 2: Register the route**

In `RegisterRoutes`, add before the existing routes (so `/accounts/net-asset-trend` is matched before `/:id`):

```go
accounts.GET("/net-asset-trend", h.GetNetAssetTrend)
```

The route group should look like:

```go
func (h *AccountHandler) RegisterRoutes(r *gin.RouterGroup) {
	accounts := r.Group("/accounts")
	{
		accounts.GET("/net-asset-trend", h.GetNetAssetTrend)
		accounts.GET("", h.ListAccounts)
		accounts.POST("", h.CreateAccount)
		accounts.GET("/:id", h.GetAccount)
		accounts.PUT("/:id", h.UpdateAccount)
		accounts.DELETE("/:id", h.DeleteAccount)
	}
}
```

Note: Need to add `"strconv"` to imports.

**Step 3: Verify it compiles**

```bash
cd backend && go build ./...
```

**Step 4: Commit**

```bash
git add backend/internal/delivery/http/account_handler.go
git commit -m "feat: add GET /accounts/net-asset-trend API endpoint"
```

---

### Task 5: Frontend — Add types and hook

**Files:**
- Modify: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/hooks/useNetAssetTrend.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Add MonthlyNetAsset type**

In `packages/shared/src/types/index.ts`, add after the `TransactionStats` interface:

```typescript
// === Net Asset Trend ===
export interface MonthlyNetAsset {
  month: string
  net_asset: number
}
```

**Step 2: Create the hook**

Create `packages/shared/src/hooks/useNetAssetTrend.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { ApiResponse, MonthlyNetAsset } from '../types/index.ts'

export function useNetAssetTrend(months = 6) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['net-asset-trend', months],
    queryFn: () =>
      api.get<ApiResponse<MonthlyNetAsset[]>>(`/accounts/net-asset-trend?months=${months}`),
    select: (res) => res.data,
  })
}
```

**Step 3: Export from index**

In `packages/shared/src/index.ts`, add:

```typescript
export * from './hooks/useNetAssetTrend.ts'
```

**Step 4: Commit**

```bash
git add packages/shared/src/types/index.ts packages/shared/src/hooks/useNetAssetTrend.ts packages/shared/src/index.ts
git commit -m "feat: add MonthlyNetAsset type and useNetAssetTrend hook"
```

---

### Task 6: Frontend — Create NetAssetChart component

**Files:**
- Create: `app/components/dashboard/NetAssetChart.tsx`

**Step 1: Create the component**

Create `app/components/dashboard/NetAssetChart.tsx`. This is a copy of `SpendingChart.tsx` with these changes:
- Props accept `MonthlyNetAsset[]` instead of `MonthlySummary[]`
- Values use `net_asset` instead of `expense`
- Colors: `#10b981` (emerald-500) instead of `#6366f1` (indigo)
- Gradient: emerald green instead of indigo
- Title: "淨資產趨勢" instead of "支出趨勢"
- Empty state text: "尚無資料"

```typescript
import { useState, useRef, useMemo } from 'react'
import { View, Text, PanResponder, useWindowDimensions } from 'react-native'
import Svg, { Path, Line, Circle, Rect, G, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg'
import type { MonthlyNetAsset } from '@zenbill/shared'
import { Card } from '../ui/Card'

interface Props {
  data: MonthlyNetAsset[]
}

function findNearestIndex(points: { x: number; y: number }[], touchX: number): number {
  let minDist = Infinity
  let nearest = 0
  for (let i = 0; i < points.length; i++) {
    const dist = Math.abs(points[i].x - touchX)
    if (dist < minDist) {
      minDist = dist
      nearest = i
    }
  }
  return nearest
}

export function NetAssetChart({ data }: Props) {
  const { width: screenWidth } = useWindowDimensions()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  if (data.length === 0) {
    return (
      <Card style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8 }}>淨資產趨勢</Text>
        <Text style={{ fontSize: 13, color: '#9ca3af' }}>尚無資料</Text>
      </Card>
    )
  }

  const svgWidth = screenWidth - 64
  const chartHeight = 160
  const paddingTop = 30
  const paddingBottom = 24
  const paddingLeft = 20
  const paddingRight = 20
  const plotWidth = svgWidth - paddingLeft - paddingRight

  const labels = data.map((m) => `${parseInt(m.month.split('-')[1], 10)}月`)
  const values = data.map((m) => m.net_asset)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1
  const graphHeight = chartHeight - paddingTop - paddingBottom

  const points = values.map((v, i) => ({
    x: paddingLeft + (values.length === 1 ? plotWidth / 2 : (i / (values.length - 1)) * plotWidth),
    y: paddingTop + graphHeight - ((v - minVal) / range) * graphHeight * 0.85 - graphHeight * 0.075,
  }))

  const pointsRef = useRef(points)
  pointsRef.current = points

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const touchX = evt.nativeEvent.locationX
          setActiveIndex(findNearestIndex(pointsRef.current, touchX))
        },
        onPanResponderMove: (evt) => {
          const touchX = evt.nativeEvent.locationX
          setActiveIndex(findNearestIndex(pointsRef.current, touchX))
        },
        onPanResponderRelease: () => setActiveIndex(null),
        onPanResponderTerminate: () => setActiveIndex(null),
      }),
    []
  )

  const linePath = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${chartHeight - paddingBottom} L${points[0].x},${chartHeight - paddingBottom} Z`

  const accentColor = '#10b981'

  return (
    <Card style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 12 }}>淨資產趨勢</Text>
      <View {...panResponder.panHandlers}>
        <Svg width={svgWidth} height={chartHeight}>
          <Defs>
            <LinearGradient id="netAssetGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={accentColor} stopOpacity="0.3" />
              <Stop offset="1" stopColor={accentColor} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          {/* Grid lines */}
          {[0, 1, 2].map((i) => {
            const y = paddingTop + (graphHeight / 2) * i
            return <Line key={i} x1={paddingLeft} y1={y} x2={svgWidth - paddingRight} y2={y} stroke="#f1f5f9" strokeWidth={1} />
          })}
          {/* Area fill */}
          <Path d={areaPath} fill="url(#netAssetGrad)" />
          {/* Line */}
          <Path d={linePath} stroke={accentColor} strokeWidth={2} fill="none" />
          {/* X-axis labels */}
          {points.map((p, i) => (
            <SvgText key={i} x={p.x} y={chartHeight - 4} fontSize={10} fill="#9ca3af" textAnchor="middle">
              {labels[i]}
            </SvgText>
          ))}
          {/* Data points */}
          {points.map((p, i) => (
            <Circle key={`dot-${i}`} cx={p.x} cy={p.y} r={3} fill={activeIndex === i ? 'transparent' : accentColor} />
          ))}
          {/* Active tooltip overlay */}
          {activeIndex !== null && (() => {
            const p = points[activeIndex]
            const amount = `$${values[activeIndex].toLocaleString()}`
            const bubbleW = 100
            const bubbleH = 28
            const bubbleY = p.y - bubbleH - 14
            const triangleSize = 5
            const bubbleCenterX = Math.max(
              paddingLeft + bubbleW / 2,
              Math.min(p.x, svgWidth - paddingRight - bubbleW / 2)
            )
            const bubbleX = bubbleCenterX - bubbleW / 2

            return (
              <G>
                <Line x1={p.x} y1={paddingTop} x2={p.x} y2={chartHeight - paddingBottom} stroke={accentColor} strokeWidth={1} strokeDasharray="4,4" opacity={0.3} />
                <Circle cx={p.x} cy={p.y} r={5} fill={accentColor} stroke="#fff" strokeWidth={2} />
                <Rect x={bubbleX} y={bubbleY} width={bubbleW} height={bubbleH} rx={6} ry={6} fill="#1e293b" />
                <Path d={`M${p.x - triangleSize},${bubbleY + bubbleH} L${p.x + triangleSize},${bubbleY + bubbleH} L${p.x},${bubbleY + bubbleH + triangleSize} Z`} fill="#1e293b" />
                <SvgText x={bubbleCenterX} y={bubbleY + bubbleH / 2 + 4} fontSize={12} fontWeight="600" fill="#ffffff" textAnchor="middle">
                  {amount}
                </SvgText>
              </G>
            )
          })()}
        </Svg>
      </View>
    </Card>
  )
}
```

Key differences from SpendingChart:
- **Y-axis scaling**: Uses `minVal`/`maxVal` range instead of 0-based, since net asset values are large absolute numbers where the range matters more than distance from zero
- **Bubble width**: 100px instead of 80px (net asset values are typically larger numbers)
- **Color**: `#10b981` (emerald) throughout

**Step 2: Commit**

```bash
git add app/components/dashboard/NetAssetChart.tsx
git commit -m "feat: add NetAssetChart dashboard component"
```

---

### Task 7: Frontend — Integrate NetAssetChart into Dashboard

**Files:**
- Modify: `app/app/(tabs)/index.tsx`

**Step 1: Add import**

Add to imports:

```typescript
import { useNetAssetTrend } from '@zenbill/shared'
import { NetAssetChart } from '../../components/dashboard/NetAssetChart'
```

**Step 2: Add hook call**

Inside `DashboardPage`, after the existing `stats` hook:

```typescript
const netAssetTrend = useNetAssetTrend(6)
```

**Step 3: Add chart to ListHeader**

In the `ListHeader` JSX, add `<NetAssetChart>` between the second StatCard row and `<SpendingChart>`:

```tsx
      {/* After the second StatCard row, before SpendingChart */}
      <NetAssetChart data={netAssetTrend.data ?? []} />

      <SpendingChart monthly={stats.data?.monthly ?? []} />
```

**Step 4: Commit**

```bash
git add app/app/\(tabs\)/index.tsx
git commit -m "feat: integrate NetAssetChart into dashboard"
```

---

### Task 8: Verify everything works end-to-end

**Step 1: Verify backend compiles**

```bash
cd backend && go build ./...
```

**Step 2: Verify frontend types**

```bash
cd packages/shared && npx tsc --noEmit
```

**Step 3: Verify app builds**

```bash
cd app && npx expo export --platform web 2>&1 | head -20
```

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A && git commit -m "fix: address build issues for net asset trend"
```
