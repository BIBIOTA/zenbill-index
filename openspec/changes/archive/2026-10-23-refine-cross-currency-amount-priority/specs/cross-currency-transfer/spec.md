## MODIFIED Requirements

### Requirement: System shall provide a shared cross-currency conversion function
The system SHALL provide a single shared pure function `computeCrossCurrencyAmount()` in `packages/shared/` that recomputes one dependent field from the user's edit history, used by both the Web and APP transfer forms. The dependent field SHALL be the one NOT among the two most recently edited distinct fields: when the two most recent distinct edits are source and target, the function SHALL derive the rate; when they are an amount and the rate, the function SHALL recompute the other amount. When only one field has been edited, the exchange rate SHALL act as the anchor: an edited amount with a rate greater than zero SHALL recompute the OTHER amount from that amount and the rate — even if the other amount already holds a stale value (so per-keystroke edits keep the result in sync, and an auto-prefilled rate counts as a usable operand); an edited rate SHALL recompute an amount from whichever amount is present; an edited amount with no usable rate combined with the other present amount SHALL derive the rate. The choice of dependent field SHALL NOT depend on which fields are empty. The exchange rate SHALL be defined as `rate = source amount ÷ target amount` (i.e. 1 unit of target currency = rate units of source currency).

A computed amount SHALL be rounded half-up to the precision of its own currency, applied to the stored value: `round(display × multiplier, decimals) / multiplier`, where `decimals` and `multiplier` belong to the source currency for a computed source amount and to the target currency for a computed target amount. Amounts entered by the user SHALL NOT be rounded. The exchange rate SHALL keep its entered or prefilled value and SHALL NOT be re-derived after rounding.

#### Scenario: Derive target amount from source and rate
- **WHEN** source amount and exchange rate are both greater than zero and the target amount is empty
- **THEN** the function returns the target amount computed as `source / rate`, rounded to the target currency precision

#### Scenario: Derive source amount from target and rate
- **WHEN** target amount and exchange rate are both greater than zero and the source amount is empty
- **THEN** the function returns the source amount computed as `target * rate`, rounded to the source currency precision

#### Scenario: Round to zero decimals for an integer currency
- **WHEN** a TWD → JPY transfer has source 16577 TWD and rate 0.2026, and JPY resolves to 0 decimal places
- **THEN** the computed target amount is `81821` (not `81821.32`)

#### Scenario: Round to three decimals for a three-decimal currency
- **WHEN** the target currency is KWD (3 decimal places)
- **THEN** the computed target amount is rounded to 3 decimal places

#### Scenario: Apply precision to the stored value when a multiplier applies
- **WHEN** the target currency is VND with 0 decimal places and a multiplier of 1000
- **THEN** the computed target display amount is rounded so that `display × 1000` is an integer

#### Scenario: Keep the rate after rounding
- **WHEN** a computed amount is rounded to its currency precision
- **THEN** the returned rate equals the input rate

#### Scenario: Derive rate from source and target
- **WHEN** source amount and target amount are both greater than zero and the exchange rate is empty
- **THEN** the function returns the exchange rate computed as `source / target`, rounded to 4 decimal places

#### Scenario: Entering both amounts derives the rate even with a prefilled rate
- **WHEN** the rate holds a value (e.g. auto-prefilled), and the two most recently edited distinct fields are source and target, both greater than zero
- **THEN** the function derives the rate as `source / target`, rounded to 4 decimal places
- **AND** returns both amounts unchanged

#### Scenario: Editing the rate after both amounts recomputes the older amount
- **WHEN** the two most recently edited distinct fields are target and rate, both greater than zero
- **THEN** the function recomputes the source amount as `target * rate`, overwriting its previous value

#### Scenario: Compute the empty amount from a prefilled rate
- **WHEN** the exchange rate is present (e.g. auto-prefilled) and the user has entered only one amount, leaving exactly one of {source, target} empty
- **THEN** the function computes the empty amount from the present amount and the rate
- **AND** does not require the rate to have been explicitly edited by the user

