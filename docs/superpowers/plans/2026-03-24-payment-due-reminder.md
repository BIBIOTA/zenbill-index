# 信用卡繳款日提醒推播 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily cron job that sends push notifications reminding users of upcoming credit card payment due dates.

**Architecture:** New `PaymentReminderService` usecase orchestrates the reminder logic. A new cron job in the worker triggers it at 18:00 Asia/Taipei. Notifications are persisted via the existing `NotificationService.Notify()` and delivered via the existing Expo Push infrastructure. Frontend routing is extended to handle `account` resource type navigation.

**Tech Stack:** Go, GORM, robfig/cron/v3, Expo Push API, React Native (Expo Router), React (React Router)

**Spec:** `docs/superpowers/specs/2026-03-24-payment-due-reminder-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/internal/domain/notification.go` | Modify | Add `PAYMENT_DUE_REMINDER` notification type constant |
| `backend/internal/domain/repository.go` | Modify | Add `FindCreditCardsDueOn` to `AccountRepository` |
| `backend/internal/domain/notification.go` | Modify | Add `PAYMENT_DUE_REMINDER` type constant; add `ExistsByTypeAndResourceToday` to `NotificationRepository` |
| `backend/internal/repository/account_repository.go` | Modify | Implement `FindCreditCardsDueOn` with short-month compensation |
| `backend/internal/repository/notification_repository.go` | Modify | Implement `ExistsByTypeAndResourceToday` |
| `backend/internal/usecase/payment_reminder_service.go` | Create | Core reminder logic: query cards, check balances, create notifications, send push |
| `backend/internal/usecase/payment_reminder_service_test.go` | Create | Unit tests with mocked repos |
| `backend/internal/config/config.go` | Modify | Add `PaymentReminderSchedule` to `WorkerConfig` |
| `backend/cmd/worker/main.go` | Modify | Register payment reminder cron job |
| `backend/configs/config.yaml.example` | Modify | Add `payment_reminder_schedule` example |
| `app/app/notifications.tsx` | Modify | Add `account` resource type routing |
| `frontend/src/components/layout/NotificationBell.tsx` | Modify | Add `account` resource type routing |

---

### Task 1: Add notification type constant

**Files:**
- Modify: `backend/internal/domain/notification.go:13-17`

- [ ] **Step 1: Add the new constant**

In `backend/internal/domain/notification.go`, add to the const block:

```go
const (
	NotificationTypeSharedExpenseCreated NotificationType = "SHARED_EXPENSE_CREATED"
	NotificationTypeSharedExpenseDeleted NotificationType = "SHARED_EXPENSE_DELETED"
	NotificationTypeSettlementCreated    NotificationType = "SETTLEMENT_CREATED"
	NotificationTypePaymentDueReminder   NotificationType = "PAYMENT_DUE_REMINDER"
)
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/domain/...`
Expected: success, no errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/domain/notification.go
git commit -m "feat: add PAYMENT_DUE_REMINDER notification type"
```

---

### Task 2: Add repository interface methods

**Files:**
- Modify: `backend/internal/domain/repository.go:75-89` (AccountRepository)
- Modify: `backend/internal/domain/notification.go:37-44` (NotificationRepository — defined in this file)

- [ ] **Step 1: Add `FindCreditCardsDueOn` to AccountRepository interface**

In `backend/internal/domain/repository.go`, add to `AccountRepository` interface after `FindCreditCardsDueToday`:

```go
// AccountRepository defines the interface for account data access
type AccountRepository interface {
	// ... existing methods ...
	FindCreditCardsDueToday(ctx context.Context, day int) ([]Account, error)
	// FindCreditCardsDueOn returns all credit cards with payment_due_day matching the given date.
	// Handles short-month compensation: if date is the last day of its month,
	// also returns cards with payment_due_day > last day of month.
	// Preloads AutoPayFromAccount for balance checking.
	FindCreditCardsDueOn(ctx context.Context, date time.Time) ([]Account, error)
	// ... rest of existing methods ...
}
```

- [ ] **Step 2: Add `ExistsByTypeAndResourceToday` to NotificationRepository interface**

In `backend/internal/domain/notification.go`, add to `NotificationRepository` interface:

```go
type NotificationRepository interface {
	Create(ctx context.Context, notification *Notification) error
	FindByUserID(ctx context.Context, userID uuid.UUID, limit, offset int) ([]Notification, int64, error)
	CountUnread(ctx context.Context, userID uuid.UUID) (int64, error)
	MarkAsRead(ctx context.Context, id, userID uuid.UUID) error
	MarkAllAsRead(ctx context.Context, userID uuid.UUID) error
	// ExistsByTypeAndResourceToday checks if a notification of the given type
	// for the given resource already exists today (in the given timezone date).
	ExistsByTypeAndResourceToday(ctx context.Context, nType NotificationType, resourceType string, resourceID uuid.UUID, date time.Time) (bool, error)
}
```

- [ ] **Step 3: Verify domain layer compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/domain/...`
Expected: success (domain layer is pure interfaces, no dependency on repo implementations)

