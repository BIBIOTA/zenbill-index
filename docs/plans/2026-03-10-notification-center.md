# Notification Center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an in-app notification center (Web + APP) with Expo push notifications, triggered when shared accounting partners create expenses or settlements.

**Architecture:** New `Notification` domain entity with full Clean Architecture stack (domain → repository → usecase → handler). NotificationService is injected into SharedExpenseService as an optional dependency. Expo push is best-effort (failure logged, not propagated). Frontend uses React Query polling (30s) for badge updates.

**Tech Stack:** Go/Gin/GORM (backend), Expo Notifications (push), React Query (polling), Lucide icons (UI).

---

### Task 1: Notification Domain Entity

**Files:**
- Create: `backend/internal/domain/notification.go`

**Step 1: Create the Notification entity and repository interface**

```go
package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// NotificationType represents the type of notification
type NotificationType string

const (
	NotificationTypeSharedExpenseCreated NotificationType = "SHARED_EXPENSE_CREATED"
	NotificationTypeSettlementCreated    NotificationType = "SETTLEMENT_CREATED"
)

// Notification represents an in-app notification for a user.
type Notification struct {
	ID           uuid.UUID        `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID       uuid.UUID        `gorm:"type:uuid;not null;index" json:"user_id"`
	Type         NotificationType `gorm:"type:varchar(50);not null" json:"type"`
	Title        string           `gorm:"type:varchar(255);not null" json:"title"`
	Body         string           `gorm:"type:text;not null" json:"body"`
	ResourceType string           `gorm:"type:varchar(50)" json:"resource_type"`
	ResourceID   *uuid.UUID       `gorm:"type:uuid" json:"resource_id"`
	IsRead       bool             `gorm:"not null;default:false" json:"is_read"`
	CreatedAt    time.Time        `gorm:"autoCreateTime" json:"created_at"`
}

// TableName overrides the table name
func (Notification) TableName() string {
	return "notifications"
}

// NotificationRepository defines the interface for notification data access.
type NotificationRepository interface {
	Create(ctx context.Context, notification *Notification) error
	FindByUserID(ctx context.Context, userID uuid.UUID, limit, offset int) ([]Notification, int64, error)
	CountUnread(ctx context.Context, userID uuid.UUID) (int64, error)
	MarkAsRead(ctx context.Context, id, userID uuid.UUID) error
	MarkAllAsRead(ctx context.Context, userID uuid.UUID) error
}
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./internal/domain/...`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/internal/domain/notification.go
git commit -m "feat(domain): add Notification entity and repository interface"
```

---

### Task 2: Notification Repository (GORM)

**Files:**
- Create: `backend/internal/repository/notification_repository.go`

**Step 1: Write the failing test**

Create `backend/internal/repository/notification_repository_test.go`:

```go
package repository_test

// Integration test — requires running PostgreSQL.
// Skip with: go test -short

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
)

func TestNotificationRepository_CreateAndFind(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test")
	}
	// This test will be filled after repository implementation
	// to verify CRUD operations work against real DB.
}
```

**Step 2: Implement the repository**

```go
package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"gorm.io/gorm"
)

type NotificationRepositoryImpl struct {
	db *gorm.DB
}

func NewNotificationRepository(db *gorm.DB) domain.NotificationRepository {
	return &NotificationRepositoryImpl{db: db}
}

func (r *NotificationRepositoryImpl) Create(ctx context.Context, notification *domain.Notification) error {
	return r.db.WithContext(ctx).Create(notification).Error
}

func (r *NotificationRepositoryImpl) FindByUserID(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.Notification, int64, error) {
	var notifications []domain.Notification
	var total int64

	q := r.db.WithContext(ctx).Where("user_id = ?", userID)
	q.Model(&domain.Notification{}).Count(&total)

	err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&notifications).Error
	return notifications, total, err
}

func (r *NotificationRepositoryImpl) CountUnread(ctx context.Context, userID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&domain.Notification{}).
		Where("user_id = ? AND is_read = ?", userID, false).
		Count(&count).Error
	return count, err
}

func (r *NotificationRepositoryImpl) MarkAsRead(ctx context.Context, id, userID uuid.UUID) error {
	result := r.db.WithContext(ctx).
		Model(&domain.Notification{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("is_read", true)
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return result.Error
}

func (r *NotificationRepositoryImpl) MarkAllAsRead(ctx context.Context, userID uuid.UUID) error {
	return r.db.WithContext(ctx).
		Model(&domain.Notification{}).
		Where("user_id = ? AND is_read = ?", userID, false).
		Update("is_read", true).Error
}
```

