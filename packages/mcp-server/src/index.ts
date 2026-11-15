#!/usr/bin/env node
/**
 * ZenBill MCP server.
 *
 * Exposes two surfaces to an AI agent over stdio.
 *
 * Shared ledger: read the ledgers, read the running totals, record a shared
 * expense, take one back. There is no tool that writes to a ledger itself —
 * creating, renaming, deleting, inviting or syncing — and no shared-expense
 * parameter for a payment account, merchant or personal category.
 *
 * Personal expenses (ADR 0005, separate token scopes): read accounts,
 * merchants, categories and reward-plan progress; create EXPENSE transactions;
 * change, delete or reward-mark only the transactions the agent itself
 * created. There is no tool for INCOME, TRANSFER, invoices or anything a
 * person recorded.
 *
 * What is absent here is defence in depth, not the defence itself: the server
 * enforces every one of these limits independently, so nothing in this file is
 * load-bearing for safety.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  dayOf,
  ZenBillApiError,
  ZenBillClient,
  type Category,
  type RewardProgress,
  type RewardProgressTransaction,
  type SplitMethod,
  type Transaction,
} from './client.js'

const DEFAULT_API_URL = 'http://localhost:8080/api/v1'

function readConfig(): { baseUrl: string; token: string } {
  const token = process.env.ZENBILL_AGENT_TOKEN
  if (!token) {
    console.error(
      'ZENBILL_AGENT_TOKEN is not set. Issue one with:\n' +
        '  docker exec -it zenbill_api /app/agent_token issue --user <uuid> --name claude-code --scopes shared_ledger:read,shared_expense:write\n' +
        '  (personal expenses & reward progress: add transaction:write,account:read,merchant:write,reward:read,reward:mark)',
    )
    process.exit(1)
  }

  const baseUrl = (process.env.ZENBILL_API_URL ?? DEFAULT_API_URL).replace(/\/$/, '')
  return { baseUrl, token }
}

/** Renders a tool result, turning a refusal into a readable explanation. */
async function reply(produce: () => Promise<string>) {
  try {
    return { content: [{ type: 'text' as const, text: await produce() }] }
  } catch (error) {
    const text =
      error instanceof ZenBillApiError
        ? error.message
        : `Unexpected failure: ${(error as Error).message}`
    return { content: [{ type: 'text' as const, text }], isError: true }
  }
}

function formatSplit(owner: string, partner: string, e: {
  total_amount: number
  owner_amount: number
  partner_amount: number
  split_method: string
}): string {
  return (
    `total ${e.total_amount}, split ${e.split_method}: ` +
    `${owner} ${e.owner_amount} / ${partner} ${e.partner_amount}`
  )
}

// --- Personal expense / reward formatting ---

/** The restriction every personal-expense tool restates. */
const AGENT_WRITE_LIMIT =
  '只能新增支出；不能碰人建的交易。Only creates EXPENSE transactions and can only change, delete or mark ' +
  'transactions this agent created — anything a person recorded is refused (403).'

/** How stored amounts work, for the tools that take or show one. */
const AMOUNT_RULE =
  'Amounts are stored values in the ACCOUNT\'s currency (金額為帳戶幣別的儲存值): ' +
  'a JPY account takes the yen amount (¥1000 → 1000); a TWD card used abroad takes the TWD amount, ' +
  'with original_amount + original_currency (e.g. 1000 JPY) alongside.'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const dateParam = (what: string) =>
  z.string().regex(ISO_DATE, 'expected YYYY-MM-DD').describe(`${what}, YYYY-MM-DD`)

/** A calendar day as the RFC3339 timestamp the transaction API expects. */
function occurredAt(date: string): string {
  return `${date}T00:00:00Z`
}

function formatTransaction(t: Transaction, currency?: string): string {
  const cur = currency ?? t.account?.currency
  const amount = cur ? `${t.amount} ${cur}` : `${t.amount}`
  const original =
    t.original_amount != null && t.original_currency ? ` (orig ${t.original_amount} ${t.original_currency})` : ''
  const merchant = t.merchant?.name ? `  ${t.merchant.name}` : t.merchant_id ? `  merchant ${t.merchant_id}` : ''
  const note = t.note ? `  "${t.note}"` : ''
  const country = t.spending_country ? `  [${t.spending_country}]` : ''
  const actor = t.created_by_actor === 'agent' ? '  [by agent]' : '  [by person — read-only]'
  return `${t.id}  ${dayOf(t.occurred_at)}  ${t.type} ${amount}${original}${merchant}${note}${country}${actor}`
}

