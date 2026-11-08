import { describe, expect, it } from 'vitest'
import type { TpassMonthlySummary } from '../../types'
import { tpassMonthBreakdown } from '../tpassSummary'

const summary = (overrides: Partial<TpassMonthlySummary> = {}): TpassMonthlySummary => ({
  id: 's', user_id: 'u', card_id: 'c', year: 2026, month: 10, query_date: '2026-11-05',
  short_bus_count: 32, short_bus_amount: 480, short_bus_official_reward: 72, short_bus_green_reward: 0,
  intercity_bus_count: 4, intercity_bus_amount: 520, intercity_bus_official_reward: 78, intercity_bus_green_reward: 0,
  taipei_metro_count: 41, taipei_metro_amount: 1025, taipei_metro_official_reward: 103, taipei_metro_green_reward: 59,
  tra_count: 0, tra_amount: 0, tra_official_reward: 0, tra_green_reward: 0,
  new_taipei_metro_count: 0, new_taipei_metro_amount: 0, new_taipei_metro_official_reward: 0, new_taipei_metro_green_reward: 0,
  rail_count: 41, rail_amount: 1025,
  official_total_reward_amount: 312, estimated_total_reward_amount: 324, calculation_delta_amount: -12,
  calculated_at: '', created_at: '', updated_at: '',
  ...overrides,
})

describe('tpassMonthBreakdown', () => {
  it('lists the five modes in order and sums reward and green', () => {
    const b = tpassMonthBreakdown(summary())
    expect(b.rows.map((r) => r.label)).toEqual(['短途公車', '中長途國道', '臺北捷運', '臺鐵', '新北捷運'])
    expect(b.rows[2]).toMatchObject({ count: 41, amount: 1025, reward: 103, green: 59 })
    expect(b.rewardSum).toBe(253)
    expect(b.greenSum).toBe(59)
    expect(b.officialTotal).toBe(312)
    expect(b.matches).toBe(true)
  })

  it('flags a mismatch but keeps the official total', () => {
    const b = tpassMonthBreakdown(summary({ official_total_reward_amount: 300 }))
    expect(b.matches).toBe(false)
    expect(b.officialTotal).toBe(300)
  })
})
