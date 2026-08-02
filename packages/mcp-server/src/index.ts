#!/usr/bin/env node
/**
 * ZenBill MCP server.
 *
 * Exposes the shared-ledger surface to an AI agent over stdio: read the
 * ledgers, read the running totals, record a shared expense, take one back.
 *
 * Two things are deliberately absent. There is no tool that writes to a ledger
 * itself — creating, renaming, deleting, inviting or syncing — and no tool
 * parameter for a payment account, merchant or personal category. Their absence
 * is defence in depth, not the defence itself: the server enforces both
 * independently, so nothing here is load-bearing for safety.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { dayOf, ZenBillApiError, ZenBillClient, type SplitMethod } from './client.js'

const DEFAULT_API_URL = 'http://localhost:8080/api/v1'

function readConfig(): { baseUrl: string; token: string } {
  const token = process.env.ZENBILL_AGENT_TOKEN
  if (!token) {
    console.error(
      'ZENBILL_AGENT_TOKEN is not set. Issue one with:\n' +
        '  docker exec -it zenbill_api /app/agent_token issue --user <uuid> --name claude-code --scopes shared_ledger:read,shared_expense:write',
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

  await server.connect(new StdioServerTransport())
}

main().catch((error: unknown) => {
  console.error('zenbill-mcp failed to start:', error)
  process.exit(1)
})
