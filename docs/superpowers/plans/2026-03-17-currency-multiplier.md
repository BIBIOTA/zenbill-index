# Currency Multiplier Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to set a per-currency input multiplier so that entering `50` for VND (×1000) stores `50000` in the database.

**Architecture:** New `user_currency_settings` table with full Clean Architecture stack (domain → repository → usecase → handler). Frontend adds a shared hook `useCurrencySettings`, a settings page on both App and Web, and multiplier-aware amount input with real-time preview.

**Tech Stack:** Go/GORM (backend), React/React Native + React Query (frontend), PostgreSQL

**Spec:** `docs/superpowers/specs/2026-03-17-currency-multiplier-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `backend/internal/domain/currency_setting.go` | Domain entity with GORM tags |
| Modify | `backend/internal/domain/repository.go` | Add `CurrencySettingRepository` interface |
| Create | `backend/internal/repository/currency_setting_repository.go` | GORM implementation |
| Create | `backend/internal/usecase/currency_setting_service.go` | Validation + proxy to repo |
| Create | `backend/internal/delivery/http/currency_setting_handler.go` | GET/PUT endpoints |
| Modify | `backend/cmd/api/main.go` | Wire up handler + register routes |
| Modify | `backend/cmd/migrate/main.go` | Add model to migration list |
| Create | `packages/shared/src/hooks/useCurrencySettings.ts` | React Query hook |
| Modify | `packages/shared/src/types/index.ts` | Add `CurrencySetting` type |
| Modify | `packages/shared/src/index.ts` | Re-export new hook |
| Create | `app/app/settings/currency-units.tsx` | App settings page |
| Modify | `app/app/(tabs)/more.tsx` | Add menu item for currency units |
| Create | `frontend/src/pages/CurrencySettingsPage.tsx` | Web settings page |
| Modify | `frontend/src/App.tsx` | Add route |
| Modify | `frontend/src/components/layout/Sidebar.tsx` | Add nav link |
| Modify | `app/components/transactions/TransactionForm.tsx` | Multiplier preview on amount input |
| Modify | `frontend/src/components/transactions/TransactionForm.tsx` | Multiplier preview on amount input |
| Modify | `app/components/quickcreate/AccountQuickCreate.tsx` | Multiplier preview on balance input |

---

## Task 1: Backend Domain Entity

**Files:**
- Create: `backend/internal/domain/currency_setting.go`

- [ ] **Step 1: Create the domain entity file**

```go
// backend/internal/domain/currency_setting.go
package domain

import (
	"time"

	"github.com/google/uuid"
)

// CurrencySetting stores a user's preferred input multiplier for a currency.
// For example, VND with multiplier 1000 means entering "50" stores 50000.
type CurrencySetting struct {
	ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID       uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_ucs_user_currency" json:"user_id"`
	CurrencyCode string    `gorm:"type:varchar(3);not null;uniqueIndex:idx_ucs_user_currency" json:"currency_code"`
	Multiplier   float64   `gorm:"type:decimal(19,4);not null;default:1" json:"multiplier"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (CurrencySetting) TableName() string {
	return "user_currency_settings"
}
```

- [ ] **Step 2: Build to verify no syntax errors**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/domain/...`
Expected: success, no errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/domain/currency_setting.go
git commit -m "feat: add CurrencySetting domain entity"
```

---

## Task 2: Repository Interface

**Files:**
- Modify: `backend/internal/domain/repository.go`

- [ ] **Step 1: Add CurrencySettingRepository interface to repository.go**

Append at the end of the file (before the closing of the package), following the existing pattern:

```go
// CurrencySettingRepository defines the interface for currency setting data access
type CurrencySettingRepository interface {
	FindByUserID(ctx context.Context, userID uuid.UUID) ([]CurrencySetting, error)
	UpsertBatch(ctx context.Context, userID uuid.UUID, settings []CurrencySetting) error
}
```

- [ ] **Step 2: Build to verify**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/domain/...`
Expected: success

- [ ] **Step 3: Commit**

```bash
git add backend/internal/domain/repository.go
git commit -m "feat: add CurrencySettingRepository interface"
```

---

## Task 3: Repository Implementation

**Files:**
- Create: `backend/internal/repository/currency_setting_repository.go`

- [ ] **Step 1: Create the GORM repository implementation**

```go
// backend/internal/repository/currency_setting_repository.go
package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type CurrencySettingRepositoryImpl struct {
	db *gorm.DB
}

func NewCurrencySettingRepository(db *gorm.DB) domain.CurrencySettingRepository {
	return &CurrencySettingRepositoryImpl{db: db}
}

func (r *CurrencySettingRepositoryImpl) FindByUserID(ctx context.Context, userID uuid.UUID) ([]domain.CurrencySetting, error) {
	var settings []domain.CurrencySetting
	err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("currency_code ASC").
		Find(&settings).Error
	if err != nil {
		return nil, err
	}
	return settings, nil
}

func (r *CurrencySettingRepositoryImpl) UpsertBatch(ctx context.Context, userID uuid.UUID, settings []domain.CurrencySetting) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if len(settings) == 0 {
			// Delete all settings for this user
			return tx.Where("user_id = ?", userID).Delete(&domain.CurrencySetting{}).Error
		}

		// Upsert provided settings
		for i := range settings {
			settings[i].UserID = userID
		}
		if err := tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}, {Name: "currency_code"}},
			DoUpdates: clause.AssignmentColumns([]string{"multiplier", "updated_at"}),
		}).Create(&settings).Error; err != nil {
			return err
		}

		// Delete settings not in the provided list
		codes := make([]string, len(settings))
		for i, s := range settings {
			codes[i] = s.CurrencyCode
		}
		return tx.Where("user_id = ? AND currency_code NOT IN ?", userID, codes).
			Delete(&domain.CurrencySetting{}).Error
	})
}
```

- [ ] **Step 2: Build to verify**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/repository/...`
Expected: success

