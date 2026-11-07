/**
 * ZenBill design tokens — the single source of truth for colour, type, space,
 * radius, shadow and layout. Values mirror the "ZenBill Design System"
 * artifact (see docs/adr/0004-design-tokens-in-shared.md). Web turns them into
 * CSS custom properties with `buildTokenCss`; the App can read the same
 * objects later.
 */

export type ThemeName = 'light' | 'dark'

export const THEMES: readonly ThemeName[] = ['light', 'dark']

export const colorTokens = {
  light: {
    'bg-page': '#f6f8fa',
    'bg-card': '#ffffff',
    'bg-sunken': '#f1f5f9',
    'bg-hover': '#eef2f6',
    line: '#e7ecf1',
    'line-control': '#8794a6',
    ink: '#0f172a',
    'ink-muted': '#5b6779',
    'ink-faint': '#8a96a6',
    brand: '#10b981',
    'brand-ink': '#047857',
    'brand-fill': '#047857',
    'on-brand': '#ffffff',
    'brand-soft': '#e7f7f0',
    income: '#047857',
    expense: '#c81e1e',
    'expense-soft': '#fdecec',
    warning: '#b45309',
    'warning-soft': '#fef3e2',
    info: '#2563eb',
    'info-soft': '#eaf1fe',
    partner: '#6d28d9',
    'partner-soft': '#f1ebfd',
    'focus-ring': '#047857',
    scrim: 'rgba(15, 23, 42, 0.45)',
    'chart-1': '#2a78d6',
    'chart-2': '#eb6834',
    'chart-3': '#1baf7a',
    'chart-4': '#eda100',
    'chart-5': '#e87ba4',
    'chart-other': '#94a3b8',
  },
  dark: {
    'bg-page': '#0b1014',
    'bg-card': '#131a20',
    'bg-sunken': '#0f151a',
    'bg-hover': '#1a232b',
    line: '#222c35',
    'line-control': '#5f6d7b',
    ink: '#e6ecf1',
    'ink-muted': '#9aa7b4',
    'ink-faint': '#6d7a87',
    brand: '#10b981',
    'brand-ink': '#34d399',
    'brand-fill': '#10b981',
    'on-brand': '#04241a',
    'brand-soft': '#0f2a21',
    income: '#34d399',
    expense: '#f87171',
    'expense-soft': '#2a1416',
    warning: '#fbbf24',
    'warning-soft': '#2a2010',
    info: '#60a5fa',
    'info-soft': '#121d33',
    partner: '#c4b5fd',
    'partner-soft': '#231a3a',
    'focus-ring': '#34d399',
    scrim: 'rgba(0, 0, 0, 0.6)',
    'chart-1': '#3987e5',
    'chart-2': '#d95926',
    'chart-3': '#199e70',
    'chart-4': '#c98500',
    'chart-5': '#d55181',
    'chart-other': '#5f6d7b',
  },
} as const satisfies Record<ThemeName, Record<string, string>>

export type ColorToken = keyof (typeof colorTokens)['light']

export const shadowTokens = {
  light: {
    'shadow-pop': '0 4px 12px rgba(15, 23, 42, 0.08)',
    'shadow-overlay': '0 16px 40px rgba(15, 23, 42, 0.18)',
  },
  dark: {
    'shadow-pop': '0 4px 12px rgba(0, 0, 0, 0.4)',
    'shadow-overlay': '0 16px 40px rgba(0, 0, 0, 0.55)',
  },
} as const satisfies Record<ThemeName, Record<string, string>>

export const spaceTokens = {
  'space-1': '4px',
  'space-2': '8px',
  'space-3': '12px',
  'space-4': '16px',
  'space-6': '24px',
  'space-8': '32px',
} as const

export const radiusTokens = {
  'radius-sm': '8px',
  'radius-md': '12px',
  'radius-pill': '999px',
} as const

export const layoutTokens = {
  'bp-tablet': '768px',
  'bp-desktop': '1024px',
  'sidebar-width': '232px',
  'rail-width': '72px',
  'tabbar-height': '64px',
  'content-max': '1120px',
} as const

export const fontFamilySans =
  'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif'

/** Type scale: [fontSize, lineHeight, fontWeight]. */
export const typeScale = {
  display: ['26px', '34px', 700],
  title: ['18px', '26px', 600],
  heading: ['15px', '22px', 600],
  body: ['14px', '22px', 400],
  label: ['13px', '20px', 500],
  caption: ['12px', '18px', 400],
  micro: ['11px', '16px', 500],
  'amount-xl': ['30px', '38px', 700],
  'amount-lg': ['20px', '28px', 700],
  amount: ['15px', '22px', 600],
} as const satisfies Record<string, readonly [string, string, number]>

function declarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join('\n')
}

/**
 * CSS custom properties for every token. Colours and shadows are scoped by
 * `[data-theme]` on the root element; the light set is also the `:root`
 * default so nothing renders unstyled before the theme attribute is set.
 */
export function buildTokenCss(): string {
  const themed = (theme: ThemeName) =>
    declarations({ ...colorTokens[theme], ...shadowTokens[theme] })
  return [
    `:root, [data-theme="light"] {\n${themed('light')}\n  color-scheme: light;\n}`,
    `[data-theme="dark"] {\n${themed('dark')}\n  color-scheme: dark;\n}`,
    `:root {\n${declarations({ ...spaceTokens, ...radiusTokens, ...layoutTokens, 'font-sans': fontFamilySans })}\n}`,
  ].join('\n')
}
