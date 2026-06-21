import { describe, expect, it } from 'vitest'
import { computeCrossCurrencyAmount } from '../crossCurrency'

describe('computeCrossCurrencyAmount', () => {
  it('Derive target amount from source and rate', () => {
    const result = computeCrossCurrencyAmount({
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

  it('Derive from the two most recently edited fields', () => {
    // Three edits in order source → rate → target; the last two distinct are
    // target + rate, so the missing field is source.
    const result = computeCrossCurrencyAmount({
      source: 0,
      target: 3150,
      rate: 0.0317,
      lastEdited: ['source', 'rate', 'target'],
    })
    expect(result.source).toBe(99.86)
  })

  it('Guard against invalid or insufficient input', () => {
    // fewer than two fields edited → unchanged
    const single = computeCrossCurrencyAmount({
      source: 100,
      target: 0,
      rate: 0,
      lastEdited: ['source'],
    })
    expect(single).toEqual({ source: 100, target: 0, rate: 0 })

    // a participating value <= 0 → no computation
    const zeroRate = computeCrossCurrencyAmount({
      source: 100,
      target: 0,
      rate: 0,
      lastEdited: ['source', 'rate'],
    })
    expect(zeroRate).toEqual({ source: 100, target: 0, rate: 0 })
  })
})