- [ ] **Step 3: Commit**

```bash
git add backend/internal/repository/currency_setting_repository.go
git commit -m "feat: add CurrencySetting GORM repository"
```

---

## Task 4: Usecase Service

**Files:**
- Create: `backend/internal/usecase/currency_setting_service.go`

- [ ] **Step 1: Create the usecase service**

```go
// backend/internal/usecase/currency_setting_service.go
package usecase

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
)

type CurrencySettingService struct {
	repo   domain.CurrencySettingRepository
	logger *slog.Logger
}

func NewCurrencySettingService(
	repo domain.CurrencySettingRepository,
	logger *slog.Logger,
) *CurrencySettingService {
	if logger == nil {
		logger = slog.Default()
	}
	return &CurrencySettingService{repo: repo, logger: logger}
}

func (s *CurrencySettingService) GetSettings(ctx context.Context, userID uuid.UUID) ([]domain.CurrencySetting, error) {
	return s.repo.FindByUserID(ctx, userID)
}

func (s *CurrencySettingService) UpdateSettings(ctx context.Context, userID uuid.UUID, settings []domain.CurrencySetting) error {
	for _, st := range settings {
		if st.Multiplier <= 0 || st.Multiplier > 1_000_000 {
			return fmt.Errorf("multiplier for %s must be > 0 and <= 1000000, got %f", st.CurrencyCode, st.Multiplier)
		}
		if len(st.CurrencyCode) != 3 {
			return fmt.Errorf("invalid currency code: %s", st.CurrencyCode)
		}
		// Note: Full ISO 4217 validation is not needed here because the frontend
		// only presents currencies from existing accounts (already validated at creation).
	}
	if err := s.repo.UpsertBatch(ctx, userID, settings); err != nil {
		return fmt.Errorf("update currency settings: %w", err)
	}
	s.logger.Info("currency settings updated",
		slog.String("user_id", userID.String()),
		slog.Int("count", len(settings)),
	)
	return nil
}
```

- [ ] **Step 2: Build to verify**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/usecase/...`
Expected: success

- [ ] **Step 3: Commit**

```bash
git add backend/internal/usecase/currency_setting_service.go
git commit -m "feat: add CurrencySettingService usecase"
```

---

## Task 5: HTTP Handler + Route Registration

**Files:**
- Create: `backend/internal/delivery/http/currency_setting_handler.go`
- Modify: `backend/cmd/api/main.go`

- [ ] **Step 1: Create the HTTP handler**

```go
// backend/internal/delivery/http/currency_setting_handler.go
package http

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	"github.com/yukiota/zenbill/internal/domain"
	"github.com/yukiota/zenbill/internal/usecase"
)

