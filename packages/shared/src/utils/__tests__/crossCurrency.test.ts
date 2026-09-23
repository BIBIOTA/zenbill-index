import { describe, expect, it } from 'vitest'
import {
  computeCrossCurrencyAmount,
  isCrossCurrencyTransfer,
  buildTransferPayloadFields,
  shouldPrefillRate,
} from '../crossCurrency'

const TWO_DP = {
  sourcePrecision: { decimals: 2, multiplier: 1 },
  targetPrecision: { decimals: 2, multiplier: 1 },
}

describe('computeCrossCurrencyAmount', () => {
  it('Derive target amount from source and rate', () => {
    const result = computeCrossCurrencyAmount({
      ...TWO_DP,
      source: 100,
      target: 0,
      rate: 0.0317,
      lastEdited: ['source', 'rate'],
    })
    // target = source / rate = 100 / 0.0317 = 3154.57..., rounded to 2 dp
    expect(result.target).toBe(3154.57)
    expect(result.source).toBe(100)
    expect(result.rate).toBe(0.0317)
  })

  it('Derive source amount from target and rate', () => {
    const result = computeCrossCurrencyAmount({
      ...TWO_DP,
      source: 0,
      target: 3150,
      rate: 0.0317,
      lastEdited: ['target', 'rate'],
    })
    // source = target * rate = 3150 * 0.0317 = 99.855, rounded to 2 dp
    expect(result.source).toBe(99.86)
    expect(result.target).toBe(3150)
    expect(result.rate).toBe(0.0317)
  })

  it('Derive rate from source and target', () => {
    const result = computeCrossCurrencyAmount({
      ...TWO_DP,
      source: 100,
      target: 3150,
      rate: 0,
      lastEdited: ['source', 'target'],
    })
    // rate = source / target = 100 / 3150 = 0.031746..., rounded to 4 dp
    expect(result.rate).toBe(0.0317)
    expect(result.source).toBe(100)
    expect(result.target).toBe(3150)
  })

  it('Auto-compute on field edits (derives from the two most recently edited fields)', () => {
    // Three edits in order source → rate → target; the last two distinct are
    // target + rate, so the missing field is source.
    const result = computeCrossCurrencyAmount({
      ...TWO_DP,
      source: 0,
      target: 3150,
      rate: 0.0317,
      lastEdited: ['source', 'rate', 'target'],
    })
    expect(result.source).toBe(99.86)
  })

  it('Compute the empty amount from a prefilled rate', () => {
    // Rate is present (auto-prefilled, NOT in lastEdited); only source entered.
    // The single-empty-field rule must compute target from source and rate.
    const result = computeCrossCurrencyAmount({
      ...TWO_DP,
      source: 1000,
      target: 0,
      rate: 31.6456,
      lastEdited: ['source'],
    })
    expect(result.target).toBeCloseTo(31.6, 1) // 1000 / 31.6456 ≈ 31.6
    expect(result.source).toBe(1000)
    expect(result.rate).toBe(31.6456)
  })

  it('Re-editing an amount recomputes the other from the rate', () => {
    // target already holds a stale value (e.g. from an earlier keystroke);
    // editing source again must recompute target from the rate, not freeze.
    const result = computeCrossCurrencyAmount({
      ...TWO_DP,
      source: 1000,
      target: 0.03, // stale from a prior source=1 keystroke
      rate: 31.6456,
      lastEdited: ['source'],
    })
    expect(result.target).toBeCloseTo(31.6, 1)
    expect(result.source).toBe(1000)
  })

  it('Guard against invalid or insufficient input', () => {
    // fewer than two fields edited → unchanged
    const single = computeCrossCurrencyAmount({
      ...TWO_DP,
      source: 100,
      target: 0,
      rate: 0,
      lastEdited: ['source'],
    })
    expect(single).toEqual({ source: 100, target: 0, rate: 0 })

    // a participating value <= 0 → no computation
    const zeroRate = computeCrossCurrencyAmount({
      ...TWO_DP,
      source: 100,
      target: 0,
      rate: 0,
      lastEdited: ['source', 'rate'],
    })
    expect(zeroRate).toEqual({ source: 100, target: 0, rate: 0 })
  })

  it('Round to zero decimals for an integer currency (TWD → JPY)', () => {
    const result = computeCrossCurrencyAmount({
      source: 16577,
      target: 0,
      rate: 0.2026,
      lastEdited: ['source'],
      sourcePrecision: { decimals: 0, multiplier: 1 },
      targetPrecision: { decimals: 0, multiplier: 1 },
    })
    // 16577 / 0.2026 = 81821.32... → 81821
    expect(result.target).toBe(81821)
    expect(result.source).toBe(16577)
  })

  it('Keep the rate after rounding', () => {
    const result = computeCrossCurrencyAmount({
      source: 16577,
      target: 0,
      rate: 0.2026,
      lastEdited: ['rate'],
      sourcePrecision: { decimals: 0, multiplier: 1 },
      targetPrecision: { decimals: 0, multiplier: 1 },
    })
    expect(result.target).toBe(81821)
    expect(result.rate).toBe(0.2026)
  })

  it('Round a computed source amount to the SOURCE currency precision', () => {
    // TWD (0 dp) source, USD (2 dp) target
    const result = computeCrossCurrencyAmount({
      source: 0,
      target: 100.5,
      rate: 31.337,
      lastEdited: ['target'],
      sourcePrecision: { decimals: 0, multiplier: 1 },
      targetPrecision: { decimals: 2, multiplier: 1 },
    })
    // 100.5 * 31.337 = 3149.3685 → 3149
    expect(result.source).toBe(3149)
    expect(result.target).toBe(100.5)
    expect(result.rate).toBe(31.337)
  })

  it('Round to three decimals for a three-decimal currency (KWD)', () => {
    const result = computeCrossCurrencyAmount({
      source: 1000,
      target: 0,
      rate: 101.2345,
      lastEdited: ['source'],
      sourcePrecision: { decimals: 0, multiplier: 1 },
      targetPrecision: { decimals: 3, multiplier: 1 },
    })
    // 1000 / 101.2345 = 9.87805...
    expect(result.target).toBe(9.878)
  })

  it('Apply precision to the stored value when a multiplier applies (VND x1000)', () => {
    const result = computeCrossCurrencyAmount({
      source: 100,
      target: 0,
      rate: 1.2345,
      lastEdited: ['source'],
      sourcePrecision: { decimals: 0, multiplier: 1 },
      targetPrecision: { decimals: 0, multiplier: 1000 },
    })
    // 100 / 1.2345 = 81.00445 (display, in thousands of VND) → stored 81004.45 → 81004 → 81.004
    expect(result.target).toBe(81.004)
  })

  it('Derived rate stays at 4 decimals regardless of amount precision', () => {
    const result = computeCrossCurrencyAmount({
      source: 16577,
      target: 81821,
      rate: 0,
      lastEdited: ['source', 'target'],
      sourcePrecision: { decimals: 0, multiplier: 1 },
      targetPrecision: { decimals: 0, multiplier: 1 },
    })
    // 16577 / 81821 = 0.202601...
    expect(result.rate).toBe(0.2026)
    expect(result.source).toBe(16577)
    expect(result.target).toBe(81821)
  })
})

