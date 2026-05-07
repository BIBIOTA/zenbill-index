# ZenBill Web Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a React + TypeScript web frontend for ZenBill with 8 pages (Dashboard, Accounts, Transactions, Invoices, Merchants, Rules, Categories, Settings), dark theme, responsive design.

**Architecture:** Single-page app using Vite + React Router. API layer via TanStack Query with typed fetch wrappers. Global auth state in Zustand. UI built with shadcn/ui (Radix + Tailwind). All pages consume existing backend REST API at `/api/v1`.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS 3, shadcn/ui, TanStack Query v5, Zustand, React Router v6, Recharts

**Prototype:** `docs/prototype/index.html` — reference for all layouts, colors, and interactions.

**Design Doc:** `docs/plans/2026-02-21-web-frontend-design.md`

---

## Phase 1: Project Scaffolding

### Task 1: Initialize Vite + React + TypeScript project

**Files:**
- Create: `frontend/` (entire directory)

**Step 1: Scaffold project**

```bash
cd /Users/yuki/projects/zen-bill
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

**Step 2: Install core dependencies**

```bash
npm install react-router-dom @tanstack/react-query zustand recharts
npm install -D tailwindcss @tailwindcss/vite
```

**Step 3: Configure Tailwind**

Create `frontend/src/index.css`:
```css
@import "tailwindcss";
```

Update `frontend/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

**Step 4: Install fonts**

```bash
npm install @fontsource/jetbrains-mono @fontsource/dm-sans
```

**Step 5: Verify dev server starts**

```bash
cd frontend && npm run dev
```
Expected: Vite dev server on http://localhost:3000

**Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold frontend with Vite, React, TypeScript, Tailwind"
```

---

### Task 2: Set up shadcn/ui

**Files:**
- Modify: `frontend/`

**Step 1: Initialize shadcn**

```bash
cd frontend
npx shadcn@latest init
```

Select: New York style, Zinc color, CSS variables: yes

**Step 2: Add essential components**

```bash
npx shadcn@latest add button input label select badge table card dialog dropdown-menu separator tabs toast sonner
```

**Step 3: Override theme colors for dark dashboard**

Edit `frontend/src/index.css` — add ZenBill custom CSS variables after the Tailwind import, matching the prototype's color scheme (bg-root: `#0a0a0f`, accent: `#6366f1`, etc).

**Step 4: Verify components render**

Update `frontend/src/App.tsx` with a test `<Button>` from shadcn. Run dev server, confirm it renders with correct styling.

**Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: add shadcn/ui with dark dashboard theme"
```

---

### Task 3: API client + TypeScript types

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/types/index.ts`

**Step 1: Define TypeScript types matching backend API**

Create `frontend/src/types/index.ts`:
```ts
// === Auth ===
export interface User {
  id: string
  email: string
}

// === Account ===
export type AccountType = 'BANK' | 'CREDIT' | 'CASH' | 'CRYPTO'

export interface Account {
  id: string
  user_id: string
  name: string
  type: AccountType
  currency: string
  balance: number
  bank_id: string | null
  passbook_number: string
  closing_day: number | null
  payment_due_day: number | null
  auto_pay_from_id: string | null
  auto_pay_enabled: boolean
  created_at: string
  updated_at: string
}

export interface CreateAccountInput {
  name: string
  type: AccountType
  currency?: string
  balance?: number
  bank_id?: string
  passbook_number?: string
  closing_day?: number
  payment_due_day?: number
  auto_pay_from_id?: string
  auto_pay_enabled?: boolean
}

// === Transaction ===
export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER'

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  target_account_id: string | null
  type: TransactionType
  amount: number
  occurred_at: string
  category_id: string | null
  merchant_id: string | null
  invoice_id: string | null
  note: string
  original_amount: number | null
  original_currency: string | null
  exchange_rate: number | null
  created_at: string
  updated_at: string
}

export interface CreateTransactionInput {
  account_id: string
  target_account_id?: string
  type: TransactionType
  amount: number
  occurred_at: string
  category_id?: string
  merchant_id?: string
  invoice_id?: string
  note?: string
  original_amount?: number
  original_currency?: string
  exchange_rate?: number
}

// === Invoice ===
export type InvoiceStatus = 'PENDING' | 'PROCESSED' | 'IGNORED'

export interface InvoiceItem {
  description: string
  quantity: number
  unit_price: number
}

export interface Invoice {
  id: string
  invoice_number: string
  invoice_date: string
  seller_name: string
  total_amount: number
  status: InvoiceStatus
  raw_details: { items?: InvoiceItem[] } | null
  created_at: string
  updated_at: string
}

// === Category ===
export type CategoryType = 'EXPENSE' | 'INCOME'

export interface Category {
  id: string
  name: string
  type: CategoryType
  icon: string
  parent_id: string | null
  children: Category[]
  created_at: string
}

export interface CreateCategoryInput {
  name: string
  type: CategoryType
  icon?: string
  parent_id?: string
}

// === Merchant ===
export interface Merchant {
  id: string
  user_id: string
  name: string
  default_category_id: string | null
  default_account_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateMerchantInput {
  name: string
  default_category_id?: string
  default_account_id?: string
}

// === MerchantRule ===
export type MatchType = 'EXACT' | 'CONTAINS' | 'REGEX'

export interface MerchantRule {
  id: string
  merchant_id: string
  keyword: string
  match_type: MatchType
  priority: number
  created_at: string
}

export interface CreateMerchantRuleInput {
  merchant_id: string
  keyword: string
  match_type: MatchType
  priority: number
}

// === Bank ===
export interface Bank {
  id: string
  code: string
  name: string
  short_name: string
  created_at: string
}

// === EInvoice Credentials ===
export interface EInvoiceCredentialStatus {
  bound: boolean
  last_synced_at: string | null
  sync_status: string | null
  sync_error: string | null
}

// === API Response ===
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface PaginatedResponse<T> {
  code: number
  message: string
  data: T[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}
```

