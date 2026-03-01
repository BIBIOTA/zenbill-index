# ZenBill React Native APP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dual-platform (iOS/Android) React Native app that mirrors all Web functionality, sharing types, hooks, and API client via a pnpm workspace monorepo.

**Architecture:** pnpm workspace with three packages: `packages/shared` (types, API client, hooks, stores, utils), `frontend` (existing React Web), and `app` (new Expo React Native). The shared package uses a `TokenStorage` interface to abstract platform-specific token persistence.

**Tech Stack:** Expo SDK 52+ (Managed Workflow), Expo Router v4, NativeWind v4, TanStack React Query, Zustand, Lucide React Native, Victory Native, expo-secure-store.

---

## Phase 0: Monorepo Setup + Shared Package Extraction

### Task 1: Initialize pnpm workspace

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (root)

**Step 1: Create root package.json**

Create `package.json` at repo root:

```json
{
  "name": "zenbill",
  "private": true,
  "scripts": {
    "dev:web": "pnpm --filter frontend dev",
    "dev:app": "pnpm --filter app start",
    "build:web": "pnpm --filter frontend build",
    "build:shared": "pnpm --filter @zenbill/shared build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck"
  }
}
```

**Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
  - "frontend"
  - "app"
```

**Step 3: Verify pnpm workspace is recognized**

Run: `pnpm install` at repo root
Expected: pnpm detects workspace and links packages

**Step 4: Commit**

```bash
git add pnpm-workspace.yaml package.json
git commit -m "chore: initialize pnpm workspace for monorepo"
```

---

### Task 2: Create @zenbill/shared package scaffold

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

**Step 1: Create packages/shared/package.json**

```json
{
  "name": "@zenbill/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.90.21",
    "zustand": "^5.0.11"
  },
  "peerDependencies": {
    "react": ">=18"
  }
}
```

**Step 2: Create packages/shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
```

**Step 3: Create empty index.ts**

```typescript
// @zenbill/shared - shared types, hooks, API client, stores, utils
// Barrel exports will be added as modules are migrated

export {}
```

**Step 4: Run pnpm install to link workspace**

Run: `pnpm install`
Expected: `@zenbill/shared` appears in workspace

**Step 5: Commit**

```bash
git add packages/
git commit -m "chore: scaffold @zenbill/shared package"
```

---

### Task 3: Extract types to shared package

**Files:**
- Create: `packages/shared/src/types/index.ts` (copy from `frontend/src/types/index.ts`)
- Modify: `packages/shared/src/index.ts` (add export)

**Step 1: Copy types verbatim**

Copy the entire contents of `frontend/src/types/index.ts` to `packages/shared/src/types/index.ts`. No changes needed — the types are pure TypeScript with no framework imports.

**Step 2: Export from barrel**

Update `packages/shared/src/index.ts`:

```typescript
export * from './types/index.ts'
```

**Step 3: Run typecheck**

Run: `cd packages/shared && pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/shared/src/types/ packages/shared/src/index.ts
git commit -m "feat(shared): extract TypeScript types from frontend"
```

---

### Task 4: Extract and refactor API client to shared package

**Files:**
- Create: `packages/shared/src/api/client.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create platform-agnostic API client**

The key change from the Web version: replace `localStorage` and `window.location` with an injected `TokenStorage` interface, and accept `baseUrl` as a parameter instead of reading `import.meta.env`.

Create `packages/shared/src/api/client.ts`:

```typescript
export interface TokenStorage {
  getToken(): Promise<string | null>
  setToken(token: string): Promise<void>
  removeToken(): Promise<void>
}

export interface ApiClientConfig {
  storage: TokenStorage
  baseUrl: string
  onUnauthorized?: () => void
}

export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

let _client: ApiClient | null = null

export function setApiClient(client: ApiClient) {
  _client = client
}

export function getApiClient(): ApiClient {
  if (!_client) throw new Error('@zenbill/shared: API client not initialized. Call setApiClient() first.')
  return _client
}

export function createApiClient(config: ApiClientConfig) {
  const { storage, baseUrl, onUnauthorized } = config

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await storage.getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    if (res.status === 401) {
      await storage.removeToken()
      onUnauthorized?.()
      throw new ApiError(401, 'Unauthorized')
    }

    const json = await res.json()

    if (!res.ok) {
      throw new ApiError(json.code || res.status, json.message || 'Unknown error')
    }

    return json
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  }
}
```

**Step 2: Add export to barrel**

Add to `packages/shared/src/index.ts`:

```typescript
export * from './types/index.ts'
export { createApiClient, setApiClient, getApiClient, ApiError } from './api/client.ts'
export type { TokenStorage, ApiClientConfig, ApiClient } from './api/client.ts'
```

**Step 3: Typecheck**

Run: `cd packages/shared && pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/shared/src/api/ packages/shared/src/index.ts
git commit -m "feat(shared): add platform-agnostic API client with TokenStorage interface"
```

---

### Task 5: Extract utils to shared package

**Files:**
- Create: `packages/shared/src/utils/billingCycle.ts` (copy from `frontend/src/utils/billingCycle.ts`)
- Modify: `packages/shared/src/index.ts`

**Step 1: Copy billingCycle.ts verbatim**

No changes needed — pure function with no dependencies.

**Step 2: Add export to barrel**

```typescript
export * from './utils/billingCycle.ts'
```

**Step 3: Commit**

```bash
git add packages/shared/src/utils/
git commit -m "feat(shared): extract billingCycle utility"
```

---

### Task 6: Extract and refactor hooks to shared package

**Files:**
- Create: `packages/shared/src/hooks/useAccounts.ts`
- Create: `packages/shared/src/hooks/useTransactions.ts`
- Create: `packages/shared/src/hooks/useInvoices.ts`
- Create: `packages/shared/src/hooks/useCategories.ts`
- Create: `packages/shared/src/hooks/useMerchants.ts`
- Create: `packages/shared/src/hooks/useRules.ts`
- Create: `packages/shared/src/hooks/useBanks.ts`
- Create: `packages/shared/src/hooks/useSharedLedgers.ts`
- Create: `packages/shared/src/hooks/useTransactionStats.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Migrate each hook file**

The pattern for every hook file is the same refactor:

**Before (Web):**
```typescript
import { api } from '@/lib/api'
import type { Foo } from '@/types'
```

