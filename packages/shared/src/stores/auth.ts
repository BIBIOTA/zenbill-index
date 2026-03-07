import { create } from 'zustand'
import type { User } from '../types/index.ts'
import type { TokenStorage } from '../api/client.ts'

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  setAuth: (token: string, refreshToken: string, user: User) => void
  setTokens: (token: string, refreshToken: string) => void
  setUser: (user: User) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export type AuthStore = ReturnType<typeof createAuthStore>

export function createAuthStore(storage: TokenStorage) {
  return create<AuthState>((set, get) => ({
    token: null,
    refreshToken: null,
    user: null,
    setAuth: (token, refreshToken, user) => {
      storage.setToken(token)
      storage.setRefreshToken(refreshToken)
      set({ token, refreshToken, user })
    },
    setTokens: (token, refreshToken) => {
      storage.setToken(token)
      storage.setRefreshToken(refreshToken)
      set({ token, refreshToken })
    },
    setUser: (user) => set({ user }),
    logout: () => {
      storage.removeToken()
      storage.removeRefreshToken()
      set({ token: null, refreshToken: null, user: null })
    },
    isAuthenticated: () => !!get().token,
  }))
}
