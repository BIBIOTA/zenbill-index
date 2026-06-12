import { describe, expect, it } from 'vitest'
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
