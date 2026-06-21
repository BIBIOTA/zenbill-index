/**
 * Cross-currency transfer conversion helper.
 *
 * Exchange rate is defined as `rate = source amount / target amount`,
 * i.e. 1 unit of the target currency equals `rate` units of the source currency.
 * This direction is consistent across the whole system and must not be inverted
 * elsewhere. See openspec change `add-cross-currency-transfer-rate`.
 */

export type CrossCurrencyField = 'source' | 'target' | 'rate'

export interface CrossCurrencyInput {
  source: number
  target: number
  rate: number
  /** Queue of edited fields; the last two distinct entries drive the computation. */
  lastEdited: CrossCurrencyField[]
}

export interface CrossCurrencyResult {
  source: number
  target: number
  rate: number
}

const ALL_FIELDS: CrossCurrencyField[] = ['source', 'target', 'rate']

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Returns the last two distinct edited fields, preserving recency order. */
function lastTwoDistinct(lastEdited: CrossCurrencyField[]): CrossCurrencyField[] {
  const seen: CrossCurrencyField[] = []
  for (let i = lastEdited.length - 1; i >= 0 && seen.length < 2; i--) {
    const field = lastEdited[i]
    if (!seen.includes(field)) seen.push(field)
  }
  return seen
}

/**
 * Derives the third of {source, target, rate} from the two most recently edited
 * values. Returns the values unchanged when fewer than two distinct fields were
 * edited or when a value participating in the computation is <= 0.
 */
export function computeCrossCurrencyAmount(input: CrossCurrencyInput): CrossCurrencyResult {
  const { source, target, rate } = input
  const edited = lastTwoDistinct(input.lastEdited)

  if (edited.length < 2) {
    return { source, target, rate }
  }

  const missing = ALL_FIELDS.find((f) => !edited.includes(f))

  if (missing === 'target' && source > 0 && rate > 0) {
    return { source, target: roundTo(source / rate, 2), rate }
  }
  if (missing === 'source' && target > 0 && rate > 0) {
    return { source: roundTo(target * rate, 2), target, rate }
  }
  if (missing === 'rate' && source > 0 && target > 0) {
    return { source, target, rate: roundTo(source / target, 4) }
  }

  return { source, target, rate }
}

/**
 * Returns true when a transaction is a TRANSFER between two accounts whose
 * currencies differ, i.e. it needs manual exchange-rate conversion.
 */
export function isCrossCurrencyTransfer(
  type: string,
  sourceCurrency: string | undefined,
  targetCurrency: string | undefined,
): boolean {
  return (
    type === 'TRANSFER' &&
    !!sourceCurrency &&
    !!targetCurrency &&
    sourceCurrency !== targetCurrency
  )
}

export interface TransferPayloadInput {
  isCrossCurrency: boolean
  sourceAmount: number
  targetAmount: number
  rate: number
  targetCurrency: string
  sourceMultiplier: number
  targetMultiplier: number
}

export interface TransferPayloadFields {
  amount: number
  original_amount: number | undefined
  original_currency: string | undefined
  exchange_rate: number | undefined
}

/**
 * Assembles the transfer transaction payload fields, applying the per-currency
 * display multipliers. For cross-currency transfers the target-currency amount
 * and rate are emitted; otherwise the cross-currency fields are left undefined.
 */
export function buildTransferPayloadFields(input: TransferPayloadInput): TransferPayloadFields {
  const amount = input.sourceAmount * input.sourceMultiplier

  if (!input.isCrossCurrency) {
    return {
      amount,
      original_amount: undefined,
      original_currency: undefined,
      exchange_rate: undefined,
    }
  }

  return {
    amount,
    original_amount: input.targetAmount * input.targetMultiplier,
    original_currency: input.targetCurrency,
    exchange_rate: input.rate,
  }
}

/**
 * Decides whether the form should prefill the rate from the live rate service:
 * only for cross-currency transfers where the user has not manually edited the
 * rate yet. Once the user overrides the rate, prefilling stops.
 */
export function shouldPrefillRate(isCrossCurrency: boolean, rateManuallyEdited: boolean): boolean {
  return isCrossCurrency && !rateManuallyEdited
}
