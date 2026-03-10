# Notification Center Design

## Overview

Add a notification center to ZenBill (Web + APP) with push notification support via Expo Notifications. Initial scope: notify shared accounting partners when SharedExpense or Settlement is created.

## Trigger Scenarios

- Partner creates a **SharedExpense** → notify the other party
- Partner creates a **Settlement** → notify the other party

## Backend

### Domain Entity: `Notification`

| Field        | Type      | Description                                          |
|-------------|-----------|------------------------------------------------------|
| ID          | UUID      | Primary key                                          |
| UserID      | UUID      | Recipient user ID                                    |
| Type        | string    | `shared_expense_created`, `settlement_created`       |
| Title       | string    | e.g. "小明新增了一筆共同消費"                          |
| Body        | string    | e.g. "午餐 $350"                                     |
| ResourceType| string    | `shared_ledger`                                      |
| ResourceID  | UUID      | SharedLedger ID (for navigation)                     |
| IsRead      | bool      | Read/unread status                                   |
| CreatedAt   | time.Time | Creation timestamp                                   |

### Expo Push Token Management

- User entity or separate `device_tokens` table stores Expo push tokens
- APP registers token on login: `PUT /api/users/push-token`
- Token cleared on logout

### API Endpoints

| Method | Path                            | Description          |
|--------|---------------------------------|----------------------|
| GET    | `/api/notifications`            | List notifications (paginated) |
| GET    | `/api/notifications/unread-count` | Get unread count    |
| PATCH  | `/api/notifications/:id/read`   | Mark single as read  |
| PATCH  | `/api/notifications/read-all`   | Mark all as read     |
| PUT    | `/api/users/push-token`         | Register/update push token |

### Notification Flow (Synchronous)

1. Create SharedExpense/Settlement → DB Transaction
2. Write Notification record → same DB Transaction
3. Send Expo Push Notification → **best-effort** (failure only logged, no rollback)

### NotificationService (`internal/usecase/`)

- Creates Notification DB record
- Calls Expo Push API (`https://exp.host/--/api/v2/push/send`)
- Called by SharedExpense/Settlement usecase after successful creation
- Push failure does NOT affect main flow

## Frontend (Web)

- **Header bell icon** with unread badge count
- Click opens **dropdown panel** with recent notifications
- Per-item click: mark as read + navigate to SharedLedger page
- "Mark all as read" button
- Polling unread count via React Query periodic refetch

## Frontend (APP)

- **Header bell icon** with unread badge
- Click navigates to **notification list page**
- Per-item click: mark as read + navigate to SharedLedger page
- "Mark all as read" button
- Expo Notifications integration:
  - Register push token on login
  - Handle push notification tap → navigate to SharedLedger

## Read/Unread Mechanism

- **Per-item**: clicking a notification marks it as read
- **Bulk**: "Mark all as read" button available
- Opening the panel does NOT auto-mark all as read

## Tech Stack

- **Push**: Expo Notifications (expo-notifications) — free, handles FCM/APNs
- **Backend**: Go usecase + repository (Clean Architecture)
- **Web**: React Query for data fetching, Lucide bell icon
- **APP**: expo-notifications for token registration + push handling

## Future Extensibility

- Additional notification types (invoice sync status, billing cycle alerts)
- Web Push API (Service Worker) for browser push notifications
- Notification preferences / mute settings
