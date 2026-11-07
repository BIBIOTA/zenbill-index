import { describe, expect, it } from 'vitest'
import { formatDayLabel, formatLongDate, groupTransactionsByDay } from '../recentTransactions'

const tx = (occurred_at: string, type: string, amount: number, currency?: string) => ({
  occurred_at,
  type,
  amount,
  account: currency ? { currency } : undefined,
})

describe('groupTransactionsByDay', () => {
  it('groups adjacent transactions by date and nets income minus expense', () => {
    const groups = groupTransactionsByDay([
      tx('2026-11-07T09:00:00+08:00', 'EXPENSE', 89, 'TWD'),
      tx('2026-11-06T12:00:00+08:00', 'EXPENSE', 2560, 'TWD'),
      tx('2026-11-06T10:00:00+08:00', 'TRANSFER', 3120, 'TWD'),
      tx('2026-11-06T08:00:00+08:00', 'INCOME', 100),
    ])
    expect(groups.map((g) => g.date)).toEqual(['2026-11-07', '2026-11-06'])
    expect(groups[1].items).toHaveLength(3)
    expect(groups[1].totals).toEqual([{ currency: 'TWD', amount: -2460 }])
  })

  it('keeps currencies separate', () => {
    const [g] = groupTransactionsByDay([
      tx('2026-11-07', 'EXPENSE', 89, 'TWD'),
      tx('2026-11-07', 'EXPENSE', 500, 'JPY'),
    ])
    expect(g.totals).toEqual([
      { currency: 'TWD', amount: -89 },
      { currency: 'JPY', amount: -500 },
    ])
  })

  it('leaves totals empty for a transfer-only day', () => {
    const [g] = groupTransactionsByDay([tx('2026-11-07', 'TRANSFER', 1000, 'TWD')])
    expect(g.totals).toEqual([])
  })
})

describe('formatDayLabel / formatLongDate', () => {
  const now = new Date(2026, 10, 7, 15, 0)
  it('prefixes today', () => {
    expect(formatDayLabel('2026-11-07', now)).toBe('今天 11/07（六）')
    expect(formatDayLabel('2026-11-05', now)).toBe('11/05（四）')
  })
  it('formats the page date', () => {
    expect(formatLongDate(now)).toBe('11 月 7 日（六）')
  })
})
