# ZenBill React Native APP 設計文件

**日期:** 2026-03-01
**目標:** 為 ZenBill 建立雙平台 (iOS + Android) React Native APP，完整複製 Web 所有功能

---

## 1. 技術選型

| 項目 | 選擇 | 理由 |
|------|------|------|
| 框架 | React Native + Expo (Managed Workflow) | 無需 Xcode/AS 即可開發，OTA 更新 |
| 路由 | Expo Router v4 | 檔案式路由，與 Next.js 類似 |
| 狀態管理 | TanStack Query + Zustand | 與 Web 一致，hooks 可共享 |
| UI 樣式 | NativeWind v4 (Tailwind for RN) | class 名寫法與 Web 接近 |
| Icon | Lucide React Native | 與 Web 相同 icon 庫 |
| 圖表 | Victory Native | RN 原生圖表庫 |
| Token 儲存 | expo-secure-store | 安全的 keychain/keystore 儲存 |
| 動畫 | React Native Reanimated | 流暢 60fps 動畫 |
| 手勢 | React Native Gesture Handler | 滑動刪除等手勢 |
| Monorepo | pnpm Workspace | 簡單有效的 workspace 管理 |

---

## 2. Monorepo 專案結構

```
zen-bill/
├── pnpm-workspace.yaml
├── package.json                   ← Root scripts
│
├── backend/                       ← Go 後端 (不動)
│
├── packages/
│   └── shared/                    ← @zenbill/shared
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── api/
│       │   │   ├── client.ts      ← 核心 HTTP client (平台無關)
│       │   │   └── endpoints.ts   ← 所有 API endpoint 函式
│       │   ├── types/
│       │   │   └── index.ts       ← 共用 TypeScript 類型
│       │   ├── hooks/
│       │   │   ├── useAccounts.ts
│       │   │   ├── useTransactions.ts
│       │   │   ├── useInvoices.ts
│       │   │   ├── useCategories.ts
│       │   │   ├── useMerchants.ts
│       │   │   ├── useRules.ts
│       │   │   ├── useBanks.ts
│       │   │   ├── useSharedLedgers.ts
│       │   │   └── useSyncStatus.ts
│       │   ├── stores/
│       │   │   └── auth.ts        ← Auth store (抽象 token 儲存)
│       │   └── utils/
│       │       └── billingCycle.ts
│       └── index.ts
│
├── frontend/                      ← React Web (改為引用 @zenbill/shared)
│   ├── package.json
│   └── src/
│       ├── components/            ← Web 專用元件
│       ├── pages/                 ← Web 專用頁面
│       ├── lib/
│       │   ├── cn.ts              ← Tailwind merge (Web 專用)
│       │   └── query.ts           ← QueryClient 配置
│       └── App.tsx
│
└── app/                           ← React Native APP
    ├── package.json
    ├── app.json                   ← Expo 配置
    ├── tsconfig.json
    ├── app/                       ← Expo Router 頁面
    │   ├── _layout.tsx            ← Root layout
    │   ├── (auth)/
    │   │   ├── _layout.tsx
    │   │   └── login.tsx
    │   ├── (tabs)/
    │   │   ├── _layout.tsx        ← Tab Bar
    │   │   ├── index.tsx          ← Dashboard
    │   │   ├── accounts.tsx
    │   │   ├── invoices.tsx
    │   │   ├── shared-ledgers.tsx
    │   │   └── more.tsx
    │   ├── accounts/[id].tsx
    │   ├── transactions/
    │   │   ├── new.tsx
    │   │   └── [id]/edit.tsx
    │   ├── invoices/[id].tsx
    │   ├── shared-ledgers/
    │   │   ├── [id].tsx
    │   │   ├── [id]/expenses/new.tsx
    │   │   ├── [id]/receivables.tsx
    │   │   └── invite/[token].tsx
    │   ├── merchants/index.tsx
    │   ├── rules/index.tsx
    │   ├── categories/index.tsx
    │   └── settings/index.tsx
    ├── components/
    │   ├── ui/                    ← Button, Card, Input, Modal, etc.
    │   ├── dashboard/
    │   ├── transactions/
    │   ├── accounts/
    │   └── shared-ledgers/
    ├── constants/
    │   └── theme.ts               ← Colors, Sizes, Spacing
    └── lib/
        ├── query.ts               ← QueryClient 配置
        └── storage.ts             ← expo-secure-store 封裝
```

