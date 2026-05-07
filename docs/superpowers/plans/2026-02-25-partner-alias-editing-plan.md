# Partner Alias Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let both owner and partner edit name mapping (aliases) for Google Sheet sync, with automatic perspective swapping.

**Architecture:** Add a new `PUT /shared-ledgers/:id/aliases` backend endpoint with `IsMember` permission (instead of `IsOwner`). On the frontend, remove the `isOwner` gate on the alias settings section and swap "my"/"their" labels based on the viewer's role.

**Tech Stack:** Go + Gin (backend handler), React + TypeScript (frontend)

---

### Task 1: Add `UpdateAliases` handler to backend

**Files:**
- Modify: `backend/internal/delivery/http/shared_ledger_handler.go`

**Step 1: Add the request type and handler**

After the `SyncSheet` handler (line 441) and before `RegisterRoutes` (line 444), add:

```go
// updateAliasesRequest defines the JSON body for updating aliases.
type updateAliasesRequest struct {
	OwnerAliases   []string `json:"owner_aliases" binding:"required"`
	PartnerAliases []string `json:"partner_aliases" binding:"required"`
}

// UpdateAliases godoc
// @Summary      更新名稱對照
// @Description  更新共同帳本的名稱對照（成員皆可操作）
// @Tags         共同帳本
// @Accept       json
// @Produce      json
// @Param        id    path      string                true  "帳本 ID (UUID)"
// @Param        body  body      updateAliasesRequest  true  "名稱對照"
// @Success      200   {object}  Response{data=domain.SharedLedger}
// @Failure      400   {object}  Response
// @Failure      403   {object}  Response
// @Failure      404   {object}  Response
// @Failure      500   {object}  Response
// @Router       /shared-ledgers/{id}/aliases [put]
func (h *SharedLedgerHandler) UpdateAliases(c *gin.Context) {
	ctx := c.Request.Context()
	userID := getUserID(c)

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		BadRequest(c, "invalid ledger ID")
		return
	}

	ledger, err := h.ledgerService.GetByID(ctx, id)
	if err != nil {
		NotFound(c, "shared ledger not found")
		return
	}

	if !ledger.IsMember(userID) {
		Forbidden(c, "you are not a member of this ledger")
		return
	}

	var req updateAliasesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body")
		return
	}

	ledger.OwnerAliases = req.OwnerAliases
	ledger.PartnerAliases = req.PartnerAliases

	if err := h.ledgerService.Update(ctx, ledger); err != nil {
		h.logger.ErrorContext(ctx, "Failed to update aliases", "error", err, "id", id)
		InternalServerError(c, "failed to update aliases")
		return
	}

	ledger.HasGoogleCredential = len(ledger.GoogleCredentialEncrypted) > 0
	SuccessWithMessage(c, "aliases updated", ledger)
}
```

**Step 2: Register the route**

In `RegisterRoutes` (line 444), add the aliases route after the sync route:

Change:
```go
		ledgers.POST("/:id/sync", h.SyncSheet)
		ledgers.POST("/invite/:token/accept", h.AcceptInvite)
```

To:
```go
		ledgers.POST("/:id/sync", h.SyncSheet)
		ledgers.PUT("/:id/aliases", h.UpdateAliases)
		ledgers.POST("/invite/:token/accept", h.AcceptInvite)
```

**Step 3: Verify it compiles**

Run: `cd backend && go build ./...`
Expected: No errors

**Step 4: Commit**

```bash
cd backend && git add internal/delivery/http/shared_ledger_handler.go
git commit -m "feat(backend): add PUT /shared-ledgers/:id/aliases endpoint for member alias editing"
```

---

### Task 2: Add `useUpdateAliases` hook to frontend

**Files:**
- Modify: `frontend/src/hooks/useSharedLedgers.ts`

**Step 1: Add the hook**

After the existing `useUpdateSharedLedger` hook (line 68), add:

```typescript
export function useUpdateAliases(ledgerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { owner_aliases: string[]; partner_aliases: string[] }) =>
      api.put<ApiResponse<SharedLedger>>(`/shared-ledgers/${ledgerId}/aliases`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers', ledgerId] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers'] })
    },
  })
}
```

**Step 2: Commit**

```bash
cd frontend && git add src/hooks/useSharedLedgers.ts
git commit -m "feat(frontend): add useUpdateAliases hook"
```

---

### Task 3: Update SharedLedgerDetailPage — perspective swap and remove isOwner gate

**Files:**
- Modify: `frontend/src/pages/SharedLedgerDetailPage.tsx`

**Step 1: Add import for `useUpdateAliases`**

