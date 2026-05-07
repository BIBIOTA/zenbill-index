# Sync Progress Design

**Date:** 2026-02-22
**Goal:** Show real-time sync progress when user clicks "Sync Invoices" on the InvoicesPage.

## Problem

After clicking sync, the user has no visibility into whether the sync is running or how many invoices have been processed. Syncs can take 5 seconds to 5 minutes.

## Approach: DB-based Progress with Polling

Store sync progress in `einvoice_credentials.sync_progress` (JSONB). Frontend polls `GET /einvoice/credentials` every 3 seconds while syncing.

## Data Model

Add to `einvoice_credentials`:

```sql
ALTER TABLE einvoice_credentials ADD COLUMN sync_progress JSONB;
```

Domain struct:

```go
type SyncProgress struct {
    NewInvoices     int `json:"new"`
    SkippedInvoices int `json:"skipped"`
    FailedInvoices  int `json:"failed"`
}
```

- Set to `{"new":0,"skipped":0,"failed":0}` when sync starts
- Updated after each invoice is processed
- Set to `null` when sync ends (idle or error)

## Backend Changes

### Repository
- Add `UpdateSyncProgress(ctx, userID, progress *SyncProgress) error`

### InvoiceSyncService
- Initialize progress at sync start
- After each `processInvoice()`, increment counter and call `UpdateSyncProgress`
- Clear progress when sync ends

### Credential Handler
- `GET /einvoice/credentials` already returns sync_status; add `sync_progress` field

## API Response

```json
{
  "bound": true,
  "sync_status": "syncing",
  "sync_progress": { "new": 5, "skipped": 2, "failed": 0 },
  "sync_error": null,
  "last_synced_at": "2026-02-22T10:30:00Z"
}
```

`sync_progress` is `null` when not syncing.

## Frontend Changes

### New hook: `useSyncStatus()`
- Polls `GET /einvoice/credentials` every 3 seconds when `sync_status === "syncing"`
- Uses TanStack Query `refetchInterval` with conditional logic
- Stops polling when sync completes

### InvoicesPage Banner (top of page)
- **Syncing:** "同步中... 已新增 5 張，略過 2 張" with spinner
- **Complete:** "同步完成！新增 12 張，略過 3 張" auto-dismiss after 5 seconds
- **Error:** "同步失敗：{error}" red background, persistent until dismissed

## Data Flow

```
User clicks sync → POST /invoices/sync (202)
  → sync_status = "syncing", sync_progress = {0,0,0}
  → Frontend starts polling every 3 seconds

Each invoice processed:
  → UPDATE sync_progress in DB
  → Next poll picks up new counts
  → Banner updates numbers

Sync ends:
  → sync_status = "idle", sync_progress = null
  → Frontend stops polling
  → Banner shows completion, then fades
  → Invoice list refreshed
```
