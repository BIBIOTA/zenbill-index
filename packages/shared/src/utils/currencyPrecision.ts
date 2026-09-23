/**
 * Currency precision (decimal places) helpers.
 *
 * Precision is resolved in this order: the user's `decimal_places` setting
 * (when not null) → built-in overrides → ISO 4217 minor unit → 2.
 *
 * Precision applies to the STORED value (`display × multiplier`), not the
 * displayed value. All data is static and nothing here relies on `Intl`, so
 * Hermes (APP) and browsers (Web) always agree. See openspec change
 * `add-currency-precision`.
 */

import type { CurrencySetting } from '../types/index.ts'

/** Currencies whose practical precision differs from (or is pinned regardless of) ISO 4217. */
export const CURRENCY_DECIMAL_OVERRIDES: Record<string, number> = {
  TWD: 0,
  JPY: 0,
  KRW: 0,
  VND: 0,
}

/**
 * Currency of the aggregated dashboard / report figures. The backend only sums TWD
 * (non-stock) accounts for monthly stats and the net asset trend, so those totals are
 * TWD regardless of what other currencies the user holds.
 */
export const STATS_CURRENCY = 'TWD'

export const DEFAULT_CURRENCY_DECIMALS = 2
export const MAX_CURRENCY_DECIMALS = 4