type CurrencySettingHandler struct {
	service *usecase.CurrencySettingService
	logger  *slog.Logger
}

func NewCurrencySettingHandler(
	service *usecase.CurrencySettingService,
	logger *slog.Logger,
) *CurrencySettingHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &CurrencySettingHandler{service: service, logger: logger}
}

func (h *CurrencySettingHandler) RegisterRoutes(router *gin.RouterGroup) {
	router.GET("/currency-settings", h.GetSettings)
	router.PUT("/currency-settings", h.UpdateSettings)
}

func (h *CurrencySettingHandler) GetSettings(c *gin.Context) {
	ctx := c.Request.Context()
	userID := getUserID(c)

	settings, err := h.service.GetSettings(ctx, userID)
	if err != nil {
		h.logger.ErrorContext(ctx, "Failed to get currency settings", "error", err)
		InternalServerError(c, "failed to get currency settings")
		return
	}

	Success(c, settings)
}

type currencySettingItem struct {
	CurrencyCode string  `json:"currency_code" binding:"required"`
	Multiplier   float64 `json:"multiplier" binding:"required"`
}

type updateCurrencySettingsRequest struct {
	Settings []currencySettingItem `json:"settings" binding:"required"`
}

func (h *CurrencySettingHandler) UpdateSettings(c *gin.Context) {
	ctx := c.Request.Context()
	userID := getUserID(c)

	var req updateCurrencySettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	settings := make([]domain.CurrencySetting, len(req.Settings))
	for i, s := range req.Settings {
		settings[i] = domain.CurrencySetting{
			UserID:       userID,
			CurrencyCode: s.CurrencyCode,
			Multiplier:   s.Multiplier,
		}
	}

	if err := h.service.UpdateSettings(ctx, userID, settings); err != nil {
		h.logger.ErrorContext(ctx, "Failed to update currency settings", "error", err)
		BadRequest(c, err.Error())
		return
	}

	Success(c, settings)
}
```

- [ ] **Step 2: Wire up in main.go**

In `backend/cmd/api/main.go`, add after the `stockHandler` initialization (after `stockHandler := httpdelivery.NewStockHandler(...)`):

```go
// Initialize currency setting handler
currencySettingRepo := repository.NewCurrencySettingRepository(db)
currencySettingService := usecase.NewCurrencySettingService(currencySettingRepo, logger.Get())
currencySettingHandler := httpdelivery.NewCurrencySettingHandler(currencySettingService, logger.Get())
```

And in the protected routes block (after `stockHandler.RegisterRoutes(protected)`), add:

```go
currencySettingHandler.RegisterRoutes(protected)
```

- [ ] **Step 3: Add to migration list in `backend/cmd/migrate/main.go`**

Add `&domain.CurrencySetting{}` to the models slice (after `&domain.Notification{}`):

```go
&domain.Notification{},
&domain.CurrencySetting{},
```

- [ ] **Step 4: Build to verify the full backend compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: success

- [ ] **Step 5: Commit**

```bash
git add backend/internal/delivery/http/currency_setting_handler.go backend/cmd/api/main.go backend/cmd/migrate/main.go
git commit -m "feat: add currency settings API endpoints (GET/PUT)"
```

---

## Task 6: Shared Types + Hook

**Files:**
- Modify: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/hooks/useCurrencySettings.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add TypeScript types**

In `packages/shared/src/types/index.ts`, append:

```typescript
// Currency Settings
export interface CurrencySetting {
  currency_code: string
  multiplier: number
}

export interface UpdateCurrencySettingsInput {
  settings: CurrencySetting[]
}
```

- [ ] **Step 2: Create the shared hook**

```typescript
// packages/shared/src/hooks/useCurrencySettings.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { ApiResponse, CurrencySetting, UpdateCurrencySettingsInput } from '../types/index.ts'

export function useCurrencySettings() {
  const api = getApiClient()
  return useQuery({
    queryKey: ['currency-settings'],
    queryFn: () =>
      api.get<ApiResponse<CurrencySetting[]>>('/currency-settings').then((r) => r.data),
  })
}

export function useUpdateCurrencySettings() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateCurrencySettingsInput) =>
      api.put<ApiResponse<CurrencySetting[]>>('/currency-settings', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['currency-settings'] }),
  })
}

