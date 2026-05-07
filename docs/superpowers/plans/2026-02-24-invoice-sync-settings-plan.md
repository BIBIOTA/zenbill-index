# Invoice Sync Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add credential binding UI to SettingsPage and gate invoice sync behind binding status on InvoicesPage.

**Architecture:** Frontend-only changes. SettingsPage gets a real credential form (bind/unbind). InvoicesPage checks `bound` status from existing `useSyncStatus` hook and shows guidance when unbound. New hooks wrap existing backend APIs.

**Tech Stack:** React, TanStack React Query, TailwindCSS, React Router

---

### Task 1: Add credential mutation hooks

**Files:**
- Modify: `frontend/src/hooks/useInvoices.ts`

**Step 1: Add `useBindCredential` and `useUnbindCredential` hooks**

Add these two hooks at the end of `frontend/src/hooks/useInvoices.ts`:

```typescript
export function useBindCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { phone_barcode: string; verify_code: string }) =>
      api.post<ApiResponse<null>>('/einvoice/credentials', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['einvoice-credential-status'] }),
  })
}

export function useUnbindCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete<ApiResponse<null>>('/einvoice/credentials'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['einvoice-credential-status'] }),
  })
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/hooks/useInvoices.ts
git commit -m "feat(frontend): add credential bind/unbind mutation hooks"
```

---

### Task 2: Replace SettingsPage invoice sync section

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

**Step 1: Replace the placeholder invoice sync section**

The current SettingsPage (lines 38-59) has placeholder toggles for "自動同步" and "自動建立交易". Replace the entire `{/* Invoice Sync Settings */}` block with a functional credential binding section.

Add imports at the top:

```typescript
import { useState } from 'react'
import { useSyncStatus, useBindCredential, useUnbindCredential } from '@/hooks/useInvoices'
import { Shield, ShieldCheck, Loader2 } from 'lucide-react'
```

Replace the invoice sync `<div>` block (lines 38-59) with:

```tsx
{/* Invoice Sync Settings */}
<div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-4 space-y-3">
  <h2 className="text-sm font-semibold">發票同步設定</h2>
  {credStatus === undefined ? (
    <div className="py-4 text-center text-xs text-[var(--text-muted)]">載入中...</div>
  ) : credStatus?.bound ? (
    <BoundCredentialView
      lastSyncedAt={credStatus.last_synced_at}
      onUnbind={() => setShowUnbindConfirm(true)}
    />
  ) : (
    <BindCredentialForm />
  )}
</div>
```

Add state and query at the top of the `SettingsPage` component function:

```typescript
const { data: credStatus } = useSyncStatus()
const [showUnbindConfirm, setShowUnbindConfirm] = useState(false)
const unbindCredential = useUnbindCredential()
```

Add the `BindCredentialForm` component as a separate function below `SettingsPage` in the same file:

```tsx
function BindCredentialForm() {
  const [phoneBarcode, setPhoneBarcode] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const bindCredential = useBindCredential()

  const handleBind = () => {
    if (!phoneBarcode.trim() || !verifyCode.trim()) return
    bindCredential.mutate({ phone_barcode: phoneBarcode.trim(), verify_code: verifyCode.trim() })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">
        綁定財政部電子發票平台帳號以使用發票同步功能
      </p>
      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">手機條碼</label>
        <input
          value={phoneBarcode}
          onChange={(e) => setPhoneBarcode(e.target.value)}
          placeholder="/ABC+123"
          className="w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">驗證碼</label>
        <input
          type="password"
          value={verifyCode}
          onChange={(e) => setVerifyCode(e.target.value)}
          placeholder="電子發票平台密碼"
          className="w-full h-9 px-3 rounded-lg bg-[var(--bg-root)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      {bindCredential.isError && (
        <p className="text-xs text-red-400">綁定失敗，請確認帳號密碼是否正確</p>
      )}
      <button
        onClick={handleBind}
        disabled={bindCredential.isPending || !phoneBarcode.trim() || !verifyCode.trim()}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
      >
        {bindCredential.isPending ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 綁定中...</>
        ) : (
          <><Shield className="w-3.5 h-3.5" /> 綁定帳號</>
        )}
      </button>
    </div>
  )
}
```

Add the `BoundCredentialView` component:

```tsx
function BoundCredentialView({ lastSyncedAt, onUnbind }: { lastSyncedAt: string | null; onUnbind: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-medium text-emerald-400">已綁定</span>
      </div>
      <div className="text-xs text-[var(--text-muted)]">
        上次同步：{lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('zh-TW') : '尚未同步'}
      </div>
      <button
        onClick={onUnbind}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors"
      >
        解除綁定
      </button>
    </div>
  )
}
```

Add unbind confirmation dialog inside the SettingsPage JSX, right before the closing `</div>` of the outermost container:

```tsx
{showUnbindConfirm && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowUnbindConfirm(false)}>
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] p-6 max-w-sm mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
      <h3 className="text-sm font-semibold">確認解除綁定</h3>
      <p className="text-xs text-[var(--text-muted)]">解除綁定後將無法使用發票同步功能，已同步的發票不受影響。</p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => setShowUnbindConfirm(false)}
          className="h-8 px-3 rounded-lg text-xs font-medium hover:bg-[var(--bg-hover)] transition-colors"
        >
          取消
        </button>
        <button
          onClick={() => { unbindCredential.mutate(undefined, { onSuccess: () => setShowUnbindConfirm(false) }) }}
          disabled={unbindCredential.isPending}
          className="h-8 px-3 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          {unbindCredential.isPending ? '解除中...' : '確認解除'}
        </button>
      </div>
    </div>
  </div>
)}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx
git commit -m "feat(frontend): add credential binding form to settings page"
```

---

### Task 3: Gate invoice sync on InvoicesPage

**Files:**
- Modify: `frontend/src/pages/InvoicesPage.tsx`

**Step 1: Add unbound guidance and conditionally hide sync button**

Add `Link` to imports (or use `useNavigate` which is already imported). The page already has `credStatus` from `useSyncStatus()` at line 64-65.

Replace the sync button area (lines 159-169) — the `<div className="flex items-center justify-between">` block — with:

```tsx
<div className="flex items-center justify-between">
  <h1 className="text-lg font-bold">發票</h1>
  {credStatus?.bound !== false && (
    <button
      onClick={() => syncInvoices.mutate()}
      disabled={syncInvoices.isPending || credStatus?.sync_status === 'syncing'}
      className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${(syncInvoices.isPending || credStatus?.sync_status === 'syncing') ? 'animate-spin' : ''}`} />
      {credStatus?.sync_status === 'syncing' ? '同步中...' : '同步發票'}
    </button>
  )}
</div>
```

Add the unbound guidance card right after the header `<div>` (before the sync progress banner):

```tsx
{credStatus?.bound === false && (
  <div className="flex flex-col items-center gap-3 px-4 py-6 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-center">
    <p className="text-xs text-[var(--text-muted)]">請先綁定電子發票帳號才能同步發票</p>
    <button
      onClick={() => navigate('/settings')}
      className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90"
    >
      前往設定
    </button>
  </div>
)}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Manual test**

1. Open browser to `/settings` — verify unbound state shows binding form
2. Enter phone barcode + verify code → click "綁定帳號"
3. Verify bound state shows with "已綁定" badge
4. Navigate to `/invoices` — verify sync button appears
5. Go back to settings → click "解除綁定" → confirm
6. Navigate to `/invoices` — verify guidance card appears instead of sync button

**Step 4: Commit**

```bash
git add frontend/src/pages/InvoicesPage.tsx
git commit -m "feat(frontend): gate invoice sync behind credential binding"
```
