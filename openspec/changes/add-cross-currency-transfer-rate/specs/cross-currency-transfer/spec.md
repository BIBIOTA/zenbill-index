## ADDED Requirements

### Requirement: System shall provide a shared cross-currency conversion function
The system SHALL provide a single shared pure function `computeCrossCurrencyAmount()` in `packages/shared/` that derives the missing one of {source amount, target amount, exchange rate} from the other two, used by both the Web and APP transfer forms. When exactly one field is empty (≤ 0) and the other two are greater than zero, the function SHALL compute the empty field regardless of how many fields were explicitly edited — so an auto-prefilled rate counts as a usable operand. When all three fields are greater than zero, the function SHALL use the two most recently edited fields to decide which field to recompute. The exchange rate SHALL be defined as `rate = source amount ÷ target amount` (i.e. 1 unit of target currency = rate units of source currency).

#### Scenario: Derive target amount from source and rate
- **WHEN** source amount and exchange rate are both greater than zero and the target amount is empty
- **THEN** the function returns the target amount computed as `source / rate`, rounded to 2 decimal places

#### Scenario: Derive source amount from target and rate
- **WHEN** target amount and exchange rate are both greater than zero and the source amount is empty
- **THEN** the function returns the source amount computed as `target * rate`, rounded to 2 decimal places

#### Scenario: Derive rate from source and target
- **WHEN** source amount and target amount are both greater than zero and the exchange rate is empty
- **THEN** the function returns the exchange rate computed as `source / target`, rounded to 4 decimal places

#### Scenario: Compute the empty amount from a prefilled rate
- **WHEN** the exchange rate is present (e.g. auto-prefilled) and the user has entered only one amount, leaving exactly one of {source, target} empty
- **THEN** the function computes the empty amount from the present amount and the rate
- **AND** does not require the rate to have been explicitly edited by the user

#### Scenario: Guard against invalid or insufficient input
- **WHEN** two or more fields are empty (≤ 0), or any value participating in the computation is less than or equal to zero
- **THEN** the function performs no computation and leaves the existing values unchanged

### Requirement: System shall prefill an editable exchange rate from the rate service
The system SHALL provide a shared `useExchangeRate(from, to)` hook in `packages/shared/` that fetches a live rate from the existing `GET /exchange-rates` endpoint and exposes it for prefilling the transfer form, while always allowing the user to override the value.

#### Scenario: Fetch and normalize rate direction
- **WHEN** the hook is called with non-empty `from` (source currency) and `to` (target currency)
- **THEN** the system requests `GET /exchange-rates?from=<from>&to=<to>`
- **AND** converts the API result (1 from = Y to) into the system rate definition as `rate = 1 / Y` so the direction matches `source ÷ target`

#### Scenario: Skip request for incomplete currencies
- **WHEN** either `from` or `to` is empty
- **THEN** the hook does not issue a request

#### Scenario: Rate service failure does not block the form
- **WHEN** the rate request fails
- **THEN** the hook does not throw to the caller
- **AND** returns no prefill value so the user can enter the rate manually

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

#### Scenario: Prefill the rate once and respect manual overrides
- **WHEN** a cross-currency transfer is detected and the user has not manually edited the rate
- **THEN** the form prefills the rate from `useExchangeRate`
- **AND** once the user manually edits the rate, the form stops overwriting it with the prefilled value

#### Scenario: Reset state when the currency relationship changes
- **WHEN** account selection changes so that the source and target currencies become equal
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
