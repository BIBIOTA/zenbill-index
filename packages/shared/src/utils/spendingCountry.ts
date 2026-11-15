/**
 * 消費國家推導（與後端 domain `SpendingCountry` 相同順序）與「同一張卡的其他幣別帳戶」判斷。
 * Web 交易表單的灰字預設值、App 交易表單、兩端的回饋方案表單與總覽分組都用這裡。
 * 詞彙見 `CONTEXT.md`「消費國家」。
 */

/** 只放「一個幣別只對應一個國家」的情況；EUR、USD 這類不推。 */
export const CURRENCY_COUNTRY: Readonly<Record<string, string>> = {
  TWD: 'TW',
  JPY: 'JP',
  KRW: 'KR',
  THB: 'TH',
  HKD: 'HK',
  SGD: 'SG',
  VND: 'VN',
}

/** 幣別 → 國家代碼；不在表裡（或空值）回傳 null。 */
export function currencyCountry(currency: string | null | undefined): string | null {
  if (!currency) return null
  return CURRENCY_COUNTRY[currency.toUpperCase()] ?? null
}

export interface SpendingCountryInput {
  /** 交易上的覆寫值 `country_override`（表單欄位本身；只要灰字預設值時不傳） */
  countryOverride?: string | null
  merchantDefaultCountry?: string | null
  /** 交易原幣別 `original_currency`（跨幣別交易才有） */
  originalCurrency?: string | null
  /** 來源帳戶幣別；沒有時視為 TWD */
  accountCurrency?: string | null
}

export interface SpendingCountry {
  /** ISO 3166-1 alpha-2；null = 外幣但推不出國家 */
  country: string | null
  /** 是否推得出國家（`countries` 類方案只在 known 時才可能符合） */
  known: boolean
  /** 不是 TW 就算海外，包含不知道是哪國的外幣交易 */
  overseas: boolean
}

function result(country: string | null): SpendingCountry {
  return { country, known: country !== null, overseas: country !== 'TW' }
}

/**
 * 依序取第一個有值的：交易覆寫 → 商家預設國家 → 交易原幣別 → 帳戶幣別（TWD → TW）。
 * 原幣別有值但推不出國家時就停在那裡（海外、未知），不會再退回帳戶幣別。
 */
export function deriveSpendingCountry({
  countryOverride,
  merchantDefaultCountry,
  originalCurrency,
  accountCurrency,
}: SpendingCountryInput): SpendingCountry {
  if (countryOverride) return result(countryOverride.toUpperCase())
  if (merchantDefaultCountry) return result(merchantDefaultCountry.toUpperCase())
  if (originalCurrency) return result(currencyCountry(originalCurrency))
  return result(currencyCountry(accountCurrency || 'TWD'))
}

// ── 同一張卡的不同幣別帳戶 ────────────────────────────────────────────

// 帳戶名稱裡代表幣別的字樣；長的在前，避免「新台幣」只被拿掉「台幣」剩下「新」。
const CURRENCY_WORDS = [
  '新台幣', '新臺幣', '台幣', '臺幣', '日幣', '日圓', '日元', '美元', '美金', '外幣',
  '韓元', '韓圜', '港幣', '人民幣', '歐元', '泰銖', '新幣', '越南盾',
]
// 只認常見幣別代碼，避免把「JCB」「ANA」這類卡名當成幣別。
const CURRENCY_CODES = [
  'TWD', 'NTD', 'JPY', 'USD', 'KRW', 'HKD', 'CNY', 'RMB', 'EUR', 'GBP', 'AUD', 'CAD',
  'SGD', 'THB', 'VND', 'MYR', 'PHP', 'IDR', 'CHF', 'NZD', 'MOP',
]
const TOKEN = `(?:${CURRENCY_WORDS.join('|')}|${CURRENCY_CODES.join('|')})`
const CODE_RE = new RegExp(`(?<![A-Z0-9])(?:${CURRENCY_CODES.join('|')})(?![A-Z0-9])`, 'g')
const TRAILING_BRACKET_RE = new RegExp(`\\s*[（(]\\s*${TOKEN}\\s*[）)]\\s*$`, 'i')
const TRAILING_WORD_RE = new RegExp(`\\s*${TOKEN}\\s*$`, 'i')
const SEPARATORS = /[\s\-_/·・|]+/g

/**
 * 顯示用卡名：去掉結尾的幣別括號或幣別字樣。
 * 「玉山熊本熊卡 （台幣）」「熊本熊卡 日幣」「熊本熊卡 JPY」→ 卡名；「幣倍卡（3703）」保留（末四碼是不同的卡）。
 */
export function cardBaseName(name: string): string {
  let s = name.trim()
  for (;;) {
    const next = s.replace(TRAILING_BRACKET_RE, '').replace(TRAILING_WORD_RE, '').trim()
    if (next === s || !next) break
    s = next
  }
  return s
}

/** 比對用卡名：去掉任何位置的幣別字樣與代碼、空括號、分隔符號，並轉大寫。 */
export function cardNameKey(name: string): string {
  let s = name.toUpperCase().replace(CODE_RE, '')
  for (const w of CURRENCY_WORDS) s = s.split(w).join('')
  return s
    .replace(/[（(][\s\-_/·・|]*[）)]/g, '')
    .replace(SEPARATORS, '')
    .trim()
}

export interface CardAccountLike {
  id: string
  name: string
  type: string
  currency: string
  bank_id?: string | null
}

/** 同一張卡的其他幣別帳戶：同類型、不同幣別、銀行相同（任一方沒設銀行時不比）、比對用卡名相同。 */
export function isSameCardOtherCurrency(a: CardAccountLike, b: CardAccountLike): boolean {
  if (a.id === b.id || a.type !== b.type || a.currency === b.currency) return false
  if (a.bank_id && b.bank_id && a.bank_id !== b.bank_id) return false
  const key = cardNameKey(a.name)
  return key !== '' && key === cardNameKey(b.name)
}

/** `current` 這張卡的其他幣別帳戶 id（新方案預選用），保留 `accounts` 的順序。 */
export function sameCardAccountIds(current: CardAccountLike, accounts: readonly CardAccountLike[]): string[] {
  return accounts.filter((a) => isSameCardOtherCurrency(current, a)).map((a) => a.id)
}