describe('isCrossCurrencyTransfer', () => {
  it('Detect cross-currency transfer', () => {
    expect(isCrossCurrencyTransfer('TRANSFER', 'USD', 'TWD')).toBe(true)
  })

  it('Same-currency transfer keeps the single-amount flow', () => {
    expect(isCrossCurrencyTransfer('TRANSFER', 'TWD', 'TWD')).toBe(false)
    expect(isCrossCurrencyTransfer('EXPENSE', 'USD', 'TWD')).toBe(false)
    // missing target currency (no target account selected yet)
    expect(isCrossCurrencyTransfer('TRANSFER', 'USD', undefined)).toBe(false)
  })
})

describe('buildTransferPayloadFields', () => {
  it('Submit a cross-currency transfer payload', () => {
    const fields = buildTransferPayloadFields({
      isCrossCurrency: true,
      sourceAmount: 100,
      targetAmount: 3150,
      rate: 0.0317,
      targetCurrency: 'TWD',
      sourceMultiplier: 1,
      targetMultiplier: 1,
    })
    expect(fields).toEqual({
      amount: 100,
      original_amount: 3150,
      original_currency: 'TWD',
      exchange_rate: 0.0317,
    })
  })

  it('applies source and target multipliers to the amounts', () => {
    const fields = buildTransferPayloadFields({
      isCrossCurrency: true,
      sourceAmount: 5,
      targetAmount: 3,
      rate: 1.5,
      targetCurrency: 'JPY',
      sourceMultiplier: 10000,
      targetMultiplier: 1000,
    })
    expect(fields.amount).toBe(50000)
    expect(fields.original_amount).toBe(3000)
  })

  it('Omit cross-currency fields for non-cross-currency transactions', () => {
    const fields = buildTransferPayloadFields({
      isCrossCurrency: false,
      sourceAmount: 100,
      targetAmount: 0,
      rate: 0,
      targetCurrency: 'TWD',
      sourceMultiplier: 1,
      targetMultiplier: 1,
    })
    expect(fields).toEqual({
      amount: 100,
      original_amount: undefined,
      original_currency: undefined,
      exchange_rate: undefined,
    })
  })
})

describe('shouldPrefillRate', () => {
  it('Prefill the rate once and respect manual overrides', () => {
    // cross-currency + rate not yet manually edited → prefill
    expect(shouldPrefillRate(true, false)).toBe(true)
    // once the user edits the rate manually → stop overwriting
    expect(shouldPrefillRate(true, true)).toBe(false)
    // not cross-currency → never prefill
    expect(shouldPrefillRate(false, false)).toBe(false)
  })
})