**After (Shared):**
```typescript
import { getApiClient } from '../api/client.ts'
import type { Foo } from '../types/index.ts'
```

All hook logic stays identical. Only imports change. Copy each hook file from `frontend/src/hooks/` to `packages/shared/src/hooks/` and apply this import replacement.

Also export `TransactionFilters` and `InvoiceFilters` interfaces (currently non-exported in Web) since the APP will need them.

**Step 2: Add exports to barrel**

```typescript
export * from './hooks/useAccounts.ts'
export * from './hooks/useTransactions.ts'
export * from './hooks/useInvoices.ts'
export * from './hooks/useCategories.ts'
export * from './hooks/useMerchants.ts'
export * from './hooks/useRules.ts'
export * from './hooks/useBanks.ts'
export * from './hooks/useSharedLedgers.ts'
export * from './hooks/useTransactionStats.ts'
```

**Step 3: Typecheck**

Run: `cd packages/shared && pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/shared/src/hooks/ packages/shared/src/index.ts
git commit -m "feat(shared): extract all data hooks to shared package"
```

---

### Task 7: Extract and refactor auth store to shared package

**Files:**
- Create: `packages/shared/src/stores/auth.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create platform-agnostic auth store**

The Web version directly uses `localStorage`. The shared version accepts a `TokenStorage` via factory:

```typescript
import { create } from 'zustand'
import type { User } from '../types/index.ts'
import type { TokenStorage } from '../api/client.ts'

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  setUser: (user: User) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export type AuthStore = ReturnType<typeof createAuthStore>

