## MODIFIED Requirements

### Requirement: System shall provide a shared cross-currency conversion function
The system SHALL provide a single shared pure function `computeCrossCurrencyAmount()` in `packages/shared/` that recomputes a dependent field from the most recently edited field, used by both the Web and APP transfer forms, treating the exchange rate as the anchor. When an amount (source or target) is the most recently edited field and the rate is greater than zero, the function SHALL recompute the OTHER amount from that amount and the rate — even if the other amount already holds a stale value (so per-keystroke edits keep the result in sync, and an auto-prefilled rate counts as a usable operand). When the rate is the most recently edited field, the function SHALL recompute an amount from whichever amount is present. When no usable rate is present, an edited amount combined with the other present amount SHALL derive the rate. The exchange rate SHALL be defined as `rate = source amount ÷ target amount` (i.e. 1 unit of target currency = rate units of source currency).

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

#### Scenario: Compute the empty amount from a prefilled rate
- **WHEN** the exchange rate is present (e.g. auto-prefilled) and the user has entered only one amount, leaving exactly one of {source, target} empty
- **THEN** the function computes the empty amount from the present amount and the rate
- **AND** does not require the rate to have been explicitly edited by the user

#### Scenario: Re-editing an amount recomputes the other from the rate
- **WHEN** the source amount is the most recently edited field, the rate is greater than zero, and the target amount already holds a stale value from an earlier edit
- **THEN** the function recomputes the target amount as `source / rate`, overwriting the stale value
- **AND** this keeps the result correct across per-keystroke edits rather than freezing at the first computed value

#### Scenario: Guard against invalid or insufficient input
- **WHEN** two or more fields are empty (≤ 0), or any value participating in the computation is less than or equal to zero
- **THEN** the function performs no computation and leaves the existing values unchanged