/**
 * Returns the multiplier for a given currency code.
 * Returns 1 if no setting exists (no multiplier applied).
 */
export function getMultiplier(
  settings: CurrencySetting[] | undefined,
  currencyCode: string,
): number {
  if (!settings) return 1
  const found = settings.find((s) => s.currency_code === currencyCode)
  return found?.multiplier ?? 1
}
```

- [ ] **Step 3: Re-export from index.ts**

In `packages/shared/src/index.ts`, add:

```typescript
export * from './hooks/useCurrencySettings.ts'
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/index.ts packages/shared/src/hooks/useCurrencySettings.ts packages/shared/src/index.ts
git commit -m "feat: add useCurrencySettings shared hook and types"
```

---

## Task 7: App — Currency Settings Page

**Files:**
- Create: `app/app/settings/currency-units.tsx`
- Modify: `app/app/(tabs)/more.tsx`

- [ ] **Step 1: Create the currency units settings page**

```tsx
// app/app/settings/currency-units.tsx
import { useState, useEffect } from 'react'
import { View, Text, TextInput, ScrollView, Alert } from 'react-native'
import { useAccounts, useCurrencySettings, useUpdateCurrencySettings } from '@zenbill/shared'
import type { CurrencySetting } from '@zenbill/shared'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { getCurrencyByCode } from '../../constants/currencies'

export default function CurrencyUnitsPage() {
  const { data: accounts } = useAccounts()
  const { data: settings } = useCurrencySettings()
  const updateMut = useUpdateCurrencySettings()

  // Derive unique currencies from user's accounts
  const activeCurrencies = [...new Set((accounts ?? []).map((a) => a.currency))].sort()

  // Local form state: currency_code -> multiplier string
  // Only initialize once when data first loads (avoid resetting user edits)
  const [form, setForm] = useState<Record<string, string>>({})
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (initialized || !settings || !accounts) return
    const initial: Record<string, string> = {}
    for (const code of activeCurrencies) {
      const existing = settings?.find((s) => s.currency_code === code)
      initial[code] = existing ? String(existing.multiplier) : '1'
    }
    setForm(initial)
    setInitialized(true)
  }, [settings, accounts, initialized, activeCurrencies])

  const handleSave = () => {
    const items: CurrencySetting[] = []
    for (const [code, val] of Object.entries(form)) {
      const num = parseFloat(val)
      if (isNaN(num) || num <= 0 || num > 1_000_000) {
        Alert.alert('Error', `${code} 的倍數必須在 0 ~ 1,000,000 之間`)
        return
      }
      if (num !== 1) {
        items.push({ currency_code: code, multiplier: num })
      }
    }
    updateMut.mutate({ settings: items }, {
      onSuccess: () => Alert.alert('成功', '幣別單位已更新'),
      onError: (e) => Alert.alert('Error', e.message),
    })
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
          設定各幣別的輸入倍數，記帳時輸入的數字會自動乘以倍數。
        </Text>

        {activeCurrencies.length === 0 ? (
          <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 32 }}>
            尚未建立任何帳戶
          </Text>
        ) : (
          activeCurrencies.map((code) => {
            const currency = getCurrencyByCode(code)
            return (
              <Card key={code} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600' }}>
                      {currency?.flag ?? ''} {code}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                      {currency?.name ?? code}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, color: '#6b7280', marginRight: 8 }}>×</Text>
                    <TextInput
                      style={{
                        borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
                        paddingHorizontal: 12, paddingVertical: 8, fontSize: 16,
                        width: 100, textAlign: 'right',
                      }}
                      keyboardType="decimal-pad"
                      value={form[code] ?? '1'}
                      onChangeText={(v) => setForm((prev) => ({ ...prev, [code]: v }))}
                    />
                  </View>
                </View>
              </Card>
            )
          })
        )}

        {activeCurrencies.length > 0 && (
          <Button
            title="儲存"
            onPress={handleSave}
            loading={updateMut.isPending}
            style={{ marginTop: 16 }}
          />
        )}
      </ScrollView>
    </View>
  )
}
```

- [ ] **Step 2: Add menu item in more.tsx**

In `app/app/(tabs)/more.tsx`, add `Coins` to the lucide import and add a menu item. Import `Coins` from `lucide-react-native`:

```typescript
import { Store, Cog, Tag, Settings, LogOut, Coins } from 'lucide-react-native'
```

Add to `MENU_ITEMS` array (before the Settings item):

```typescript
{ icon: Coins, label: '幣別單位', route: '/settings/currency-units', testID: 'menu_currency_units' },
```

- [ ] **Step 3: Commit**

```bash
git add app/app/settings/currency-units.tsx app/app/\(tabs\)/more.tsx
git commit -m "feat(app): add currency units settings page"
```

---

## Task 8: Web — Currency Settings Page

**Files:**
- Create: `frontend/src/pages/CurrencySettingsPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create the web currency settings page**

