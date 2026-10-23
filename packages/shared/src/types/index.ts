// === Auth ===
export interface User {
  id: string
  email: string
}

// === Account ===
export type AccountType = 'BANK' | 'CREDIT' | 'CASH' | 'CRYPTO' | 'STOCK'

export type StockMarket = 'TW' | 'US'

export interface Account {
  id: string
  user_id: string
  name: string
  type: AccountType
  currency: string
  balance: number
  bank_id: string | null
  passbook_number: string
  closing_day: number | null
  payment_due_day: number | null
  auto_pay_from_id: string | null
  auto_pay_enabled: boolean
  // Stock fields (only meaningful for STOCK accounts)
  stock_symbol: string
  stock_market: StockMarket | ''
  shares_held: number
  avg_cost_price: number
  last_price: number
  previous_close_price: number | null
  day_change: number | null
  day_change_percent: number | null
  last_price_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

// Returned in `data.reasons` of the 409 response when archive / delete is blocked.
export type AccountBlockReasonCode =
  | 'NON_ZERO_BALANCE'
  | 'NON_ZERO_SHARES'
  | 'AUTO_PAY_ENABLED'
  | 'AUTO_PAY_SOURCE'
  | 'MERCHANT_DEFAULT'
  | 'TPASS_LINKED'
  | 'NOT_ARCHIVED'
  | 'HAS_TRANSACTIONS'

export interface AccountBlockReason {
  code: AccountBlockReasonCode
  message: string
}

export interface CreateAccountInput {
  name: string
  type: AccountType
  currency?: string
  balance?: number
  bank_id?: string
  passbook_number?: string
  closing_day?: number
  payment_due_day?: number
  auto_pay_from_id?: string
  auto_pay_enabled?: boolean
  // Stock fields (used when type === 'STOCK')
  stock_symbol?: string
  stock_market?: StockMarket
  price_per_share?: number
  from_account_id?: string
}

// === Stock ===
export interface BuyStockInput {
  stock_symbol: string
  stock_market: StockMarket
  stock_name?: string
  shares: number
  price_per_share: number
  from_account_id?: string
  account_id?: string
}

export interface SellStockInput {
  account_id: string
  shares: number
  price_per_share: number
  to_account_id?: string
}

export interface StockSearchResult {
  symbol: string
  name: string
  market: StockMarket
}

// === Transaction ===
export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'SETTLEMENT'

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  target_account_id: string | null
  type: TransactionType
  amount: number
  occurred_at: string
  category_id: string | null
  merchant_id: string | null
  invoice_id: string | null
  note: string
  original_amount: number | null
  original_currency: string | null
  exchange_rate: number | null
  billing_period_deferred: boolean
  running_balance?: number
  settled_at?: string | null
  created_at: string
  updated_at: string
  // Preloaded relationships (optional)
  merchant?: Merchant
  category?: Category
  account?: Account
  // Only on the single-transaction read (GET /transactions/:id), and only when
  // this transaction belongs to a shared expense. Deleting the transaction
  // deletes that shared expense too; editing it does not propagate.
  linked_shared_expense?: LinkedSharedExpense
}

export interface LinkedSharedExpense {
  id: string
  ledger_name: string
  settled: boolean
}

export interface CreateTransactionInput {
  account_id: string
  target_account_id?: string
  type: TransactionType
  amount: number
  occurred_at: string
  category_id?: string
  merchant_id?: string
  invoice_id?: string
  note?: string
  original_amount?: number
  original_currency?: string
  exchange_rate?: number
}

// === Invoice ===
export type InvoiceStatus = 'PENDING' | 'PROCESSED' | 'IGNORED'

export interface InvoiceItem {
  item: string
  quantity: string
  unitPrice: string
  amount: string
  sequenceNumber: string
}

export interface Invoice {
  id: string
  invoice_number: string
  invoice_date: string
  seller_name: string
  total_amount: number
  status: InvoiceStatus
  raw_details: { Details?: InvoiceItem[] } | null
  created_at: string
  updated_at: string
}

// === Invoice Match ===
export interface InvoiceMatchResult {
  matched: boolean
  merchant_id?: string
  merchant_name?: string
  category_id?: string
  category_name?: string
  account_id?: string
  account_name?: string
}

// === Category ===
export type CategoryType = 'EXPENSE' | 'INCOME'

export interface Category {
  id: string
  name: string
  type: CategoryType
  icon: string
  parent_id: string | null
  children: Category[]
  created_at: string
}

export interface CreateCategoryInput {
  name: string
  type: CategoryType
  icon?: string
  parent_id?: string
}

