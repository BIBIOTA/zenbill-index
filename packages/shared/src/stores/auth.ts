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
