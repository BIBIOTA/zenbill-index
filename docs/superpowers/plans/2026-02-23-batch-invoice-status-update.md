# Batch Invoice Status Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add batch status update API and checkbox-based multi-select UI so users can ignore multiple invoices at once.

**Architecture:** Backend adds `BatchUpdateStatus` to `InvoiceRepository` interface + GORM implementation, new `PATCH /invoices/batch/status` endpoint. Frontend adds checkbox selection to `InvoicesPage` with floating batch action toolbar.

**Tech Stack:** Go/Gin/GORM (backend), React/TypeScript/TanStack Query (frontend)

---

### Task 1: Add `BatchUpdateStatus` to Domain Interface

**Files:**
- Modify: `backend/internal/domain/repository.go:28-41` (InvoiceRepository interface)

**Step 1: Add the method to the interface**

In `backend/internal/domain/repository.go`, add this method to the `InvoiceRepository` interface, after the existing `UpdateStatus` line (line 34):

```go
BatchUpdateStatus(ctx context.Context, userID uuid.UUID, ids []uuid.UUID, status InvoiceStatus) (int64, error)
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/domain/...`
Expected: PASS (interface change only, no implementations yet — will break other packages)

**Step 3: Commit**

```bash
git add backend/internal/domain/repository.go
git commit -m "feat(domain): add BatchUpdateStatus to InvoiceRepository interface"
```

---

### Task 2: Implement `BatchUpdateStatus` in Repository

**Files:**
- Modify: `backend/internal/repository/invoice_repository.go` (add method after `UpdateStatus`)

**Step 1: Add the GORM implementation**

Add this method to `InvoiceRepositoryImpl` after the existing `UpdateStatus` method (after line 80):

