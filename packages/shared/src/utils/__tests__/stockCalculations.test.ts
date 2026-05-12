import { describe, expect, it } from 'vitest'
import type { Account } from '../../types'
import {
  calculateStockDailyPerformance,
  calculateStockDailySummary,
} from '../stockCalculations'

function stock(overrides: Partial<Account>): Account {
  return {
    id: 'stock-1',
    user_id: 'user-1',
    name: '台積電',
    type: 'STOCK',
    currency: 'TWD',
    balance: 58000,
    bank_id: null,
    passbook_number: '',
    closing_day: null,
    payment_due_day: null,
    auto_pay_from_id: null,
    auto_pay_enabled: false,
    stock_symbol: '2330.TW',
    stock_market: 'TW',
    shares_held: 100,
    avg_cost_price: 500,
    last_price: 580,
    previous_close_price: 570,
    day_change: 10,
    day_change_percent: 1.7544,
    last_price_at: '2026-05-12T09:30:00Z',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-12T09:30:00Z',
    ...overrides,
  }
}

describe('calculateStockDailyPerformance', () => {
  it('calculates daily pnl from day change and shares', () => {
    expect(calculateStockDailyPerformance(stock({}))).toEqual({
      pnl: 1000,
      pnlPercent: 1.7544,
      previousMarketValue: 57000,
    })
  })

  it('returns null when previous close is missing', () => {
    expect(calculateStockDailyPerformance(stock({ previous_close_price: null }))).toBeNull()
  })

  it('returns null when day change is missing', () => {
    expect(calculateStockDailyPerformance(stock({ day_change: null }))).toBeNull()
  })
})

describe('calculateStockDailySummary', () => {
  it('aggregates only stocks with complete daily performance data', () => {
    const result = calculateStockDailySummary([
      stock({ id: 'tw-1', currency: 'TWD', shares_held: 100, previous_close_price: 570, day_change: 10 }),
      stock({ id: 'tw-2', currency: 'TWD', shares_held: 10, previous_close_price: 100, day_change: -2 }),
      stock({ id: 'tw-3', currency: 'TWD', shares_held: 10, previous_close_price: null, day_change: 3 }),
    ])

    expect(result).toEqual({
      pnl: 980,
      pnlPercent: 1.6896551724137931,
      previousMarketValue: 58000,
      includedCount: 2,
    })
  })

  it('returns null when no stock has complete daily performance data', () => {
    expect(calculateStockDailySummary([
      stock({ previous_close_price: null }),
      stock({ day_change: null }),
    ])).toBeNull()
  })
})
