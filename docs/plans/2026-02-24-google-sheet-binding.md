# Google Sheet 綁定功能 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 讓使用者能在共同帳本詳情頁綁定 Google Sheet，並透過後端 sync endpoint 進行雙向同步。

**Architecture:** 前端在 SharedLedgerDetailPage 新增「綁定 Google Sheet」區塊，呼叫已有的 `PUT /shared-ledgers/:id` API 設定 sheet ID/GID。後端新增 `POST /shared-ledgers/:id/sync` handler，初始化 `googlesheet.Client` 和 `SheetSyncService`。

**Tech Stack:** React + TypeScript (frontend), Go + Gin (backend), Google Sheets API v4

---

## 現況分析

### 已完成
- Backend: `SharedLedger` entity 有 `GoogleSheetID`, `GoogleSheetGID`, `SyncEnabled` 欄位
- Backend: `PUT /shared-ledgers/:id` handler 已支援更新這三個欄位
- Backend: `SheetSyncService` 完整實作雙向同步邏輯
- Backend: `googlesheet.Client` 完整實作 Sheets API 操作
- Backend: `GoogleConfig` 已定義在 config 中
- Frontend: `SharedLedger` type 已有 `google_sheet_id`, `google_sheet_gid`, `sync_enabled`
- Frontend: `useSyncSheet` hook 已存在

### 缺少
1. **Frontend:** 沒有 `useUpdateSharedLedger` hook
2. **Frontend:** 沒有 `UpdateSharedLedgerInput` type
3. **Frontend:** 詳情頁沒有綁定 Google Sheet 的 UI
4. **Backend:** 沒有 `SyncSheet` HTTP handler / route
5. **Backend:** `googlesheet.Client` 和 `SheetSyncService` 未在 `main.go` 初始化

---

### Task 1: 新增前端 UpdateSharedLedgerInput type

**Files:**
- Modify: `frontend/src/types/index.ts:257` (在 `CreateSharedLedgerInput` 後面)

**Step 1: 新增 type**

在 `CreateSharedLedgerInput` 後面加入：

```typescript
export interface UpdateSharedLedgerInput {
  name?: string
  google_sheet_id?: string
  google_sheet_gid?: string
  sync_enabled?: boolean
}
```

**Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(frontend): add UpdateSharedLedgerInput type"
```

---

### Task 2: 新增 useUpdateSharedLedger hook

**Files:**
- Modify: `frontend/src/hooks/useSharedLedgers.ts`

**Step 1: 新增 import**

在 import 列表加入 `UpdateSharedLedgerInput`：

```typescript
import type {
  SharedLedger,
  SharedExpense,
  SharedLedgerSummary,
  InviteInfo,
  ApiResponse,
  PaginatedResponse,
  CreateSharedLedgerInput,
  CreateSharedExpenseInput,
  UpdateSharedLedgerInput,
} from '@/types'
```

**Step 2: 在 `useDeleteSharedLedger` 後面新增 hook**

```typescript
export function useUpdateSharedLedger(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateSharedLedgerInput) =>
      api.put<ApiResponse<SharedLedger>>(`/shared-ledgers/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-ledgers', id] })
      qc.invalidateQueries({ queryKey: ['shared-ledgers'] })
    },
  })
}
```

**Step 3: Commit**

```bash
git add frontend/src/hooks/useSharedLedgers.ts
git commit -m "feat(frontend): add useUpdateSharedLedger hook"
```

---

### Task 3: 在 SharedLedgerDetailPage 新增 Google Sheet 綁定 UI

**Files:**
- Modify: `frontend/src/pages/SharedLedgerDetailPage.tsx`

**Step 1: 新增 import**

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

新增 icon import：
```typescript
import { ArrowLeft, Plus, RefreshCw, Link2, ChevronLeft, ChevronRight, DollarSign, PieChart, Users, Wallet, FileSpreadsheet, Settings, Check, X } from 'lucide-react'
```

**Step 2: 新增 state 和 mutation**

在 component 內 `const [copiedInvite, setCopiedInvite] = useState(false)` 之後：

```typescript
const updateMutation = useUpdateSharedLedger(id!)
const [showSheetForm, setShowSheetForm] = useState(false)
const [sheetForm, setSheetForm] = useState({
  google_sheet_id: '',
  google_sheet_gid: '',
})
```

**Step 3: 新增 handler functions**

在 `handleDeleteExpense` 之後：

```typescript
const handleOpenSheetForm = () => {
  setSheetForm({
    google_sheet_id: ledger?.google_sheet_id || '',
    google_sheet_gid: ledger?.google_sheet_gid || '',
  })
  setShowSheetForm(true)
}

const handleSaveSheet = () => {
  updateMutation.mutate(
    {
      google_sheet_id: sheetForm.google_sheet_id,
      google_sheet_gid: sheetForm.google_sheet_gid || undefined,
      sync_enabled: true,
    },
    { onSuccess: () => setShowSheetForm(false) },
  )
}

const handleUnbindSheet = () => {
  if (!confirm('確定要解除 Google Sheet 綁定嗎？')) return
  updateMutation.mutate(
    { google_sheet_id: '', google_sheet_gid: '', sync_enabled: false },
    { onSuccess: () => setShowSheetForm(false) },
  )
}
```

**Step 4: 新增 Google Sheet 區塊 UI**

在 `{/* Action buttons */}` 的 `</div>` 和 `{/* Summary cards */}` 之間插入：

```tsx
{/* Google Sheet binding */}
{isOwner && (
  <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-4">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-semibold">Google Sheet</h3>
      </div>
      {!showSheetForm && (
        <button
          onClick={handleOpenSheetForm}
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <Settings className="w-3 h-3" />
          {ledger.google_sheet_id ? '修改' : '綁定'}
        </button>
      )}
    </div>

    {showSheetForm ? (
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">
            Sheet ID（從試算表 URL 取得）
          </label>
          <input
            type="text"
            value={sheetForm.google_sheet_id}
            onChange={(e) => setSheetForm((f) => ({ ...f, google_sheet_id: e.target.value }))}
            placeholder="例: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            className="w-full h-8 px-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            URL 格式: https://docs.google.com/spreadsheets/d/<strong>此段即為 Sheet ID</strong>/edit
          </p>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">
            分頁名稱（選填，預設 Sheet1）
          </label>
          <input
            type="text"
            value={sheetForm.google_sheet_gid}
            onChange={(e) => setSheetForm((f) => ({ ...f, google_sheet_gid: e.target.value }))}
            placeholder="例: 日本旅遊"
            className="w-full h-8 px-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveSheet}
            disabled={!sheetForm.google_sheet_id || updateMutation.isPending}
            className="flex items-center gap-1 h-7 px-3 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check className="w-3 h-3" />
            {updateMutation.isPending ? '儲存中...' : '儲存'}
          </button>
          <button
            onClick={() => setShowSheetForm(false)}
            className="flex items-center gap-1 h-7 px-3 rounded-lg bg-[var(--bg-hover)] text-xs hover:bg-[var(--bg-primary)]"
          >
            <X className="w-3 h-3" /> 取消
          </button>
          {ledger.google_sheet_id && (
            <button
              onClick={handleUnbindSheet}
              className="ml-auto text-xs text-red-400 hover:text-red-300"
            >
              解除綁定
            </button>
          )}
        </div>
      </div>
    ) : ledger.google_sheet_id ? (
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="truncate">已綁定: {ledger.google_sheet_gid || 'Sheet1'}</span>
      </div>
    ) : (
      <p className="text-xs text-[var(--text-muted)]">
        尚未綁定，點擊右上角「綁定」開始設定
      </p>
    )}
  </div>
)}
```

**Step 5: 確認前端可編譯**

Run: `cd frontend && npx tsc --noEmit`
Expected: 無錯誤

**Step 6: Commit**

```bash
git add frontend/src/pages/SharedLedgerDetailPage.tsx
git commit -m "feat(frontend): add Google Sheet binding UI to shared ledger detail page"
```

---

### Task 4: 後端新增 SyncSheet handler 與 route

**Files:**
- Modify: `backend/internal/delivery/http/shared_ledger_handler.go`

**Step 1: 擴充 SharedLedgerHandler struct，加入 syncService**

```go
type SharedLedgerHandler struct {
	ledgerService *usecase.SharedLedgerService
	syncService   *usecase.SheetSyncService // nullable — nil if Google not configured
	logger        *slog.Logger
}

func NewSharedLedgerHandler(
	ledgerService *usecase.SharedLedgerService,
	syncService *usecase.SheetSyncService,
	logger *slog.Logger,
) *SharedLedgerHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &SharedLedgerHandler{
		ledgerService: ledgerService,
		syncService:   syncService,
		logger:        logger,
	}
}
```

**Step 2: 新增 SyncSheet handler**

在 `AcceptInvite` handler 之後、`RegisterRoutes` 之前加入：

```go
// SyncSheet godoc
// @Summary      同步 Google Sheet
// @Description  觸發共同帳本與 Google Sheet 的雙向同步
// @Tags         共同帳本
// @Produce      json
// @Param        id   path      string  true  "帳本 ID (UUID)"
// @Success      200  {object}  Response
// @Failure      400  {object}  Response
// @Failure      403  {object}  Response
// @Failure      404  {object}  Response
// @Failure      500  {object}  Response
// @Router       /shared-ledgers/{id}/sync [post]
func (h *SharedLedgerHandler) SyncSheet(c *gin.Context) {
	ctx := c.Request.Context()
	userID := getUserID(c)

	if h.syncService == nil {
		BadRequest(c, "Google Sheet sync is not configured on this server")
		return
	}

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

	if ledger.GoogleSheetID == "" {
		BadRequest(c, "this ledger has no Google Sheet configured")
		return
	}

	pushed, pulled, err := h.syncService.Sync(ctx, id)
	if err != nil {
		h.logger.ErrorContext(ctx, "Failed to sync sheet", "error", err, "ledger_id", id)
		InternalServerError(c, "failed to sync with Google Sheet")
		return
	}

	SuccessWithMessage(c, "sync completed", gin.H{
		"pushed": pushed,
		"pulled": pulled,
	})
}
```

**Step 3: 在 RegisterRoutes 加入 sync route**

```go
func (h *SharedLedgerHandler) RegisterRoutes(r *gin.RouterGroup) {
	ledgers := r.Group("/shared-ledgers")
	{
		ledgers.POST("", h.CreateLedger)
		ledgers.GET("", h.ListLedgers)
		ledgers.GET("/:id", h.GetLedger)
		ledgers.PUT("/:id", h.UpdateLedger)
		ledgers.DELETE("/:id", h.DeleteLedger)
		ledgers.POST("/:id/invite", h.RegenerateInvite)
		ledgers.POST("/:id/sync", h.SyncSheet)
		ledgers.POST("/invite/:token/accept", h.AcceptInvite)
	}
}
```

**Step 4: Commit**

```bash
git add backend/internal/delivery/http/shared_ledger_handler.go
git commit -m "feat(backend): add SyncSheet handler and route"
```

---

### Task 5: 在 main.go 初始化 Google Sheet 服務

**Files:**
- Modify: `backend/cmd/api/main.go`

**Step 1: 新增 import**

在 import 區塊加入：
```go
"github.com/yukiota/zenbill/pkg/googlesheet"
```

**Step 2: 在 `sharedExpenseService` 初始化之後，建立 SheetSyncService**

```go
// Initialize Google Sheet sync (optional — only if service account key is configured)
var sheetSyncService *usecase.SheetSyncService
if cfg.Google.ServiceAccountKeyPath != "" {
    sheetClient, err := googlesheet.NewClient(context.Background(), cfg.Google.ServiceAccountKeyPath)
    if err != nil {
        logger.Warn("Google Sheet client initialization failed, sync disabled", "error", err)
    } else {
        sheetSyncService = usecase.NewSheetSyncService(sheetClient, sharedExpenseRepo, sharedLedgerRepo, logger.Get())
        logger.Info("Google Sheet sync enabled")
    }
}
```

**Step 3: 更新 NewSharedLedgerHandler 呼叫**

將：
```go
sharedLedgerHandler := httpdelivery.NewSharedLedgerHandler(sharedLedgerService, logger.Get())
```
改為：
```go
sharedLedgerHandler := httpdelivery.NewSharedLedgerHandler(sharedLedgerService, sheetSyncService, logger.Get())
```

**Step 4: 確認編譯通過**

Run: `cd backend && go build ./...`
Expected: 無錯誤

**Step 5: Commit**

```bash
git add backend/cmd/api/main.go
git commit -m "feat(backend): wire Google Sheet client and SheetSyncService in main.go"
```

---

### Task 6: 更新 config.yaml.example

**Files:**
- Modify: `backend/configs/config.yaml.example`

**Step 1: 確認 google 區塊存在**

如果不存在，在檔案末尾加入：

```yaml
# Google API (optional — for Google Sheet sync)
google:
  service_account_key_path: ""  # Path to service account JSON key file
```

**Step 2: Commit**

```bash
git add backend/configs/config.yaml.example
git commit -m "docs: add Google config section to config.yaml.example"
```

---

### Task 7: 前端驗證 — 手動測試

**Step 1: 確認前端編譯成功**

```bash
cd frontend && npm run build
```

**Step 2: 視覺確認**

確認以下場景：
1. 共同帳本詳情頁（owner 身份）顯示「Google Sheet」區塊
2. 未綁定時顯示「尚未綁定」提示和「綁定」按鈕
3. 點擊「綁定」展開表單，可輸入 Sheet ID 和分頁名稱
4. 填入 Sheet ID 後可點擊「儲存」
5. 已綁定後顯示綠點和分頁名稱，以及「同步 Sheet」按鈕
6. 非 owner 不顯示 Google Sheet 區塊

**Step 3: Final commit（如有修正）**

```bash
git add -A
git commit -m "fix(frontend): polish Google Sheet binding UI"
```

---

## 任務摘要

| Task | 內容 | 層級 |
|------|------|------|
| 1 | 新增 `UpdateSharedLedgerInput` type | Frontend |
| 2 | 新增 `useUpdateSharedLedger` hook | Frontend |
| 3 | Google Sheet 綁定 UI | Frontend |
| 4 | SyncSheet handler + route | Backend |
| 5 | main.go 初始化 Google Sheet 服務 | Backend |
| 6 | 更新 config.yaml.example | Backend |
| 7 | 前端驗證 | QA |
