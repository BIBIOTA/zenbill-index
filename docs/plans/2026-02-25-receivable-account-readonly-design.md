# Receivable Account Readonly Restrictions

## Problem

RECEIVABLE accounts are system-managed accounts created by shared ledgers. Users should not be able to edit, delete, or manually create transactions for these accounts. Currently the frontend shows edit/delete buttons on the accounts page and full editing capabilities on the account detail page.

## Design

### Changes

**1. AccountsPage.tsx — Hide edit/delete buttons for RECEIVABLE accounts**

In the account card rendering (line 134-144), wrap the edit and delete buttons with a condition:
```
{account.type !== 'RECEIVABLE' && (
  <div className="flex gap-1">
    <button ... Pencil />
    <button ... Trash2 />
  </div>
)}
```

**2. AccountDetailPage.tsx — Readonly mode for RECEIVABLE accounts**

Add `const isReceivable = account.type === 'RECEIVABLE'` after account loads.

- Hide the "編輯" button in the header when `isReceivable`
- Hide the "新增交易" button in the transactions section when `isReceivable`
- Pass `showEditButton={!isReceivable}` to TransactionRow so individual transaction edit buttons are hidden
- Prevent auto-edit mode (`?edit=1`) from activating for receivable accounts

**3. accountOptions.ts — Confirm RECEIVABLE exclusion**

The current `typeLabels` map only includes CASH, BANK, CREDIT, CRYPTO. RECEIVABLE accounts are already excluded from the grouped options. No change needed, but verify this is the case.

### Scope

- Frontend-only changes (no backend API changes)
- 2 files modified: AccountsPage.tsx, AccountDetailPage.tsx
- Does not affect shared ledger flows that create/manage receivable accounts programmatically
