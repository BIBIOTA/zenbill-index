import { describe, it, expect } from 'vitest'
import { parseStockTransactionNote } from '../stockTransaction'

describe('parseStockTransactionNote', () => {
  it('parses a standard buy note', () => {
    const result = parseStockTransactionNote('Buy 100 shares of 2330 @ 500.00')
    expect(result).toEqual({
      action: 'buy',
      shares: 100,
      symbol: '2330',
      pricePerShare: 500,
      isExistingHolding: false,
    })
  })

  it('parses a standard sell note', () => {
    const result = parseStockTransactionNote('Sell 50 shares of AAPL @ 150.25')
    expect(result).toEqual({
      action: 'sell',
      shares: 50,
      symbol: 'AAPL',
      pricePerShare: 150.25,
      isExistingHolding: false,
    })
  })

  it('parses buy with existing holding suffix', () => {
    const result = parseStockTransactionNote('Buy 2000 shares of 0050.TW @ 52.50 (計入既有持股)')
    expect(result).toEqual({
      action: 'buy',
      shares: 2000,
      symbol: '0050.TW',
      pricePerShare: 52.5,
      isExistingHolding: true,
    })
  })

  it('parses fractional shares', () => {
    const result = parseStockTransactionNote('Buy 0.5 shares of AAPL @ 150.00')
    expect(result).toEqual({
      action: 'buy',
      shares: 0.5,
      symbol: 'AAPL',
      pricePerShare: 150,
      isExistingHolding: false,
    })
  })

  it('returns null for non-matching notes', () => {
    expect(parseStockTransactionNote('Some random note')).toBeNull()
    expect(parseStockTransactionNote('')).toBeNull()
    expect(parseStockTransactionNote('Transfer to savings')).toBeNull()
  })
})