**Step 2: Create API client**

Create `frontend/src/lib/api.ts`:
```ts
const BASE_URL = '/api/v1'

class ApiError extends Error {
  constructor(public code: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token')
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new ApiError(401, 'Unauthorized')
  }

  const json = await res.json()

  if (!res.ok) {
    throw new ApiError(json.code || res.status, json.message || 'Unknown error')
  }

  return json
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
}

export { ApiError }
```

**Step 3: Commit**

```bash
git add frontend/src/types/ frontend/src/lib/api.ts
git commit -m "feat: add TypeScript types and API client"
```

---

### Task 4: Auth store + TanStack Query setup

**Files:**
- Create: `frontend/src/stores/auth.ts`
- Create: `frontend/src/lib/query.ts`
- Modify: `frontend/src/main.tsx`

**Step 1: Create auth store with Zustand**

Create `frontend/src/stores/auth.ts`:
```ts
import { create } from 'zustand'
import type { User } from '@/types'

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token'),
  user: null,
  setAuth: (token, user) => {
    localStorage.setItem('token', token)
    set({ token, user })
  },
  logout: () => {
    localStorage.removeItem('token')
    set({ token: null, user: null })
  },
  isAuthenticated: () => !!get().token,
}))
```

**Step 2: Create query client**

Create `frontend/src/lib/query.ts`:
```ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
```

**Step 3: Wire up providers in main.tsx**

Update `frontend/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { queryClient } from './lib/query'
import { Toaster } from '@/components/ui/sonner'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
```

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: add auth store and TanStack Query setup"
```

---

## Phase 2: Layout + Routing

### Task 5: App shell — Sidebar + Mobile layout + Routing

**Files:**
- Create: `frontend/src/components/layout/Sidebar.tsx`
- Create: `frontend/src/components/layout/MobileHeader.tsx`
- Create: `frontend/src/components/layout/BottomNav.tsx`
- Create: `frontend/src/components/layout/AppLayout.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Build Sidebar component**

Reference prototype's sidebar: ZenBill logo, nav sections (總覽/財務/管理/系統), user card at bottom. Use `NavLink` from react-router for active state.

**Step 2: Build MobileHeader component**

Hamburger button + logo + page title. Only visible at `md:hidden`.

**Step 3: Build BottomNav component**

5 items: 總覽, 交易, 發票, 帳戶, 更多. Visible at `md:hidden`. Use `NavLink` for active state.

**Step 4: Build AppLayout**

Compose Sidebar + MobileHeader + BottomNav + `<Outlet />` for nested routes. Sidebar is drawer on mobile (slide-in with overlay).

**Step 5: Build LoginPage (placeholder)**

Simple centered card with email input + "Send Magic Link" button. Will be wired up later.

**Step 6: Set up routing in App.tsx**

```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/auth/callback" element={<AuthCallbackPage />} />
  <Route element={<ProtectedRoute />}>
    <Route element={<AppLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="accounts" element={<AccountsPage />} />
      <Route path="transactions" element={<TransactionsPage />} />
      <Route path="invoices" element={<InvoicesPage />} />
      <Route path="merchants" element={<MerchantsPage />} />
      <Route path="rules" element={<RulesPage />} />
      <Route path="categories" element={<CategoriesPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>
  </Route>
</Routes>
```

Create placeholder pages that just render `<div>Page Name</div>`.

