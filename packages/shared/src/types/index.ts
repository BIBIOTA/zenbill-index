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
  created_at: string
  updated_at: string
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

export interface TransactionStats {
  monthly: MonthlySummary[]
  current_month_categories: CategorySummary[]
}

// === Net Asset Trend ===
export interface MonthlyNetAsset {
  month: string
  net_asset: number
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
export type NotificationType = 'SHARED_EXPENSE_CREATED' | 'SHARED_EXPENSE_DELETED' | 'SETTLEMENT_CREATED'

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
  intercity_bus_count: number
  intercity_bus_amount: number
  intercity_bus_official_reward: number
  taipei_metro_count: number
  taipei_metro_amount: number
  taipei_metro_official_reward: number
  tra_count: number
  tra_amount: number
  tra_official_reward: number
  new_taipei_metro_count: number
  new_taipei_metro_amount: number
  new_taipei_metro_official_reward: number
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