**Step 3: Verify it compiles**

Run: `cd backend && go build ./internal/repository/...`
Expected: PASS

**Step 4: Commit**

```bash
git add backend/internal/repository/notification_repository.go
git commit -m "feat(repository): implement NotificationRepository with GORM"
```

---

### Task 3: Notification Service (Usecase)

**Files:**
- Create: `backend/internal/usecase/notification_service.go`

**Step 1: Implement the service**

```go
package usecase

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
)

// NotificationService handles notification CRUD and push delivery.
type NotificationService struct {
	repo   domain.NotificationRepository
	logger *slog.Logger
}

func NewNotificationService(
	repo domain.NotificationRepository,
	logger *slog.Logger,
) *NotificationService {
	if logger == nil {
		logger = slog.Default()
	}
	return &NotificationService{repo: repo, logger: logger}
}

// Notify creates a notification record in the database.
// Push notification delivery will be added in a later task.
func (s *NotificationService) Notify(
	ctx context.Context,
	userID uuid.UUID,
	notifType domain.NotificationType,
	title, body string,
	resourceType string,
	resourceID *uuid.UUID,
) error {
	n := &domain.Notification{
		ID:           uuid.New(),
		UserID:       userID,
		Type:         notifType,
		Title:        title,
		Body:         body,
		ResourceType: resourceType,
		ResourceID:   resourceID,
	}
	if err := s.repo.Create(ctx, n); err != nil {
		return fmt.Errorf("create notification: %w", err)
	}
	s.logger.Info("notification created",
		slog.String("user_id", userID.String()),
		slog.String("type", string(notifType)),
	)
	return nil
}

// List returns paginated notifications for a user.
func (s *NotificationService) List(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.Notification, int64, error) {
	return s.repo.FindByUserID(ctx, userID, limit, offset)
}

// UnreadCount returns the number of unread notifications.
func (s *NotificationService) UnreadCount(ctx context.Context, userID uuid.UUID) (int64, error) {
	return s.repo.CountUnread(ctx, userID)
}

// MarkAsRead marks a single notification as read.
func (s *NotificationService) MarkAsRead(ctx context.Context, id, userID uuid.UUID) error {
	return s.repo.MarkAsRead(ctx, id, userID)
}

// MarkAllAsRead marks all unread notifications as read for a user.
func (s *NotificationService) MarkAllAsRead(ctx context.Context, userID uuid.UUID) error {
	return s.repo.MarkAllAsRead(ctx, userID)
}
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./internal/usecase/...`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/internal/usecase/notification_service.go
git commit -m "feat(usecase): add NotificationService for notification CRUD"
```

---

### Task 4: Notification HTTP Handler

**Files:**
- Create: `backend/internal/delivery/http/notification_handler.go`

**Step 1: Implement the handler**

Follow existing patterns from `shared_expense_handler.go`:
- Use `c.GetString("userID")` for authenticated user ID (from JWT middleware)
- Use `Success()`, `SuccessWithPagination()`, `BadRequest()`, etc. from `response.go`
- Parse pagination with `strconv.Atoi(c.DefaultQuery("page", "1"))` pattern

```go
package http

import (
	"log/slog"
	"math"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/usecase"
)

type NotificationHandler struct {
	service *usecase.NotificationService
	logger  *slog.Logger
}