export function createAuthStore(storage: TokenStorage) {
  return create<AuthState>((set, get) => ({
    token: null,
    user: null,
    setAuth: (token, user) => {
      storage.setToken(token)
      set({ token, user })
    },
    setUser: (user) => set({ user }),
    logout: () => {
      storage.removeToken()
      set({ token: null, user: null })
    },
    isAuthenticated: () => !!get().token,
  }))
}
```

Note: The initial `token` is `null` because `storage.getToken()` is async. Each platform initializes the token asynchronously at startup.

**Step 2: Add export to barrel**

```typescript
export { createAuthStore } from './stores/auth.ts'
export type { AuthStore } from './stores/auth.ts'
```

**Step 3: Commit**

```bash
git add packages/shared/src/stores/ packages/shared/src/index.ts
git commit -m "feat(shared): extract auth store with TokenStorage abstraction"
```

---

### Task 8: Update frontend to use @zenbill/shared

**Files:**
- Modify: `frontend/package.json` (add `@zenbill/shared` dependency)
- Create: `frontend/src/lib/storage.ts` (Web TokenStorage impl)
- Modify: `frontend/src/lib/api.ts` (initialize shared API client)
- Modify: `frontend/src/stores/auth.ts` (use shared store factory)
- Modify: All hook imports across `frontend/src/` (change from `@/hooks/*` to `@zenbill/shared`)
- Modify: All type imports across `frontend/src/` (change from `@/types` to `@zenbill/shared`)

**Step 1: Add @zenbill/shared to frontend dependencies**

In `frontend/package.json`, add to `dependencies`:
```json
"@zenbill/shared": "workspace:*"
```

Run: `pnpm install`

**Step 2: Create Web TokenStorage implementation**

Create `frontend/src/lib/storage.ts`:

```typescript
import type { TokenStorage } from '@zenbill/shared'

export const webTokenStorage: TokenStorage = {
  getToken: async () => localStorage.getItem('token'),
  setToken: async (token) => localStorage.setItem('token', token),
  removeToken: async () => localStorage.removeItem('token'),
}
```

**Step 3: Update frontend/src/lib/api.ts**

Replace the existing `api.ts` to initialize the shared client:

```typescript
import { createApiClient, setApiClient } from '@zenbill/shared'
import { webTokenStorage } from './storage.ts'

const BASE_URL = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1`

const client = createApiClient({
  storage: webTokenStorage,
  baseUrl: BASE_URL,
  onUnauthorized: () => {
    window.location.href = '/login'
  },
})

setApiClient(client)

// Re-export for any remaining direct usage in frontend
export { ApiError } from '@zenbill/shared'
export const api = client
```

**Step 4: Update frontend/src/stores/auth.ts**

```typescript
import { createAuthStore } from '@zenbill/shared'
import { webTokenStorage } from '@/lib/storage.ts'

export const useAuthStore = createAuthStore(webTokenStorage)

// Initialize token from localStorage synchronously for Web
const token = localStorage.getItem('token')
if (token) {
  useAuthStore.setState({ token })
}
```

**Step 5: Update all imports across frontend/src/**

Search and replace across all files in `frontend/src/`:

- `from '@/types'` → `from '@zenbill/shared'`
- `from '@/hooks/useAccounts'` → `from '@zenbill/shared'`
- `from '@/hooks/useTransactions'` → `from '@zenbill/shared'`
- `from '@/hooks/useInvoices'` → `from '@zenbill/shared'`
- `from '@/hooks/useCategories'` → `from '@zenbill/shared'`
- `from '@/hooks/useMerchants'` → `from '@zenbill/shared'`
- `from '@/hooks/useRules'` → `from '@zenbill/shared'`
- `from '@/hooks/useBanks'` → `from '@zenbill/shared'`
- `from '@/hooks/useSharedLedgers'` → `from '@zenbill/shared'`
- `from '@/hooks/useTransactionStats'` → `from '@zenbill/shared'`

**Important:** Keep `from '@/lib/api'` for the one file that still uses `api` directly. The shared hooks use `getApiClient()` internally so components don't need to import `api` anymore.

**Step 6: Delete migrated source files from frontend**

After all imports are updated:
- Delete `frontend/src/types/index.ts`
- Delete all files in `frontend/src/hooks/`
- Delete `frontend/src/utils/billingCycle.ts`

Keep `frontend/src/lib/api.ts` (now a thin wrapper) and `frontend/src/stores/auth.ts` (now uses factory).

**Step 7: Verify Web still works**

Run: `cd frontend && pnpm dev`
Expected: Web app loads, login works, all pages render data correctly.

Run: `cd frontend && pnpm build`
Expected: Build succeeds with no TypeScript errors.

**Step 8: Commit**

```bash
git add -A frontend/ packages/
git commit -m "refactor(frontend): migrate to @zenbill/shared for types, hooks, API client, and auth store"
```

---

## Phase 1: Expo APP Foundation

### Task 9: Create Expo app with dependencies

**Files:**
- Create: `app/` directory (Expo project)

**Step 1: Create Expo project**

```bash
cd /Users/yuki/projects/zen-bill
npx create-expo-app@latest app --template blank-typescript
```

**Step 2: Install dependencies**

```bash
cd app
npx expo install expo-router expo-linking expo-constants expo-status-bar expo-secure-store react-native-safe-area-context react-native-screens react-native-gesture-handler react-native-reanimated
pnpm add @tanstack/react-query zustand nativewind tailwindcss react-native-css-interop lucide-react-native react-native-svg
pnpm add @zenbill/shared@workspace:*
pnpm add -D @types/react
```

**Step 3: Verify dependency installation**

Run: `cd app && npx expo doctor`
Expected: No critical issues

**Step 4: Commit**

```bash
git add app/
git commit -m "feat(app): initialize Expo project with dependencies"
```

---

### Task 10: Configure NativeWind + Expo Router

**Files:**
- Modify: `app/app.json` (Expo Router + scheme config)
- Create: `app/global.css` (Tailwind directives)
- Create: `app/tailwind.config.ts`
- Create: `app/metro.config.js` (for pnpm workspace + NativeWind)
- Create: `app/nativewind-env.d.ts`

**Step 1: Update app.json**

Set Expo Router as entry point, add `zenbill` scheme for deep linking:

```json
{
  "expo": {
    "name": "ZenBill",
    "slug": "zenbill",
    "scheme": "zenbill",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.zenbill.app"
    },
    "android": {
      "package": "com.zenbill.app",
      "adaptiveIcon": {
        "backgroundColor": "#ffffff"
      }
    },
    "plugins": [
      "expo-router",
      "expo-secure-store"
    ]
  }
}
```

**Step 2: Create global.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 3: Create tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
```

**Step 4: Create metro.config.js for pnpm workspace**

```javascript
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [monorepoRoot]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

config.resolver.disableHierarchicalLookup = true

module.exports = withNativeWind(config, { input: './global.css' })
```

**Step 5: Create nativewind-env.d.ts**

```typescript
/// <reference types="nativewind/types" />
```

**Step 6: Verify Expo starts**

Run: `cd app && npx expo start`
Expected: Metro bundler starts, QR code shown

**Step 7: Commit**

```bash
git add app/
git commit -m "feat(app): configure NativeWind, Expo Router, and pnpm workspace metro config"
```

---

### Task 11: Create app root layout with providers

**Files:**
- Create: `app/app/_layout.tsx`
- Create: `app/lib/storage.ts`
- Create: `app/lib/query.ts`
- Create: `app/lib/init.ts`

**Step 1: Create expo-secure-store TokenStorage**

Create `app/lib/storage.ts`:

```typescript
import * as SecureStore from 'expo-secure-store'
import type { TokenStorage } from '@zenbill/shared'

const TOKEN_KEY = 'auth_token'

export const appTokenStorage: TokenStorage = {
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  setToken: (token) => SecureStore.setItemAsync(TOKEN_KEY, token),
  removeToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
}
```

**Step 2: Create QueryClient config**

Create `app/lib/query.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})
```

**Step 3: Create API client init**

Create `app/lib/init.ts`:

```typescript
import { createApiClient, setApiClient } from '@zenbill/shared'
import { appTokenStorage } from './storage'
import { router } from 'expo-router'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8080/api/v1'

const client = createApiClient({
  storage: appTokenStorage,
  baseUrl: API_BASE_URL,
  onUnauthorized: () => {
    router.replace('/(auth)/login')
  },
})

setApiClient(client)
```

**Step 4: Create root layout**

Create `app/app/_layout.tsx`:

```tsx
import '../lib/init'
import '../global.css'
import { Slot } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../lib/query'
import { StatusBar } from 'expo-status-bar'

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Slot />
    </QueryClientProvider>
  )
}
```

**Step 5: Verify app renders**

Run: `cd app && npx expo start`
Expected: App opens with blank screen (no routes yet), no errors

**Step 6: Commit**

```bash
git add app/
git commit -m "feat(app): add root layout with QueryClientProvider, API client init, and secure storage"
```

---

### Task 12: Create auth flow (login + deep link callback)

**Files:**
- Create: `app/app/(auth)/_layout.tsx`
- Create: `app/app/(auth)/login.tsx`
- Create: `app/app/(auth)/callback.tsx`
- Create: `app/lib/auth.ts`

**Step 1: Create auth store instance**

Create `app/lib/auth.ts`:

```typescript
import { createAuthStore } from '@zenbill/shared'
import { appTokenStorage } from './storage'

export const useAuthStore = createAuthStore(appTokenStorage)

// Initialize token from secure store (async)
export async function initAuth(): Promise<boolean> {
  const token = await appTokenStorage.getToken()
  if (token) {
    useAuthStore.setState({ token })
    return true
  }
  return false
}
```

**Step 2: Create auth layout**

Create `app/app/(auth)/_layout.tsx`:

```tsx
import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  )
}
```

**Step 3: Create login page**

Create `app/app/(auth)/login.tsx`:

```tsx
import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { getApiClient } from '@zenbill/shared'
import type { ApiResponse } from '@zenbill/shared'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email.trim()) return
    setLoading(true)
    try {
      const api = getApiClient()
      await api.post<ApiResponse<null>>('/auth/login', { email: email.trim() })
      setSent(true)
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-2xl font-bold mb-4">Check your email</Text>
        <Text className="text-gray-500 text-center">
          We sent a login link to {email}. Tap the link in the email to sign in.
        </Text>
        <TouchableOpacity
          className="mt-8"
          onPress={() => setSent(false)}
        >
          <Text className="text-blue-500">Use a different email</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-3xl font-bold mb-2">ZenBill</Text>
        <Text className="text-gray-500 mb-8">Sign in with your email</Text>
        <TextInput
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base mb-4"
          placeholder="your@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />
        <TouchableOpacity
          className="w-full bg-blue-500 rounded-lg py-3 items-center"
          onPress={handleLogin}
          disabled={loading}
        >
          <Text className="text-white font-semibold text-base">
            {loading ? 'Sending...' : 'Send login link'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}
```

**Step 4: Create deep link callback handler**

Create `app/app/(auth)/callback.tsx`:

```tsx
import { useEffect } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { getApiClient } from '@zenbill/shared'
import type { ApiResponse, User } from '@zenbill/shared'
import { useAuthStore } from '../../lib/auth'

export default function AuthCallbackPage() {
  const { token } = useLocalSearchParams<{ token: string }>()

  useEffect(() => {
    if (!token) {
      router.replace('/(auth)/login')
      return
    }

    const verify = async () => {
      try {
        const { setAuth } = useAuthStore.getState()
        // Store token first so subsequent API calls include it
        await useAuthStore.getState().setAuth(token, { id: '', email: '' } as User)

        // Verify token and get user info
        const api = getApiClient()
        const res = await api.get<ApiResponse<User>>('/auth/me')
        setAuth(token, res.data)
        router.replace('/(tabs)')
      } catch {
        router.replace('/(auth)/login')
      }
    }
    verify()
  }, [token])

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" />
      <Text className="mt-4 text-gray-500">Signing in...</Text>
    </View>
  )
}
```

**Step 5: Update root layout to check auth on startup**

Update `app/app/_layout.tsx` to redirect based on auth state:

```tsx
import '../lib/init'
import '../global.css'
import { useEffect, useState } from 'react'
import { Slot, router, useSegments } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../lib/query'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator } from 'react-native'
import { initAuth, useAuthStore } from '../lib/auth'

export default function RootLayout() {
  const [ready, setReady] = useState(false)
  const segments = useSegments()
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    initAuth().then(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!ready) return
    const inAuthGroup = segments[0] === '(auth)'
    if (!token && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (token && inAuthGroup) {
      router.replace('/(tabs)')
    }
  }, [ready, token, segments])

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Slot />
    </QueryClientProvider>
  )
}
```

**Step 6: Commit**

```bash
git add app/
git commit -m "feat(app): implement magic link auth flow with deep link callback"
```

---

### Task 13: Create tab navigation layout

**Files:**
- Create: `app/app/(tabs)/_layout.tsx`
- Create: `app/app/(tabs)/index.tsx` (placeholder Dashboard)
- Create: `app/app/(tabs)/accounts.tsx` (placeholder)
- Create: `app/app/(tabs)/shared-ledgers.tsx` (placeholder)
- Create: `app/app/(tabs)/invoices.tsx` (placeholder)
- Create: `app/app/(tabs)/more.tsx` (placeholder)

**Step 1: Create tab layout with 5 tabs**

Create `app/app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router'
import { LayoutDashboard, Wallet, Users, Receipt, Menu } from 'lucide-react-native'

const ACTIVE_COLOR = '#0284c7'
const INACTIVE_COLOR = '#9ca3af'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: {
          height: 64,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '總覽',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: '帳戶',
          tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="shared-ledgers"
        options={{
          title: '分帳',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: '發票',
          tabBarIcon: ({ color, size }) => <Receipt color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: '更多',
          tabBarIcon: ({ color, size }) => <Menu color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
```

**Step 2: Create placeholder pages**

Create `app/app/(tabs)/index.tsx`:

```tsx
import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function DashboardPage() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center">
        <Text className="text-xl font-bold">Dashboard</Text>
        <Text className="text-gray-500 mt-2">Coming in Phase 2</Text>
      </View>
    </SafeAreaView>
  )
}
```

Create similar placeholders for `accounts.tsx`, `shared-ledgers.tsx`, `invoices.tsx`, `more.tsx` (same structure, different title text).

**Step 3: Verify tab navigation works**

Run: `cd app && npx expo start`
Expected: Tab bar with 5 tabs, each shows placeholder content

**Step 4: Commit**

```bash
git add app/
git commit -m "feat(app): add tab navigation with 5 placeholder tabs"
```

---

### Task 14: Create base UI components

**Files:**
- Create: `app/constants/theme.ts`
- Create: `app/components/ui/Button.tsx`
- Create: `app/components/ui/Card.tsx`
- Create: `app/components/ui/Input.tsx`
- Create: `app/components/ui/EmptyState.tsx`
- Create: `app/components/ui/LoadingScreen.tsx`

**Step 1: Create theme constants**

Create `app/constants/theme.ts`:

```typescript
export const Colors = {
  primary: '#0284c7',
  primaryLight: '#e0f2fe',
  background: '#ffffff',
  surface: '#f8fafc',
  text: '#0f172a',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  error: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
} as const

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const
```

**Step 2: Create Button component**

Create `app/components/ui/Button.tsx`:

```tsx
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native'

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  loading?: boolean
  disabled?: boolean
  className?: string
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, className = '' }: ButtonProps) {
  const base = 'rounded-lg py-3 px-4 items-center'
  const variants = {
    primary: 'bg-sky-600',
    secondary: 'bg-gray-100',
    danger: 'bg-red-500',
  }
  const textVariants = {
    primary: 'text-white font-semibold',
    secondary: 'text-gray-700 font-medium',
    danger: 'text-white font-semibold',
  }

  return (
    <TouchableOpacity
      className={`${base} ${variants[variant]} ${disabled || loading ? 'opacity-50' : ''} ${className}`}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? '#374151' : '#ffffff'} />
      ) : (
        <Text className={textVariants[variant]}>{title}</Text>
      )}
    </TouchableOpacity>
  )
}
```

**Step 3: Create Card component**

Create `app/components/ui/Card.tsx`:

```tsx
import { View } from 'react-native'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <View className={`bg-white rounded-xl border border-gray-100 p-4 ${className}`}>
      {children}
    </View>
  )
}
```

**Step 4: Create Input component**

Create `app/components/ui/Input.tsx`:

```tsx
import { View, Text, TextInput, type TextInputProps } from 'react-native'

interface InputProps extends TextInputProps {
  label?: string
  error?: string
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <View className="mb-4">
      {label && <Text className="text-sm font-medium text-gray-700 mb-1">{label}</Text>}
      <TextInput
        className={`border rounded-lg px-4 py-3 text-base ${error ? 'border-red-500' : 'border-gray-300'} ${className}`}
        placeholderTextColor="#9ca3af"
        {...props}
      />
      {error && <Text className="text-sm text-red-500 mt-1">{error}</Text>}
    </View>
  )
}
```

**Step 5: Create EmptyState and LoadingScreen**

Create `app/components/ui/EmptyState.tsx`:

```tsx
import { View, Text } from 'react-native'

interface EmptyStateProps {
  title: string
  description?: string
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center py-12">
      <Text className="text-lg font-medium text-gray-400">{title}</Text>
      {description && <Text className="text-gray-400 mt-1 text-center px-8">{description}</Text>}
    </View>
  )
}
```

Create `app/components/ui/LoadingScreen.tsx`:

```tsx
import { View, ActivityIndicator } from 'react-native'

export function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#0284c7" />
    </View>
  )
}
```

**Step 6: Commit**

```bash
git add app/
git commit -m "feat(app): add base UI components (Button, Card, Input, EmptyState, LoadingScreen)"
```

---

## Phase 2: Core Pages

### Task 15: Dashboard page

**Files:**
- Modify: `app/app/(tabs)/index.tsx`
- Create: `app/components/dashboard/StatCard.tsx`
- Create: `app/components/dashboard/RecentTransactions.tsx`

**Step 1: Create StatCard**

Create `app/components/dashboard/StatCard.tsx`:

```tsx
import { View, Text } from 'react-native'
import { Card } from '../ui/Card'

interface StatCardProps {
  label: string
  value: string
  subtext?: string
}

export function StatCard({ label, value, subtext }: StatCardProps) {
  return (
    <Card className="flex-1">
      <Text className="text-xs text-gray-500 mb-1">{label}</Text>
      <Text className="text-lg font-bold">{value}</Text>
      {subtext && <Text className="text-xs text-gray-400 mt-0.5">{subtext}</Text>}
    </Card>
  )
}
```

**Step 2: Create RecentTransactions**

Create `app/components/dashboard/RecentTransactions.tsx`:

```tsx
import { View, Text, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import type { Transaction } from '@zenbill/shared'

interface Props {
  transactions: Transaction[]
}

export function RecentTransactions({ transactions }: Props) {
  return (
    <View>
      <Text className="text-base font-semibold mb-3">最近交易</Text>
      {transactions.map((t) => (
        <TouchableOpacity
          key={t.id}
          className="flex-row items-center justify-between py-3 border-b border-gray-50"
          onPress={() => router.push(`/transactions/${t.id}/edit`)}
        >
          <View className="flex-1">
            <Text className="text-sm font-medium">{t.note || 'Untitled'}</Text>
            <Text className="text-xs text-gray-400">{t.occurred_at.split('T')[0]}</Text>
          </View>
          <Text className={`text-sm font-semibold ${t.type === 'INCOME' ? 'text-green-600' : 'text-gray-900'}`}>
            {t.type === 'INCOME' ? '+' : '-'}${Math.abs(t.amount).toLocaleString()}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
```

**Step 3: Implement Dashboard page**

Update `app/app/(tabs)/index.tsx`:

```tsx
import { View, Text, ScrollView, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTransactionStats, useTransactions } from '@zenbill/shared'
import { StatCard } from '../../components/dashboard/StatCard'
import { RecentTransactions } from '../../components/dashboard/RecentTransactions'
import { LoadingScreen } from '../../components/ui/LoadingScreen'
import { useState } from 'react'

export default function DashboardPage() {
  const stats = useTransactionStats(6)
  const recent = useTransactions({ page: 1, page_size: 10 })
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([stats.refetch(), recent.refetch()])
    setRefreshing(false)
  }

  if (stats.isLoading) return <LoadingScreen />

  const currentMonth = stats.data?.monthly?.[stats.data.monthly.length - 1]

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="text-2xl font-bold mb-4">ZenBill</Text>

        <View className="flex-row gap-3 mb-6">
          <StatCard
            label="本月支出"
            value={`$${currentMonth?.expense?.toLocaleString() ?? '0'}`}
          />
          <StatCard
            label="本月收入"
            value={`$${currentMonth?.income?.toLocaleString() ?? '0'}`}
          />
        </View>

        {recent.data?.data && <RecentTransactions transactions={recent.data.data} />}
      </ScrollView>
    </SafeAreaView>
  )
}
```

**Step 4: Verify Dashboard loads data**

Run: `cd app && npx expo start`
Expected: Dashboard shows stat cards and recent transactions from API

**Step 5: Commit**

```bash
git add app/
git commit -m "feat(app): implement Dashboard page with stats and recent transactions"
```

---

### Task 16: Accounts list page

**Files:**
- Modify: `app/app/(tabs)/accounts.tsx`
- Create: `app/components/accounts/AccountCard.tsx`
- Create: `app/components/ui/FAB.tsx`

**Step 1: Create AccountCard**

Create `app/components/accounts/AccountCard.tsx`:

```tsx
import { View, Text, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Card } from '../ui/Card'
import type { Account } from '@zenbill/shared'

const TYPE_LABELS: Record<string, string> = {
  CASH: '現金',
  BANK: '銀行',
  CREDIT: '信用卡',
  CRYPTO: '加密貨幣',
}

interface Props {
  account: Account
}

export function AccountCard({ account }: Props) {
  return (
    <TouchableOpacity onPress={() => router.push(`/accounts/${account.id}`)}>
      <Card className="mb-3">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-sm text-gray-500">{TYPE_LABELS[account.type] ?? account.type}</Text>
            <Text className="text-base font-semibold mt-0.5">{account.name}</Text>
          </View>
          <Text className="text-lg font-bold">
            {account.currency === 'TWD' ? '$' : `${account.currency} `}
            {account.balance.toLocaleString()}
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  )
}
```

**Step 2: Create FAB component**

Create `app/components/ui/FAB.tsx`:

```tsx
import { TouchableOpacity } from 'react-native'
import { Plus } from 'lucide-react-native'

interface FABProps {
  onPress: () => void
}

export function FAB({ onPress }: FABProps) {
  return (
    <TouchableOpacity
      className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-sky-600 items-center justify-center shadow-lg"
      onPress={onPress}
      style={{ elevation: 5 }}
    >
      <Plus color="#ffffff" size={24} />
    </TouchableOpacity>
  )
}
```

**Step 3: Implement accounts list page**

Update `app/app/(tabs)/accounts.tsx`:

```tsx
import { View, ScrollView, RefreshControl, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useAccounts } from '@zenbill/shared'
import { AccountCard } from '../../components/accounts/AccountCard'
import { FAB } from '../../components/ui/FAB'
import { LoadingScreen } from '../../components/ui/LoadingScreen'
import { EmptyState } from '../../components/ui/EmptyState'
import { useState } from 'react'

export default function AccountsPage() {
  const { data: accounts, isLoading, refetch } = useAccounts()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  if (isLoading) return <LoadingScreen />

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold">帳戶</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-24"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!accounts?.length ? (
          <EmptyState title="尚無帳戶" description="點擊右下角按鈕新增帳戶" />
        ) : (
          accounts.map((a) => <AccountCard key={a.id} account={a} />)
        )}
      </ScrollView>

      <FAB onPress={() => router.push('/transactions/new')} />
    </SafeAreaView>
  )
}
```

**Step 4: Commit**

```bash
git add app/
git commit -m "feat(app): implement accounts list page with FAB"
```

---

### Task 17: Account detail page

**Files:**
- Create: `app/app/accounts/[id].tsx`

**Step 1: Implement account detail page**

Create `app/app/accounts/[id].tsx`:

```tsx
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, Stack, router } from 'expo-router'
import { useAccount, useTransactions } from '@zenbill/shared'
import { Card } from '../../components/ui/Card'
import { LoadingScreen } from '../../components/ui/LoadingScreen'
import { FAB } from '../../components/ui/FAB'
import { useState } from 'react'

export default function AccountDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: account, isLoading } = useAccount(id!)
  const txn = useTransactions({ account_id: id, page_size: 50 })
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    await txn.refetch()
    setRefreshing(false)
  }

  if (isLoading) return <LoadingScreen />
  if (!account) return null

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: account.name, headerShown: true }} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-24"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Card className="mb-4">
          <Text className="text-sm text-gray-500">餘額</Text>
          <Text className="text-2xl font-bold mt-1">
            {account.currency === 'TWD' ? '$' : `${account.currency} `}
            {account.balance.toLocaleString()}
          </Text>
        </Card>

        <Text className="text-base font-semibold mb-3">交易紀錄</Text>

        {txn.data?.data?.map((t) => (
          <TouchableOpacity
            key={t.id}
            className="flex-row items-center justify-between py-3 border-b border-gray-100"
            onPress={() => router.push(`/transactions/${t.id}/edit`)}
          >
            <View className="flex-1 mr-4">
              <Text className="text-sm font-medium" numberOfLines={1}>{t.note || 'Untitled'}</Text>
              <Text className="text-xs text-gray-400">{t.occurred_at.split('T')[0]}</Text>
            </View>
            <Text className={`text-sm font-semibold ${t.type === 'INCOME' ? 'text-green-600' : ''}`}>
              {t.type === 'INCOME' ? '+' : t.type === 'TRANSFER' ? '' : '-'}
              ${Math.abs(t.amount).toLocaleString()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FAB onPress={() => router.push({ pathname: '/transactions/new', params: { account_id: id } })} />
    </SafeAreaView>
  )
}
```

**Step 2: Commit**

```bash
git add app/
git commit -m "feat(app): implement account detail page with transaction history"
```

---

### Task 18: Transaction form page (create + edit)

**Files:**
- Create: `app/app/transactions/new.tsx`
- Create: `app/app/transactions/[id]/edit.tsx`
- Create: `app/components/transactions/TransactionForm.tsx`

This is the most complex page. It mirrors the Web's TransactionForm with type selector, amount input, merchant/category/account selectors, date picker, and note field.

**Step 1: Create TransactionForm component**

Create `app/components/transactions/TransactionForm.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { router } from 'expo-router'
import { Picker } from '@react-native-picker/picker'
import {
  useAccounts, useCategories, useMerchants,
  useCreateTransaction, useUpdateTransaction, useDeleteTransaction,
} from '@zenbill/shared'
import type { Transaction, CreateTransactionInput, TransactionType } from '@zenbill/shared'
import { Button } from '../ui/Button'

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'EXPENSE', label: '支出' },
  { value: 'INCOME', label: '收入' },
  { value: 'TRANSFER', label: '轉帳' },
]

interface Props {
  transaction?: Transaction
  defaultAccountId?: string
}

export function TransactionForm({ transaction, defaultAccountId }: Props) {
  const isEdit = !!transaction

  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'EXPENSE')
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '')
  const [accountId, setAccountId] = useState(transaction?.account_id ?? defaultAccountId ?? '')
  const [targetAccountId, setTargetAccountId] = useState(transaction?.target_account_id ?? '')
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? '')
  const [merchantId, setMerchantId] = useState(transaction?.merchant_id ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')
  const [occurredAt, setOccurredAt] = useState(
    transaction?.occurred_at?.split('T')[0] ?? new Date().toISOString().split('T')[0]
  )

  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const { data: merchants } = useMerchants()

  const createMut = useCreateTransaction()
  const updateMut = useUpdateTransaction()
  const deleteMut = useDeleteTransaction()

  const flatCategories = categories?.flatMap((c) => [c, ...(c.children || [])]) ?? []

  const handleSubmit = () => {
    if (!amount || !accountId) {
      Alert.alert('Error', '請填寫金額和帳戶')
      return
    }

    const input: CreateTransactionInput = {
      type,
      amount: parseFloat(amount),
      account_id: accountId,
      occurred_at: `${occurredAt}T00:00:00Z`,
      ...(targetAccountId ? { target_account_id: targetAccountId } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(merchantId ? { merchant_id: merchantId } : {}),
      ...(note ? { note } : {}),
    }

    if (isEdit) {
      updateMut.mutate({ id: transaction.id, ...input }, {
        onSuccess: () => router.back(),
        onError: (e) => Alert.alert('Error', e.message),
      })
    } else {
      createMut.mutate(input, {
        onSuccess: () => router.back(),
        onError: (e) => Alert.alert('Error', e.message),
      })
    }
  }

  const handleDelete = () => {
    if (!transaction) return
    Alert.alert('確認刪除', '確定要刪除這筆交易嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除', style: 'destructive',
        onPress: () => deleteMut.mutate(transaction.id, {
          onSuccess: () => router.back(),
        }),
      },
    ])
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="p-4">
      {/* Type selector */}
      <View className="flex-row mb-4 gap-2">
        {TYPES.map((t) => (
          <TouchableOpacity
            key={t.value}
            className={`flex-1 py-2 rounded-lg items-center ${type === t.value ? 'bg-sky-600' : 'bg-gray-100'}`}
            onPress={() => setType(t.value)}
          >
            <Text className={type === t.value ? 'text-white font-semibold' : 'text-gray-600'}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Amount */}
      <Text className="text-sm font-medium text-gray-700 mb-1">金額</Text>
      <TextInput
        className="border border-gray-300 rounded-lg px-4 py-3 text-lg font-bold mb-4"
        keyboardType="decimal-pad"
        placeholder="0"
        value={amount}
        onChangeText={setAmount}
      />

      {/* Date */}
      <Text className="text-sm font-medium text-gray-700 mb-1">日期</Text>
      <TextInput
        className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-4"
        placeholder="YYYY-MM-DD"
        value={occurredAt}
        onChangeText={setOccurredAt}
      />

      {/* Account picker */}
      <Text className="text-sm font-medium text-gray-700 mb-1">帳戶</Text>
      <View className="border border-gray-300 rounded-lg mb-4 overflow-hidden">
        <Picker selectedValue={accountId} onValueChange={setAccountId}>
          <Picker.Item label="選擇帳戶" value="" />
          {accounts?.map((a) => (
            <Picker.Item key={a.id} label={a.name} value={a.id} />
          ))}
        </Picker>
      </View>

      {/* Target account for transfers */}
      {type === 'TRANSFER' && (
        <>
          <Text className="text-sm font-medium text-gray-700 mb-1">目標帳戶</Text>
          <View className="border border-gray-300 rounded-lg mb-4 overflow-hidden">
            <Picker selectedValue={targetAccountId} onValueChange={setTargetAccountId}>
              <Picker.Item label="選擇目標帳戶" value="" />
              {accounts?.filter((a) => a.id !== accountId).map((a) => (
                <Picker.Item key={a.id} label={a.name} value={a.id} />
              ))}
            </Picker>
          </View>
        </>
      )}

      {/* Category picker */}
      {type !== 'TRANSFER' && (
        <>
          <Text className="text-sm font-medium text-gray-700 mb-1">分類</Text>
          <View className="border border-gray-300 rounded-lg mb-4 overflow-hidden">
            <Picker selectedValue={categoryId} onValueChange={setCategoryId}>
              <Picker.Item label="選擇分類" value="" />
              {flatCategories
                .filter((c) => c.type === (type === 'INCOME' ? 'INCOME' : 'EXPENSE'))
                .map((c) => (
                  <Picker.Item key={c.id} label={`${c.parent_id ? '  ' : ''}${c.icon} ${c.name}`} value={c.id} />
                ))}
            </Picker>
          </View>
        </>
      )}

      {/* Merchant picker */}
      {type === 'EXPENSE' && (
        <>
          <Text className="text-sm font-medium text-gray-700 mb-1">商家</Text>
          <View className="border border-gray-300 rounded-lg mb-4 overflow-hidden">
            <Picker selectedValue={merchantId} onValueChange={setMerchantId}>
              <Picker.Item label="選擇商家 (可選)" value="" />
              {merchants?.map((m) => (
                <Picker.Item key={m.id} label={m.name} value={m.id} />
              ))}
            </Picker>
          </View>
        </>
      )}

      {/* Note */}
      <Text className="text-sm font-medium text-gray-700 mb-1">備註</Text>
      <TextInput
        className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-6"
        placeholder="備註 (可選)"
        value={note}
        onChangeText={setNote}
      />

      {/* Submit */}
      <Button
        title={isEdit ? '儲存修改' : '新增交易'}
        onPress={handleSubmit}
        loading={createMut.isPending || updateMut.isPending}
      />

      {/* Delete (edit mode only) */}
      {isEdit && (
        <Button
          title="刪除交易"
          variant="danger"
          onPress={handleDelete}
          loading={deleteMut.isPending}
          className="mt-3"
        />
      )}
    </ScrollView>
  )
}
```

**Step 2: Create new transaction page**

Create `app/app/transactions/new.tsx`:

```tsx
import { Stack, useLocalSearchParams } from 'expo-router'
import { TransactionForm } from '../../components/transactions/TransactionForm'

