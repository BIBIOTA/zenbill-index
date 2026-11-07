import type { ThemeName } from './tokens.ts'

/** What the user picked under 設定 › 外觀. Stored per device. */
export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  system: '跟隨系統',
  light: '淺色',
  dark: '深色',
}

/** Storage key for the device's theme preference. */
export const THEME_STORAGE_KEY = 'zb-theme'

/** Anything other than a known preference (missing, garbage) means "system". */
export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ThemeName {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}