const ISO_0_DECIMALS = [
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF',
  'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]

const ISO_2_DECIMALS = [
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD',
  'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CNY',
  'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DKK', 'DOP', 'DZD', 'EGP',
  'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD',
  'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IRR',
  'JMD', 'KES', 'KGS', 'KHR', 'KPW', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR',
  'LRD', 'LSL', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU',
  'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO',
  'NOK', 'NPR', 'NZD', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'QAR',
  'RON', 'RSD', 'RUB', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP',
  'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS',
  'TMT', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'USD', 'USN', 'UYU',
  'UZS', 'VED', 'VES', 'WST', 'XCD', 'XCG', 'YER', 'ZAR', 'ZMW', 'ZWG',
]

const ISO_3_DECIMALS = ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']

const ISO_4_DECIMALS = ['CLF', 'UYW']

/** ISO 4217 minor units for active currency codes (static; TWD is 2 here, overridden above). */
export const ISO_4217_DECIMALS: Record<string, number> = Object.fromEntries([
  ...ISO_0_DECIMALS.map((code) => [code, 0] as const),
  ...ISO_2_DECIMALS.map((code) => [code, 2] as const),
  ...ISO_3_DECIMALS.map((code) => [code, 3] as const),
  ...ISO_4_DECIMALS.map((code) => [code, 4] as const),
])

/** Significant digits used to absorb binary floating-point error before rounding. */
const FLOAT_TOLERANCE_PRECISION = 15

function stripFloatError(value: number): number {
  return Number(value.toPrecision(FLOAT_TOLERANCE_PRECISION))
}

/** Precision ignoring user settings: override -> ISO -> 2. Used for "預設（N）" label. */
export function defaultDecimals(currency: string): number {
  const code = currency.toUpperCase()
  return (
    CURRENCY_DECIMAL_OVERRIDES[code] ?? ISO_4217_DECIMALS[code] ?? DEFAULT_CURRENCY_DECIMALS
  )
}

/** user setting decimal_places (non-null) -> override -> ISO -> 2 */
export function resolveDecimals(currency: string, settings?: CurrencySetting[]): number {
  const code = currency.toUpperCase()
  const userSetting = settings?.find((s) => s.currency_code.toUpperCase() === code)
  if (userSetting?.decimal_places != null) return userSetting.decimal_places
  return defaultDecimals(code)
}

/**
 * round_half_up(display*multiplier, decimals)/multiplier; float-tolerant (1.005 @2 -> 1.01).
 * Negatives round half away from zero. multiplier defaults 1
 */
export function roundToCurrency(display: number, decimals: number, multiplier = 1): number {
  const factor = 10 ** decimals
  const scaled = stripFloatError(Math.abs(display * multiplier) * factor)
  const rounded = (Math.sign(display) * Math.round(scaled)) / factor / multiplier
  return stripFloatError(rounded) + 0 // + 0 normalizes -0 to 0
}

/** true when display*multiplier has at most `decimals` fractional digits (float-tolerant). multiplier defaults 1 */
export function validateAmountPrecision(display: number, decimals: number, multiplier = 1): boolean {
  const scaled = stripFloatError(display * multiplier * 10 ** decimals)
  return Number.isInteger(scaled)
}

/** true when a raw text input string (e.g. "12.3", "12.", "") has <= decimals fractional digits; decimals 0 rejects any "." */
export function isAmountInputWithinPrecision(text: string, decimals: number): boolean {
  const dot = text.indexOf('.')
  if (dot === -1) return true
  if (decimals <= 0) return false
  return text.length - dot - 1 <= decimals
}

function groupThousands(integerDigits: string): string {
  return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * value is the STORED amount (not divided by multiplier). Fixed decimals (min=max=decimals),
 * thousands separators, negative sign kept, no currency symbol.
 * e.g. 5 USD -> "5.00", 1234.57 TWD -> "1,235", 1.5 KWD -> "1.500".
 * Formatted manually (no Intl) so Hermes and browsers agree.
 */
export function formatAmount(value: number, currency: string, settings?: CurrencySetting[]): string {
  const decimals = resolveDecimals(currency, settings)
  const rounded = roundToCurrency(value, decimals)
  const [integerPart, fractionPart] = Math.abs(rounded).toFixed(decimals).split('.')
  const sign = rounded < 0 ? '-' : ''
  const grouped = groupThousands(integerPart)
  return fractionPart ? `${sign}${grouped}.${fractionPart}` : `${sign}${grouped}`
}

// === Amount form helpers (shared by Web and APP) ===

export interface DecimalPlaceOption {
  /** null = follow the currency's default precision. */
  value: number | null
  label: string
}

/** Options for a currency's decimal-places picker: 預設（N）, 0 … MAX_CURRENCY_DECIMALS. */
export function decimalPlaceOptions(currency: string): DecimalPlaceOption[] {
  const options: DecimalPlaceOption[] = [
    { value: null, label: `預設（${defaultDecimals(currency)}）` },
  ]
  for (let d = 0; d <= MAX_CURRENCY_DECIMALS; d++) options.push({ value: d, label: String(d) })
  return options
}

function fractionDigits(text: string): number {
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

/**
 * Whether a keystroke changing an amount input from `prev` to `next` is accepted.
 *
 * With multiplier 1 the stored value is what the user types, so digits beyond the
 * currency's precision cannot be entered. An edit that does not ADD fractional digits
 * is still accepted, so a legacy over-precision amount stays editable (backspacing
 * through it would otherwise be blocked). With a multiplier other than 1 the stored
 * value is not what is typed, so everything is accepted and checked on submit.
 */
export function acceptAmountInput(
  next: string,
  prev: string,
  decimals: number,
  multiplier: number,
): boolean {
  if (multiplier !== 1) return true
  if (isAmountInputWithinPrecision(next, decimals)) return true
  return prev.includes('.') && next.includes('.') && fractionDigits(next) <= fractionDigits(prev)
}

export interface AmountPrecisionCheck {
  /** Current input text (display value, before × multiplier). */
  text: string
  currency: string
  decimals: number
  multiplier: number
  /**
   * Text the input started with when editing an existing record. When the amount is
   * unchanged from it, validation is skipped: legacy data may exceed the precision and
   * the user should not be forced to alter an amount they did not come to edit.
   */
  initialText?: string
  /** Field name used in the message, e.g. "金額". */
  label?: string
}

/** Returns a precision error message for an amount input, or null when it is acceptable. */
export function amountPrecisionError(check: AmountPrecisionCheck): string | null {
  const { text, currency, decimals, multiplier, initialText, label = '金額' } = check
  if (initialText !== undefined && text === initialText) return null
  if (text.trim() === '') return null
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  if (initialText !== undefined && initialText.trim() !== '' && Number(initialText) === value) {
    return null
  }
  if (validateAmountPrecision(value, decimals, multiplier)) return null
  const rule = decimals === 0 ? '須為整數' : `最多 ${decimals} 位小數`
  return multiplier === 1
    ? `${label}超過 ${currency} 的精度（${rule}）`
    : `${label}超過 ${currency} 的精度：實際金額（輸入 × ${multiplier}）${rule}`
}

/**
 * Stored value -> display value, the inverse of the `× multiplier` applied on submit.
 * `toPrecision` strips the binary float noise a division leaves behind, so a stored
 * 81821 VND at multiplier 1000 reads as 81.821, not 81.82100000000001.
 */
export function toDisplayAmount(stored: number, multiplier: number): number {
  if (multiplier === 1 || multiplier === 0) return stored
  return Number((stored / multiplier).toPrecision(FLOAT_TOLERANCE_PRECISION))
}