func NewNotificationHandler(service *usecase.NotificationService, logger *slog.Logger) *NotificationHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &NotificationHandler{service: service, logger: logger}
}

func (h *NotificationHandler) RegisterRoutes(r *gin.RouterGroup) {
	g := r.Group("/notifications")
	{
		g.GET("", h.List)
		g.GET("/unread-count", h.UnreadCount)
		g.PATCH("/:id/read", h.MarkAsRead)
		g.PATCH("/read-all", h.MarkAllAsRead)
	}
}

func (h *NotificationHandler) List(c *gin.Context) {
	userID, err := uuid.Parse(c.GetString("userID"))
	if err != nil {
		Unauthorized(c, "invalid user")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	notifications, total, err := h.service.List(c.Request.Context(), userID, pageSize, offset)
	if err != nil {
		InternalServerError(c, "failed to list notifications")
		return
	}

	SuccessWithPagination(c, notifications, PaginationMeta{
		Page:       page,
		PageSize:   pageSize,
		Total:      total,
		TotalPages: int(math.Ceil(float64(total) / float64(pageSize))),
	})
}

func (h *NotificationHandler) UnreadCount(c *gin.Context) {
	userID, err := uuid.Parse(c.GetString("userID"))
	if err != nil {
		Unauthorized(c, "invalid user")
		return
	}

	count, err := h.service.UnreadCount(c.Request.Context(), userID)
	if err != nil {
		InternalServerError(c, "failed to count unread notifications")
		return
	}

	Success(c, gin.H{"count": count})
}

func (h *NotificationHandler) MarkAsRead(c *gin.Context) {
	userID, err := uuid.Parse(c.GetString("userID"))
	if err != nil {
		Unauthorized(c, "invalid user")
		return
	}

	notifID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		BadRequest(c, "invalid notification ID")
		return
	}

	if err := h.service.MarkAsRead(c.Request.Context(), notifID, userID); err != nil {
		NotFound(c, "notification not found")
		return
	}

	Success(c, nil)
}

func (h *NotificationHandler) MarkAllAsRead(c *gin.Context) {
	userID, err := uuid.Parse(c.GetString("userID"))
	if err != nil {
		Unauthorized(c, "invalid user")
		return
	}

	if err := h.service.MarkAllAsRead(c.Request.Context(), userID); err != nil {
		InternalServerError(c, "failed to mark all as read")
		return
	}

	Success(c, nil)
}
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./internal/delivery/http/...`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/internal/delivery/http/notification_handler.go
git commit -m "feat(handler): add notification HTTP endpoints"
```

---

### Task 5: Wire Up Dependency Injection + Migration

**Files:**
- Modify: `backend/cmd/api/main.go` (add NotificationService + handler)
- Modify: `backend/cmd/migrate/main.go` (add Notification to auto-migrate list)

**Step 1: Add to migration**

In `backend/cmd/migrate/main.go`, add `&domain.Notification{}` to the `models` slice after `&domain.SharedExpense{}`:

```go
models := []interface{}{
	// ... existing models ...
	&domain.SharedExpense{},
	&domain.Notification{},  // ADD THIS
}
```

**Step 2: Add to DI in main.go**

In `backend/cmd/api/main.go`:

After line 143 (sharedExpenseRepo):
```go
notificationRepo := repository.NewNotificationRepository(db)
```

After line 147 (sharedExpenseService):
```go
notificationService := usecase.NewNotificationService(notificationRepo, logger.Get())
```

After line 167 (sharedExpenseHandler):
```go
notificationHandler := httpdelivery.NewNotificationHandler(notificationService, logger.Get())
```

After line 223 (sharedExpenseHandler.RegisterRoutes):
```go
notificationHandler.RegisterRoutes(protected)
```

**Step 3: Verify it compiles**

Run: `cd backend && go build ./cmd/api/...`
Expected: PASS

**Step 4: Commit**

```bash
git add backend/cmd/api/main.go backend/cmd/migrate/main.go
git commit -m "feat: wire notification service into DI and migration"
```

