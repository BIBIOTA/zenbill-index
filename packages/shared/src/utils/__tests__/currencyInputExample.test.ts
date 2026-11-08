import { describe, expect, it } from 'vitest'
import { currencyInputExample } from '../currencyPrecision'

describe('currencyInputExample', () => {
  it('multiplier 1, 0 decimals', () => {
    expect(currencyInputExample('TWD', 1, null)).toEqual({ input: '1280', amount: '1,280' })
  })
  it('multiplier 1, 2 decimals', () => {
    expect(currencyInputExample('USD', 1, null)).toEqual({ input: '12.5', amount: '12.50' })
    expect(currencyInputExample('TWD', 1, 2)).toEqual({ input: '12.5', amount: '12.50' })
  })
  it('multiplier 1000, 0 decimals', () => {
    expect(currencyInputExample('VND', 1000, null)).toEqual({ input: '50.5', amount: '50,500' })
  })
  it('multiplier 1000, 2 decimals', () => {
    expect(currencyInputExample('VND', 1000, 2)).toEqual({ input: '50.5', amount: '50,500.00' })
  })
  it('rejects an invalid multiplier', () => {
    expect(currencyInputExample('TWD', 0, null)).toBeNull()
    expect(currencyInputExample('TWD', Number.NaN, null)).toBeNull()
  })
})
