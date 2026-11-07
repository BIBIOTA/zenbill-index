import { describe, expect, it } from 'vitest'
import { buildTokenCss, colorTokens, shadowTokens } from '../tokens'
import { parseThemePreference, resolveTheme } from '../theme'

describe('colorTokens', () => {
  it('淺色與深色定義同一組 token', () => {
    expect(Object.keys(colorTokens.dark).sort()).toEqual(Object.keys(colorTokens.light).sort())
    expect(Object.keys(shadowTokens.dark).sort()).toEqual(Object.keys(shadowTokens.light).sort())
  })

  it('所有顏色都是 hex 或 rgba', () => {
    for (const theme of [colorTokens.light, colorTokens.dark]) {
      for (const value of Object.values(theme)) {
        expect(value).toMatch(/^(#[0-9a-f]{6}|rgba\(\d+, \d+, \d+, [\d.]+\))$/)
      }
    }
  })
})

describe('buildTokenCss', () => {
  const css = buildTokenCss()

  it('淺色是 :root 預設值，深色只在 [data-theme="dark"]', () => {
    expect(css).toContain(':root, [data-theme="light"] {')
    expect(css).toContain('[data-theme="dark"] {')
    const dark = css.slice(css.indexOf('[data-theme="dark"]'))
    expect(dark).toContain('--bg-page: #0b1014;')
    expect(dark).toContain('color-scheme: dark;')
  })

  it('輸出每個顏色、間距、圓角與字體變數', () => {
    for (const name of Object.keys(colorTokens.light)) expect(css).toContain(`--${name}:`)
    expect(css).toContain('--space-4: 16px;')
    expect(css).toContain('--radius-md: 12px;')
    expect(css).toContain('--font-sans: system-ui')
  })
})

describe('resolveTheme', () => {
  it('跟隨系統時依系統設定', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('手動選擇時忽略系統設定', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('parseThemePreference', () => {
  it('不認得的值一律當作跟隨系統', () => {
    expect(parseThemePreference('dark')).toBe('dark')
    expect(parseThemePreference('light')).toBe('light')
    expect(parseThemePreference(null)).toBe('system')
    expect(parseThemePreference('blue')).toBe('system')
  })
})