---

### Task 6: Integrate Notifications into SharedExpenseService

**Files:**
- Modify: `backend/internal/usecase/shared_expense_service.go`

**Step 1: Add NotificationService as optional dependency**

Add `notifService *NotificationService` field to `SharedExpenseService` struct. Add it as the last parameter to `NewSharedExpenseService`. Keep it optional (nil-safe) so existing callers and tests don't break.

**Step 2: Add helper method to send notifications**

```go
// notifyPartner sends a best-effort notification to the other party in the ledger.
func (s *SharedExpenseService) notifyPartner(
	ctx context.Context,
	ledger *domain.SharedLedger,
	actorID uuid.UUID,
	notifType domain.NotificationType,
	title, body string,
) {
	if s.notifService == nil {
		return
	}

	// Determine who to notify (the other person)
	var recipientID uuid.UUID
	if ledger.IsOwner(actorID) {
		if ledger.PartnerID == nil {
			return // no partner to notify
		}
		recipientID = *ledger.PartnerID
	} else {
		recipientID = ledger.OwnerID
	}

	resourceID := ledger.ID
	if err := s.notifService.Notify(ctx, recipientID, notifType, title, body, "shared_ledger", &resourceID); err != nil {
		s.logger.Warn("failed to send notification", "error", err)
	}
}
```

**Step 3: Call notifyPartner in Create() method**

After the successful creation log (line ~175 in Create()), add:

```go
s.notifyPartner(ctx, ledger, userID,
	domain.NotificationTypeSharedExpenseCreated,
	fmt.Sprintf("%s 新增了一筆共同消費", ledger.GetOwnerDisplayName()),
	fmt.Sprintf("%s $%.0f", input.Description, input.TotalAmount),
)
```

Note: use `GetOwnerDisplayName()` or `GetPartnerDisplayName()` based on who `userID` is:
```go
actorName := ledger.GetPartnerDisplayName()
if ledger.IsOwner(userID) {
	actorName = ledger.GetOwnerDisplayName()
}
```

**Step 4: Call notifyPartner in Settle/SettleAll**

After successful settlement (line ~366), add:

```go
s.notifyPartner(ctx, ledger, userID,
	domain.NotificationTypeSettlementCreated,
	fmt.Sprintf("%s 結算了一筆費用", actorName),
	fmt.Sprintf("%s $%.0f", expense.Description, absAmount),
)
```

Similar pattern for SettleAll after the loop completes.

**Step 5: Update NewSharedExpenseService call in main.go**

In `backend/cmd/api/main.go`, update the SharedExpenseService constructor to pass `notificationService`:

```go
sharedExpenseService := usecase.NewSharedExpenseService(
	sharedExpenseRepo, sharedLedgerRepo, txRepo, accountRepo, txMgr,
	notificationService, logger.Get(),
)
```

**Step 6: Verify it compiles**

Run: `cd backend && go build ./...`
Expected: PASS

**Step 7: Run tests**

Run: `cd backend && go test ./internal/usecase/... -v -short`
Expected: PASS (existing tests should still pass since notifService is nil in tests)

**Step 8: Commit**

```bash
git add backend/internal/usecase/shared_expense_service.go backend/cmd/api/main.go
git commit -m "feat: trigger notifications on shared expense create and settle"
```

---

### Task 7: Frontend Types and Hooks

**Files:**
- Modify: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/hooks/useNotifications.ts`

**Step 1: Add Notification types**

Append to `packages/shared/src/types/index.ts`:

```typescript
// === Notifications ===
export type NotificationType = 'SHARED_EXPENSE_CREATED' | 'SETTLEMENT_CREATED'

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string
  resource_type: string
  resource_id: string | null
  is_read: boolean
  created_at: string
}
```

**Step 2: Create hooks file**

Create `packages/shared/src/hooks/useNotifications.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { Notification, ApiResponse, PaginatedResponse } from '../types/index.ts'