---

## 3. 共享層設計 (@zenbill/shared)

### 3.1 Token 儲存抽象

Web 用 `localStorage`，APP 用 `expo-secure-store`，共享層透過介面抽象：

```typescript
// packages/shared/src/api/client.ts
export interface TokenStorage {
  getToken(): Promise<string | null>
  setToken(token: string): Promise<void>
  removeToken(): Promise<void>
}

export function createApiClient(storage: TokenStorage, baseUrl: string) {
  return {
    get: <T>(path: string) => request<T>('GET', path, storage, baseUrl),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, storage, baseUrl, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, storage, baseUrl, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, storage, baseUrl, body),
    delete: <T>(path: string) => request<T>('DELETE', path, storage, baseUrl),
  }
}

// 全域 API client 實例
let apiClient: ReturnType<typeof createApiClient>
export function setApiClient(client: ReturnType<typeof createApiClient>) { apiClient = client }
export function getApiClient() { return apiClient }
```

### 3.2 共享 Hooks

所有 TanStack Query hooks 從 Web 搬入 shared，使用 `getApiClient()` 取得平台注入的 client：

```typescript
// packages/shared/src/hooks/useAccounts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client'
import type { Account, CreateAccountInput, ApiResponse } from '../types'

export function useAccounts() {
  const api = getApiClient()
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<ApiResponse<Account[]>>('/accounts'),
  })
}

export function useCreateAccount() {
  const api = getApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAccountInput) => api.post<ApiResponse<Account>>('/accounts', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  })
}
// ... 其他 CRUD hooks
```

### 3.3 從 Web 搬入 Shared 的檔案

| 原始位置 (frontend/src/) | 新位置 (packages/shared/src/) |
|--------------------------|-------------------------------|
| `types/index.ts` | `types/index.ts` |
| `hooks/*.ts` (所有 hooks) | `hooks/*.ts` |
| `stores/auth.ts` | `stores/auth.ts` (抽象化) |
| `utils/billingCycle.ts` | `utils/billingCycle.ts` |
| `lib/api.ts` (核心邏輯) | `api/client.ts` |

---

## 4. APP 導航架構

### 4.1 Bottom Tab Bar (5 Tabs)

| Tab | Icon | 頁面 | Web 對應 |
|-----|------|------|---------|
| 總覽 | LayoutDashboard | Dashboard | `/` |
| 帳戶 | Wallet | 帳戶列表 | `/accounts` |
| 分帳 | Users | 共享帳本列表 | `/shared-ledgers` |
| 發票 | Receipt | 發票列表 | `/invoices` |
| 更多 | Menu | 功能選單 | - |

### 4.2 頁面導航流

```
Tab: 總覽
└── Dashboard (月報/圖表/最近交易)
    └── Push → 交易詳情/編輯

Tab: 帳戶
└── 帳戶列表 (卡片式)
    ├── Push → 帳戶詳情 (含交易歷史)
    └── Modal → 新增/編輯帳戶

Tab: 分帳
└── 共享帳本列表
    ├── Push → 帳本詳情
    │   ├── Push → 新增共享支出
    │   └── Push → 應收/應付明細
    └── Modal → 新增帳本

Tab: 發票
└── 發票列表 (可篩選月份/狀態)
    ├── Push → 發票詳情
    └── Action → 同步發票 / 批次處理

Tab: 更多
└── 功能選單
    ├── Push → 商家管理
    ├── Push → 規則引擎
    ├── Push → 分類管理
    └── Push → 設定
```

