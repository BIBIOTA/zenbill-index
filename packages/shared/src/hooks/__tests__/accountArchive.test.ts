import { describe, expect, it } from 'vitest'
import { selectableAccounts } from '../useAccounts'

const acc = (id: string, archived_at?: string | null) => ({ id, archived_at })

describe('selectableAccounts', () => {
  it('excludes archived accounts and keeps order', () => {
    const list = [acc('a', null), acc('b', '2026-10-01T00:00:00Z'), acc('c', null)]
    expect(selectableAccounts(list).map((a) => a.id)).toEqual(['a', 'c'])
  })

  it('treats a missing archived_at (older API) as not archived', () => {
    expect(selectableAccounts([acc('a')]).map((a) => a.id)).toEqual(['a'])
  })

  it('keeps archived accounts listed in keepIds, ignoring null / undefined ids', () => {
    const list = [acc('a', '2026-10-01T00:00:00Z'), acc('b', '2026-10-01T00:00:00Z')]
    expect(selectableAccounts(list, ['b', null, undefined]).map((a) => a.id)).toEqual(['b'])
  })

  it('returns an empty array for empty input', () => {
    expect(selectableAccounts([])).toEqual([])
  })
})