export function useNotifications(page = 1, pageSize = 20) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['notifications', { page, pageSize }],
    queryFn: () =>
      api.get<PaginatedResponse<Notification[]>>(
        `/notifications?page=${page}&page_size=${pageSize}`,
      ),
  })
}

export function useUnreadCount() {
  const api = getApiClient()
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () =>
      api
        .get<ApiResponse<{ count: number }>>('/notifications/unread-count')
        .then((r) => r.data.count),
    refetchInterval: 30000,
  })
}

export function useMarkAsRead() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.patch<ApiResponse<null>>(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllAsRead() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.patch<ApiResponse<null>>('/notifications/read-all', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
```

**Step 3: Export from hooks index (if exists)**

Check if `packages/shared/src/hooks/index.ts` exists and add the export.

**Step 4: Commit**

```bash
git add packages/shared/src/types/index.ts packages/shared/src/hooks/useNotifications.ts
git commit -m "feat(shared): add Notification types and React Query hooks"
```

---

### Task 8: Web — Notification Bell Component

**Files:**
- Create: `frontend/src/components/layout/NotificationBell.tsx`
- Modify: `frontend/src/components/layout/MobileHeader.tsx`

**Step 1: Create NotificationBell component**

```tsx
import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { useNotifications, useUnreadCount, useMarkAsRead, useMarkAllAsRead } from '@zenbill/shared/hooks/useNotifications'
import { useNavigate } from 'react-router'
import type { Notification } from '@zenbill/shared/types'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data: count = 0 } = useUnreadCount()
  const { data: notifData } = useNotifications(1, 10)
  const markRead = useMarkAsRead()
  const markAllRead = useMarkAllAsRead()
  const navigate = useNavigate()

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const notifications: Notification[] = notifData?.data ?? []

  function handleItemClick(n: Notification) {
    if (!n.is_read) markRead.mutate(n.id)
    if (n.resource_type === 'shared_ledger' && n.resource_id) {
      navigate(`/shared-ledgers/${n.resource_id}`)
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors relative"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <span className="font-semibold text-sm">通知</span>
            {count > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                全部已讀
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              沒有通知
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`w-full text-left px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border-subtle)] last:border-b-0 ${
                  !n.is_read ? 'bg-[var(--bg-hover)]/50' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-[var(--color-accent)] shrink-0" />
                  )}
                  <div className={!n.is_read ? '' : 'ml-4'}>
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">{n.body}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {new Date(n.created_at).toLocaleString('zh-TW')}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Add NotificationBell to MobileHeader**

Modify `frontend/src/components/layout/MobileHeader.tsx` to add the bell icon:

```tsx
import { Menu } from 'lucide-react'
import { NotificationBell } from './NotificationBell'

interface MobileHeaderProps {
  onMenuClick: () => void
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <header className="md:hidden h-14 flex items-center px-4 gap-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] sticky top-0 z-30">
      <button
        onClick={onMenuClick}
        className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-[6px] bg-gradient-to-br from-[var(--color-accent)] to-[#818cf8] grid place-items-center text-white font-bold text-[11px]">
          Z
        </div>
        <span className="font-bold text-sm tracking-tight">ZenBill</span>
      </div>
      <div className="ml-auto">
        <NotificationBell />
      </div>
    </header>
  )
}
```

**Step 3: Also add to desktop Sidebar header if applicable**

Check `frontend/src/components/layout/Sidebar.tsx` — if there's a header area, add NotificationBell there too.

**Step 4: Commit**

```bash
git add frontend/src/components/layout/NotificationBell.tsx frontend/src/components/layout/MobileHeader.tsx
git commit -m "feat(web): add notification bell with dropdown panel"
```

---

### Task 9: APP — Notification Bell in Header

**Files:**
- Create: `app/components/NotificationBell.tsx`
- Modify: App screens that have headers (e.g., `app/app/(tabs)/index.tsx` or the layout)

**Step 1: Create NotificationBell component for React Native**

```tsx
import { View, Text, Pressable } from 'react-native'
import { Bell } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useUnreadCount } from '@zenbill/shared/hooks/useNotifications'
import { Colors } from '../constants/theme'

export function NotificationBell() {
  const router = useRouter()
  const { data: count = 0 } = useUnreadCount()

  return (
    <Pressable onPress={() => router.push('/notifications')} style={{ padding: 8 }}>
      <Bell size={22} color={Colors.text} />
      {count > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            backgroundColor: '#ef4444',
            borderRadius: 8,
            minWidth: 16,
            height: 16,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 3,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      )}
    </Pressable>
  )
}
```

**Step 2: Create notifications page**

Create `app/app/notifications.tsx` (a stack screen, not a tab):

```tsx
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '@zenbill/shared/hooks/useNotifications'
import type { Notification } from '@zenbill/shared/types'
import { Colors } from '../constants/theme'

export default function NotificationsScreen() {
  const { data, isLoading } = useNotifications(1, 50)
  const markRead = useMarkAsRead()
  const markAllRead = useMarkAllAsRead()
  const router = useRouter()

  const notifications: Notification[] = data?.data ?? []

  function handlePress(n: Notification) {
    if (!n.is_read) markRead.mutate(n.id)
    if (n.resource_type === 'shared_ledger' && n.resource_id) {
      router.push(`/shared-ledgers/${n.resource_id}`)
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: '通知',
          headerRight: () => (
            <Pressable onPress={() => markAllRead.mutate()}>
              <Text style={{ color: Colors.primary, fontSize: 14 }}>全部已讀</Text>
            </Pressable>
          ),
        }}
      />
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#9ca3af' }}>沒有通知</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handlePress(item)}
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#f3f4f6',
                backgroundColor: item.is_read ? '#fff' : '#f0f9ff',
              }}
            >
              <Text style={{ fontWeight: '600', fontSize: 14 }}>{item.title}</Text>
              <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>{item.body}</Text>
              <Text style={{ color: '#9ca3af', fontSize: 11, marginTop: 4 }}>
                {new Date(item.created_at).toLocaleString('zh-TW')}
              </Text>
            </Pressable>
          )}
        />
      )}
    </>
  )
}
```

**Step 3: Add NotificationBell to tab screens' headerRight**

In the tab `_layout.tsx` or individual screen options, set `headerRight` to render `<NotificationBell />`.

**Step 4: Commit**

```bash
git add app/components/NotificationBell.tsx app/app/notifications.tsx
git commit -m "feat(app): add notification bell and notifications screen"
```

---

### Task 10: Expo Push Notification Integration

**Files:**
- Modify: `backend/internal/domain/user.go` (add ExpoPushToken field)
- Create: `backend/pkg/pushnotification/expo.go` (Expo Push API client)
- Modify: `backend/internal/usecase/notification_service.go` (send push after DB write)
- Modify: `backend/internal/delivery/http/notification_handler.go` (add push token endpoint)
- Create: `app/lib/notifications.ts` (Expo push token registration)

**Step 1: Add ExpoPushToken to User entity**

In `backend/internal/domain/user.go`, add:
```go
ExpoPushToken string `gorm:"type:varchar(255)" json:"-"`
```

**Step 2: Create Expo Push API client**

Create `backend/pkg/pushnotification/expo.go`:

```go
package pushnotification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