Note: `go build ./...` (full project) will FAIL until Task 3 and Task 4 implement the new interface methods. That's expected.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/domain/repository.go backend/internal/domain/notification.go
git commit -m "feat: add FindCreditCardsDueOn and ExistsByTypeAndResourceToday interfaces"
```

---

### Task 3: Implement `FindCreditCardsDueOn` in account repository

**Files:**
- Modify: `backend/internal/repository/account_repository.go`

- [ ] **Step 1: Implement the method**

Add after `FindCreditCardsDueToday` method (line ~81):

```go
// FindCreditCardsDueOn returns credit cards due on the given date with short-month compensation.
func (r *AccountRepositoryImpl) FindCreditCardsDueOn(ctx context.Context, date time.Time) ([]domain.Account, error) {
	day := date.Day()

	// Calculate last day of the month
	lastDay := time.Date(date.Year(), date.Month()+1, 0, 0, 0, 0, 0, date.Location()).Day()
	isLastDayOfMonth := day == lastDay

	var accounts []domain.Account
	query := r.db.WithContext(ctx).
		Preload("AutoPayFromAccount").
		Where("type = ? AND payment_due_day IS NOT NULL", domain.AccountTypeCredit)

	if isLastDayOfMonth {
		// Match exact day OR any day > last day of month (short-month compensation)
		query = query.Where("payment_due_day = ? OR payment_due_day > ?", day, lastDay)
	} else {
		query = query.Where("payment_due_day = ?", day)
	}

	err := query.Find(&accounts).Error
	if err != nil {
		return nil, err
	}
	return accounts, nil
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/repository/...`
Expected: FAIL — `NotificationRepositoryImpl` doesn't implement `ExistsByTypeAndResourceToday` yet. That's expected; the account_repository itself is correct.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/repository/account_repository.go
git commit -m "feat: implement FindCreditCardsDueOn with short-month compensation"
```

---

### Task 4: Implement `ExistsByTypeAndResourceToday` in notification repository

**Files:**
- Modify: `backend/internal/repository/notification_repository.go`

- [ ] **Step 1: Add import for time package**

Add `"time"` to the import block if not present.

- [ ] **Step 2: Implement the method**

Add at the end of the file:

```go
// ExistsByTypeAndResourceToday checks if a notification already exists for the given type/resource today.
func (r *NotificationRepositoryImpl) ExistsByTypeAndResourceToday(ctx context.Context, nType domain.NotificationType, resourceType string, resourceID uuid.UUID, date time.Time) (bool, error) {
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)

	var count int64
	err := r.db.WithContext(ctx).
		Model(&domain.Notification{}).
		Where("type = ? AND resource_type = ? AND resource_id = ? AND created_at >= ? AND created_at < ?",
			nType, resourceType, resourceID, startOfDay, endOfDay).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
```

- [ ] **Step 3: Verify full build passes**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: success (all interfaces now satisfied)

- [ ] **Step 4: Commit**

```bash
git add backend/internal/repository/notification_repository.go
git commit -m "feat: implement ExistsByTypeAndResourceToday for idempotent reminders"
```

---

### Task 5: Add config for payment reminder schedule

**Files:**
- Modify: `backend/internal/config/config.go:76-81`
- Modify: `backend/configs/config.yaml.example`

- [ ] **Step 1: Add field to WorkerConfig**

In `backend/internal/config/config.go`, update `WorkerConfig`:

```go
type WorkerConfig struct {
	SyncSchedule             string `mapstructure:"sync_schedule"`
	AutoPaySchedule          string `mapstructure:"autopay_schedule"`
	SheetSyncSchedule        string `mapstructure:"sheet_sync_schedule"`
	PaymentReminderSchedule  string `mapstructure:"payment_reminder_schedule"`
	SyncDaysBack             int    `mapstructure:"sync_days_back"`
}
```

- [ ] **Step 2: Add default value**

In `setDefaults()` function, add after line 261:

```go
v.SetDefault("worker.payment_reminder_schedule", "CRON_TZ=Asia/Taipei 0 18 * * *")
```

- [ ] **Step 3: Update config.yaml.example**

Add to the worker section in `backend/configs/config.yaml.example`:

```yaml
worker:
  sync_schedule: "0 3 * * *"        # Every day at 3:00 AM
  autopay_schedule: "0 10 * * *"    # Every day at 10:00 AM
  payment_reminder_schedule: "CRON_TZ=Asia/Taipei 0 18 * * *"  # Every day at 6:00 PM (Taipei)
```

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: success

- [ ] **Step 5: Commit**

```bash
git add backend/internal/config/config.go backend/configs/config.yaml.example
git commit -m "feat: add payment_reminder_schedule config"
```

---

### Task 6: Create PaymentReminderService

**Files:**
- Create: `backend/internal/usecase/payment_reminder_service.go`

- [ ] **Step 1: Create the service file**

```go
package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
	"github.com/yukiota/zenbill/pkg/pushnotification"
)

var taipeiLocation *time.Location

func init() {
	var err error
	taipeiLocation, err = time.LoadLocation("Asia/Taipei")
	if err != nil {
		taipeiLocation = time.FixedZone("Asia/Taipei", 8*60*60)
	}
}

// PaymentReminderService sends payment due date reminders for credit cards.
type PaymentReminderService struct {
	acctRepo  domain.AccountRepository
	notifRepo domain.NotificationRepository
	userRepo  domain.UserRepository
	logger    *slog.Logger
}

// NewPaymentReminderService creates a new PaymentReminderService.
func NewPaymentReminderService(
	acctRepo domain.AccountRepository,
	notifRepo domain.NotificationRepository,
	userRepo domain.UserRepository,
	logger *slog.Logger,
) *PaymentReminderService {
	if logger == nil {
		logger = slog.Default()
	}
	return &PaymentReminderService{
		acctRepo:  acctRepo,
		notifRepo: notifRepo,
		userRepo:  userRepo,
		logger:    logger,
	}
}

// cardReminder holds the notification data for a single card.
type cardReminder struct {
	Card            domain.Account
	Title           string
	Body            string
	Amount          float64 // abs(Balance)
	BalanceShortage bool    // auto-pay source has insufficient balance
}

// SendReminders finds all credit cards due tomorrow and sends reminders.
func (s *PaymentReminderService) SendReminders(ctx context.Context) error {
	now := time.Now().In(taipeiLocation)
	tomorrow := now.AddDate(0, 0, 1)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, taipeiLocation)

	s.logger.Info("starting payment reminder job",
		slog.String("tomorrow", tomorrow.Format("2006-01-02")),
	)

	// 1. Query credit cards due tomorrow (with short-month compensation)
	cards, err := s.acctRepo.FindCreditCardsDueOn(ctx, tomorrow)
	if err != nil {
		return fmt.Errorf("find credit cards due on %s: %w", tomorrow.Format("2006-01-02"), err)
	}

	if len(cards) == 0 {
		s.logger.Info("no credit cards due tomorrow, skipping")
		return nil
	}

	s.logger.Info("found credit cards due tomorrow", slog.Int("count", len(cards)))

	// 2. Filter out cards with no outstanding balance and build reminders
	type userReminders struct {
		userID    uuid.UUID
		reminders []cardReminder
	}
	userMap := make(map[uuid.UUID]*userReminders)

	for _, card := range cards {
		// Skip cards with no outstanding balance
		if card.Balance >= 0 {
			s.logger.Debug("skipping card: no outstanding balance",
				slog.String("card", card.Name),
			)
			continue
		}

		// Idempotency check: skip if already notified today for this card
		exists, err := s.notifRepo.ExistsByTypeAndResourceToday(
			ctx, domain.NotificationTypePaymentDueReminder, "account", card.ID, today,
		)
		if err != nil {
			s.logger.Warn("idempotency check failed, skipping card",
				slog.String("card", card.Name),
				slog.Any("error", err),
			)
			continue
		}
		if exists {
			s.logger.Debug("skipping card: already reminded today",
				slog.String("card", card.Name),
			)
			continue
		}

		amount := math.Abs(card.Balance)
		reminder := s.buildCardReminder(card, amount, tomorrow)

		ur, ok := userMap[card.UserID]
		if !ok {
			ur = &userReminders{userID: card.UserID}
			userMap[card.UserID] = ur
		}
		ur.reminders = append(ur.reminders, reminder)
	}

	// 3. Process each user
	totalCards := 0
	for _, ur := range userMap {
		if err := s.processUser(ctx, ur.userID, ur.reminders); err != nil {
			s.logger.Error("failed to process reminders for user",
				slog.String("user_id", ur.userID.String()),
				slog.Any("error", err),
			)
			continue
		}
		totalCards += len(ur.reminders)
	}

	s.logger.Info("payment reminder job completed",
		slog.Int("total_users", len(userMap)),
		slog.Int("total_cards", totalCards),
	)

	return nil
}

// buildCardReminder creates the notification content for a single card.
func (s *PaymentReminderService) buildCardReminder(card domain.Account, amount float64, dueDate time.Time) cardReminder {
	currencySymbol := currencyToSymbol(card.Currency)
	amountStr := formatAmount(currencySymbol, amount)
	dueDateStr := fmt.Sprintf("%d/%d", dueDate.Month(), dueDate.Day())

	reminder := cardReminder{
		Card:   card,
		Amount: amount,
	}

	if !card.IsAutoPayEnabled() || card.AutoPayFromID == nil {
		// Case 1: No auto-pay
		reminder.Title = fmt.Sprintf("💳 %s 明天繳款截止", card.Name)
		reminder.Body = fmt.Sprintf("目前待繳金額 %s，繳款截止日為 %s。", amountStr, dueDateStr)
		return reminder
	}

	// Auto-pay is enabled — check source account balance
	sourceAccount := card.AutoPayFromAccount
	if sourceAccount == nil {
		// Case 4: Source account not found (config anomaly)
		reminder.Title = fmt.Sprintf("⚠️ %s 自動扣款設定異常", card.Name)
		reminder.Body = fmt.Sprintf("明天繳款截止，待繳 %s，但自動扣款來源帳戶已不存在，請手動繳款或重新設定。", amountStr)
		reminder.BalanceShortage = true
		return reminder
	}

	if sourceAccount.Balance >= amount {
		// Case 2: Auto-pay, sufficient balance
		reminder.Title = fmt.Sprintf("💳 %s 明天自動扣款", card.Name)
		reminder.Body = fmt.Sprintf("預計從「%s」自動扣繳 %s。", sourceAccount.Name, amountStr)
	} else {
		// Case 3: Auto-pay, insufficient balance
		shortage := amount - sourceAccount.Balance
		reminder.Title = fmt.Sprintf("⚠️ %s 扣款餘額不足", card.Name)
		reminder.Body = fmt.Sprintf("明天預計自動扣繳 %s，但「%s」餘額僅 %s，請盡快補足 %s。",
			amountStr,
			sourceAccount.Name,
			formatAmount(currencySymbol, sourceAccount.Balance),
			formatAmount(currencySymbol, shortage),
		)
		reminder.BalanceShortage = true
	}

	return reminder
}

// processUser creates notifications and sends push for one user.
func (s *PaymentReminderService) processUser(ctx context.Context, userID uuid.UUID, reminders []cardReminder) error {
	// Create individual notification records in DB
	for _, r := range reminders {
		cardID := r.Card.ID
		if err := s.createNotification(ctx, userID, r.Title, r.Body, &cardID); err != nil {
			s.logger.Warn("failed to create notification for card",
				slog.String("card", r.Card.Name),
				slog.Any("error", err),
			)
		}
	}

	// Send push notification
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil || user.ExpoPushToken == "" {
		s.logger.Debug("skipping push: no push token",
			slog.String("user_id", userID.String()),
		)
		return nil
	}

	if len(reminders) == 1 {
		// Single card: direct push to account page
		r := reminders[0]
		s.sendPush(user.ExpoPushToken, r.Title, r.Body, "account", r.Card.ID.String())
	} else {
		// Multiple cards: merged push to notifications page
		title, body := s.buildMergedPush(reminders)
		s.sendPush(user.ExpoPushToken, title, body, "notifications", "")
	}

	s.logger.Info("sent payment reminder push",
		slog.String("user_id", userID.String()),
		slog.Int("card_count", len(reminders)),
		slog.Bool("merged", len(reminders) > 1),
	)

	return nil
}

// buildMergedPush creates the merged push notification for multiple cards.
func (s *PaymentReminderService) buildMergedPush(reminders []cardReminder) (string, string) {
	count := len(reminders)
	shortageCount := 0
	var names []string

	// Group amounts by currency
	currencyTotals := make(map[string]float64)
	for _, r := range reminders {
		names = append(names, r.Card.Name)
		currency := r.Card.Currency
		if currency == "" {
			currency = "TWD"
		}
		currencyTotals[currency] += r.Amount
		if r.BalanceShortage {
			shortageCount++
		}
	}

	// Format amount string (single or multi-currency)
	var amountParts []string
	for currency, total := range currencyTotals {
		amountParts = append(amountParts, formatAmount(currencyToSymbol(currency), total))
	}
	amountStr := strings.Join(amountParts, "、")
	nameStr := strings.Join(names, "、")

	var title string
	if shortageCount > 0 {
		title = fmt.Sprintf("⚠️ %d 張信用卡明天繳款截止（%d 張餘額不足）", count, shortageCount)
	} else {
		title = fmt.Sprintf("💳 %d 張信用卡明天繳款截止", count)
	}

	body := fmt.Sprintf("%s，合計待繳 %s。", nameStr, amountStr)

	if shortageCount > 0 {
		var shortageNames []string
		for _, r := range reminders {
			if r.BalanceShortage {
				shortageNames = append(shortageNames, r.Card.Name)
			}
		}
		body += fmt.Sprintf("%s帳戶餘額不足，請盡快補足。", strings.Join(shortageNames, "、"))
	}

	return title, body
}

// createNotification persists a notification record via the repo directly.
func (s *PaymentReminderService) createNotification(ctx context.Context, userID uuid.UUID, title, body string, resourceID *uuid.UUID) error {
	n := &domain.Notification{
		ID:           uuid.New(),
		UserID:       userID,
		Type:         domain.NotificationTypePaymentDueReminder,
		Title:        title,
		Body:         body,
		ResourceType: "account",
		ResourceID:   resourceID,
	}
	return s.notifRepo.Create(ctx, n)
}

// sendPush sends an Expo push notification (best-effort, async).
func (s *PaymentReminderService) sendPush(token, title, body, resourceType, resourceID string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		data := map[string]string{"resource_type": resourceType}
		if resourceID != "" {
			data["resource_id"] = resourceID
		}
		if err := pushnotification.SendExpoPush(ctx, pushnotification.ExpoPushMessage{
			To:    token,
			Title: title,
			Body:  body,
			Data:  data,
		}); err != nil {
			s.logger.Warn("push notification failed", slog.Any("error", err))
		}
	}()
}

// currencyToSymbol maps currency code to display symbol.
func currencyToSymbol(currency string) string {
	switch currency {
	case "TWD":
		return "NT$"
	case "USD":
		return "US$"
	case "JPY":
		return "¥"
	case "EUR":
		return "€"
	case "GBP":
		return "£"
	case "CNY":
		return "CN¥"
	default:
		return currency + " "
	}
}

// formatAmount formats an amount with currency symbol and thousand separators.
func formatAmount(symbol string, amount float64) string {
	// Round to integer for display (most credit card amounts)
	rounded := int64(math.Round(amount))
	// Format with thousand separators
	str := fmt.Sprintf("%d", rounded)
	if len(str) <= 3 {
		return symbol + str
	}

	var result []byte
	for i, c := range str {
		if i > 0 && (len(str)-i)%3 == 0 {
			result = append(result, ',')
		}
		result = append(result, byte(c))
	}
	return symbol + string(result)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/usecase/...`
Expected: success

- [ ] **Step 3: Commit**

```bash
git add backend/internal/usecase/payment_reminder_service.go
git commit -m "feat: add PaymentReminderService for credit card due date reminders"
```

---

### Task 7: Write unit tests for PaymentReminderService

**Files:**
- Create: `backend/internal/usecase/payment_reminder_service_test.go`

- [ ] **Step 1: Create the test file**

```go
package usecase

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/yukiota/zenbill/internal/domain"
)

// --- Mock Repositories ---

type mockAccountRepoForReminder struct {
	cards []domain.Account
	err   error
}

func (m *mockAccountRepoForReminder) FindCreditCardsDueOn(_ context.Context, _ time.Time) ([]domain.Account, error) {
	return m.cards, m.err
}

// Stub all other AccountRepository methods (unused in tests)
func (m *mockAccountRepoForReminder) Create(_ context.Context, _ *domain.Account) error            { return nil }
func (m *mockAccountRepoForReminder) FindByID(_ context.Context, _ uuid.UUID) (*domain.Account, error) { return nil, nil }
func (m *mockAccountRepoForReminder) FindByUserID(_ context.Context, _ uuid.UUID) ([]domain.Account, error) { return nil, nil }
func (m *mockAccountRepoForReminder) UpdateBalance(_ context.Context, _ uuid.UUID, _ float64) error { return nil }
func (m *mockAccountRepoForReminder) Update(_ context.Context, _ *domain.Account) error            { return nil }
func (m *mockAccountRepoForReminder) Delete(_ context.Context, _ uuid.UUID) error                  { return nil }
func (m *mockAccountRepoForReminder) FindCreditCardsDueToday(_ context.Context, _ int) ([]domain.Account, error) { return nil, nil }
func (m *mockAccountRepoForReminder) GetNetAssetTrend(_ context.Context, _ uuid.UUID, _ int) ([]domain.MonthlyNetAsset, error) { return nil, nil }
func (m *mockAccountRepoForReminder) FindStocksByUserID(_ context.Context, _ uuid.UUID) ([]domain.Account, error) { return nil, nil }
func (m *mockAccountRepoForReminder) UpdateStockPrice(_ context.Context, _ uuid.UUID, _ float64, _ time.Time, _ float64) error { return nil }

type mockNotifRepoForReminder struct {
	existsMap map[uuid.UUID]bool // card ID -> exists
	created   []domain.Notification
}

func (m *mockNotifRepoForReminder) ExistsByTypeAndResourceToday(_ context.Context, _ domain.NotificationType, _ string, resourceID uuid.UUID, _ time.Time) (bool, error) {
	if m.existsMap != nil {
		return m.existsMap[resourceID], nil
	}
	return false, nil
}

func (m *mockNotifRepoForReminder) Create(_ context.Context, n *domain.Notification) error {
	m.created = append(m.created, *n)
	return nil
}

func (m *mockNotifRepoForReminder) FindByUserID(_ context.Context, _ uuid.UUID, _, _ int) ([]domain.Notification, int64, error) { return nil, 0, nil }
func (m *mockNotifRepoForReminder) CountUnread(_ context.Context, _ uuid.UUID) (int64, error) { return 0, nil }
func (m *mockNotifRepoForReminder) MarkAsRead(_ context.Context, _, _ uuid.UUID) error        { return nil }
func (m *mockNotifRepoForReminder) MarkAllAsRead(_ context.Context, _ uuid.UUID) error        { return nil }

type mockUserRepoForReminder struct {
	users map[uuid.UUID]*domain.User
}

func (m *mockUserRepoForReminder) FindByID(_ context.Context, id uuid.UUID) (*domain.User, error) {
	if u, ok := m.users[id]; ok {
		return u, nil
	}
	return &domain.User{}, nil
}

func (m *mockUserRepoForReminder) Create(_ context.Context, _ *domain.User) error            { return nil }
func (m *mockUserRepoForReminder) FindByEmail(_ context.Context, _ string) (*domain.User, error) { return nil, nil }
func (m *mockUserRepoForReminder) Update(_ context.Context, _ *domain.User) error            { return nil }
func (m *mockUserRepoForReminder) Delete(_ context.Context, _ uuid.UUID) error               { return nil }

// --- Tests ---

func boolPtr(b bool) *bool { return &b }
func intPtr(i int) *int    { return &i }

func TestSendReminders_NoCards(t *testing.T) {
	svc := NewPaymentReminderService(
		&mockAccountRepoForReminder{cards: nil},
		&mockNotifRepoForReminder{},
		&mockUserRepoForReminder{},
		nil,
	)

	err := svc.SendReminders(context.Background())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestSendReminders_SkipsZeroBalance(t *testing.T) {
	userID := uuid.New()
	cardID := uuid.New()

	notifRepo := &mockNotifRepoForReminder{}
	svc := NewPaymentReminderService(
		&mockAccountRepoForReminder{
			cards: []domain.Account{
				{ID: cardID, UserID: userID, Name: "Test Card", Type: domain.AccountTypeCredit, Balance: 0, PaymentDueDay: intPtr(25)},
			},
		},
		notifRepo,
		&mockUserRepoForReminder{users: map[uuid.UUID]*domain.User{userID: {ID: userID}}},
		nil,
	)

	err := svc.SendReminders(context.Background())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(notifRepo.created) != 0 {
		t.Fatalf("expected 0 notifications, got %d", len(notifRepo.created))
	}
}

func TestSendReminders_NoAutoPay(t *testing.T) {
	userID := uuid.New()
	cardID := uuid.New()

	notifRepo := &mockNotifRepoForReminder{}
	svc := NewPaymentReminderService(
		&mockAccountRepoForReminder{
			cards: []domain.Account{
				{
					ID: cardID, UserID: userID, Name: "國泰世華",
					Type: domain.AccountTypeCredit, Balance: -12350, Currency: "TWD",
					PaymentDueDay: intPtr(25), AutoPayEnabled: boolPtr(false),
				},
			},
		},
		notifRepo,
		&mockUserRepoForReminder{users: map[uuid.UUID]*domain.User{userID: {ID: userID}}},
		nil,
	)

	err := svc.SendReminders(context.Background())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(notifRepo.created) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(notifRepo.created))
	}
	n := notifRepo.created[0]
	if n.Type != domain.NotificationTypePaymentDueReminder {
		t.Errorf("expected type PAYMENT_DUE_REMINDER, got %s", n.Type)
	}
	if n.ResourceType != "account" {
		t.Errorf("expected resource_type account, got %s", n.ResourceType)
	}
	if *n.ResourceID != cardID {
		t.Errorf("expected resource_id %s, got %s", cardID, *n.ResourceID)
	}
}

func TestSendReminders_AutoPaySufficientBalance(t *testing.T) {
	userID := uuid.New()
	cardID := uuid.New()
	bankID := uuid.New()

	notifRepo := &mockNotifRepoForReminder{}
	bankAccount := &domain.Account{ID: bankID, Name: "台新銀行", Balance: 50000}

	svc := NewPaymentReminderService(
		&mockAccountRepoForReminder{
			cards: []domain.Account{
				{
					ID: cardID, UserID: userID, Name: "國泰世華",
					Type: domain.AccountTypeCredit, Balance: -12350, Currency: "TWD",
					PaymentDueDay: intPtr(25), AutoPayEnabled: boolPtr(true),
					AutoPayFromID: &bankID, AutoPayFromAccount: bankAccount,
				},
			},
		},
		notifRepo,
		&mockUserRepoForReminder{users: map[uuid.UUID]*domain.User{userID: {ID: userID}}},
		nil,
	)

	err := svc.SendReminders(context.Background())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(notifRepo.created) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(notifRepo.created))
	}
	n := notifRepo.created[0]
	if n.Title != "💳 國泰世華 明天自動扣款" {
		t.Errorf("unexpected title: %s", n.Title)
	}
}

func TestSendReminders_AutoPayInsufficientBalance(t *testing.T) {
	userID := uuid.New()
	cardID := uuid.New()
	bankID := uuid.New()

	notifRepo := &mockNotifRepoForReminder{}
	bankAccount := &domain.Account{ID: bankID, Name: "台新銀行", Balance: 8000}

	svc := NewPaymentReminderService(
		&mockAccountRepoForReminder{
			cards: []domain.Account{
				{
					ID: cardID, UserID: userID, Name: "國泰世華",
					Type: domain.AccountTypeCredit, Balance: -12350, Currency: "TWD",
					PaymentDueDay: intPtr(25), AutoPayEnabled: boolPtr(true),
					AutoPayFromID: &bankID, AutoPayFromAccount: bankAccount,
				},
			},
		},
		notifRepo,
		&mockUserRepoForReminder{users: map[uuid.UUID]*domain.User{userID: {ID: userID}}},
		nil,
	)

	err := svc.SendReminders(context.Background())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(notifRepo.created) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(notifRepo.created))
	}
	n := notifRepo.created[0]
	if n.Title != "⚠️ 國泰世華 扣款餘額不足" {
		t.Errorf("unexpected title: %s", n.Title)
	}
}

func TestSendReminders_IdempotencySkip(t *testing.T) {
	userID := uuid.New()
	cardID := uuid.New()

	notifRepo := &mockNotifRepoForReminder{
		existsMap: map[uuid.UUID]bool{cardID: true}, // Already notified
	}

	svc := NewPaymentReminderService(
		&mockAccountRepoForReminder{
			cards: []domain.Account{
				{
					ID: cardID, UserID: userID, Name: "Test Card",
					Type: domain.AccountTypeCredit, Balance: -5000, Currency: "TWD",
					PaymentDueDay: intPtr(25),
				},
			},
		},
		notifRepo,
		&mockUserRepoForReminder{users: map[uuid.UUID]*domain.User{userID: {ID: userID}}},
		nil,
	)

	err := svc.SendReminders(context.Background())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(notifRepo.created) != 0 {
		t.Fatalf("expected 0 notifications (idempotency), got %d", len(notifRepo.created))
	}
}

func TestSendReminders_MultipleCardsMerged(t *testing.T) {
	userID := uuid.New()
	card1ID := uuid.New()
	card2ID := uuid.New()

	notifRepo := &mockNotifRepoForReminder{}
	svc := NewPaymentReminderService(
		&mockAccountRepoForReminder{
			cards: []domain.Account{
				{
					ID: card1ID, UserID: userID, Name: "國泰世華",
					Type: domain.AccountTypeCredit, Balance: -12350, Currency: "TWD",
					PaymentDueDay: intPtr(25),
				},
				{
					ID: card2ID, UserID: userID, Name: "台新銀行",
					Type: domain.AccountTypeCredit, Balance: -5000, Currency: "TWD",
					PaymentDueDay: intPtr(25),
				},
			},
		},
		notifRepo,
		&mockUserRepoForReminder{users: map[uuid.UUID]*domain.User{userID: {ID: userID}}},
		nil,
	)

	err := svc.SendReminders(context.Background())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	// Should create 2 individual notification records
	if len(notifRepo.created) != 2 {
		t.Fatalf("expected 2 notifications, got %d", len(notifRepo.created))
	}
}

func TestFormatAmount(t *testing.T) {
	tests := []struct {
		symbol   string
		amount   float64
		expected string
	}{
		{"NT$", 12350, "NT$12,350"},
		{"NT$", 500, "NT$500"},
		{"NT$", 0, "NT$0"},
		{"NT$", 1234567, "NT$1,234,567"},
		{"US$", 99.5, "US$100"},
	}

	for _, tc := range tests {
		got := formatAmount(tc.symbol, tc.amount)
		if got != tc.expected {
			t.Errorf("formatAmount(%q, %v) = %q, want %q", tc.symbol, tc.amount, got, tc.expected)
		}
	}
}

func TestCurrencyToSymbol(t *testing.T) {
	tests := []struct {
		currency string
		expected string
	}{
		{"TWD", "NT$"},
		{"USD", "US$"},
		{"JPY", "¥"},
		{"EUR", "€"},
		{"KRW", "KRW "},
	}

	for _, tc := range tests {
		got := currencyToSymbol(tc.currency)
		if got != tc.expected {
			t.Errorf("currencyToSymbol(%q) = %q, want %q", tc.currency, got, tc.expected)
		}
	}
}

func TestBuildMergedPush(t *testing.T) {
	svc := &PaymentReminderService{}

	reminders := []cardReminder{
		{Card: domain.Account{Name: "國泰世華"}, Amount: 12350, BalanceShortage: false},
		{Card: domain.Account{Name: "台新銀行"}, Amount: 5000, BalanceShortage: true},
		{Card: domain.Account{Name: "玉山銀行"}, Amount: 17850, BalanceShortage: false},
	}

	title, body := svc.buildMergedPush(reminders)

	expectedTitle := "⚠️ 3 張信用卡明天繳款截止（1 張餘額不足）"
	if title != expectedTitle {
		t.Errorf("title = %q, want %q", title, expectedTitle)
	}

	if !strings.Contains(body, "國泰世華") || !strings.Contains(body, "台新銀行") || !strings.Contains(body, "玉山銀行") {
		t.Errorf("body missing card names: %s", body)
	}
	if !strings.Contains(body, "NT$35,200") {
		t.Errorf("body missing total amount: %s", body)
	}
	if !strings.Contains(body, "餘額不足") {
		t.Errorf("body missing shortage warning: %s", body)
	}
}

func TestSendReminders_AutoPaySourceAccountMissing(t *testing.T) {
	userID := uuid.New()
	cardID := uuid.New()
	bankID := uuid.New()

	notifRepo := &mockNotifRepoForReminder{}
	svc := NewPaymentReminderService(
		&mockAccountRepoForReminder{
			cards: []domain.Account{
				{
					ID: cardID, UserID: userID, Name: "國泰世華",
					Type: domain.AccountTypeCredit, Balance: -12350, Currency: "TWD",
					PaymentDueDay: intPtr(25), AutoPayEnabled: boolPtr(true),
					AutoPayFromID: &bankID, AutoPayFromAccount: nil, // Source account deleted
				},
			},
		},
		notifRepo,
		&mockUserRepoForReminder{users: map[uuid.UUID]*domain.User{userID: {ID: userID}}},
		nil,
	)

	err := svc.SendReminders(context.Background())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(notifRepo.created) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(notifRepo.created))
	}
	n := notifRepo.created[0]
	if n.Title != "⚠️ 國泰世華 自動扣款設定異常" {
		t.Errorf("unexpected title: %s", n.Title)
	}
	if !strings.Contains(n.Body, "來源帳戶已不存在") {
		t.Errorf("body should mention missing source account: %s", n.Body)
	}
}
```

- [ ] **Step 2: Run the tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run TestSendReminders -v`
Expected: all tests PASS

- [ ] **Step 3: Run helper function tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./internal/usecase/ -run "TestFormatAmount|TestCurrencyToSymbol|TestBuildMergedPush" -v`
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/internal/usecase/payment_reminder_service_test.go
git commit -m "test: add unit tests for PaymentReminderService"
```

---

### Task 8: Register cron job in worker

**Files:**
- Modify: `backend/cmd/worker/main.go`

- [ ] **Step 1: Add notification repos and service initialization**

After the `autoPayService` initialization (line 105), add:

```go
	// Initialize notification services for payment reminders
	notifRepo := repository.NewNotificationRepository(db)
	userRepo := repository.NewUserRepository(db)
	paymentReminderService := usecase.NewPaymentReminderService(accountRepo, notifRepo, userRepo, logger.Get())
```

- [ ] **Step 2: Add the cron job**

After the sheet sync job block (around line 242), before `// Start scheduler`, add:

```go
	// Schedule: Payment Reminder Job
	reminderJobID, err := scheduler.AddFunc(cfg.Worker.PaymentReminderSchedule, func() {
		ctx := context.Background()
		logger.Info("payment reminder job started", "schedule", cfg.Worker.PaymentReminderSchedule)

		if err := paymentReminderService.SendReminders(ctx); err != nil {
			logger.Error("payment reminder job failed", "error", err)
			return
		}

		logger.Info("payment reminder job completed")
	})
	if err != nil {
		log.Fatalf("Failed to schedule payment reminder job: %v", err)
	}
	jobCount++
	logger.Info("scheduled payment reminder job",
		"job_id", reminderJobID,
		"schedule", cfg.Worker.PaymentReminderSchedule,
	)
```

- [ ] **Step 3: Update the startup log**

After the existing `log.Printf` lines (~line 253), add:

```go
	log.Printf("   - Payment Reminder: %s", cfg.Worker.PaymentReminderSchedule)
```

- [ ] **Step 4: Add import for repository.NewUserRepository**

Verify that `repository.NewUserRepository` exists. If it does, the import is already present. If not, check what function creates the user repo.

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./cmd/worker/...`
Expected: success

- [ ] **Step 6: Commit**

```bash
git add backend/cmd/worker/main.go
git commit -m "feat: register payment reminder cron job in worker"
```

---

### Task 9: Update App notification routing

**Files:**
- Modify: `app/app/notifications.tsx:14-19`

- [ ] **Step 1: Add account resource type handling**

Update the `handlePress` function:

```typescript
  function handlePress(n: Notification) {
    if (!n.is_read) markRead.mutate(n.id)
    if (n.resource_type === 'shared_ledger' && n.resource_id) {
      router.push(`/shared-ledgers/${n.resource_id}`)
    } else if (n.resource_type === 'account' && n.resource_id) {
      router.push(`/accounts/${n.resource_id}`)
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add app/app/notifications.tsx
git commit -m "feat: add account resource type routing in notification list"
```

---

### Task 10: Update Web notification routing

**Files:**
- Modify: `frontend/src/components/layout/NotificationBell.tsx:37-45`

- [ ] **Step 1: Add account resource type handling**

Update the `handleNotificationClick` function:

```typescript
  function handleNotificationClick(notification: Notification) {
    if (!notification.is_read) {
      markAsRead.mutate(notification.id)
    }
    if (notification.resource_type === 'shared_ledger' && notification.resource_id) {
      navigate(`/shared-ledgers/${notification.resource_id}`)
    } else if (notification.resource_type === 'account' && notification.resource_id) {
      navigate(`/accounts/${notification.resource_id}`)
    }
    setOpen(false)
  }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/layout/NotificationBell.tsx
git commit -m "feat: add account resource type routing in web notification bell"
```

---

### Task 11: Add push notification tap handling in App

**Files:**
- Modify: `app/app/_layout.tsx`

Note: The app currently has NO push notification tap handler (`addNotificationResponseReceivedListener` or `useLastNotificationResponse`). We need to add one so that tapping a push notification navigates to the correct screen.

- [ ] **Step 1: Add notification response listener**

In `app/app/_layout.tsx`, add a `useEffect` that listens for notification taps. Import `router` from `expo-router` and lazily import `expo-notifications`:

```typescript
  useEffect(() => {
    let sub: { remove(): void } | undefined

    function handleNotificationData(data: Record<string, string> | undefined) {
      if (!data) return
      const { resource_type, resource_id } = data
      if (resource_type === 'account' && resource_id) {
        router.push(`/accounts/${resource_id}`)
      } else if (resource_type === 'notifications') {
        router.push('/notifications')
      } else if (resource_type === 'shared_ledger' && resource_id) {
        router.push(`/shared-ledgers/${resource_id}`)
      }
    }

    ;(async () => {
      const Notifications = await (async () => {
        try {
          const mod = await import('expo-notifications')
          if (typeof mod.addNotificationResponseReceivedListener !== 'function') return null
          return mod
        } catch { return null }
      })()
      if (!Notifications) return

      // Handle cold start: check if app was opened via notification tap
      const lastResponse = await Notifications.getLastNotificationResponseAsync()
      if (lastResponse) {
        handleNotificationData(
          lastResponse.notification.request.content.data as Record<string, string> | undefined
        )
      }

      // Handle warm/background taps
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationData(
          response.notification.request.content.data as Record<string, string> | undefined
        )
      })
    })()
    return () => sub?.remove()
  }, [])
```

- [ ] **Step 2: Commit**

```bash
git add app/app/_layout.tsx
git commit -m "feat: add push notification tap handler for navigation"
```

---

### Task 12: Final verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/yuki/projects/zen-bill/backend && go test ./... -v`
Expected: all tests pass

- [ ] **Step 2: Run lint check**

Run: `cd /Users/yuki/projects/zen-bill/backend && golangci-lint run`
Expected: no errors

- [ ] **Step 3: Verify full build**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: success

- [ ] **Step 4: Verify frontend builds**

Run: `cd /Users/yuki/projects/zen-bill && npx turbo build --filter=@zenbill/shared`
Expected: success

- [ ] **Step 5: Commit any fixes if needed**
