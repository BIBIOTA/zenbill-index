import { describe, expect, it } from 'vitest'
import { resolveWalletOnAccountChange } from '../walletDefault'

const sport = { default_wallet_id: 'samsung-pay' }
const cathay = { default_wallet_id: 'all-pay' }
const noDefault = { default_wallet_id: null }

describe('resolveWalletOnAccountChange', () => {
  it('untouched: switching to an account with a default takes that default', () => {
    expect(resolveWalletOnAccountChange(cathay, sport, 'all-pay', false)).toBe('samsung-pay')
  })

  it('untouched: switching from no account (first pick) takes the default', () => {
    expect(resolveWalletOnAccountChange(null, sport, null, false)).toBe('samsung-pay')
  })

  it('untouched: switching to an account without a default clears the wallet', () => {
    expect(resolveWalletOnAccountChange(sport, noDefault, 'samsung-pay', false)).toBeNull()
  })

  it('touched: keeps the user choice even when the new account has a default', () => {
    expect(resolveWalletOnAccountChange(cathay, sport, 'apple-pay', true)).toBe('apple-pay')
  })

  it('touched: keeps an explicit "none" choice', () => {
    expect(resolveWalletOnAccountChange(cathay, sport, null, true)).toBeNull()
  })

  it('untouched: new account is null (account cleared) → no wallet', () => {
    expect(resolveWalletOnAccountChange(sport, null, 'samsung-pay', false)).toBeNull()
    expect(resolveWalletOnAccountChange(sport, undefined, 'samsung-pay', false)).toBeNull()
  })

  it('touched: new account is null → keeps the current choice', () => {
    expect(resolveWalletOnAccountChange(sport, null, 'apple-pay', true)).toBe('apple-pay')
  })
})