#### Scenario: Re-editing an amount recomputes the other from the rate
- **WHEN** the source amount is the only edited field, the rate is greater than zero, and the target amount already holds a stale value from an earlier edit
- **THEN** the function recomputes the target amount as `source / rate`, overwriting the stale value
- **AND** this keeps the result correct across per-keystroke edits rather than freezing at the first computed value

#### Scenario: Guard against invalid or insufficient input
- **WHEN** two or more fields are empty (≤ 0), or any value participating in the computation is less than or equal to zero
- **THEN** the function performs no computation and leaves the existing values unchanged

### Requirement: Transfer form shall support cross-currency conversion on both platforms
Both the Web (`frontend/`) and APP (`app/`) transfer forms SHALL detect when a TRANSFER occurs between accounts of different currencies, present target-amount and exchange-rate inputs, prefill an editable rate, and submit the converted target-currency amount. The same behavior SHALL be shared via `packages/shared/` so the two platforms do not diverge.

#### Scenario: Detect cross-currency transfer
- **WHEN** the transaction type is TRANSFER and the source and target accounts have different currencies
- **THEN** the form shows the target-amount input and the exchange-rate input

#### Scenario: Same-currency transfer keeps the single-amount flow
- **WHEN** the source and target accounts have the same currency, or the type is not TRANSFER
- **THEN** the form hides the target-amount and exchange-rate inputs and uses the original single-amount flow

#### Scenario: Auto-compute on field edits
- **WHEN** the user edits any two of {source amount, target amount, exchange rate}
- **THEN** the form computes the third field via the shared `computeCrossCurrencyAmount()` function

#### Scenario: Entering one amount with a prefilled rate computes the other
- **WHEN** the rate has been auto-prefilled (not manually edited) and the user enters only the source amount, or only the target amount
- **THEN** the form auto-computes the other amount from the prefilled rate via `computeCrossCurrencyAmount()`
- **AND** the target amount is not left at zero, so the submitted transfer credits the target account a non-zero amount

#### Scenario: Entering both actual amounts derives the rate
- **WHEN** the rate has been auto-prefilled and the user enters the source amount and then the target amount
- **THEN** the form keeps both entered amounts and replaces the rate with `source / target`

#### Scenario: Prefill the rate only while the user has not fixed it
- **WHEN** a cross-currency transfer is detected, the user has not manually edited the rate, and the user has not manually entered both amounts
- **THEN** the form prefills the rate from `useExchangeRate`
- **AND** once the user manually edits the rate, or has entered both amounts, the form stops overwriting the rate with the prefilled value

#### Scenario: Editing an existing cross-currency transfer keeps its actual amounts
- **WHEN** the form opens an existing cross-currency transfer
- **THEN** the edit history starts as source and target both edited, so the stored rate is not replaced by a prefilled rate
- **AND** editing either amount derives the rate rather than overwriting the other amount
- **AND** the edit history is not cleared while the accounts list is still loading

#### Scenario: Reset state when the currency relationship changes
- **WHEN** account selection changes so that a cross-currency transfer becomes one whose source and target currencies are equal
- **THEN** the form hides the target-amount and exchange-rate inputs
- **AND** resets the prefill state and the last-edited tracking

#### Scenario: Submit a cross-currency transfer payload
- **WHEN** the user submits a cross-currency transfer
- **THEN** the payload sets `amount` to the source-currency amount multiplied by the source currency multiplier
- **AND** sets `original_amount` to the target-currency amount multiplied by the target currency multiplier
- **AND** sets `original_currency` to the target account currency
- **AND** sets `exchange_rate` to the entered rate

#### Scenario: Omit cross-currency fields for non-cross-currency transactions
- **WHEN** the user submits a non-cross-currency transaction
- **THEN** the payload sends `original_amount`, `original_currency`, and `exchange_rate` as undefined