### 4.3 新增交易入口

使用 **浮動按鈕 (FAB)** 出現在 Dashboard 和帳戶頁面右下角，點擊後開啟新增交易頁面。比起佔用一個 Tab 位置，FAB 更符合行動端習慣。

---

## 5. 認證流程 (Deep Link)

```
使用者開啟 APP
     ↓
檢查 expo-secure-store 有無 token
     ↓ (無 token)
顯示 Login 頁面 → 輸入 Email
     ↓
POST /auth/login (發送 Magic Link)
     ↓
使用者點擊信箱中的連結
     ↓
Deep Link: zenbill://auth/callback?token=xxx
     ↓
APP 攔截 → 儲存 token → 導向 Dashboard
```

**Expo 配置：**
- `app.json` 中設定 `scheme: "zenbill"`
- iOS Universal Links + Android App Links

---

## 6. 頁面功能對照表

| Web 頁面 | APP 頁面 | 功能差異 |
|----------|----------|---------|
| Dashboard | (tabs)/index | 相同：月報、分類圓餅圖、最近交易 |
| 帳戶列表 | (tabs)/accounts | 相同：卡片式帳戶列表 |
| 帳戶詳情 | accounts/[id] | 相同：帳戶資訊 + 交易歷史 |
| 交易列表 | 從帳戶詳情進入 | Web 有獨立頁面，APP 整合至帳戶詳情 |
| 新增交易 | transactions/new | 相同：完整交易表單 |
| 發票列表 | (tabs)/invoices | 相同：篩選、同步、批次操作 |
| 共享帳本列表 | (tabs)/shared-ledgers | 相同 |
| 帳本詳情 | shared-ledgers/[id] | 相同：支出列表 + 操作 |
| 新增共享支出 | shared-ledgers/[id]/expenses/new | 相同 |
| 應收應付 | shared-ledgers/[id]/receivables | 相同 |
| 商家管理 | merchants/ | 相同 |
| 規則引擎 | rules/ | 相同 |
| 分類管理 | categories/ | 相同 |
| 設定 | settings/ | 相同 + APP 專屬設定 |
| 邀請接受 | shared-ledgers/invite/[token] | Deep Link 觸發 |

---

## 7. 實施階段

### Phase 0: Monorepo 搭建 + 共享層抽取
- 建立 `pnpm-workspace.yaml`
- 建立 `packages/shared/` 套件
- 從 `frontend/src/` 搬移 types、hooks、api、stores、utils 至 shared
- 改造 `frontend/` 引用 `@zenbill/shared`
- 驗證 Web 功能不受影響

### Phase 1: APP 基礎框架
- `npx create-expo-app app`
- Expo Router 導航結構
- 認證流程 + Deep Link
- NativeWind 配置
- 基礎 UI 元件 (Button, Card, Input, Modal)

### Phase 2: 核心頁面
- Dashboard (圖表、統計、最近交易)
- 帳戶列表 + 帳戶詳情
- 新增/編輯交易表單
- FAB 按鈕

### Phase 3: 發票 + 管理功能
- 發票列表 + 同步觸發 + 批次操作
- 商家管理 CRUD
- 規則引擎 CRUD
- 分類管理 CRUD

### Phase 4: 共享帳本
- 共享帳本列表 + 詳情
- 新增共享支出
- 應收應付 + 結算
- 邀請流程 (Deep Link)

### Phase 5: 打磨 + 發佈
- 動畫與轉場效果
- 錯誤處理與 loading 狀態
- App Store / Play Store 上架準備

---

## 8. 不實作的功能（YAGNI）

- 離線模式 — 不需要，React Query cache 已提供短時間緩存
- 推播通知 — 架構預留但不在此次範圍
- 生物辨識登入 — 未來擴充
- 深色模式 — 未來擴充（NativeWind 原生支援，容易加入）
