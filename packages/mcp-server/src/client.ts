/**
 * Thin HTTP client for the ZenBill API surface open to agent tokens: the
 * shared ledger, and (ADR 0005) the agent's own personal expenses plus the
 * reward-plan progress they feed.
 *
 * Deliberately holds no business rules. Every limit that matters — what an
 * agent token may reach, that a shared expense never links to a personal
 * account, that only EXPENSE may be created, that only agent-created
 * transactions may be changed, deleted or marked — is enforced by the server.
 * This layer only shapes requests and makes refusals readable.
 */

export type SplitMethod = 'EQUAL' | 'FULL_OWNER' | 'FULL_PARTNER' | 'CUSTOM'

/**
 * Wire shapes, mirroring the API responses.
 *
 * Defined here rather than imported from `@zenbill/shared`: that package's
 * entry point re-exports React hooks and it ships no build output, so a Node
 * ESM build cannot consume it. These are the only shapes this server reads.
 */
export interface SharedLedger {
  id: string
  name: string
  currency: string
  owner_id: string
  partner_id: string | null
  partner_name: string
  owner_aliases: string[]
  partner_aliases: string[]
}

export interface SharedExpense {
  id: string
  ledger_id: string
  date: string
  category: string
  description: string
  payer_name: string
  total_amount: number
  split_method: SplitMethod
  owner_amount: number
  partner_amount: number
  owner_paid_amount: number
  partner_paid_amount: number
  settled_at: string | null
  source_type: string
  created_by_actor: string
  created_at: string
}

export interface SharedLedgerSummary {
  total_expenses: number
  owner_share: number
  partner_share: number
  receivable_balance: number
  expense_count: number
}

export interface CreateExpenseArgs {
  ledger_id: string
  date: string
  category: string
  description: string
  payer_name: string
  paid_by_owner?: boolean
  total_amount: number
  split_method: SplitMethod
  owner_amount?: number
  partner_amount?: number
  partner_payment_method?: string
}

// --- Personal expenses and reward plans (ADR 0005) ---

export interface Account {
  id: string
  name: string
  type: string
  currency: string
  balance: number
  closing_day: number | null
  archived_at: string | null
}

export interface Merchant {
  id: string
  name: string
  default_category_id: string | null
  default_account_id: string | null
  default_country: string | null
  default_wallet_id?: string | null
}

/** 行動支付: the payment instrument a transaction went through (Apple Pay, 全支付・PayPay …). */
export interface Wallet {
  id: string
  name: string
  sort_order: number
  transaction_count: number
  plan_count: number
}

export interface Category {
  id: string
  name: string
  type: string
  icon: string
  parent_id: string | null
  children?: Category[]
}

export interface Transaction {
  id: string
  account_id: string
  type: string
  amount: number
  occurred_at: string
  category_id: string | null
  merchant_id: string | null
  note: string
  original_amount: number | null
  original_currency: string | null
  exchange_rate: number | null
  country_override: string | null
  spending_country: string | null
  spending_country_known?: boolean
  created_by_actor: string
  account?: { name: string; currency: string }
  merchant?: { name: string } | null
  wallet_id?: string | null
  wallet?: { id: string; name: string } | null
}

/** Body of POST /transactions as this server sends it: EXPENSE only. */
export interface CreatePersonalExpenseBody {
  account_id: string
  type: 'EXPENSE'
  amount: number
  occurred_at: string
  category_id?: string
  merchant_id?: string
  wallet_id?: string
  note?: string
  original_amount?: number
  original_currency?: string
  exchange_rate?: number
  country_override?: string
}

/**
 * Body of PUT /transactions/:id. Omitted keys stay unchanged; only
 * wallet_id (null) and country_override (null or "") can be cleared.
 */
export interface UpdatePersonalExpenseBody {
  account_id?: string
  amount?: number
  occurred_at?: string
  category_id?: string
  merchant_id?: string
  wallet_id?: string | null
  note?: string
  original_amount?: number
  original_currency?: string
  exchange_rate?: number
  country_override?: string | null
}

export interface CreateMerchantBody {
  name: string
  default_category_id?: string
  default_account_id?: string
  default_country?: string
  default_wallet_id?: string
}

export interface RewardPlan {
  id: string
  name: string
  rate: number
  cap_amount: number | null
  unit_label: string
  currency: string
  period_type: string
  starts_on: string | null
  ends_on: string | null
  location_type: string
  countries: string[]
  min_single_amount: number | null
  inclusion_mode: string
  account_ids: string[]
}

