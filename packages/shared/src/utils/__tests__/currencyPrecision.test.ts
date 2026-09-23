import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CURRENCY_DECIMAL_OVERRIDES,
  DEFAULT_CURRENCY_DECIMALS,
  ISO_4217_DECIMALS,
  MAX_CURRENCY_DECIMALS,
  acceptAmountInput,
  amountPrecisionError,
  decimalPlaceOptions,
  defaultDecimals,
  formatAmount,
  isAmountInputWithinPrecision,
  resolveDecimals,
  roundToCurrency,
  validateAmountPrecision,
} from '../currencyPrecision'
import type { CurrencySetting } from '../../types'

describe('constants', () => {
  it('overrides TWD / JPY / KRW / VND to 0', () => {
    expect(CURRENCY_DECIMAL_OVERRIDES).toEqual({ TWD: 0, JPY: 0, KRW: 0, VND: 0 })
  })

  it('exposes the default and the maximum', () => {
    expect(DEFAULT_CURRENCY_DECIMALS).toBe(2)
    expect(MAX_CURRENCY_DECIMALS).toBe(4)
  })

  it('ISO table keeps TWD at 2 (the override is what makes it 0)', () => {
    expect(ISO_4217_DECIMALS.TWD).toBe(2)
    expect(ISO_4217_DECIMALS.USD).toBe(2)
    expect(ISO_4217_DECIMALS.JPY).toBe(0)
  })
})

describe('resolveDecimals', () => {
  it('User setting takes precedence', () => {
    const settings: CurrencySetting[] = [{ currency_code: 'USD', multiplier: 1, decimal_places: 1 }]
    expect(resolveDecimals('USD', settings)).toBe(1)
  })

  it('User setting of 0 is honoured (not treated as falsy)', () => {
    const settings: CurrencySetting[] = [{ currency_code: 'USD', multiplier: 1, decimal_places: 0 }]
    expect(resolveDecimals('USD', settings)).toBe(0)
  })

  it('User setting can override a built-in override', () => {
    const settings: CurrencySetting[] = [{ currency_code: 'TWD', multiplier: 1, decimal_places: 2 }]
    expect(resolveDecimals('TWD', settings)).toBe(2)
  })

  it('null / missing decimal_places falls through to the defaults', () => {
    const settings: CurrencySetting[] = [
      { currency_code: 'TWD', multiplier: 1, decimal_places: null },
      { currency_code: 'KWD', multiplier: 1000 },
    ]
    expect(resolveDecimals('TWD', settings)).toBe(0)
    expect(resolveDecimals('KWD', settings)).toBe(3)
  })

  it('ignores settings of other currencies', () => {
    const settings: CurrencySetting[] = [{ currency_code: 'EUR', multiplier: 1, decimal_places: 4 }]
    expect(resolveDecimals('USD', settings)).toBe(2)
  })

  it.each(['TWD', 'JPY', 'KRW', 'VND'])('Built-in override: %s resolves to 0', (code) => {
    expect(resolveDecimals(code)).toBe(0)
    expect(resolveDecimals(code, [])).toBe(0)
  })

  it.each(['KWD', 'BHD', 'OMR', 'JOD', 'TND', 'IQD', 'LYD'])(
    'ISO 4217 minor unit: %s resolves to 3',
    (code) => {
      expect(resolveDecimals(code)).toBe(3)
    },
  )

  it('Unknown currency falls back to 2', () => {
    expect(resolveDecimals('XYZ')).toBe(2)
    expect(resolveDecimals('')).toBe(2)
  })

  it('is case-insensitive on the currency code', () => {
    expect(resolveDecimals('twd')).toBe(0)
    const settings: CurrencySetting[] = [{ currency_code: 'USD', multiplier: 1, decimal_places: 3 }]
    expect(resolveDecimals('usd', settings)).toBe(3)
  })

  it('does not use Intl', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../currencyPrecision.ts', import.meta.url)),
      'utf8',
    )
    expect(src).not.toMatch(/\bIntl\./)
    expect(src).not.toMatch(/toLocaleString/)
  })
})

describe('defaultDecimals', () => {
  it('ignores user settings: override -> ISO -> 2', () => {
    expect(defaultDecimals('TWD')).toBe(0)
    expect(defaultDecimals('USD')).toBe(2)
    expect(defaultDecimals('KWD')).toBe(3)
    expect(defaultDecimals('XYZ')).toBe(2)
  })
})