function formatProgress(p: RewardProgress): string {
  const plan = p.plan
  const cur = plan.currency
  const period = `${p.period_start}~${p.period_end}${p.offset !== 0 ? `, offset ${p.offset}` : ''}`
  const spend =
    p.spend_cap != null
      ? `spent ${p.qualifying_spend} / cap ${p.spend_cap} ${cur} (${Math.round((p.usage_ratio ?? 0) * 1000) / 10}%), ` +
        `remaining ${p.remaining_spend} ${cur}`
      : `spent ${p.qualifying_spend} ${cur} (no cap)`
  const reward = `est. reward ${p.estimated_reward}${plan.cap_amount != null ? `/${plan.cap_amount}` : ''} ${plan.unit_label}`
  const flags = [
    p.capped ? 'CAPPED' : '',
    p.over_cap_spend > 0 ? `over cap by ${p.over_cap_spend} ${cur}` : '',
    p.converted ? '≈ FX-converted' : '',
    p.unknown_country_count > 0 ? `${p.unknown_country_count} overseas tx with unknown country` : '',
  ].filter(Boolean)
  return (
    `${plan.id}  ${plan.name}  (${period}, ${plan.inclusion_mode})\n` +
    `  ${spend}; ${reward}${flags.length ? `  [${flags.join('; ')}]` : ''}`
  )
}

function formatProgressTransaction(row: RewardProgressTransaction, planCurrency: string): string {
  const mark = row.mark_included === true ? '  [marked in]' : row.mark_included === false ? '  [marked out]' : ''
  const converted = row.converted ? `  ≈${row.converted_amount} ${planCurrency}` : ''
  return `  ${formatTransaction(row.transaction)}${converted}${mark}`
}

function flattenCategories(nodes: Category[], depth = 0): string[] {
  return nodes.flatMap((c) => [
    `${'  '.repeat(depth)}${c.id}  ${c.icon ? `${c.icon} ` : ''}${c.name}`,
    ...flattenCategories(c.children ?? [], depth + 1),
  ])
}

/** Resolves a lookup best-effort: missing scope or a failure just means ids stay ids. */
async function optional<T>(load: () => Promise<T>): Promise<T | undefined> {
  try {
    return await load()
  } catch {
    return undefined
  }
}

/**
 * Finds the plan period holding a given day: the current one, else the one
 * before (a receipt recorded just after a statement closes). Returns undefined
 * if neither holds it.
 */
async function progressForDay(client: ZenBillClient, planId: string, day: string) {
  for (const offset of [0, -1]) {
    const detail = await client.getRewardPlanProgress(planId, offset)
    if (day >= detail.period_start && day <= detail.period_end) return detail
    if (detail.plan.period_type === 'whole_validity') return detail
  }
  return undefined
}

