import { describe, expect, it } from 'vitest'
import { resolveWalletDefault } from '../walletDefault'

const sport = { id: 'sport', default_wallet_id: 'samsung-pay' }
const cathay = { id: 'cathay', default_wallet_id: 'all-pay' }
const noDefault = { id: 'plain', default_wallet_id: null }

type Args = Parameters<typeof resolveWalletDefault>[0]

describe('resolveWalletDefault', () => {
  const cases: Array<[string, Args, string | null]> = [
    [
      'touched: keeps the current choice over merchant and account defaults',
      { merchant: { default_account_id: null, default_wallet_id: 'line-pay' }, account: sport, current: 'apple-pay', touched: true },
      'apple-pay',
    ],
    [
      'touched: keeps an explicit "none" choice',
      { merchant: { default_account_id: null, default_wallet_id: 'line-pay' }, account: sport, current: null, touched: true },
      null,
    ],
    [
      'merchant has a wallet but no account → merchant wallet, whatever the account',
      { merchant: { default_account_id: null, default_wallet_id: 'line-pay' }, account: sport, current: null, touched: false },
      'line-pay',
    ],
    [
      'merchant has a wallet but no account, and no account picked → merchant wallet',
      { merchant: { default_account_id: null, default_wallet_id: 'line-pay' }, account: null, current: null, touched: false },
      'line-pay',
    ],
    [
      "merchant account matches the picked account → merchant wallet",
      { merchant: { default_account_id: 'sport', default_wallet_id: 'line-pay' }, account: sport, current: 'samsung-pay', touched: false },
      'line-pay',
    ],
    [
      "merchant account differs from the picked account → account default",
      { merchant: { default_account_id: 'sport', default_wallet_id: 'line-pay' }, account: cathay, current: 'line-pay', touched: false },
      'all-pay',
    ],
    [
      'merchant account set but no account picked → account default (none)',
      { merchant: { default_account_id: 'sport', default_wallet_id: 'line-pay' }, account: undefined, current: 'line-pay', touched: false },
      null,
    ],
    [
      'merchant wallet is null → account default',
      { merchant: { default_account_id: 'sport', default_wallet_id: null }, account: sport, current: null, touched: false },
      'samsung-pay',
    ],
    [
      'no merchant → account default',
      { merchant: null, account: cathay, current: null, touched: false },
      'all-pay',
    ],
    [
      'neither merchant nor account has a wallet → null',
      { merchant: { default_account_id: null, default_wallet_id: null }, account: noDefault, current: 'samsung-pay', touched: false },
      null,
    ],
    [
      'no merchant and no account → null',
      { merchant: undefined, account: null, current: 'samsung-pay', touched: false },
      null,
    ],
  ]

  it.each(cases)('%s', (_name, args, expected) => {
    expect(resolveWalletDefault(args)).toBe(expected)
  })
})