At line 11, add `useUpdateAliases` to the import:

Change:
```typescript
import {
  useSharedLedger,
  useSharedExpenses,
  useSharedLedgerSummary,
  useSyncSheet,
  useRegenerateInvite,
  useDeleteSharedExpense,
  useUpdateSharedLedger,
} from '@/hooks/useSharedLedgers'
```

To:
```typescript
import {
  useSharedLedger,
  useSharedExpenses,
  useSharedLedgerSummary,
  useSyncSheet,
  useRegenerateInvite,
  useDeleteSharedExpense,
  useUpdateSharedLedger,
  useUpdateAliases,
} from '@/hooks/useSharedLedgers'
```

**Step 2: Add the `aliasMutation` and perspective variables**

After `const updateMutation = useUpdateSharedLedger(id!)` (line 48), add:

```typescript
const aliasMutation = useUpdateAliases(id!)
```

After `const isOwner = ledger?.owner_id === user?.id` (line 66), add:

```typescript
// Perspective swap: "my" aliases map to the viewer's role
const myAliasKey = isOwner ? 'owner' : 'partner' as const
const theirAliasKey = isOwner ? 'partner' : 'owner' as const
```

**Step 3: Remove the `isOwner` gate on alias settings**

Change line 331 from:
```tsx
{isOwner && (
```
To:
```tsx
{ledger && (
```

**Step 4: Swap alias form initialization**

Change the "編輯" button's `onClick` handler (lines 341-344) from:
```typescript
setAliasForm({
  owner: ledger.owner_aliases?.length ? [...ledger.owner_aliases] : [],
  partner: ledger.partner_aliases?.length ? [...ledger.partner_aliases] : [],
})
```
To:
```typescript
setAliasForm({
  owner: ledger[`${myAliasKey}_aliases`]?.length ? [...ledger[`${myAliasKey}_aliases`]] : [],
  partner: ledger[`${theirAliasKey}_aliases`]?.length ? [...ledger[`${theirAliasKey}_aliases`]] : [],
})
```

**Step 5: Update the save handler to use the new endpoint and reverse-map aliases**

Change the save button's `onClick` (lines 437-441) from:
```typescript
updateMutation.mutate(
  { owner_aliases: aliasForm.owner, partner_aliases: aliasForm.partner },
  { onSuccess: () => setShowAliasForm(false) },
)
```
To:
```typescript
aliasMutation.mutate(
  {
    owner_aliases: isOwner ? aliasForm.owner : aliasForm.partner,
    partner_aliases: isOwner ? aliasForm.partner : aliasForm.owner,
  },
  { onSuccess: () => setShowAliasForm(false) },
)
```

**Step 6: Update the save button's `disabled` and label to use `aliasMutation`**

Change (line 443):
```typescript
disabled={updateMutation.isPending}
```
To:
```typescript
disabled={aliasMutation.isPending}
```

Change (line 447):
```typescript
{updateMutation.isPending ? '儲存中...' : '儲存'}
```
To:
```typescript
{aliasMutation.isPending ? '儲存中...' : '儲存'}
```

**Step 7: Update the read-only view to use perspective variables**

Change the read-only display (lines 458-461) from:
```tsx
<div className="space-y-1 text-xs text-[var(--text-muted)]">
  <p>我: {ledger.owner_aliases?.length ? ledger.owner_aliases.join(', ') : '(未設定)'}</p>
  <p>對方: {ledger.partner_aliases?.length ? ledger.partner_aliases.join(', ') : ledger.partner_name}</p>
</div>
```
To:
```tsx
<div className="space-y-1 text-xs text-[var(--text-muted)]">
  <p>我: {ledger[`${myAliasKey}_aliases`]?.length ? ledger[`${myAliasKey}_aliases`].join(', ') : '(未設定)'}</p>
  <p>對方: {ledger[`${theirAliasKey}_aliases`]?.length ? ledger[`${theirAliasKey}_aliases`].join(', ') : isOwner ? ledger.partner_name : '(未設定)'}</p>
</div>
```

**Step 8: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 9: Commit**

```bash
cd frontend && git add src/pages/SharedLedgerDetailPage.tsx
git commit -m "feat(frontend): allow partner to edit name aliases with perspective swap"
```

---

## Summary

| Task | Description | Layer |
|------|-------------|-------|
| 1 | Add `PUT /shared-ledgers/:id/aliases` endpoint (`IsMember` permission) | Backend |
| 2 | Add `useUpdateAliases` hook | Frontend |
| 3 | Remove `isOwner` gate + add perspective swap on alias section | Frontend |