export default function NewTransactionPage() {
  const { account_id } = useLocalSearchParams<{ account_id?: string }>()

  return (
    <>
      <Stack.Screen options={{ title: '新增交易', headerShown: true }} />
      <TransactionForm defaultAccountId={account_id} />
    </>
  )
}
```

**Step 3: Create edit transaction page**

Create `app/app/transactions/[id]/edit.tsx`:

```tsx
import { Stack, useLocalSearchParams } from 'expo-router'
import { useTransaction } from '@zenbill/shared'
import { TransactionForm } from '../../../components/transactions/TransactionForm'
import { LoadingScreen } from '../../../components/ui/LoadingScreen'

export default function EditTransactionPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: transaction, isLoading } = useTransaction(id)

  if (isLoading) return <LoadingScreen />
  if (!transaction) return null

  return (
    <>
      <Stack.Screen options={{ title: '編輯交易', headerShown: true }} />
      <TransactionForm transaction={transaction} />
    </>
  )
}
```

**Step 4: Install @react-native-picker/picker**

Run: `cd app && npx expo install @react-native-picker/picker`

**Step 5: Verify transaction form works**

Run: `cd app && npx expo start`
Expected: Can create/edit/delete transactions

**Step 6: Commit**

```bash
git add app/
git commit -m "feat(app): implement transaction form with create, edit, and delete"
```

---

## Phase 3: Invoices + Management Pages

### Task 19: Invoices list page

**Files:**
- Modify: `app/app/(tabs)/invoices.tsx`

**Step 1: Implement invoices list page**

Update `app/app/(tabs)/invoices.tsx` with:
- Month filter (text input or picker for YYYY-MM)
- Status filter tabs (ALL / PENDING / PROCESSED / IGNORED)
- Invoice list with seller name, date, amount, status badge
- Pull-to-refresh
- Sync button in header (triggers `useSyncInvoices`)
- Batch status update (select multiple → mark as PROCESSED/IGNORED)
- Tap invoice to view details

**Step 2: Commit**

```bash
git add app/
git commit -m "feat(app): implement invoices list page with filters and sync"
```

---

### Task 20: "More" tab with management pages

**Files:**
- Modify: `app/app/(tabs)/more.tsx`
- Create: `app/app/merchants/index.tsx`
- Create: `app/app/rules/index.tsx`
- Create: `app/app/categories/index.tsx`
- Create: `app/app/settings/index.tsx`

**Step 1: Implement "More" menu**

Update `app/app/(tabs)/more.tsx` as a settings-style list with rows:
- 商家管理 → navigates to `/merchants`
- 規則引擎 → navigates to `/rules`
- 分類管理 → navigates to `/categories`
- 設定 → navigates to `/settings`
- 登出 → calls `useAuthStore.logout()` and redirects to login

**Step 2: Implement merchants CRUD page**

Create `app/app/merchants/index.tsx`:
- List merchants with name
- Swipe to delete
- Add button in header → modal or inline form
- Edit on tap → modal with name, default category, default account pickers

**Step 3: Implement rules CRUD page**

Create `app/app/rules/index.tsx`:
- List rules with keyword, match type, priority
- CRUD operations using `useCreateRule`, `useUpdateRule`, `useDeleteRule`

**Step 4: Implement categories management page**

Create `app/app/categories/index.tsx`:
- List categories (grouped by EXPENSE/INCOME)
- Show hierarchy (parent → children)
- CRUD operations

**Step 5: Implement settings page**

Create `app/app/settings/index.tsx`:
- E-Invoice credential binding (phone barcode + verify code)
- Sync status display
- User info display
- API server URL config (for development)

**Step 6: Commit (one per page)**

```bash
git commit -m "feat(app): implement More tab with merchants, rules, categories, and settings pages"
```

---

## Phase 4: Shared Ledgers

### Task 21: Shared ledgers list page

**Files:**
- Modify: `app/app/(tabs)/shared-ledgers.tsx`

**Step 1: Implement shared ledgers list**

- List all shared ledgers with name, partner, currency, summary
- Create button → modal with name, partner name, currency
- Tap to navigate to detail page
- Pull-to-refresh

**Step 2: Commit**

```bash
git commit -m "feat(app): implement shared ledgers list page"
```

---

### Task 22: Shared ledger detail + expenses

**Files:**
- Create: `app/app/shared-ledgers/[id].tsx`
- Create: `app/app/shared-ledgers/[id]/expenses/new.tsx`
- Create: `app/app/shared-ledgers/[id]/receivables.tsx`

**Step 1: Implement shared ledger detail page**

- Header: ledger name, summary stats (total, owner share, partner share, receivable balance)
- Expense list (paginated, pull-to-refresh)
- Action buttons: Add expense, View receivables, Sync sheet
- Swipe to delete expense

**Step 2: Implement new shared expense form**

Create `app/app/shared-ledgers/[id]/expenses/new.tsx`:
- Date, category picker, description, payer, amount
- Split method selector (EQUAL / FULL_OWNER / FULL_PARTNER / CUSTOM)
- Custom split: owner amount + partner amount inputs
- Payment account picker

**Step 3: Implement receivables page**

Create `app/app/shared-ledgers/[id]/receivables.tsx`:
- List unsettled receivables
- Settle individual or settle all button
- Show amount owed per receivable

**Step 4: Commit**

```bash
git commit -m "feat(app): implement shared ledger detail, expenses, and receivables"
```

---

### Task 23: Invite deep link handler

**Files:**
- Create: `app/app/shared-ledgers/invite/[token].tsx`

**Step 1: Implement invite accept page**

Create `app/app/shared-ledgers/invite/[token].tsx`:
- Display invite info (ledger name, owner email, partner name)
- Accept button → calls `useAcceptInvite`
- On success → navigate to the shared ledger detail page
- Handle invalid/expired tokens

**Step 2: Commit**

```bash
git commit -m "feat(app): implement shared ledger invite deep link handler"
```

---

## Phase 5: Polish + Release

### Task 24: Error handling + loading states

**Files:**
- Create: `app/components/ui/ErrorBoundary.tsx`
- Modify: all page files to add proper error states

**Step 1: Create error boundary**

- Wrap each tab in an error boundary
- Show "Something went wrong" with retry button
- Handle network errors gracefully with toast/alert

**Step 2: Add proper loading states**

- Skeleton screens for lists (accounts, invoices, transactions)
- Pull-to-refresh on all list pages
- Disable buttons during mutations
- Show success/error feedback after mutations

**Step 3: Commit**

```bash
git commit -m "feat(app): add error boundaries and improved loading states"
```

---

### Task 25: Navigation polish + animations

**Files:**
- Modify: `app/app/(tabs)/_layout.tsx`
- Modify: various page files

**Step 1: Polish navigation transitions**

- Add smooth Stack transitions (push/pop)
- Add modal presentation for create/edit forms
- Add swipe-back gesture support
- Add haptic feedback on key actions

**Step 2: Commit**

```bash
git commit -m "feat(app): polish navigation transitions and add haptic feedback"
```

---

### Task 26: App store preparation

**Files:**
- Create: `app/assets/` (app icon, splash screen)
- Modify: `app/app.json` (metadata for stores)

**Step 1: Configure app metadata**

- Set proper app name, version, description
- Add app icon (1024x1024)
- Configure splash screen
- Set iOS permissions (if any)
- Set Android permissions (if any)

**Step 2: Build for testing**

```bash
cd app
npx eas build --platform ios --profile preview
npx eas build --platform android --profile preview
```

**Step 3: Commit**

```bash
git commit -m "feat(app): configure app store metadata and assets"
```

---

## Task Dependency Summary

```
Phase 0 (Monorepo):
  Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8

Phase 1 (APP Foundation):
  Task 8 → Task 9 → Task 10 → Task 11 → Task 12 → Task 13 → Task 14

Phase 2 (Core Pages):
  Task 14 → Task 15 → Task 16 → Task 17 → Task 18

Phase 3 (Invoices + Management):
  Task 18 → Task 19 → Task 20

Phase 4 (Shared Ledgers):
  Task 18 → Task 21 → Task 22 → Task 23

Phase 5 (Polish):
  Task 23 → Task 24 → Task 25 → Task 26
```

**Note:** Phase 3 and Phase 4 are independent of each other and can be developed in parallel after Phase 2 completes.