```tsx
// frontend/src/pages/CurrencySettingsPage.tsx
import { useState, useEffect } from 'react'
import { useAccounts, useCurrencySettings, useUpdateCurrencySettings } from '@zenbill/shared'
import type { CurrencySetting } from '@zenbill/shared'
import { getCurrencyByCode } from '@/constants/currencies'
import { Save, Loader2 } from 'lucide-react'

export default function CurrencySettingsPage() {
  const { data: accounts } = useAccounts()
  const { data: settings } = useCurrencySettings()
  const updateMut = useUpdateCurrencySettings()

  const activeCurrencies = [...new Set((accounts ?? []).map((a) => a.currency))].sort()

  const [form, setForm] = useState<Record<string, string>>({})

  useEffect(() => {
    const initial: Record<string, string> = {}
    for (const code of activeCurrencies) {
      const existing = settings?.find((s) => s.currency_code === code)
      initial[code] = existing ? String(existing.multiplier) : '1'
    }
    setForm(initial)
  }, [settings, accounts])

  const handleSave = () => {
    const items: CurrencySetting[] = []
    for (const [code, val] of Object.entries(form)) {
      const num = parseFloat(val)
      if (isNaN(num) || num <= 0 || num > 1_000_000) return
      if (num !== 1) {
        items.push({ currency_code: code, multiplier: num })
      }
    }
    updateMut.mutate({ settings: items })
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-lg font-bold">幣別單位</h1>
      <p className="text-xs text-[var(--text-muted)]">
        設定各幣別的輸入倍數，記帳時輸入的數字會自動乘以倍數。
      </p>

      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-4 space-y-3">
        {activeCurrencies.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] text-center py-4">尚未建立任何帳戶</p>
        ) : (
          activeCurrencies.map((code) => {
            const currency = getCurrencyByCode(code)
            return (
              <div key={code} className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium">{currency?.flag ?? ''} {code}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{currency?.name ?? code}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)]">×</span>
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    step="any"
                    value={form[code] ?? '1'}
                    onChange={(e) => setForm((prev) => ({ ...prev, [code]: e.target.value }))}
                    className="w-24 h-8 px-2 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm text-right focus:outline-none focus:border-[var(--color-accent)]"
                  />
                </div>
              </div>
            )
          })
        )}
      </div>

      {activeCurrencies.length > 0 && (
        <button
          onClick={handleSave}
          disabled={updateMut.isPending}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {updateMut.isPending ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 儲存中...</>
          ) : (
            <><Save className="w-3.5 h-3.5" /> 儲存</>
          )}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add route in App.tsx**

Import the page and add a route. Find the existing settings route in `frontend/src/App.tsx` and add nearby:

```tsx
import CurrencySettingsPage from '@/pages/CurrencySettingsPage'
```

Add route (inside the protected layout routes):

```tsx
<Route path="/currency-settings" element={<CurrencySettingsPage />} />
```

- [ ] **Step 3: Add sidebar link**

In `frontend/src/components/layout/Sidebar.tsx`, add `Coins` to the lucide import and add a nav item for "幣別單位" pointing to `/currency-settings`. Follow the existing pattern for other settings-like nav items.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CurrencySettingsPage.tsx frontend/src/App.tsx frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(web): add currency units settings page"
```

---

## Task 9: App — Amount Input Multiplier Preview

**Files:**
- Modify: `app/components/transactions/TransactionForm.tsx`
- Modify: `app/components/quickcreate/AccountQuickCreate.tsx`

- [ ] **Step 1: Add multiplier preview to TransactionForm**

In `app/components/transactions/TransactionForm.tsx`:

