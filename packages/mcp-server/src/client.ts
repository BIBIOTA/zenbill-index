/**
 * Thin HTTP client for the ZenBill shared-ledger API.
 *
 * Deliberately holds no business rules. Every limit that matters — what an
 * agent token may reach, that an agent-authored expense never links to a
 * personal account, that a linked expense may not be deleted — is enforced by
 * the server. This layer only shapes requests and makes refusals readable.
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
      return detail ?? 'ZenBill could not find that ledger or expense.'
    default:
      return detail
        ? `ZenBill returned ${status}: ${detail}`
        : `ZenBill returned ${status}.`
  }
}