// === Merchant ===
export interface Merchant {
  id: string
  user_id: string
  name: string
  default_category_id: string | null
  default_account_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateMerchantInput {
  name: string
  default_category_id?: string
  default_account_id?: string
}

// === MerchantRule ===
export type MatchType = 'EXACT' | 'CONTAINS' | 'REGEX'

export interface MerchantRule {
  id: string
  merchant_id: string
  keyword: string
  match_type: MatchType
  priority: number
  created_at: string
}

export interface CreateMerchantRuleInput {
  merchant_id: string
  keyword: string
  match_type: MatchType
  priority: number
}

// === Bank ===
export interface Bank {
  id: string
  code: string
  name: string
  short_name: string
  created_at: string
}

// === EInvoice Credentials ===
export interface SyncProgress {
  new: number
  skipped: number
  failed: number
}

export interface EInvoiceCredentialStatus {
  bound: boolean
  last_synced_at: string | null
  sync_status: string | null
  sync_error: string | null
  sync_progress: SyncProgress | null
}

// === API Response wrappers ===
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface PaginatedResponse<T> {
  code: number
  message: string
  data: T[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}

// === Transaction Stats ===
export interface MonthlySummary {
  month: string
  expense: number
  income: number
}

export interface CategorySummary {
  category_id: string | null
  category_name: string
  total: number
}

/** 本月某一非台幣幣別的支出與收入（非股票帳戶）。 */
export interface CurrencyMonthSummary {
  currency: string
  expense: number
  income: number
}

/** 本月至今 vs 上月同期的台幣支出。 */
export interface MTDComparison {
  current_mtd_expense: number
  previous_mtd_expense: number
}

export interface TransactionStats {
  monthly: MonthlySummary[]
  current_month_categories: CategorySummary[]
  /** 舊版後端沒有此欄位；讀取請用 `otherCurrencyAmounts()`。 */
  current_month_other_currencies?: CurrencyMonthSummary[]
  /** 舊版後端沒有此欄位；缺少時不顯示同期比較。 */
  mtd_comparison?: MTDComparison
}

// === Net Asset Trend ===
export interface MonthlyNetAsset {
  month: string
  net_asset: number
}

/**
 * `GET /accounts/credit-card-dues` 的單筆：已結帳、尚未過繳款日的信用卡上期帳單。
 * 日期皆為 `YYYY-MM-DD`。後端依 `due_date` 升冪排序。
 */
export interface CreditCardDue {
  account_id: string
  name: string
  currency: string
  /** 上期帳單週期起日（含） */
  cycle_start: string
  /** 上期帳單週期迄日＝結帳日（含） */
  cycle_end: string
  /** 繳款截止日；有帳單且帳單印有繳款日時用帳單的，否則依 `payment_due_day` 推算 */
  due_date: string
  /**
   * 上期應繳總額：有帳單時是帳單上的數字（確定），否則是 `本期消費 + 結轉`（預估）。
   * 見 `amount_due_source`。
   */
  amount_due: number
  /** `amount_due` 的來源：`statement`＝確定（有帳單）、`estimate`＝預估 */
  amount_due_source: CreditCardAmountDueSource
  /** 帳單上的最低應繳；沒有帳單或帳單沒填時為 null */
  minimum_due: number | null
  /** 結帳日次日起轉入此卡的 TRANSFER 加總 */
  amount_paid: number
  auto_pay_enabled: boolean
}

/** 應繳總額的來源：`statement`＝確定（以帳單為準）、`estimate`＝預估（本期消費 + 結轉）。 */
export type CreditCardAmountDueSource = 'statement' | 'estimate'

/** 帳單是怎麼寫進來的：`manual`＝App/Web 手動填寫、`skill`＝匯入 skill。 */
export type CreditCardStatementSource = 'manual' | 'skill'

/**
 * 帳單原始欄位（`credit_card_statements` 一列）。日期皆為 `YYYY-MM-DD`，金額是儲存值。
 * `cycle_end` 是 ZenBill 依 `closing_day` 算出的週期結束日，不是銀行印的結帳日（那是 `statement_date`）。
 */
export interface CreditCardStatement {
  id: string
  cycle_end: string
  /** 本期應繳總額 */
  amount_due: number
  minimum_due: number | null
  /** 銀行印的繳款截止日；有值時覆蓋 `payment_due_day` 推算的日期 */
  due_date: string | null
  /** 銀行印的結帳日，只用來顯示 */
  statement_date: string | null
  previous_balance: number | null
  payments_credited: number | null
  new_charges: number | null
  source: CreditCardStatementSource
  note: string | null
  /** RFC3339 */
  created_at: string
  /** RFC3339 */
  updated_at: string
}

/**
 * `GET /accounts/:id/statements/:cycle_end` 與 `GET /accounts/:id/statements/latest-closed` 的 `data`，
 * PUT 也回傳同一格式。日期皆為 `YYYY-MM-DD`。
 */
export interface CreditCardStatementView {
  account_id: string
  currency: string
  /** 週期起日（含） */
  cycle_start: string
  /** 週期結束日（含），ZenBill 依 `closing_day` 算出 */
  cycle_end: string
  /** 今天（Asia/Taipei）晚於 `cycle_end`；未結帳的期數前端只用 `cycle_net` */
  is_closed: boolean
  /** 繳款截止日：帳單的 `due_date`，沒有時依 `payment_due_day` 推算 */
  due_date: string
  /** 本期消費（EXPENSE − INCOME − SETTLEMENT，套用延到下期，TRANSFER 不計） */
  cycle_net: number
  /** 結轉：前一期帳單應繳 − 前一期繳款期間已繳；前一期沒有帳單時為 0。可為負（溢繳） */
  carryover: number
  /** 預估應繳＝`cycle_net + carryover` */
  estimated_amount_due: number
  /** 應繳總額：有帳單時是帳單數字，否則等於 `estimated_amount_due` */
  amount_due: number
  amount_due_source: CreditCardAmountDueSource
  /** 本期繳款期間（`cycle_end` 次日到下一個 `cycle_end`）轉入此卡的 TRANSFER 加總 */
  amount_paid: number
  /** `amount_due − amount_paid`；≤ 0 表示已繳清或溢繳 */
  remaining: number
  /** 有帳單時是 `statement.amount_due − estimated_amount_due`，否則為 null。≠ 0 是對帳訊號 */
  diff: number | null
  /** 帳單原始欄位；沒有帳單時為 null */
  statement: CreditCardStatement | null
}

/**
 * `PUT /accounts/:id/statements/:cycle_end` 的 body。`amount_due` 必填，其他選填且可為 null
 * （null＝清空該欄）。`source` 由後端固定為 `manual`，不用送。
 */
export interface CreditCardStatementInput {
  amount_due: number
  minimum_due?: number | null
  /** `YYYY-MM-DD` */
  due_date?: string | null
  /** `YYYY-MM-DD` */
  statement_date?: string | null
  previous_balance?: number | null
  payments_credited?: number | null
  new_charges?: number | null
  note?: string | null
}

// === Shared Ledger ===
export type SplitMethod = 'EQUAL' | 'FULL_OWNER' | 'FULL_PARTNER' | 'CUSTOM'
export type ExpenseCategory = 'food' | 'transport' | 'accommodation' | 'ticket' | 'supplies' | 'settlement' | 'other'

export interface SharedLedger {
  id: string
  name: string
  currency: string
  owner_id: string
  partner_id: string | null
  partner_name: string
  owner_aliases: string[]
  partner_aliases: string[]
  google_sheet_id: string
  sync_enabled: boolean
  has_google_credential: boolean
  created_at: string
  updated_at: string
  owner?: User
  partner?: User
}

export interface CreateSharedLedgerInput {
  name: string
  partner_name: string
  currency?: string
  google_sheet_id?: string
}

export interface UpdateSharedLedgerInput {
  name?: string
  currency?: string
  google_sheet_id?: string
  sync_enabled?: boolean
  google_credential_json?: string
  owner_aliases?: string[]
  partner_aliases?: string[]
}

export interface SharedExpense {
  id: string
  ledger_id: string
  date: string
  category: string
  description: string
  payer_name: string
  payer_user_id: string | null
  total_amount: number
  split_method: SplitMethod
  owner_amount: number
  partner_amount: number
  owner_paid_amount: number
  partner_paid_amount: number
  settled_at: string | null
  source_type: string
  /** Which instrument the partner paid with. A free-text label, not an account reference. */
  partner_payment_method?: string
  /** Who wrote this row: 'user' or 'agent'. Absent on responses predating agent tokens. */
  created_by_actor?: string
  /** Who soft-deleted this row, when it has been deleted. */
  deleted_by_actor?: string
  created_at: string
  updated_at: string
}

export interface CreateSharedExpenseInput {
  date: string
  category: string
  description: string
  payer_name: string
  paid_by_owner: boolean
  total_amount: number
  split_method: SplitMethod
  owner_amount?: number
  partner_amount?: number
  payment_account_id?: string
  merchant_id?: string
  personal_category_id?: string
  partner_payment_method?: string
  /** Import this invoice along with the expense. Requires payment_account_id. */
  invoice_id?: string
}

export interface SharedLedgerSummary {
  total_expenses: number
  owner_share: number
  partner_share: number
  receivable_balance: number
  expense_count: number
}

export interface InviteInfo {
  ledger_name: string
  owner_email: string
  currency: string
  partner_name: string
}

// === Notifications ===
export type NotificationType = 'SHARED_EXPENSE_CREATED' | 'SHARED_EXPENSE_DELETED' | 'SETTLEMENT_CREATED' | 'APP_UPDATE'

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string
  resource_type: string
  resource_id: string | null
  is_read: boolean
  created_at: string
}

// Currency Settings
export interface CurrencySetting {
  currency_code: string
  multiplier: number
  /** User-chosen decimal places (0–4); null / absent means use the built-in default. */
  decimal_places?: number | null
}

export interface UpdateCurrencySettingsInput {
  settings: CurrencySetting[]
}

// === TPASS EasyCard ===
export type TpassSyncStatus =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'failed'
  | 'partial_failed'

// GET /tpass/status. When no credentials are configured the backend returns
// only `{ bound: false }`, so every field except `bound` is optional.
export interface TpassCredentialStatus {
  bound: boolean
  national_id_masked?: string
  last_synced_at?: string | null
  sync_status?: TpassSyncStatus
  sync_error?: string | null
}

// PUT /tpass/credentials body.
export interface SetTpassCredentialsInput {
  national_id: string
  birth_date: string
}

// POST /tpass/sync result envelope data.
export interface TpassSyncResult {
  status: TpassSyncStatus
  cards_upserted: number
  summaries_upserted: number
  failed_cards: number
  errors: string[] | null
}

// One official monthly reward summary for a TPASS card.
// *_green_reward 為 TPASS 2.0（2026-08）新增的「綠色運輸加碼」欄位；
// 官方語意：官方回饋總計 = 基本回饋 + 綠色運輸加碼（2.0 之前的月份一律為 0）。
export interface TpassMonthlySummary {
  id: string
  user_id: string
  card_id: string
  year: number
  month: number
  query_date: string
  short_bus_count: number
  short_bus_amount: number
  short_bus_official_reward: number
  short_bus_green_reward: number
  intercity_bus_count: number
  intercity_bus_amount: number
  intercity_bus_official_reward: number
  intercity_bus_green_reward: number
  taipei_metro_count: number
  taipei_metro_amount: number
  taipei_metro_official_reward: number
  taipei_metro_green_reward: number
  tra_count: number
  tra_amount: number
  tra_official_reward: number
  tra_green_reward: number
  new_taipei_metro_count: number
  new_taipei_metro_amount: number
  new_taipei_metro_official_reward: number
  new_taipei_metro_green_reward: number
  rail_count: number
  rail_amount: number
  official_total_reward_amount: number
  redeemed_at?: string | null
  estimated_total_reward_amount: number
  calculation_delta_amount: number
  official_raw_data?: unknown
  calculated_at: string
  created_at: string
  updated_at: string
}

// List/account DTO for a TPASS card. Excludes the full card number; only the
// masked display number and last 4 digits are exposed.
// Backend-authoritative TPASS values (verbatim Chinese, see backend/pkg/tpass/parser.go).
// registration_status is '已登錄' or '未登錄'; early_bird_qualification is '符合' or '' (empty).
export const TPASS_REGISTERED = '已登錄'
export const TPASS_NOT_REGISTERED = '未登錄'
export const TPASS_EARLY_BIRD_QUALIFIED = '符合'

export interface TpassCardListItem {
  id: string
  display_number: string
  card_number_last4: string
  card_type: string
  registration_status: string
  registered_at?: string | null
  early_bird_qualification: string
  linked_account_id?: string | null
  last_detail_synced_at?: string | null
  recent_summary?: TpassMonthlySummary
}

// Single-card detail DTO. Adds the decrypted full card number.
export interface TpassCardDetail extends TpassCardListItem {
  card_number: string
}

// PUT /tpass/cards/:id/linked-account body. Pass null to unlink.
export interface LinkTpassCardAccountInput {
  linked_account_id: string | null
}

// GET /tpass/summaries query filter (all optional).
export interface TpassSummaryFilter {
  card_id?: string
  year?: number
  month?: number
}

// GET /accounts/:id/tpass — credit-account TPASS section.
export interface TpassAccountSection {
  account_id: string
  card?: TpassCardListItem
  previous_month_summary?: TpassMonthlySummary
  current_month_summary?: TpassMonthlySummary
  remaining_ride_count_to_next_threshold: number
  previous_month_reward_amount: number
  current_month_estimated_reward_amount: number
}

// === App release (OTA update) ===
// GET /app/latest-version (public, no auth). 404 when no release recorded yet.
export interface AppRelease {
  version: string // "1.0.57"
  version_code: number // MAJOR*10000 + MINOR*100 + PATCH
  apk_url: string
  apk_sha256: string // lowercase hex
  content_hash: string // app build-input hash; used by build-apk.sh to skip unchanged builds
  min_supported_version_code: number | null // reserved, not enforced yet
  released_at: string // RFC3339
}