export interface RewardProgress {
  plan: RewardPlan
  offset: number
  period_start: string
  period_end: string
  qualifying_spend: number
  estimated_reward: number
  spend_cap: number | null
  remaining_spend: number | null
  over_cap_spend: number
  capped: boolean
  usage_ratio: number | null
  unknown_country_count: number
  converted: boolean
  excludes_refunds: boolean
}

export interface RewardProgressTransaction {
  transaction: Transaction
  converted_amount: number
  converted: boolean
  mark_included: boolean | null
}

export interface RewardPlanProgressDetail extends RewardProgress {
  included_transactions: RewardProgressTransaction[]
  excluded_transactions: RewardProgressTransaction[]
}

export interface RewardSummaryPlan {
  plan_id: string
  name: string
  unit_label: string
  reward: number
  qualifying_spend: number
  capped_in_range: boolean
}

export interface RewardSummaryGroup {
  currency: string
  total_reward: number
  spend: number
  spend_basis: 'all' | 'qualifying'
  fees: number
  gross_rate: number | null
  net_rate: number | null
  converted: boolean
  includes_points: boolean
  plans: RewardSummaryPlan[]
}

/** 總回饋率 of one card (the account's card group) over a date range. */
export interface RewardSummary {
  from: string
  to: string
  scope: 'all' | 'overseas'
  account_ids: string[]
  groups: RewardSummaryGroup[]
  excludes_refunds: boolean
}

export interface RewardSummaryQuery {
  from?: string
  to?: string
  period?: 'current' | 'previous'
  scope?: 'all' | 'overseas'
}

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

/**
 * ZenBillApiError carries a message the agent can relay verbatim.
 *
 * The distinction the server draws between 401 and 403 is preserved, because
 * it maps to different instructions for the user: a dead credential needs a new
 * token, while a refusal needs a different action entirely.
 */
export class ZenBillApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ZenBillApiError'
  }
}

/** How many pages listExpenses will walk before giving up. */
const MAX_PAGES = 20
const PAGE_SIZE = 100

/**
 * Reduces an API date to its calendar day.
 *
 * The API returns RFC3339 timestamps ("2026-05-31T00:00:00Z") while callers
 * give plain days ("2026-05-31"). Compared as raw strings the timestamp sorts
 * *after* the bare day, which would silently drop the last day of any range.
 */
export function dayOf(apiDate: string): string {
  return apiDate.slice(0, 10)
}

