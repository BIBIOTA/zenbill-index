import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { tpassKeys, tpassInvalidators } from '../useTpass'
import * as shared from '../../index'

describe('tpass query key factory', () => {
  it('produces stable status/cards/card keys', () => {
    expect(tpassKeys.all).toEqual(['tpass'])
    expect(tpassKeys.status()).toEqual(['tpass', 'status'])
    expect(tpassKeys.cards()).toEqual(['tpass', 'cards'])
    expect(tpassKeys.card('abc')).toEqual(['tpass', 'card', 'abc'])
  })

  it('embeds the filter in the summaries key', () => {
    const filter = { card_id: 'c1', year: 2026, month: 6 }
    expect(tpassKeys.summaries(filter)).toEqual(['tpass', 'summaries', filter])
  })

  it('nests card keys under the tpass prefix so invalidating ["tpass"] covers them', () => {
    // The sync mutation invalidates tpassKeys.all (["tpass"]); react-query
    // treats query keys as prefixes, so every card/status/summaries key here
    // must start with "tpass".
    expect(tpassKeys.status()[0]).toBe('tpass')
    expect(tpassKeys.cards()[0]).toBe('tpass')
    expect(tpassKeys.card('x')[0]).toBe('tpass')
    expect(tpassKeys.summaries({})[0]).toBe('tpass')
  })
})

describe('tpass hooks are exported from the package entrypoint', () => {
  it('exposes all TPASS hooks', () => {
    const names = [
      'useTpassStatus',
      'useSetTpassCredentials',
      'useDeleteTpassCredentials',
      'useSyncTpass',
      'useTpassCards',
      'useTpassCard',
      'useLinkTpassCardAccount',
      'useTpassSummaries',
      'useAccountTpass',
    ] as const
    for (const name of names) {
      expect(typeof (shared as Record<string, unknown>)[name]).toBe('function')
    }
  })
})

/**
 * Query-invalidation coverage (task 6.4, deferred from 5.1).
 *
 * Approach: NO renderHook. The @zenbill/shared package has no DOM test
 * infrastructure — no react-dom, no jsdom/happy-dom, no @testing-library/react
 * in the package's (deliberately minimal) devDependencies. Adding a full React
 * DOM renderer just to mount mutation hooks would be disproportionate.
 *
 * Instead, each mutation's onSuccess body is extracted into an EXPORTED
 * `tpassInvalidators.*` helper that the hook itself calls. These tests invoke
 * the SAME helper against a spied real @tanstack/react-query QueryClient, so a
 * drift in any invalidation key fails here AND changes the hook's behaviour —
 * no duplicated contract table that can silently fall out of sync.
 *
 * We additionally seed real queries into the cache and assert the ["tpass"]
 * (sync) and ["accounts"] invalidations actually MATCH the relevant cached
 * queries via react-query's real prefix matching.
 */
describe('tpass mutation query invalidation', () => {
  const linkedCardId = 'card-123'

  let qc: QueryClient
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    qc = new QueryClient()
    spy = vi.spyOn(qc, 'invalidateQueries')
  })

  it('setCredentials invalidates only the status query', () => {
    tpassInvalidators.setCredentials(qc)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ queryKey: ['tpass', 'status'] })
  })

  it('deleteCredentials invalidates status + cards', () => {
    tpassInvalidators.deleteCredentials(qc)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenNthCalledWith(1, { queryKey: ['tpass', 'status'] })
    expect(spy).toHaveBeenNthCalledWith(2, { queryKey: ['tpass', 'cards'] })
  })

  it('sync invalidates the whole tpass tree + accounts', () => {
    tpassInvalidators.sync(qc)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenNthCalledWith(1, { queryKey: ['tpass'] })
    expect(spy).toHaveBeenNthCalledWith(2, { queryKey: ['accounts'] })
  })

  it('linkAccount invalidates cards + that card detail + accounts', () => {
    tpassInvalidators.linkAccount(qc, linkedCardId)
    expect(spy).toHaveBeenCalledTimes(3)
    expect(spy).toHaveBeenNthCalledWith(1, { queryKey: ['tpass', 'cards'] })
    expect(spy).toHaveBeenNthCalledWith(2, { queryKey: ['tpass', 'card', linkedCardId] })
    expect(spy).toHaveBeenNthCalledWith(3, { queryKey: ['accounts'] })
  })

  it('sync invalidation ["tpass"] really matches every cached tpass query (real prefix match)', async () => {
    // Seed the cache with the actual TPASS query keys the hooks register.
    const tpassQueryKeys = [
      tpassKeys.status(),
      tpassKeys.cards(),
      tpassKeys.card(linkedCardId),
      tpassKeys.summaries({ card_id: linkedCardId, year: 2026, month: 6 }),
    ]
    for (const k of tpassQueryKeys) {
      qc.setQueryData(k, { seeded: true })
    }
    // An unrelated query that must NOT be matched by the tpass invalidation.
    qc.setQueryData(['budgets'], { seeded: true })

    // After invalidating ["tpass"], every tpass query is marked invalid and the
    // unrelated one stays valid — proving prefix coverage via real react-query.
    await qc.invalidateQueries({ queryKey: tpassKeys.all })

    for (const k of tpassQueryKeys) {
      expect(qc.getQueryState(k)?.isInvalidated).toBe(true)
    }
    expect(qc.getQueryState(['budgets'])?.isInvalidated).toBe(false)
  })

  it('link/sync ["accounts"] invalidation matches the account TPASS section query', async () => {
    // useAccountTpass registers under ['accounts', id, 'tpass'].
    const accountTpassKey = ['accounts', 'acct-9', 'tpass']
    qc.setQueryData(accountTpassKey, { seeded: true })
    qc.setQueryData(['tpass', 'status'], { seeded: true })

    await qc.invalidateQueries({ queryKey: ['accounts'] })

    expect(qc.getQueryState(accountTpassKey)?.isInvalidated).toBe(true)
    // The accounts invalidation must not touch unrelated tpass queries.
    expect(qc.getQueryState(['tpass', 'status'])?.isInvalidated).toBe(false)
  })
})