**Step 7: Build ProtectedRoute component**

Check `useAuthStore().isAuthenticated()`, redirect to `/login` if not.

**Step 8: Build AuthCallbackPage**

Parse `?token=` from URL, store in auth store, redirect to `/`.

**Step 9: Verify all routes work with navigation**

Run dev server, click through sidebar items, confirm routing works. Test mobile view at 390px width.

**Step 10: Commit**

```bash
git add frontend/src/
git commit -m "feat: add app shell with sidebar, mobile layout, and routing"
```

---

## Phase 3: Core Pages

### Task 6: Dashboard page

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/hooks/useDashboard.ts`
- Create: `frontend/src/components/dashboard/StatCard.tsx`
- Create: `frontend/src/components/dashboard/SpendingChart.tsx`
- Create: `frontend/src/components/dashboard/CategoryDonut.tsx`
- Create: `frontend/src/components/dashboard/RecentTransactions.tsx`

**Implementation:**

Reference prototype Dashboard layout:
- 4 stat cards in grid (2 cols on mobile, 4 on desktop)
- 2-column grid: spending trend line chart (Recharts `AreaChart`) + category donut chart (Recharts `PieChart`)
- Recent transactions table (last 5)

`useDashboard.ts` hook fetches accounts (for totals), transactions (recent + monthly aggregation), invoices (pending count) using TanStack Query `useQueries`.

**Commit:** `feat: add Dashboard page with stats, charts, and recent transactions`

---

### Task 7: Accounts page

**Files:**
- Create: `frontend/src/pages/AccountsPage.tsx`
- Create: `frontend/src/hooks/useAccounts.ts`
- Create: `frontend/src/components/accounts/AccountCard.tsx`
- Create: `frontend/src/components/accounts/AccountFormDialog.tsx`

**Implementation:**

Reference prototype Accounts layout:
- 4 summary stat cards
- Account cards grouped by type (BANK / CREDIT / CASH)
- Color-coded top border per type (green=bank, amber=credit, cyan=cash)
- Credit cards show closing day, due day, auto-pay badge
- Create/Edit dialog with form: name, type selector, bank dropdown, currency, initial balance

`useAccounts.ts` hook: `useQuery` for list, `useMutation` for create/update/delete with `queryClient.invalidateQueries`.

**Commit:** `feat: add Accounts page with CRUD`

---

### Task 8: Transactions page

**Files:**
- Create: `frontend/src/pages/TransactionsPage.tsx`
- Create: `frontend/src/hooks/useTransactions.ts`
- Create: `frontend/src/components/transactions/TransactionTable.tsx`
- Create: `frontend/src/components/transactions/TransactionFilters.tsx`
- Create: `frontend/src/components/transactions/TransactionFormDialog.tsx`

**Implementation:**

Reference prototype Transactions layout:
- Filter bar: search input, type select, account select, category select, date range select
- Data table with columns: date, type badge, merchant/description, category, account, invoice link, amount, actions menu
- Pagination component
- Create/Edit dialog: type toggle (支出/收入/轉帳), amount, date, merchant, account, category, note
- Amount colored by type: red=expense, green=income, cyan=transfer

Filter state managed via URL search params (`useSearchParams`) for bookmarkable URLs.

**Commit:** `feat: add Transactions page with filters, table, and CRUD`

---

### Task 9: Invoices page

**Files:**
- Create: `frontend/src/pages/InvoicesPage.tsx`
- Create: `frontend/src/hooks/useInvoices.ts`
- Create: `frontend/src/components/invoices/InvoiceTable.tsx`
- Create: `frontend/src/components/invoices/SyncStatusBar.tsx`
- Create: `frontend/src/components/invoices/InvoiceDetailRow.tsx`

**Implementation:**

Reference prototype Invoices layout:
- Sync status bar: green dot, last sync time, next schedule, "立即同步" button
- Filter bar: search, status select, month select
- Table: expandable arrow, invoice number (colored by status), date, raw seller name, matched merchant badge, status badge, amount
- Expandable row: line items from `raw_details.items` with description + price
- Pagination

Sync button calls `POST /invoices/sync` mutation and shows toast.

**Commit:** `feat: add Invoices page with sync, filters, and expandable details`

---

### Task 10: Merchants page

**Files:**
- Create: `frontend/src/pages/MerchantsPage.tsx`
- Create: `frontend/src/hooks/useMerchants.ts`
- Create: `frontend/src/components/merchants/MerchantFormDialog.tsx`

**Implementation:**

Reference prototype Merchants layout:
- Search bar + create button
- Table: name, default category badge, default account, rule count, transaction count, monthly spend, edit button
- Create/Edit dialog: name, default category select, default account select

Note: rule count and transaction count may need to be computed client-side or require a backend enhancement. Start with basic CRUD, add computed fields later.

**Commit:** `feat: add Merchants page with CRUD`

---

### Task 11: Rules page

**Files:**
- Create: `frontend/src/pages/RulesPage.tsx`
- Create: `frontend/src/hooks/useRules.ts`
- Create: `frontend/src/components/rules/RuleList.tsx`
- Create: `frontend/src/components/rules/RuleFormDialog.tsx`
- Create: `frontend/src/components/rules/RegexTester.tsx`

**Implementation:**

Reference prototype Rules layout:
- Explanation banner
- Filter bar: search, match type select, create button
- Rule list (not table — custom layout): drag handle, priority number, pattern (amber highlighted), arrow, merchant name, match type badge, actions
- Create dialog: match type toggle (REGEX/CONTAINS/EXACT), pattern input, live regex tester, merchant select, priority number

`RegexTester` component: input field where user types a test string, runs client-side `new RegExp(pattern).test(input)` and shows green checkmark or red X.

**Note:** Backend may not have merchant-rule CRUD endpoints yet. Create the frontend now; wire API when backend is ready. Use mock data temporarily if needed.

**Commit:** `feat: add Rules page with regex tester`

---

### Task 12: Categories page

**Files:**
- Create: `frontend/src/pages/CategoriesPage.tsx`
- Create: `frontend/src/hooks/useCategories.ts`
- Create: `frontend/src/components/categories/CategoryTree.tsx`
- Create: `frontend/src/components/categories/CategoryFormDialog.tsx`

**Implementation:**

Reference prototype Categories layout:
- Two-column grid (stacks on mobile): Expense categories / Income categories
- Each column: card with header (title + type badge) + tree list
- Tree items: emoji icon, name, child count. Children indented.
- Create/Edit dialog: type toggle, name, emoji icon input, parent select

API returns flat list — build tree client-side by grouping `parent_id`.

**Commit:** `feat: add Categories page with tree view and CRUD`

---

### Task 13: Settings page

**Files:**
- Create: `frontend/src/pages/SettingsPage.tsx`

**Implementation:**

Reference prototype Settings layout:
- Two-column grid (stacks on mobile)
- Left column: Personal info (email, disabled), Invoice sync settings (auto sync toggle, auto create transactions toggle, sync time select)
- Right column: Credit card auto-pay toggles, Currency settings, Data management (CSV export/import buttons)

Settings are mostly display-only for now — toggles can update account `auto_pay_enabled` via existing API. CSV export can be a client-side download of transactions data.

**Commit:** `feat: add Settings page`

---

## Phase 4: Polish + Auth

### Task 14: Login page + auth flow

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`
- Create: `frontend/src/pages/AuthCallbackPage.tsx`