export class ZenBillClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async listLedgers(): Promise<SharedLedger[]> {
    return this.request<SharedLedger[]>('GET', '/shared-ledgers')
  }

  async getSummary(ledgerId: string): Promise<SharedLedgerSummary> {
    return this.request<SharedLedgerSummary>('GET', `/shared-ledgers/${ledgerId}/summary`)
  }

  /**
   * Lists expenses, most recent first, optionally narrowed to a date range.
   *
   * The API paginates but does not filter by date, so the range is applied
   * here over fetched pages. Walking stops once a page falls entirely before
   * `from`, since results are ordered by date descending.
   */
  async listExpenses(
    ledgerId: string,
    opts: { from?: string; to?: string; limit?: number } = {},
  ): Promise<SharedExpense[]> {
    const collected: SharedExpense[] = []
    const limit = opts.limit ?? 50

    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await this.request<SharedExpense[]>(
        'GET',
        `/shared-ledgers/${ledgerId}/expenses?page=${page}&page_size=${PAGE_SIZE}`,
      )
      if (batch.length === 0) break

      for (const expense of batch) {
        const day = dayOf(expense.date)
        if (opts.from && day < opts.from) continue
        if (opts.to && day > opts.to) continue
        collected.push(expense)
      }

      if (collected.length >= limit) break
      if (batch.length < PAGE_SIZE) break
      // Ordered newest first: once a whole page predates the range, stop.
      if (opts.from && batch.every((e) => dayOf(e.date) < opts.from!)) break
    }

    return collected.slice(0, limit)
  }

  async createExpense(args: CreateExpenseArgs): Promise<SharedExpense> {
    const { ledger_id: ledgerId, ...body } = args
    return this.request<SharedExpense>('POST', `/shared-ledgers/${ledgerId}/expenses`, body)
  }

  async deleteExpense(ledgerId: string, expenseId: string): Promise<void> {
    await this.request<null>('DELETE', `/shared-ledgers/${ledgerId}/expenses/${expenseId}`)
  }

  // --- Personal expenses (scope transaction:write) ---

  async listAccounts(): Promise<Account[]> {
    return this.request<Account[]>('GET', '/accounts')
  }

  async getAccount(accountId: string): Promise<Account> {
    return this.request<Account>('GET', `/accounts/${accountId}`)
  }

  async listMerchants(): Promise<Merchant[]> {
    return this.request<Merchant[]>('GET', '/merchants')
  }

  async createMerchant(body: CreateMerchantBody): Promise<Merchant> {
    return this.request<Merchant>('POST', '/merchants', body)
  }

  async listWallets(): Promise<Wallet[]> {
    return this.request<Wallet[]>('GET', '/wallets')
  }

  async listCategories(): Promise<Category[]> {
    return this.request<Category[]>('GET', '/categories')
  }

  /** Same source account, same day, amount equal to amount or original_amount. */
  async findSimilarTransactions(accountId: string, date: string, amount: number): Promise<Transaction[]> {
    const query = new URLSearchParams({ account_id: accountId, date, amount: String(amount) })
    return this.request<Transaction[]>('GET', `/transactions/similar?${query}`)
  }

  async createPersonalExpense(body: CreatePersonalExpenseBody): Promise<Transaction> {
    return this.request<Transaction>('POST', '/transactions', body)
  }

  async updatePersonalExpense(transactionId: string, body: UpdatePersonalExpenseBody): Promise<Transaction> {
    return this.request<Transaction>('PUT', `/transactions/${transactionId}`, body)
  }

  async deletePersonalExpense(transactionId: string): Promise<void> {
    await this.request<null>('DELETE', `/transactions/${transactionId}`)
  }

  // --- Reward plans (scopes reward:read, reward:mark) ---

  async listRewardProgress(): Promise<RewardProgress[]> {
    return this.request<RewardProgress[]>('GET', '/reward-progress')
  }

  async getAccountRewardProgress(accountId: string, offset = 0): Promise<RewardProgress[]> {
    return this.request<RewardProgress[]>('GET', `/accounts/${accountId}/reward-progress?offset=${offset}`)
  }

  async getRewardPlanProgress(planId: string, offset = 0): Promise<RewardPlanProgressDetail> {
    return this.request<RewardPlanProgressDetail>('GET', `/reward-plans/${planId}/progress?offset=${offset}`)
  }

  /** Null when the account has no reward plans overlapping the range (no card group). */
  async getRewardSummary(accountId: string, q: RewardSummaryQuery = {}): Promise<RewardSummary | null> {
    const query = new URLSearchParams()
    for (const key of ['from', 'to', 'period', 'scope'] as const) {
      const v = q[key]
      if (v) query.set(key, v)
    }
    const qs = query.toString()
    return this.request<RewardSummary | null>(
      'GET',
      `/accounts/${accountId}/reward-summary${qs ? `?${qs}` : ''}`,
    )
  }

  async setRewardMark(planId: string, transactionId: string, included: boolean): Promise<void> {
    await this.request<null>('PUT', `/reward-plans/${planId}/marks/${transactionId}`, { included })
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (cause) {
      throw new ZenBillApiError(
        0,
        `Could not reach the ZenBill API at ${this.baseUrl}: ${(cause as Error).message}`,
      )
    }

    const raw = await response.text()
    let envelope: Partial<ApiEnvelope<T>> = {}
    try {
      envelope = raw ? (JSON.parse(raw) as ApiEnvelope<T>) : {}
    } catch {
      // Fall through to the status-based message below.
    }

    if (!response.ok) {
      throw new ZenBillApiError(response.status, explain(response.status, envelope.message))
    }

    return envelope.data as T
  }
}

/**
 * Turns a refusal into something worth relaying to the person behind the agent.
 *
 * The server's own message is preferred wherever it has one — it knows why it
 * said no, and the deletion gate in particular carries an instruction the agent
 * should pass on rather than paraphrase.
 */
function explain(status: number, serverMessage?: string): string {
  const detail = serverMessage?.trim()

  switch (status) {
    case 401:
      return 'ZenBill rejected the agent token. It may have been revoked or expired — issue a new one with `agent_token issue`.'
    case 403:
      return detail
        ? detail
        : 'ZenBill refused this action for the agent token in use.'
    case 404:
      return detail ?? 'ZenBill could not find that ledger, expense, account, transaction or plan.'
    default:
      return detail
        ? `ZenBill returned ${status}: ${detail}`
        : `ZenBill returned ${status}.`
  }
}