describe('roundToCurrency', () => {
  it('rounds half-up to the given decimals', () => {
    expect(roundToCurrency(81821.32, 0)).toBe(81821)
    expect(roundToCurrency(2.5, 0)).toBe(3)
    expect(roundToCurrency(1.2345, 3)).toBe(1.235)
  })

  it('tolerates floating-point error (1.005 @2 -> 1.01)', () => {
    expect(roundToCurrency(1.005, 2)).toBe(1.01)
    expect(roundToCurrency(1.015, 2)).toBe(1.02)
    expect(roundToCurrency(8.345, 2)).toBe(8.35)
  })

  it('rounds negatives symmetrically (half away from zero)', () => {
    expect(roundToCurrency(-2.5, 0)).toBe(-3)
    expect(roundToCurrency(-1.005, 2)).toBe(-1.01)
  })

  it('applies precision to the stored value (display x multiplier)', () => {
    // VND 0 decimals, multiplier 1000: 50.5005 → stored 50500.5 → 50501 → 50.501
    expect(roundToCurrency(50.5005, 0, 1000)).toBe(50.501)
    expect(roundToCurrency(50.5, 0, 1000)).toBe(50.5)
  })

  it('defaults the multiplier to 1', () => {
    expect(roundToCurrency(3.14159, 2)).toBe(3.14)
  })
})

describe('validateAmountPrecision', () => {
  it('VND (0 dp) with multiplier 1000: 50.5 passes, 50.5005 fails', () => {
    expect(validateAmountPrecision(50.5, 0, 1000)).toBe(true)
    expect(validateAmountPrecision(50.5005, 0, 1000)).toBe(false)
  })

  it('checks fractional digits with multiplier 1 by default', () => {
    expect(validateAmountPrecision(12, 0)).toBe(true)
    expect(validateAmountPrecision(12.3, 0)).toBe(false)
    expect(validateAmountPrecision(12.34, 2)).toBe(true)
    expect(validateAmountPrecision(12.345, 2)).toBe(false)
  })

  it('tolerates floating-point error', () => {
    // 1.1 * 3 = 3.3000000000000003, 0.1 + 0.2 = 0.30000000000000004
    expect(validateAmountPrecision(1.1 * 3, 1)).toBe(true)
    expect(validateAmountPrecision(0.1 + 0.2, 1)).toBe(true)
    expect(validateAmountPrecision(1.005, 3)).toBe(true)
  })

  it('handles negatives', () => {
    expect(validateAmountPrecision(-12.34, 2)).toBe(true)
    expect(validateAmountPrecision(-12.345, 2)).toBe(false)
  })
})

describe('isAmountInputWithinPrecision', () => {
  it('accepts empty and integer input', () => {
    expect(isAmountInputWithinPrecision('', 0)).toBe(true)
    expect(isAmountInputWithinPrecision('123', 0)).toBe(true)
  })

  it('0 decimals rejects any decimal point', () => {
    expect(isAmountInputWithinPrecision('12.', 0)).toBe(false)
    expect(isAmountInputWithinPrecision('12.3', 0)).toBe(false)
  })

  it('limits fractional digits to decimals', () => {
    expect(isAmountInputWithinPrecision('12.', 2)).toBe(true)
    expect(isAmountInputWithinPrecision('12.3', 2)).toBe(true)
    expect(isAmountInputWithinPrecision('12.34', 2)).toBe(true)
    expect(isAmountInputWithinPrecision('12.345', 2)).toBe(false)
    expect(isAmountInputWithinPrecision('.5', 1)).toBe(true)
  })
})