type ExpoPushMessage struct {
	To    string `json:"to"`
	Title string `json:"title"`
	Body  string `json:"body"`
	Data  map[string]string `json:"data,omitempty"`
}

// SendExpoPush sends a push notification via Expo's push API.
// Returns nil on success. Failures are non-fatal.
func SendExpoPush(ctx context.Context, msg ExpoPushMessage) error {
	body, err := json.Marshal([]ExpoPushMessage{msg})
	if err != nil {
		return fmt.Errorf("marshal push message: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://exp.host/--/api/v2/push/send", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create push request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("send push request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("expo push API returned %d", resp.StatusCode)
	}
	return nil
}
```

**Step 3: Update NotificationService to send push**

Add `userRepo domain.UserRepository` to NotificationService. After creating the notification record in `Notify()`, look up the user's push token and call `SendExpoPush`. Wrap in best-effort:

```go
// After DB write in Notify():
user, err := s.userRepo.FindByID(ctx, userID)
if err == nil && user.ExpoPushToken != "" {
	go func() {
		pushCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := pushnotification.SendExpoPush(pushCtx, pushnotification.ExpoPushMessage{
			To:    user.ExpoPushToken,
			Title: title,
			Body:  body,
			Data:  map[string]string{"resource_type": resourceType, "resource_id": resourceID.String()},
		}); err != nil {
			s.logger.Warn("push notification failed", "error", err, "user_id", userID)
		}
	}()
}
```

**Step 4: Add push token registration endpoint**

Add to `notification_handler.go`:

```go
// In RegisterRoutes:
g.PUT("/push-token", h.UpdatePushToken)

func (h *NotificationHandler) UpdatePushToken(c *gin.Context) {
	// Parse userID from JWT, parse body { "token": "ExponentPushToken[xxx]" }
	// Update user.ExpoPushToken via userRepo
}
```

**Step 5: Create app-side push registration**

Create `app/lib/notifications.ts`:

```typescript
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { getApiClient } from '@zenbill/shared/api/client'

export async function registerForPushNotifications() {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return null

  const token = await Notifications.getExpoPushTokenAsync()

  // Send token to backend
  const api = getApiClient()
  await api.put('/notifications/push-token', { token: token.data })

  return token.data
}
```

Call `registerForPushNotifications()` after login in the app.

**Step 6: Verify backend compiles**

Run: `cd backend && go build ./...`
Expected: PASS

**Step 7: Commit**

```bash
git add backend/internal/domain/user.go backend/pkg/pushnotification/expo.go \
  backend/internal/usecase/notification_service.go \
  backend/internal/delivery/http/notification_handler.go \
  app/lib/notifications.ts
git commit -m "feat: add Expo push notification support with token registration"
```

---

### Task 11: Unit Tests

**Files:**
- Create: `backend/internal/usecase/notification_service_test.go`

**Step 1: Write tests for NotificationService**

Test the following scenarios using a mock NotificationRepository:
1. `Notify` creates a notification record
2. `List` returns paginated results
3. `UnreadCount` returns correct count
4. `MarkAsRead` delegates to repo
5. `MarkAllAsRead` delegates to repo

Pattern: create a `mockNotificationRepo` struct implementing `domain.NotificationRepository`.

**Step 2: Run tests**

Run: `cd backend && go test ./internal/usecase/... -v -run TestNotification -short`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/internal/usecase/notification_service_test.go
git commit -m "test: add NotificationService unit tests"
```

---

### Task 12: Run Full Test Suite + Lint

**Step 1: Run all backend tests**

Run: `cd backend && go test ./... -short -v`
Expected: ALL PASS

**Step 2: Run linter**

Run: `cd backend && golangci-lint run`
Expected: No errors

**Step 3: Fix any issues found**

**Step 4: Final commit if fixes needed**

```bash
git commit -m "fix: address lint issues in notification feature"
```

---

## Summary

| Task | Component | Description |
|------|-----------|-------------|
| 1 | Domain | Notification entity + repository interface |
| 2 | Repository | GORM implementation |
| 3 | Usecase | NotificationService CRUD |
| 4 | Handler | HTTP endpoints (list, unread-count, mark-read) |
| 5 | Wiring | DI + migration setup |
| 6 | Integration | Trigger notifications from SharedExpenseService |
| 7 | Frontend | Shared types + React Query hooks |
| 8 | Web | NotificationBell dropdown component |
| 9 | APP | Bell icon + notifications screen |
| 10 | Push | Expo push token + delivery |
| 11 | Tests | Unit tests for NotificationService |
| 12 | QA | Full test suite + lint |
