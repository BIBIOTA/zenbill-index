// Request-shape tests for the wallet (行動支付) surface of the API client.
// Runs against a separate compiled copy (.test-build/): `pnpm test` compiles it first and never
// touches dist/, which the live OpenClaw agents run.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { ZenBillClient } from '../.test-build/client.js'

const BASE = 'http://zenbill.test/api/v1'
let calls
const realFetch = globalThis.fetch

beforeEach(() => {
  calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) })
    return new Response(JSON.stringify({ code: 0, message: 'ok', data: { id: 'tx-1', account_id: 'acc-1' } }), {
      status: 200,
    })
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
})

const client = () => new ZenBillClient(BASE, 'zbat_test')

test('listWallets reads GET /wallets', async () => {
  await client().listWallets()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].url, `${BASE}/wallets`)
})

test('createPersonalExpense sends wallet_id in the POST body', async () => {
  await client().createPersonalExpense({
    account_id: 'acc-1',
    type: 'EXPENSE',
    amount: 1200,
    occurred_at: '2026-11-21T00:00:00Z',
    merchant_id: 'm-1',
    wallet_id: 'w-paypay',
  })
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].url, `${BASE}/transactions`)
  assert.deepEqual(calls[0].body, {
    account_id: 'acc-1',
    type: 'EXPENSE',
    amount: 1200,
    occurred_at: '2026-11-21T00:00:00Z',
    merchant_id: 'm-1',
    wallet_id: 'w-paypay',
  })
})

test('createPersonalExpense without wallet_id sends no wallet_id key', async () => {
  await client().createPersonalExpense({ account_id: 'acc-1', type: 'EXPENSE', amount: 500, occurred_at: '2026-11-21T00:00:00Z' })
  assert.equal('wallet_id' in calls[0].body, false)
})

test('updatePersonalExpense sends wallet_id null to clear it', async () => {
  await client().updatePersonalExpense('tx-1', { wallet_id: null })
  assert.equal(calls[0].method, 'PUT')
  assert.equal(calls[0].url, `${BASE}/transactions/tx-1`)
  assert.deepEqual(calls[0].body, { wallet_id: null })
})

test('updatePersonalExpense omitting wallet_id leaves it out of the body', async () => {
  await client().updatePersonalExpense('tx-1', { amount: 900 })
  assert.deepEqual(calls[0].body, { amount: 900 })
})

test('createMerchant sends default_wallet_id in the POST body', async () => {
  await client().createMerchant({ name: '7-11', default_account_id: 'acc-1', default_wallet_id: 'w-1' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].url, `${BASE}/merchants`)
  assert.deepEqual(calls[0].body, { name: '7-11', default_account_id: 'acc-1', default_wallet_id: 'w-1' })
})
