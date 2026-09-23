/**
 * Cross-currency transfer conversion helper.
 *
 * Exchange rate is defined as `rate = source amount / target amount`,
 * i.e. 1 unit of the target currency equals `rate` units of the source currency.
 * This direction is consistent across the whole system and must not be inverted
 * elsewhere. See openspec change `add-cross-currency-transfer-rate`.
 */

import { roundToCurrency } from './currencyPrecision.ts'

export type CrossCurrencyField = 'source' | 'target' | 'rate'

/** Precision of one side of the transfer; applied to the stored value (`display × multiplier`). */
export interface CurrencyPrecision {
  decimals: number
  multiplier: number
}

export interface CrossCurrencyInput {
  source: number
  target: number
  rate: number
  /** Queue of edited fields; the last two distinct entries drive the computation. */
  lastEdited: CrossCurrencyField[]
  /** Precision used to round a computed source amount. */
  sourcePrecision: CurrencyPrecision
  /** Precision used to round a computed target amount. */
  targetPrecision: CurrencyPrecision
}

export interface CrossCurrencyResult {
  source: number
  target: number
  rate: number
}

function roundRate(value: number): number {
  return Math.round(value * 10_000) / 10_000
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
 * Recomputes a dependent field from the most recently edited field, anchoring on
 * the exchange rate. Editing an amount recomputes the OTHER amount from the rate
 * (overwriting any stale value, so per-keystroke edits stay in sync and an
 * auto-prefilled rate acts as a usable operand). Editing the rate recomputes an
 * amount from whichever amount is present. When no usable rate exists, an edited
 * amount plus the other present amount derives the rate.
 *
 * A computed amount is rounded half-up to its own currency's precision (see
 * `roundToCurrency`); entered amounts are never rounded, and the rate keeps its
 * entered/prefilled value. A derived rate is rounded to 4 decimal places.
 *
 * Returns the values unchanged when the operands needed for a computation are
 * not all greater than zero.
 */
export function computeCrossCurrencyAmount(input: CrossCurrencyInput): CrossCurrencyResult {
  const { source, target, rate, sourcePrecision, targetPrecision } = input
  const toSource = (value: number) =>
    roundToCurrency(value, sourcePrecision.decimals, sourcePrecision.multiplier)
  const toTarget = (value: number) =>
    roundToCurrency(value, targetPrecision.decimals, targetPrecision.multiplier)
  const edited = lastTwoDistinct(input.lastEdited)[0] // most recently edited field

  if (edited === 'source') {
    if (source > 0 && rate > 0) return { source, target: toTarget(source / rate), rate }
    if (source > 0 && target > 0) return { source, target, rate: roundRate(source / target) }
  } else if (edited === 'target') {
    if (target > 0 && rate > 0) return { source: toSource(target * rate), target, rate }
    if (target > 0 && source > 0) return { source, target, rate: roundRate(source / target) }
  } else if (edited === 'rate') {
    if (rate > 0 && source > 0) return { source, target: toTarget(source / rate), rate }
    if (rate > 0 && target > 0) return { source: toSource(target * rate), target, rate }
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
