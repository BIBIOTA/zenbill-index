# Transaction Form: Modal → Independent Page

**Date:** 2026-02-22
**Status:** Approved

## Goal

Refactor the transaction create/edit UI from a modal (`TransactionFormModal`) to a dedicated page, improving UX with a full-page form experience.

## Routes

| Route | Purpose |
|-------|---------|
| `/transactions/new` | Create new transaction |
| `/transactions/new?invoiceId=123` | Create from invoice import (pre-filled) |
| `/transactions/:id/edit` | Edit existing transaction |

## Component Changes

### New Files

- **`TransactionForm.tsx`** — Pure form component extracted from `TransactionFormModal.tsx`. Contains all form fields, validation, quick-create modals, auto-fill logic. Props: `mode` (create/edit), `defaultValues`, `invoiceId`, `onSubmit`, `onCancel`, `onDelete` (edit only).
- **`TransactionFormPage.tsx`** — Page wrapper. Uses `useParams()` and `useSearchParams()` to determine mode. Fetches transaction data (edit) or invoice data (import). Wraps `TransactionForm` in page layout with header.

### Modified Files

- **`TransactionsPage.tsx`** — Remove modal state (`showForm`, `editingTx`). Replace with `navigate('/transactions/new')` and `navigate('/transactions/${id}/edit')`.
- **`InvoicesPage.tsx`** — Replace `importTarget` state and modal with `navigate('/transactions/new?invoiceId=${id}')`. Keep merchant/category matching logic (move to hook or pass via route state).
- **`App.tsx`** — Add routes: `/transactions/new`, `/transactions/:id/edit`.

### Deleted Files

- **`TransactionFormModal.tsx`** — Replaced by `TransactionForm` + `TransactionFormPage`.

## Navigation

- After successful create/edit/delete: `navigate(-1)` (browser back)
- Cancel button: `navigate(-1)`
- This ensures users return to their origin page (transactions list or invoices page)

## Quick-Create Modals

`MerchantQuickCreate` and `CategoryQuickCreate` remain as modals within `TransactionForm` — unchanged.

## Invoice Import Flow

1. User clicks "匯入" on InvoicesPage
2. Frontend does merchant/category matching (existing logic)
3. Navigates to `/transactions/new?invoiceId=123` with matched data in route state
4. `TransactionFormPage` reads route state for default values, falls back to fetching invoice by ID
5. Form pre-fills with invoice data
6. On submit, transaction is created with `invoice_id` link