async function main() {
  const { baseUrl, token } = readConfig()
  const client = new ZenBillClient(baseUrl, token)
  const server = new McpServer({ name: 'zenbill', version: '0.0.1' })

  server.tool(
    'list_shared_ledgers',
    'List the shared ledgers this user belongs to. Use it to find the ledger_id the other tools need.',
    {},
    async () =>
      reply(async () => {
        const ledgers = await client.listLedgers()
        if (ledgers.length === 0) return 'No shared ledgers.'
        return ledgers
          .map((l) => `${l.id}  ${l.name} (${l.currency}, with ${l.partner_name})`)
          .join('\n')
      }),
  )

  server.tool(
    'get_shared_ledger_summary',
    'Totals for a shared ledger: overall spend, each side’s share, and the outstanding receivable balance. Answers "how much do we owe each other".',
    { ledger_id: z.string().describe('Ledger UUID from list_shared_ledgers') },
    async ({ ledger_id }) =>
      reply(async () => {
        const s = await client.getSummary(ledger_id)
        return [
          `Total expenses: ${s.total_expenses}`,
          `Owner share: ${s.owner_share}`,
          `Partner share: ${s.partner_share}`,
          `Receivable balance: ${s.receivable_balance}`,
          `Expense count: ${s.expense_count}`,
        ].join('\n')
      }),
  )

  server.tool(
    'list_shared_expenses',
    'List expenses in a shared ledger, newest first. Supports a date range for reconciling a month.',
    {
      ledger_id: z.string().describe('Ledger UUID'),
      from: z.string().optional().describe('Inclusive start date, YYYY-MM-DD'),
      to: z.string().optional().describe('Inclusive end date, YYYY-MM-DD'),
      limit: z.number().int().positive().max(200).optional().describe('Max rows (default 50)'),
    },
    async ({ ledger_id, from, to, limit }) =>
      reply(async () => {
        const expenses = await client.listExpenses(ledger_id, { from, to, limit })
        if (expenses.length === 0) return 'No expenses matched.'
        return expenses
          .map((e) => {
            const settled = e.settled_at ? ' [settled]' : ''
            const byAgent = e.created_by_actor === 'agent' ? ' [recorded by agent]' : ''
            return (
              `${e.id}  ${dayOf(e.date)}  ${e.description} (${e.category})  ` +
              `${e.total_amount} paid by ${e.payer_name}  ` +
              `split ${e.owner_amount}/${e.partner_amount}${settled}${byAgent}`
            )
          })
          .join('\n')
      }),
  )

  server.tool(
    'create_shared_expense',
    'Record a shared expense. The result restates the split so the user can catch a miscalculation immediately. ' +
      'This never touches personal accounts or balances — it only writes to the shared ledger.',
    {
      ledger_id: z.string().describe('Ledger UUID'),
      date: z.string().describe('Date of the expense, YYYY-MM-DD'),
      category: z.string().describe('Category, e.g. food, transport, accommodation, supplies, other'),
      description: z.string().describe('What it was for'),
      payer_name: z.string().describe('Display name of whoever paid'),
      paid_by_owner: z
        .boolean()
        .optional()
        .describe('True if the ledger owner paid, false if the partner did'),
      total_amount: z.number().positive().describe('Total amount paid'),
      split_method: z
        .enum(['EQUAL', 'FULL_OWNER', 'FULL_PARTNER', 'CUSTOM'])
        .describe('EQUAL splits in half; FULL_OWNER/FULL_PARTNER assign the whole cost; CUSTOM needs both amounts'),
      owner_amount: z.number().optional().describe('Owner share, CUSTOM only'),
      partner_amount: z.number().optional().describe('Partner share, CUSTOM only'),
      // Deliberately no list of valid values here: the options live on the
      // user's Google Sheet and change without this description changing. Only
      // what the user actually said belongs in this field.
      partner_payment_method: z
        .string()
        .optional()
        .describe(
          'Which instrument the PARTNER paid with, only if the user said so explicitly. ' +
            'Applies only when the partner paid (paid_by_owner false); leave it out for expenses the owner paid. ' +
            'Never infer or guess one; leave it out when unmentioned.',
        ),
    },
    async (args) =>
      reply(async () => {
        const created = await client.createExpense({
          ...args,
          split_method: args.split_method as SplitMethod,
        })
        return (
          `Recorded ${created.id}: ${created.description} on ${dayOf(created.date)}\n` +
          formatSplit('owner', 'partner', created)
        )
      }),
  )

  server.tool(
    'delete_shared_expense',
    'Remove a shared expense — for undoing one just recorded in error. ' +
      'Expenses linked to a personal transaction are refused; those must be deleted from the ZenBill app.',
    {
      ledger_id: z.string().describe('Ledger UUID'),
      expense_id: z.string().describe('Expense UUID from list_shared_expenses'),
    },
    async ({ ledger_id, expense_id }) =>
      reply(async () => {
        await client.deleteExpense(ledger_id, expense_id)
        return `Deleted ${expense_id}.`
      }),
  )

  // --- Personal expenses (ADR 0005) ---

  server.tool(
    'list_accounts',
    '列出帳戶（id、類型、幣別、目前餘額）。List the user\'s accounts with id, type, currency and current balance — ' +
      'use it to find the account_id for create_expense (a card may have separate TWD and JPY accounts). Read-only.',
    {
      include_archived: z.boolean().optional().describe('Also list archived accounts (default false)'),
    },
    async ({ include_archived }) =>
      reply(async () => {
        const accounts = (await client.listAccounts()).filter((a) => include_archived || !a.archived_at)
        if (accounts.length === 0) return 'No accounts.'
        return accounts
          .map((a) => {
            const closing = a.closing_day ? `, closes day ${a.closing_day}` : ''
            const archived = a.archived_at ? ' [archived]' : ''
            return `${a.id}  ${a.name}  ${a.type} ${a.currency}  balance ${a.balance}${closing}${archived}`
          })
          .join('\n')
      }),
  )

  server.tool(
    'list_merchants',
    '列出／搜尋商家。List or search the user\'s merchants (case-insensitive name match), with their default ' +
      'category, account and country. Reuse an existing merchant before creating one.',
    {
      query: z.string().optional().describe('Substring of the merchant name to match'),
      limit: z.number().int().positive().max(500).optional().describe('Max rows (default 50)'),
    },
    async ({ query, limit }) =>
      reply(async () => {
        const [merchants, categories, accounts] = await Promise.all([
          client.listMerchants(),
          optional(() => client.listCategories()),
          optional(() => client.listAccounts()),
        ])
        const needle = query?.trim().toLowerCase()
        const matched = needle ? merchants.filter((m) => m.name.toLowerCase().includes(needle)) : merchants
        if (matched.length === 0) return needle ? `No merchant matches "${query}".` : 'No merchants.'

        const categoryName = new Map<string, string>()
        const walk = (nodes: Category[]) =>
          nodes.forEach((c) => {
            categoryName.set(c.id, c.name)
            walk(c.children ?? [])
          })
        walk(categories ?? [])
        const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))

        const max = limit ?? 50
        const lines = matched.slice(0, max).map((m) => {
          const parts = [
            m.default_category_id ? `category ${categoryName.get(m.default_category_id) ?? ''} ${m.default_category_id}` : '',
            m.default_account_id ? `account ${accountName.get(m.default_account_id) ?? ''} ${m.default_account_id}` : '',
            m.default_country ? `country ${m.default_country}` : '',
          ].filter(Boolean)
          return `${m.id}  ${m.name}${parts.length ? `  (default ${parts.join('; ').replace(/  +/g, ' ')})` : ''}`
        })
        if (matched.length > max) lines.push(`… ${matched.length - max} more; narrow with query.`)
        return lines.join('\n')
      }),
  )

  server.tool(
    'create_merchant',
    '新建商家（同名已存在會被拒絕，先用 list_merchants 查）。Create a merchant. A duplicate name is refused, so ' +
      'search with list_merchants first. Optional defaults are applied by the app when the user records at this merchant.',
    {
      name: z.string().min(1).describe('Merchant name as it should appear, e.g. the shop name on the receipt'),
      default_category_id: z.string().optional().describe('Category UUID from list_categories'),
      default_account_id: z.string().optional().describe('Account UUID from list_accounts'),
      default_country: z.string().optional().describe('ISO 3166-1 alpha-2, e.g. JP — the shop\'s country'),
    },
    async (args) =>
      reply(async () => {
        const m = await client.createMerchant(args)
        return `Created merchant ${m.id}: ${m.name}${m.default_country ? ` (${m.default_country})` : ''}`
      }),
  )

  server.tool(
    'list_categories',
    '列出支出分類樹。List the expense category tree (parent, then indented children). Prefer a child category; ' +
      'use the merchant\'s default category when it has one.',
    {
      include_income: z.boolean().optional().describe('Also list INCOME categories (default false)'),
    },
    async ({ include_income }) =>
      reply(async () => {
        const tree = (await client.listCategories()).filter((c) => include_income || c.type === 'EXPENSE')
        if (tree.length === 0) return 'No categories.'
        return flattenCategories(tree).join('\n')
      }),
  )

  server.tool(
    'find_similar_transactions',
    '查重複：同帳戶、同一天、同金額的交易。Duplicate check before recording: transactions on the same account, ' +
      'same day, whose amount OR original_amount equals the given amount. Run it before create_expense; ' +
      'flag any hit to the user as a possible duplicate.',
    {
      account_id: z.string().describe('Account UUID'),
      date: dateParam('Day of the expense'),
      amount: z.number().positive().describe('Amount in the account currency, or the original foreign amount'),
    },
    async ({ account_id, date, amount }) =>
      reply(async () => {
        const txs = await client.findSimilarTransactions(account_id, date, amount)
        if (txs.length === 0) return 'No similar transactions — not a duplicate.'
        return `${txs.length} possible duplicate(s):\n` + txs.map((t) => formatTransaction(t)).join('\n')
      }),
  )

  server.tool(
    'create_expense',
    '新增一筆個人支出（記入後扣帳戶餘額）。' +
      AGENT_WRITE_LIMIT +
      ' Record one EXPENSE on an account; the balance moves with it. ' +
      AMOUNT_RULE +
      ' Optionally mark it as counted toward reward plans (reward_plan_ids); the result reports each mark and ' +
      'the plans\' progress after the write. Only call after the user has confirmed the entry.',
    {
      account_id: z.string().describe('Account UUID from list_accounts'),
      date: dateParam('Day of the expense'),
      amount: z.number().positive().describe('Stored amount in the account\'s currency'),
      category_id: z.string().optional().describe('Category UUID (merchant default if it has one)'),
      merchant_id: z.string().optional().describe('Merchant UUID from list_merchants / create_merchant'),
      note: z.string().optional().describe('Free text, e.g. an item summary from the receipt'),
      original_amount: z
        .number()
        .positive()
        .optional()
        .describe('Foreign amount when the account currency differs from what was paid'),
      original_currency: z.string().optional().describe('ISO 4217 of original_amount, e.g. JPY'),
      exchange_rate: z.number().positive().optional().describe('Rate used, if known (1 original = rate account currency)'),
      country_override: z
        .string()
        .optional()
        .describe('ISO 3166-1 alpha-2 where it was spent, only when the merchant/currency would not imply it'),
      reward_plan_ids: z
        .array(z.string())
        .optional()
        .describe('Reward plan UUIDs to mark this expense as counted in (needed for manual-inclusion plans)'),
    },
    async ({ date, reward_plan_ids, ...fields }) =>
      reply(async () => {
        const tx = await client.createPersonalExpense({ ...fields, type: 'EXPENSE', occurred_at: occurredAt(date) })
        const account = await optional(() => client.getAccount(tx.account_id))
        const lines = [
          `Recorded ${formatTransaction(tx, account?.currency)}`,
          account ? `Account ${account.name}: balance now ${account.balance} ${account.currency}` : '',
        ].filter(Boolean)

        const planIds = reward_plan_ids ?? []
        if (planIds.length > 0) {
          const failed: string[] = []
          lines.push('Reward marks:')
          for (const planId of planIds) {
            try {
              await client.setRewardMark(planId, tx.id, true)
              lines.push(`  ok      ${planId} marked as counted`)
            } catch (error) {
              failed.push(planId)
              lines.push(`  FAILED  ${planId}: ${(error as Error).message}`)
            }
          }
          if (failed.length > 0) {
            lines.push(
              `The expense WAS recorded (${tx.id}); only ${failed.length} mark(s) failed. ` +
                'Tell the user, and do not re-create the expense.',
            )
          }

          lines.push('Progress after write:')
          for (const planId of planIds) {
            try {
              const detail = await progressForDay(client, planId, dayOf(tx.occurred_at))
              if (!detail) {
                lines.push(`  ${planId}: this expense falls outside the plan's current and previous period`)
                continue
              }
              const counted = detail.included_transactions.some((r) => r.transaction.id === tx.id)
              lines.push(formatProgress(detail).replace(/^/gm, '  ') + `\n    this expense: ${counted ? 'counted' : 'NOT counted'}`)
            } catch (error) {
              lines.push(`  ${planId}: progress unavailable — ${(error as Error).message}`)
            }
          }
        }
        return lines.join('\n')
      }),
  )

  server.tool(
    'update_agent_expense',
    '修改 agent 自己建的支出。' +
      AGENT_WRITE_LIMIT +
      ' Change an expense this agent created; omitted fields stay as they are. The type cannot change. ' +
      AMOUNT_RULE,
    {
      transaction_id: z.string().describe('Transaction UUID returned by create_expense'),
      account_id: z.string().optional().describe('Move it to another account'),
      date: dateParam('New day').optional(),
      amount: z.number().positive().optional().describe('New stored amount in the account\'s currency'),
      category_id: z.string().optional().describe('Category UUID'),
      merchant_id: z.string().optional().describe('Merchant UUID'),
      note: z.string().optional().describe('New note ("" empties it)'),
      original_amount: z.number().positive().optional(),
      original_currency: z.string().optional(),
      exchange_rate: z.number().positive().optional(),
      country_override: z
        .string()
        .nullable()
        .optional()
        .describe('ISO 3166-1 alpha-2; null or "" clears the override'),
    },
    async ({ transaction_id, date, ...fields }) =>
      reply(async () => {
        const body = { ...fields, ...(date ? { occurred_at: occurredAt(date) } : {}) }
        if (Object.keys(body).length === 0) return 'Nothing to change: pass at least one field.'
        const tx = await client.updatePersonalExpense(transaction_id, body)
        const account = await optional(() => client.getAccount(tx.account_id))
        return (
          `Updated ${formatTransaction(tx, account?.currency)}` +
          (account ? `\nAccount ${account.name}: balance now ${account.balance} ${account.currency}` : '')
        )
      }),
  )

  server.tool(
    'delete_agent_expense',
    '刪除 agent 自己建的支出（餘額會還原）。' +
      AGENT_WRITE_LIMIT +
      ' Delete an expense this agent created — for undoing a mistaken entry; the balance is restored. ' +
      'Expenses that are part of a shared expense are refused.',
    { transaction_id: z.string().describe('Transaction UUID returned by create_expense') },
    async ({ transaction_id }) =>
      reply(async () => {
        await client.deletePersonalExpense(transaction_id)
        return `Deleted ${transaction_id}.`
      }),
  )

  // --- Reward plans ---

  server.tool(
    'list_reward_progress',
    '回饋方案進度總覽：已刷、上限、還能刷多少、預估回饋。Reward-plan progress overview: qualifying spend, spend cap, ' +
      'remaining spend before the cap and estimated reward, per active plan. Answers "還能刷多少" / "哪些快封頂". ' +
      'Without account_id: every active plan, current period, capped first. With account_id: that account\'s plans, ' +
      'any period via offset. Spend figures are in the plan currency; refunds are not deducted.',
    {
      account_id: z.string().optional().describe('Only plans covering this account'),
      offset: z
        .number()
        .int()
        .min(-240)
        .max(0)
        .optional()
        .describe('Period: 0 = current (default), -1 = previous …; requires account_id'),
    },
    async ({ account_id, offset }) =>
      reply(async () => {
        if (offset && !account_id) {
          return 'offset needs account_id (or use get_reward_plan_progress for one plan).'
        }
        const rows = account_id
          ? await client.getAccountRewardProgress(account_id, offset ?? 0)
          : await client.listRewardProgress()
        if (rows.length === 0) return 'No active reward plans.'
        return rows.map(formatProgress).join('\n')
      }),
  )

  server.tool(
    'get_reward_plan_progress',
    '單一回饋方案某期的進度與明細。One reward plan\'s progress for a period, with counts of counted / not-counted ' +
      'expenses; optionally lists them. Spend figures are in the plan currency; refunds are not deducted.',
    {
      plan_id: z.string().describe('Reward plan UUID from list_reward_progress'),
      offset: z.number().int().min(-240).max(0).optional().describe('0 = current period (default), -1 = previous …'),
      transactions: z
        .enum(['none', 'included', 'all'])
        .optional()
        .describe('List transactions: none (default), included only, or included + excluded'),
      limit: z.number().int().positive().max(200).optional().describe('Max rows per list (default 20)'),
    },
    async ({ plan_id, offset, transactions, limit }) =>
      reply(async () => {
        const d = await client.getRewardPlanProgress(plan_id, offset ?? 0)
        const lines = [
          formatProgress(d),
          `  ${d.included_transactions.length} counted, ${d.excluded_transactions.length} not counted`,
        ]
        const max = limit ?? 20
        const list = (title: string, rows: RewardProgressTransaction[]) => {
          if (rows.length === 0) return
          lines.push(`${title}:`)
          rows.slice(0, max).forEach((r) => lines.push(formatProgressTransaction(r, d.plan.currency)))
          if (rows.length > max) lines.push(`  … ${rows.length - max} more`)
        }
        if (transactions === 'included' || transactions === 'all') list('Counted', d.included_transactions)
        if (transactions === 'all') list('Not counted', d.excluded_transactions)
        return lines.join('\n')
      }),
  )

  await server.connect(new StdioServerTransport())
}

main().catch((error: unknown) => {
  console.error('zenbill-mcp failed to start:', error)
  process.exit(1)
})
