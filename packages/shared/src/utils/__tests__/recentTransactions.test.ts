import { describe, expect, it } from 'vitest'
import { filterRecentTransactions, formatLocalDate, recentDaysRange } from '../recentTransactions'

const tx = (id: string, occurred_at: string) => ({ id, occurred_at })
const ids = (list: { id: string }[]) => list.map((t) => t.id)

describe('recentDaysRange', () => {
  it('days = 3 covers the day before yesterday through today', () => {
    expect(recentDaysRange(new Date(2026, 9, 15, 10, 0), 3)).toEqual({
      start_date: '2026-10-13',
      end_date: '2026-10-15',
    })
  })

  it('crosses month and year boundaries', () => {
    expect(recentDaysRange(new Date(2026, 2, 1), 3)).toEqual({
      start_date: '2026-02-27',
      end_date: '2026-03-01',
    })
    expect(recentDaysRange(new Date(2027, 0, 2), 3)).toEqual({
      start_date: '2026-12-31',
      end_date: '2027-01-02',
    })
  })

  it('clamps days below 1 to just today', () => {
    expect(recentDaysRange(new Date(2026, 9, 15), 0)).toEqual({
      start_date: '2026-10-15',
      end_date: '2026-10-15',
    })
  })

  it('uses local calendar day, not UTC (just after local midnight)', () => {
    const now = new Date(2026, 9, 15, 0, 5)
    expect(formatLocalDate(now)).toBe('2026-10-15')
    expect(recentDaysRange(now, 1).end_date).toBe('2026-10-15')
  })
})

describe('filterRecentTransactions', () => {
  const now = new Date(2026, 9, 15, 9, 30)

  it('keeps transactions within the last 3 days inclusive of both bounds', () => {
    const list = [
      tx('today', '2026-10-15T23:59:00+08:00'),
      tx('start', '2026-10-13T00:00:00+08:00'),
      tx('too-old', '2026-10-12T23:59:59+08:00'),
    ]
    expect(ids(filterRecentTransactions(list, now, 3))).toEqual(['today', 'start'])
  })

  it('excludes future-dated transactions (e.g. scheduled card payments)', () => {
    const list = [tx('tomorrow', '2026-10-16T00:00:00+08:00'), tx('today', '2026-10-15T08:00:00+08:00')]
    expect(ids(filterRecentTransactions(list, now, 3))).toEqual(['today'])
  })

  it('returns an empty array for empty input', () => {
    expect(filterRecentTransactions([], now, 3)).toEqual([])
  })

  it('handles a window that crosses into the previous month', () => {
    const list = [
      tx('mar-1', '2026-03-01T12:00:00+08:00'),
      tx('feb-28', '2026-02-28T12:00:00+08:00'),
      tx('feb-27', '2026-02-27T12:00:00+08:00'),
      tx('feb-26', '2026-02-26T12:00:00+08:00'),
    ]
    expect(ids(filterRecentTransactions(list, new Date(2026, 2, 1, 8), 3))).toEqual([
      'mar-1',
      'feb-28',
      'feb-27',
    ])
  })

  it('preserves input order and element identity', () => {
    const a = tx('a', '2026-10-14T00:00:00+08:00')
    const b = tx('b', '2026-10-15T00:00:00+08:00')
    const result = filterRecentTransactions([a, b], now, 3)
    expect(result[0]).toBe(a)
    expect(result[1]).toBe(b)
  })
})
