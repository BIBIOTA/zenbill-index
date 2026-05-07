# Partner Alias Editing Design

**Date:** 2026-02-25
**Status:** Approved

## Problem

Google Sheet 名稱對照設定（`owner_aliases` / `partner_aliases`）目前只有帳本 owner 能查看和編輯。Partner 加入帳本後無法管理自己的別名，必須請 owner 代為設定。

## Goal

讓 partner 也能編輯名稱對照設定，且自動交換視角（partner 看到的「我」= `partner_aliases`，「對方」= `owner_aliases`）。

## Design

### 1. Backend: New `PUT /shared-ledgers/:id/aliases` endpoint

**Why a new endpoint:** 現有 `PUT /shared-ledgers/:id` 檢查 `IsOwner`，用於更新帳本名稱、Sheet 綁定等 owner-only 設定。為避免權限洩漏，aliases 使用獨立端點。

**Handler:** `UpdateAliases(c *gin.Context)`
- Permission: `IsMember(userID)` — owner and partner both allowed
- Request body:
  ```json
  {
    "owner_aliases": ["Yuki", "ゆき"],
    "partner_aliases": ["Zumi"]
  }
  ```
- Only updates `OwnerAliases` and `PartnerAliases` fields
- Route: `PUT /shared-ledgers/:id/aliases` in `RegisterRoutes`

### 2. Frontend: Remove isOwner gate + perspective swap

**File:** `SharedLedgerDetailPage.tsx`

Changes:
1. Remove `{isOwner && (` wrapper on alias settings section (line 331)
2. Add perspective variables:
   ```typescript
   const myAliasKey = isOwner ? 'owner' : 'partner'
   const theirAliasKey = isOwner ? 'partner' : 'owner'
   ```
3. Swap form labels: "我的名稱" maps to `aliasForm[myAliasKey]`, "對方名稱" maps to `aliasForm[theirAliasKey]`
4. On save, map back to `owner_aliases` / `partner_aliases` correctly
5. Change API call from `PUT /:id` to `PUT /:id/aliases`

**New hook:** `useUpdateAliases(id)` — calls `PUT /shared-ledgers/:id/aliases`

### 3. No changes needed

- Domain layer (SharedLedger entity, aliases field semantics unchanged)
- Repository layer (Update method already handles partial updates)
- Google Sheet sync (uses `ledger.OwnerAliases` / `ledger.PartnerAliases` as before)

## Files to modify

| File | Change |
|------|--------|
| `backend/internal/delivery/http/shared_ledger_handler.go` | Add `UpdateAliases` handler + route |
| `frontend/src/pages/SharedLedgerDetailPage.tsx` | Remove isOwner gate, add perspective swap |
| `frontend/src/hooks/useSharedLedgers.ts` | Add `useUpdateAliases` hook |
