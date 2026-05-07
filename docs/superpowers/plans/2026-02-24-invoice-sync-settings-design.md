# Invoice Sync Settings Page Design

**Date:** 2026-02-24
**Status:** Approved

## Summary

Add functional e-invoice credential binding to SettingsPage and gate invoice sync behind credential binding on InvoicesPage.

## Requirements

- Users must bind their 財政部電子發票平台 credentials (phone barcode + verify code) before using invoice sync
- Settings page shows inline form for binding (unbound) or status + unbind button (bound)
- Invoices page shows guidance prompt when credentials are not bound, directing user to settings

## Design

### SettingsPage - Invoice Sync Settings Section

**Unbound state:**
- Description text: "綁定財政部電子發票平台帳號以使用發票同步功能"
- Phone barcode input field (text)
- Verify code input field (password)
- "綁定帳號" button (accent color)

**Bound state:**
- Green "已綁定" badge
- Phone barcode displayed with mask (e.g., `/****3382`)
- Last synced time (or "尚未同步" if null)
- "解除綁定" button (red, with confirmation)

### InvoicesPage - Unbound Guidance

When `credStatus?.bound === false` or credentials not found:
- Replace sync button with guidance card
- Card text: "請先綁定電子發票帳號才能同步發票"
- "前往設定" button linking to `/settings`
- Existing invoice list still displays normally

### Data Flow

```
SettingsPage → GET /einvoice/credentials → check bound status
SettingsPage → POST /einvoice/credentials → bind (phone_barcode + verify_code)
SettingsPage → DELETE /einvoice/credentials → unbind
InvoicesPage → GET /einvoice/credentials → gate sync button
```

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/pages/SettingsPage.tsx` | Replace placeholder toggles with real credential binding form |
| `frontend/src/pages/InvoicesPage.tsx` | Add unbound guidance card, conditionally hide sync button |
| `frontend/src/hooks/useInvoices.ts` | Add `useBindCredential` and `useUnbindCredential` mutation hooks |

Backend APIs already exist — no backend changes needed.
