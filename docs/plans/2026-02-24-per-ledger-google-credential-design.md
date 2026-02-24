# Per-Ledger Google Credential Design

## Goal

Allow each shared ledger to have its own Google Service Account credential, uploaded via the frontend binding form. Replace the current server-wide credential with per-ledger encrypted credentials stored in the database.

## Architecture

```
Frontend: Binding form with file input for Service Account JSON
  ↓ JSON body with credential content as string
Backend: Validate JSON → AES-GCM encrypt → store in DB
  ↓ On sync
Backend: Decrypt from DB → option.WithCredentialsJSON() → per-ledger Sheets client
```

## Data Model

Add to `SharedLedger` entity:
- `GoogleCredentialEncrypted []byte` (GORM `type:bytea`) — AES-GCM encrypted Service Account JSON

## API

`PUT /shared-ledgers/:id` accepts an optional new field:
```json
{
  "google_sheet_id": "spreadsheet-id",
  "google_sheet_gid": "tab-name",
  "google_credential_json": "{ ...entire service account JSON... }"
}
```

Response includes `has_google_credential: true/false` (never returns the raw credential).

## Backend Changes

1. **`googlesheet/client.go`** — Add `NewClientFromJSON(ctx context.Context, credJSON []byte) (*Client, error)` using `option.WithCredentialsJSON()`
2. **`domain/shared_ledger.go`** — Add `GoogleCredentialEncrypted []byte` field
3. **`delivery/http/shared_ledger_handler.go`** — UpdateLedger accepts `google_credential_json`, encrypts with existing `pkg/crypto.Encryptor`, stores in entity
4. **`usecase/sheet_sync_service.go`** — On sync, decrypt credential from ledger, create per-ledger `googlesheet.Client` via `NewClientFromJSON`
5. **`cmd/api/main.go`** — Remove global `googlesheet.Client` init; pass `Encryptor` to handler and sync service instead

## Frontend Changes

- Binding form: Add file input for `.json` file
- Read file content with `FileReader`, send as `google_credential_json` string in request body
- Show `has_google_credential` status (green dot) instead of raw credential

## Security

- Reuse existing `pkg/crypto.Encryptor` (AES-256-GCM)
- Credential JSON never returned to frontend after upload
- Only decrypted in memory during sync operation
- DB stores only encrypted bytes