1. Add imports:
```typescript
import { useCurrencySettings, getMultiplier } from '@zenbill/shared'
import { getCurrencySymbol } from '../../constants/currencies'
```

2. Inside the component, after `const { data: accounts } = useAccounts()`, add:
```typescript
const { data: currencySettings } = useCurrencySettings()
```

3. Derive the selected account's currency and multiplier (after `accountOptions`):
```typescript
const selectedAccount = accounts?.find((a) => a.id === accountId)
const multiplier = getMultiplier(currencySettings, selectedAccount?.currency ?? 'TWD')
```

4. Right after the amount `<TextInput>` (after line ~214), add the preview:
```tsx
{multiplier !== 1 && amount !== '' && (
  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: -12, marginBottom: 16 }}>
    實際金額：{getCurrencySymbol(selectedAccount?.currency ?? 'TWD')}
    {(parseFloat(amount) * multiplier).toLocaleString()}
  </Text>
)}
```

5. In `handleSubmit`, change the amount calculation:
```typescript
amount: parseFloat(amount) * multiplier,
```

- [ ] **Step 2: Add multiplier preview to AccountQuickCreate**

In `app/components/quickcreate/AccountQuickCreate.tsx`:

1. Add imports:
```typescript
import { useCurrencySettings, getMultiplier } from '@zenbill/shared'
import { getCurrencySymbol } from '../../constants/currencies'
```

2. Inside the component, add:
```typescript
const { data: currencySettings } = useCurrencySettings()
const multiplier = getMultiplier(currencySettings, form.currency ?? 'TWD')
```

3. After the balance input, add preview:
```tsx
{multiplier !== 1 && form.balance !== undefined && form.balance !== 0 && (
  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
    實際金額：{getCurrencySymbol(form.currency ?? 'TWD')}
    {(form.balance * multiplier).toLocaleString()}
  </Text>
)}
```

4. In the submit handler, multiply the balance:
```typescript
balance: (form.balance ?? 0) * multiplier,
```

- [ ] **Step 3: Commit**

```bash
git add app/components/transactions/TransactionForm.tsx app/components/quickcreate/AccountQuickCreate.tsx
git commit -m "feat(app): add multiplier preview to amount inputs"
```

---

## Task 10: Web — Amount Input Multiplier Preview

**Files:**
- Modify: `frontend/src/components/transactions/TransactionForm.tsx`

- [ ] **Step 1: Add multiplier preview to web TransactionForm**

In `frontend/src/components/transactions/TransactionForm.tsx`:

1. Add imports:
```typescript
import { useCurrencySettings, getMultiplier } from '@zenbill/shared'
import { getCurrencySymbol } from '@/constants/currencies'
```

2. Inside the component, add:
```typescript
const { data: currencySettings } = useCurrencySettings()
```

3. Derive multiplier from source account:
```typescript
const sourceMultiplier = getMultiplier(currencySettings, sourceAccount?.currency ?? 'TWD')
```

4. After the amount input field (for the non-cross-currency case), add preview:
```tsx
{sourceMultiplier !== 1 && form.amountStr !== '' && (
  <p className="text-[11px] text-[var(--text-muted)] mt-1">
    實際金額：{getCurrencySymbol(sourceAccount?.currency ?? 'TWD')}
    {(parseFloat(form.amountStr) * sourceMultiplier).toLocaleString()}
  </p>
)}
```

5. For cross-currency transfers, also add preview under each amount field using the respective account's multiplier:
```typescript
const targetMultiplier = getMultiplier(currencySettings, targetAccount?.currency ?? 'TWD')
```

6. In the submit handler, multiply amounts by their respective multipliers:
```typescript
amount: parseFloat(form.amountStr) * sourceMultiplier,
```
For cross-currency, also multiply `original_amount`:
```typescript
original_amount: parseFloat(form.originalAmountStr) * targetMultiplier,
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/transactions/TransactionForm.tsx
git commit -m "feat(web): add multiplier preview to amount inputs"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Build backend**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: success

- [ ] **Step 2: Verify no TypeScript errors in shared package**

Run: `cd /Users/yuki/projects/zen-bill/packages/shared && npx tsc --noEmit` (if tsconfig exists)
Expected: success

- [ ] **Step 3: Final commit with any remaining fixes**

```bash
git add -A
git commit -m "feat: complete currency multiplier feature"
```