**Implementation:**

- Login page: centered card, dark theme, ZenBill logo, email input, submit button
- Calls `POST /auth/login` with email
- Shows "check your inbox" message on success
- AuthCallbackPage: reads `?token=` param, calls `GET /auth/me` to get user, stores both in auth store, redirects to `/`

**Commit:** `feat: implement magic link auth flow`

---

### Task 15: Responsive polish + testing

**Files:**
- Various component files

**Implementation:**

- Test all pages at 1280px, 768px, 390px viewport widths
- Fix any overflow, truncation, or layout issues
- Ensure mobile sidebar drawer works with overlay
- Ensure bottom nav highlights correct page
- Ensure modals are full-screen on mobile
- Test table horizontal scroll on mobile

**Commit:** `feat: responsive polish across all breakpoints`

---

### Task 16: Loading states + error handling

**Files:**
- Create: `frontend/src/components/ui/loading.tsx`
- Create: `frontend/src/components/ui/error-state.tsx`
- Modify: all page files

**Implementation:**

- Skeleton loading states for stat cards, tables, charts
- Error boundary with retry button
- Toast notifications for CRUD operations (success/error)
- Empty states for tables with no data

**Commit:** `feat: add loading states, error handling, and empty states`

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-4 | Scaffolding: Vite, shadcn/ui, types, API client, auth store |
| 2 | 5 | Layout: Sidebar, mobile header, bottom nav, routing |
| 3 | 6-13 | Pages: Dashboard, Accounts, Transactions, Invoices, Merchants, Rules, Categories, Settings |
| 4 | 14-16 | Polish: Auth flow, responsive fixes, loading/error states |

**Total: 16 tasks**

**Missing backend work (can be done in parallel):**
- `CRUD /api/v1/merchant-rules` endpoints (Task 11 needs this)
- Dashboard aggregation endpoint (optional, Task 6 can compute client-side)
