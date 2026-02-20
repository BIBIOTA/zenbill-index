# ZenBill Web Frontend Design

**Date:** 2026-02-21
**Status:** Approved
**Prototype:** `docs/prototype/index.html`

## Overview

ZenBill 需要一個 Web 前端介面，讓小團隊/家庭用戶能管理發票、帳務、規則引擎和查看報表。採用數據導向 Dashboard 風格，暗色主題，支援手機 RWD。

## Tech Stack

- **Framework:** React 18 + TypeScript
- **UI:** shadcn/ui (Radix UI + Tailwind CSS)
- **Routing:** React Router v6
- **State:** TanStack Query (API cache) + Zustand (global state)
- **Charts:** Recharts
- **Build:** Vite
- **Font:** JetBrains Mono (data) + DM Sans + Noto Sans TC (UI)

## Pages (8 total)

### 1. Dashboard (`/`)
- 4 stat cards: 總資產、本月支出、本月收入、待處理發票
- 月度收支趨勢折線圖 (6 months)
- 分類環形圖 + 比例明細
- 最近 5 筆交易

### 2. Accounts (`/accounts`)
- Summary stats: 淨資產、銀行、信用卡待繳、現金
- Card-based layout grouped by type (BANK / CREDIT / CASH / CRYPTO)
- Credit card: closing day, payment due day, auto-pay badge
- Create/edit account modal

### 3. Transactions (`/transactions`)
- Filter bar: search, type, account, category, date range
- Data table with pagination
- Columns: date, type badge, merchant, category, account, invoice link, amount
- Create/edit transaction modal

### 4. Invoices (`/invoices`)
- Sync status bar with last sync time + manual sync button
- Filter: search, status (PENDING/PROCESSED/IGNORED), month
- Table: invoice number, date, raw seller → matched merchant, status, amount
- Expandable row showing line items (from raw_details JSONB)
- Pagination

### 5. Merchants (`/merchants`)
- Search + create button
- Table: name, default category, default account, rule count, transaction count, monthly spend
- Edit merchant modal

### 6. Rules (`/rules`)
- Explanation banner describing rule engine behavior
- Filter: search pattern, match type
- List with drag handle for priority reorder
- Columns: priority, pattern (highlighted), arrow, merchant, match type badge
- Create rule modal with live regex testing

### 7. Categories (`/categories`)
- Two-column layout: Expense / Income
- Hierarchical tree with emoji icons
- Parent-child relationship display
- Create/edit category modal

### 8. Settings (`/settings`)
- Personal info (email, magic link auth)
- Invoice sync settings (auto sync toggle, schedule, auto-create transactions)
- Credit card auto-pay configuration
- Currency settings
- Data import/export (CSV)

## Layout

### Desktop (>768px)
- Fixed sidebar (240px) with navigation grouped by section
- Top header with page title + search shortcut
- Scrollable main content area

### Mobile (<=768px)
- Hidden sidebar, accessible via hamburger menu (slide-in drawer with overlay)
- Sticky mobile header: hamburger + logo + page title
- Fixed bottom navigation: 總覽, 交易, 發票, 帳戶, 更多
- Stat grids: 2 columns instead of 4
- Cards/grids stack to single column
- Tables: horizontal scroll with touch support
- Modals: full-screen on mobile

### Breakpoints
- `>768px`: Desktop (sidebar + full layout)
- `<=768px`: Tablet/Mobile (bottom nav + drawer sidebar)
- `<=480px`: Small mobile (smaller fonts, compact spacing)

## API Integration

All pages map directly to existing backend API endpoints:

| Page | API Endpoints |
|------|--------------|
| Dashboard | GET /accounts, GET /transactions (recent), GET /invoices (count) |
| Accounts | CRUD /accounts |
| Transactions | CRUD /transactions (with filters) |
| Invoices | GET /invoices, POST /invoices/sync, PATCH /invoices/:id/status |
| Merchants | CRUD /merchants |
| Rules | CRUD /merchant-rules (needs new API endpoint) |
| Categories | CRUD /categories |
| Settings | GET /auth/me, GET /banks |

### Missing API Endpoints (need backend work)
- `CRUD /api/v1/merchant-rules` — Rule management endpoints
- `GET /api/v1/dashboard/stats` — Aggregated dashboard data (optional, can compute client-side)

## Design System

### Colors
- Background: `#0a0a0f` (root), `#111118` (surface), `#1a1a24` (elevated)
- Accent: `#6366f1` (indigo)
- Semantic: green (#22c55e) income, red (#ef4444) expense, amber (#f59e0b) pending, cyan (#06b6d4) transfer

### Typography
- Data/amounts: JetBrains Mono (monospace)
- UI text: DM Sans + Noto Sans TC
- Base size: 14px desktop, 13px mobile

## Authentication
- Magic Link login page (email input → check inbox → JWT)
- JWT stored in localStorage
- Protected routes redirect to login
- Auth state managed by Zustand
