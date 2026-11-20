/**
 * 新增交易（或共同記帳新增時的個人交易）表單上，行動支付欄位該是什麼（App、Web 共用）。
 * 詞彙見 `CONTEXT.md`「行動支付」；規則見 `.scratch/merchant-wallet-country/spec.md`「@zenbill/shared」。
 *
 * 1. 使用者已經手動改過行動支付（`touched = true`）→ 保留目前的選擇，包括刻意選「無」的 null。
 * 2. 商家設了預設行動支付，而且商家沒設預設帳戶，或商家預設帳戶就是目前選的帳戶
 *    → 用商家的行動支付（商家的帳戶和行動支付是成組的）。
 * 3. 其他情況 → 用目前帳戶的預設行動支付，沒有就是 null。
 *
 * 表單每次 render 都用它算出行動支付，所以換商家、換帳戶都會自動重算。
 * 編輯既有交易時不自動帶入，由表單在初始化時把 `touched` 設成 true。
 */
import type { Account, Merchant } from '../types/index.ts'

/** helper 只看商家的預設帳戶和預設行動支付；傳整個 `Merchant` 也可以。 */
export type WalletDefaultMerchant = Pick<Merchant, 'default_account_id' | 'default_wallet_id'>

/** helper 只看帳戶的 id 和預設行動支付；傳整個 `Account` 也可以。 */
export type WalletDefaultAccount = Pick<Account, 'id' | 'default_wallet_id'>

export interface ResolveWalletDefaultArgs {
  merchant: WalletDefaultMerchant | null | undefined
  account: WalletDefaultAccount | null | undefined
  /** 表單目前的行動支付 */
  current: string | null
  /** 使用者是否手動改過行動支付 */
  touched: boolean
}

export function resolveWalletDefault({ merchant, account, current, touched }: ResolveWalletDefaultArgs): string | null {
  if (touched) return current
  if (
    merchant?.default_wallet_id &&
    (!merchant.default_account_id || merchant.default_account_id === account?.id)
  ) {
    return merchant.default_wallet_id
  }
  return account?.default_wallet_id ?? null
}
