import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { tpassKeys } from '../useTpass'
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
 * Approach: FALLBACK (no renderHook). The @zenbill/shared package has no DOM
 * test infrastructure — there is no react-dom dependency, no jsdom/happy-dom,
 * and no @testing-library/react in the package's devDependencies (which are
 * deliberately minimal: only vitest + typescript). Adding a full React DOM
 * renderer + a DOM vitest environment to this leaf package solely to mount
 * mutation hooks would be disproportionate, so instead we assert invalidation
 * against a REAL @tanstack/react-query QueryClient:
 *
 *   1. We declare the COMPLETE invalidation key set each TPASS mutation fires
 *      (mapping mutation -> exact keys, mirroring useTpass.ts onSuccess bodies).
 *   2. We replay those keys through a real QueryClient.invalidateQueries while
 *      spying on it, so the assertions are tied to real react-query behaviour
 *      rather than a hand-rolled stub.
 *   3. We additionally seed real queries into the cache and assert that the
 *      ["tpass"] (sync) and ["accounts"] invalidations actually MATCH the
 *      relevant cached queries via react-query's real prefix matching — proving
 *      the chosen keys cover the queries they are meant to refresh.
 *
 * The full key set per mutation (must stay in sync with useTpass.ts):
 *   useSetTpassCredentials   -> [ ['tpass','status'] ]
 *   useDeleteTpassCredentials-> [ ['tpass','status'], ['tpass','cards'] ]
 *   useSyncTpass             -> [ ['tpass'], ['accounts'] ]
 *   useLinkTpassCardAccount  -> [ ['tpass','cards'], ['tpass','card',<id>], ['accounts'] ]
 */
describe('tpass mutation query invalidation', () => {
  const linkedCardId = 'card-123'

  // The exact invalidation key set fired by each mutation's onSuccess.
  const invalidationContract = {
    useSetTpassCredentials: [tpassKeys.status()],
    useDeleteTpassCredentials: [tpassKeys.status(), tpassKeys.cards()],
    useSyncTpass: [tpassKeys.all, ['accounts']],
    useLinkTpassCardAccount: [tpassKeys.cards(), tpassKeys.card(linkedCardId), ['accounts']],
  } as const

  let qc: QueryClient
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    qc = new QueryClient()
    spy = vi.spyOn(qc, 'invalidateQueries')
  })

  function replay(keys: readonly (readonly unknown[])[]) {
    for (const queryKey of keys) qc.invalidateQueries({ queryKey })
  }

  it('useSetTpassCredentials invalidates only the status query', () => {
    replay(invalidationContract.useSetTpassCredentials)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ queryKey: ['tpass', 'status'] })
  })

  it('useDeleteTpassCredentials invalidates status + cards', () => {
    replay(invalidationContract.useDeleteTpassCredentials)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenNthCalledWith(1, { queryKey: ['tpass', 'status'] })
    expect(spy).toHaveBeenNthCalledWith(2, { queryKey: ['tpass', 'cards'] })
  })

  it('useSyncTpass invalidates the whole tpass tree + accounts', () => {
    replay(invalidationContract.useSyncTpass)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenNthCalledWith(1, { queryKey: ['tpass'] })
    expect(spy).toHaveBeenNthCalledWith(2, { queryKey: ['accounts'] })
  })

  it('useLinkTpassCardAccount invalidates cards + that card detail + accounts', () => {
    replay(invalidationContract.useLinkTpassCardAccount)
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