describe('formatAmount', () => {
  it('Pad to the currency precision: 5 USD -> 5.00', () => {
    expect(formatAmount(5, 'USD')).toBe('5.00')
  })

  it('Round for display: 1234.57 TWD -> 1,235', () => {
    expect(formatAmount(1234.57, 'TWD')).toBe('1,235')
  })

  it('Three-decimal currency: 1.5 KWD -> 1.500', () => {
    expect(formatAmount(1.5, 'KWD')).toBe('1.500')
  })

  it('adds thousands separators and keeps the negative sign', () => {
    expect(formatAmount(1234567.891, 'USD')).toBe('1,234,567.89')
    expect(formatAmount(-1234.5, 'USD')).toBe('-1,234.50')
    expect(formatAmount(-999, 'JPY')).toBe('-999')
    expect(formatAmount(1000, 'JPY')).toBe('1,000')
  })

  it('does not print a negative zero', () => {
    expect(formatAmount(-0.4, 'TWD')).toBe('0')
    expect(formatAmount(0, 'USD')).toBe('0.00')
  })

  it('rounds half-up with float tolerance', () => {
    expect(formatAmount(1.005, 'USD')).toBe('1.01')
  })

  it('honours the user setting (stored value is not changed)', () => {
    const settings: CurrencySetting[] = [{ currency_code: 'USD', multiplier: 1, decimal_places: 0 }]
    const stored = 12.34
    expect(formatAmount(stored, 'USD', settings)).toBe('12')
    expect(stored).toBe(12.34)
  })
})

describe('decimalPlaceOptions', () => {
  it('offers the default first, labelled with the currency default', () => {
    expect(decimalPlaceOptions('TWD')[0]).toEqual({ value: null, label: '預設（0）' })
    expect(decimalPlaceOptions('USD')[0]).toEqual({ value: null, label: '預設（2）' })
  })

  it('offers 0 through the maximum', () => {
    expect(decimalPlaceOptions('USD').map((o) => o.value)).toEqual([null, 0, 1, 2, 3, 4])
  })
})

describe('acceptAmountInput', () => {
  it('blocks digits beyond the precision when the multiplier is 1', () => {
    expect(acceptAmountInput('12.3', '12', 0, 1)).toBe(false)
    expect(acceptAmountInput('12.345', '12.34', 2, 1)).toBe(false)
    expect(acceptAmountInput('12.34', '12.3', 2, 1)).toBe(true)
  })

  it('keeps a legacy over-precision amount editable', () => {
    // A stored 12.345 TWD (0 decimals): backspacing must not be blocked.
    expect(acceptAmountInput('12.34', '12.345', 0, 1)).toBe(true)
    expect(acceptAmountInput('12.3', '12.34', 0, 1)).toBe(true)
    // ...but adding a digit back is.
    expect(acceptAmountInput('12.34', '12.3', 0, 1)).toBe(false)
  })

  it('accepts anything when the multiplier is not 1, since submit validates', () => {
    expect(acceptAmountInput('50.5005', '50.500', 0, 1000)).toBe(true)
  })
})

describe('amountPrecisionError', () => {
  const twd = { currency: 'TWD', decimals: 0, multiplier: 1 }

  it('returns null for an amount within precision', () => {
    expect(amountPrecisionError({ ...twd, text: '100' })).toBeNull()
  })

  it('reports an integer-only currency', () => {
    expect(amountPrecisionError({ ...twd, text: '100.5' })).toBe('金額超過 TWD 的精度（須為整數）')
  })

  it('names the field and the stored value when a multiplier applies', () => {
    expect(
      amountPrecisionError({
        text: '50.5005',
        currency: 'VND',
        decimals: 0,
        multiplier: 1000,
        label: '轉入金額',
      }),
    ).toBe('轉入金額超過 VND 的精度：實際金額（輸入 × 1000）須為整數')
    expect(
      amountPrecisionError({ text: '50.5', currency: 'VND', decimals: 0, multiplier: 1000 }),
    ).toBeNull()
  })

  it('skips validation when an existing amount is unchanged', () => {
    expect(amountPrecisionError({ ...twd, text: '12.345', initialText: '12.345' })).toBeNull()
    // Same value written differently is still unchanged.
    expect(amountPrecisionError({ ...twd, text: '12.3450', initialText: '12.345' })).toBeNull()
    // Actually changing it is validated.
    expect(amountPrecisionError({ ...twd, text: '12.346', initialText: '12.345' })).not.toBeNull()
  })

  it('ignores empty and unparseable input, which other validation reports', () => {
    expect(amountPrecisionError({ ...twd, text: '' })).toBeNull()
    expect(amountPrecisionError({ ...twd, text: 'abc' })).toBeNull()
    expect(amountPrecisionError({ ...twd, text: '100.5', initialText: '' })).not.toBeNull()
  })
})
