/**
 * 交易表單「換帳戶」時，行動支付欄位該變成什麼（App、Web 共用）。
 * 詞彙見 `CONTEXT.md`「行動支付」；規則見 `.scratch/mobile-wallet/spec.md`「@zenbill/shared」。
 *
 * - 使用者還沒手動改過行動支付（`touched = false`）→ 換成新帳戶的預設行動支付（沒有就清空）。
 * - 已經手動改過（含刻意選「無」）→ 保留目前的選擇。
 *
 * 只負責換帳戶這個時機；編輯既有交易時不自動帶入，由表單在初始化時把 `touched` 設成 true。
 */
import type { Account } from '../types/index.ts'

/** helper 只看帳戶的預設行動支付；傳整個 `Account` 也可以。 */
export type WalletDefaultSource = Pick<Account, 'default_wallet_id'>

export function resolveWalletOnAccountChange(
  _prevAccount: WalletDefaultSource | null | undefined,
  nextAccount: WalletDefaultSource | null | undefined,
  current: string | null,
  touched: boolean,
): string | null {
  if (touched) return current
  return nextAccount?.default_wallet_id ?? null
}