```go
// BatchUpdateStatus updates the status of multiple invoices belonging to a user
func (r *InvoiceRepositoryImpl) BatchUpdateStatus(ctx context.Context, userID uuid.UUID, ids []uuid.UUID, status domain.InvoiceStatus) (int64, error) {
	result := r.db.WithContext(ctx).
		Model(&domain.Invoice{}).
		Where("id IN ? AND user_id = ?", ids, userID).
		Update("status", status)
	return result.RowsAffected, result.Error
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./internal/repository/...`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/internal/repository/invoice_repository.go
git commit -m "feat(repository): implement BatchUpdateStatus with user_id scoping"
```

---

### Task 3: Add Batch Status Update HTTP Handler

**Files:**
- Modify: `backend/internal/delivery/http/invoice_handler.go`

**Step 1: Add the request struct**

Add after the existing `UpdateStatusRequest` struct (after line 61):

```go
// BatchUpdateStatusRequest 批次更新發票狀態請求
type BatchUpdateStatusRequest struct {
	IDs    []string `json:"ids" binding:"required"`
	Status string   `json:"status" binding:"required"`
}
```

**Step 2: Add the handler method**

Add after the existing `UpdateInvoiceStatus` method (after line 306):

```go
// BatchUpdateInvoiceStatus godoc
// @Summary      批次更新發票狀態
// @Description  一次更新多筆發票的狀態
// @Tags         發票
// @Accept       json
// @Produce      json
// @Param        body  body      BatchUpdateStatusRequest  true  "批次更新請求"
// @Success      200   {object}  Response
// @Failure      400   {object}  Response
// @Failure      500   {object}  Response
// @Router       /invoices/batch/status [patch]
func (h *InvoiceHandler) BatchUpdateInvoiceStatus(c *gin.Context) {
	userID := getUserID(c)

	var req BatchUpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "invalid request body, expected {\"ids\": [...], \"status\": \"IGNORED\"}")
		return
	}

	if len(req.IDs) == 0 {
		BadRequest(c, "ids must not be empty")
		return
	}
	if len(req.IDs) > 100 {
		BadRequest(c, "ids must not exceed 100")
		return
	}

	status := domain.InvoiceStatus(req.Status)
	if status != domain.InvoiceStatusPending && status != domain.InvoiceStatusProcessed && status != domain.InvoiceStatusIgnored {
		BadRequest(c, "invalid status, must be one of: PENDING, PROCESSED, IGNORED")
		return
	}

	ids := make([]uuid.UUID, 0, len(req.IDs))
	for _, idStr := range req.IDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			BadRequest(c, "invalid invoice ID: "+idStr)
			return
		}
		ids = append(ids, id)
	}

	count, err := h.invoiceRepo.BatchUpdateStatus(c.Request.Context(), userID, ids, status)
	if err != nil {
		h.logger.ErrorContext(c.Request.Context(), "Failed to batch update invoice status",
			"count", len(ids),
			"status", status,
			"error", err,
		)
		InternalServerError(c, "failed to batch update invoice status")
		return
	}

	Success(c, gin.H{"updated_count": count})
}
```

**Step 3: Register the route**

In the `RegisterRoutes` method (line 341-349), add the batch route **before** the `/:id` routes to avoid route conflicts:

```go
func (h *InvoiceHandler) RegisterRoutes(r *gin.RouterGroup) {
	invoices := r.Group("/invoices")
	{
		invoices.GET("", h.ListInvoices)
		invoices.POST("/sync", h.TriggerSync)
		invoices.PATCH("/batch/status", h.BatchUpdateInvoiceStatus)
		invoices.PATCH("/:id/status", h.UpdateInvoiceStatus)
		invoices.POST("/:id/match", h.MatchInvoice)
	}
}
```

**Step 4: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/backend && go build ./...`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/internal/delivery/http/invoice_handler.go
git commit -m "feat(api): add PATCH /invoices/batch/status endpoint"
```

---

### Task 4: Add Frontend Hook `useBatchUpdateInvoiceStatus`

**Files:**
- Modify: `frontend/src/hooks/useInvoices.ts`

**Step 1: Add the mutation hook**

Add after the existing `useUpdateInvoiceStatus` function (after line 34):

```typescript
export function useBatchUpdateInvoiceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      api.patch<ApiResponse<{ updated_count: number }>>('/invoices/batch/status', { ids, status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/hooks/useInvoices.ts
git commit -m "feat(frontend): add useBatchUpdateInvoiceStatus hook"
```

---

### Task 5: Add Checkbox Selection and Batch Toolbar to InvoicesPage

**Files:**
- Modify: `frontend/src/pages/InvoicesPage.tsx`

**Step 1: Add selection state and import the hook**

Update the import line (line 4) to include the new hook:

```typescript
import { useInvoices, useSyncInvoices, useUpdateInvoiceStatus, useMatchInvoice, useSyncStatus, useBatchUpdateInvoiceStatus } from '@/hooks/useInvoices'
```

Add the `Square` and `CheckSquare` icons to the lucide import (line 3):

```typescript
import { RefreshCw, ChevronDown, ChevronRight, ChevronLeft, ArrowDownToLine, Square, CheckSquare2 } from 'lucide-react'
```

Inside the component, after the `expanded` state (line 24), add:

```typescript
const batchUpdate = useBatchUpdateInvoiceStatus()
const [selected, setSelected] = useState<Set<string>>(new Set())

const toggleSelect = (id: string) => {
  setSelected((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
}

const allOnPageSelected = invoices.length > 0 && invoices.every((inv: Invoice) => selected.has(inv.id))
const someSelected = selected.size > 0

const toggleSelectAll = () => {
  if (allOnPageSelected) {
    setSelected((prev) => {
      const next = new Set(prev)
      invoices.forEach((inv: Invoice) => next.delete(inv.id))
      return next
    })
  } else {
    setSelected((prev) => {
      const next = new Set(prev)
      invoices.forEach((inv: Invoice) => next.add(inv.id))
      return next
    })
  }
}

const handleBatchIgnore = () => {
  batchUpdate.mutate(
    { ids: Array.from(selected), status: 'IGNORED' },
    { onSuccess: () => setSelected(new Set()) },
  )
}
```

**Step 2: Add "Select All" checkbox in the list header**

Replace the invoice list container (the `<div className="bg-[var(--bg-surface)]...` block starting at line 185). Add a header row with select-all checkbox before the invoice map:

```tsx
<div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
  {isLoading ? (
    <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">載入中...</div>
  ) : invoices.length === 0 ? (
    <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">尚無發票資料</div>
  ) : (
    <>
      {/* Select All Header */}
      <div
        className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-root)]"
      >
        <button onClick={toggleSelectAll} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          {allOnPageSelected ? <CheckSquare2 className="w-4 h-4 text-[var(--color-accent)]" /> : <Square className="w-4 h-4" />}
        </button>
        <span className="text-[11px] text-[var(--text-muted)]">
          {someSelected ? `已選取 ${selected.size} 筆` : '全選'}
        </span>
      </div>
      {invoices.map((inv: Invoice) => {
        const sc = statusConfig[inv.status] || statusConfig.PENDING
        const isExpanded = expanded.has(inv.id)
        const isSelected = selected.has(inv.id)
        const items = inv.raw_details?.Details ?? []
        return (
          <div key={inv.id} className="border-b border-[var(--border-subtle)] last:border-0">
            <div
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)] ${isSelected ? 'bg-[var(--color-accent)]/5' : ''}`}
              onClick={() => toggleExpand(inv.id)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); toggleSelect(inv.id) }}
                className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                {isSelected ? <CheckSquare2 className="w-4 h-4 text-[var(--color-accent)]" /> : <Square className="w-4 h-4" />}
              </button>
              {items.length > 0 ? (
                isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
              ) : (
                <div className="w-4 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono text-[var(--color-accent)]">{inv.invoice_number}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sc.color} ${sc.bg}`}>
                    {sc.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span>{new Date(inv.invoice_date).toLocaleDateString('zh-TW')}</span>
                  <span className="truncate">{inv.seller_name}</span>
                </div>
              </div>
              <div className="text-right shrink-0 flex items-center gap-2">
                {inv.status === 'PENDING' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleImport(inv) }}
                    disabled={matchInvoice.isPending}
                    className="h-6 px-2 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-[10px] font-medium hover:bg-[var(--color-accent)]/20 disabled:opacity-50"
                  >
                    <ArrowDownToLine className="w-3 h-3 inline mr-0.5" />
                    匯入
                  </button>
                )}
                <div>
                  <p className="text-sm font-semibold tabular-nums">${inv.total_amount.toLocaleString()}</p>
                  <select
                    value={inv.status}
                    onChange={(e) => { e.stopPropagation(); updateStatus.mutate({ id: inv.id, status: e.target.value }) }}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 h-6 px-1 rounded bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[10px] focus:outline-none"
                  >
                    <option value="PENDING">待處理</option>
                    <option value="PROCESSED">已處理</option>
                    <option value="IGNORED">已忽略</option>
                  </select>
                </div>
              </div>
            </div>
            {isExpanded && items.length > 0 && (
              <div className="px-4 pb-3 pl-11">
                <div className="bg-[var(--bg-root)] rounded-lg p-3 space-y-1.5">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-secondary)]">
                        {item.item}
                        {Number(item.quantity) > 1 && <span className="text-[var(--text-muted)]"> x{item.quantity}</span>}
                      </span>
                      <span className="tabular-nums font-medium">${Number(item.unitPrice).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </>
  )}
</div>
```

**Step 3: Add floating batch action toolbar**

Add this block after the pagination section (before the closing `</div>` of the page), just before the final `</div>`:

```tsx
{/* Batch Action Toolbar */}
{someSelected && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-lg">
    <span className="text-xs font-medium">已選取 {selected.size} 筆</span>
    <button
      onClick={handleBatchIgnore}
      disabled={batchUpdate.isPending}
      className="h-7 px-3 rounded-lg bg-[var(--text-muted)]/20 text-xs font-medium hover:bg-[var(--text-muted)]/30 disabled:opacity-50"
    >
      {batchUpdate.isPending ? '處理中...' : '批次忽略'}
    </button>
    <button
      onClick={() => setSelected(new Set())}
      className="h-7 px-3 rounded-lg text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
    >
      取消選取
    </button>
  </div>
)}
```

**Step 4: Verify frontend compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/pages/InvoicesPage.tsx
git commit -m "feat(frontend): add checkbox selection and batch ignore toolbar to InvoicesPage"
```

---

### Task 6: Manual Verification

**Step 1: Start backend**

Run: `cd /Users/yuki/projects/zen-bill/backend && go run cmd/api/main.go`

**Step 2: Start frontend**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npm run dev`

**Step 3: Test in browser**

1. Navigate to the invoices page
2. Verify checkboxes appear on each invoice row
3. Click individual checkboxes — should toggle selection with accent highlight
4. Click "全選" — should select all visible invoices
5. Verify floating toolbar appears at bottom: "已選取 N 筆 | 批次忽略 | 取消選取"
6. Click "批次忽略" — selected invoices should change to IGNORED status
7. Toolbar should disappear after batch operation
8. List should refresh showing updated statuses

**Step 4: Test API directly**

```bash
curl -X PATCH http://localhost:8080/api/v1/invoices/batch/status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["uuid-1", "uuid-2"], "status": "IGNORED"}'
```

Expected: `{"code": 200, "message": "success", "data": {"updated_count": 2}}`

**Step 5: Test error cases**

- Empty ids: should return 400
- Over 100 ids: should return 400
- Invalid status: should return 400
- Invalid UUID: should return 400
