# billing-period-balance Specification

## Purpose
TBD - created by archiving change debug-credit-card-defer-balance. Update Purpose after archive.
## Requirements
### Requirement: Billing period balance calculation shall respect deferred transaction reclassification
When computing the running balance anchor (`balanceAtEnd`) for a credit card billing period via `ListByAccountWithBalanceInDateRangeWithDeferred`, the system SHALL exclude the effect of any transaction whose `occurred_at` falls within the current period `[startDate, endDate]` but whose `billing_period_deferred` flag is `true`, so that a transaction moved to the next billing period is fully removed — both from the displayed list and from the balance calculation — rather than only from the list.

#### Scenario: Deferred-out transaction is excluded from the current period's balance
- **WHEN** a transaction A occurred within the current period `[startDate, endDate]` and has been marked `billing_period_deferred = true`
- **THEN** transaction A does not appear in the current period's transaction list (existing behavior, unchanged)
- **AND** the `RunningBalance` shown for every other transaction in the current period no longer includes transaction A's effective amount
- **AND** the balance anchor `balanceAtEnd` equals `accountBalance` minus the effective amount of every transaction chronologically after `endDate` minus the effective amount of transaction A

#### Scenario: Un-deferring a transaction restores it to the current period's balance
- **WHEN** a transaction that was previously marked `billing_period_deferred = true` within `[startDate, endDate]` is reset to `billing_period_deferred = false`
- **THEN** the transaction reappears in the current period's transaction list
- **AND** the `RunningBalance` shown for transactions in the current period includes its effective amount again

### Requirement: Balance for transactions carried in from the previous period remains unchanged
Transactions that occurred within the previous period `[prevStartDate, prevEndDate]` and are marked `billing_period_deferred = true` (carried into the current period's list) SHALL continue to have their effective amount counted toward the current period's balance anchor, without additional adjustment, because their `occurred_at` is chronologically before `endDate` and is therefore already included in the real account balance up to `endDate`.

#### Scenario: Deferred-in transaction from the previous period is already reflected in the balance
- **WHEN** a transaction B occurred within the previous period `[prevStartDate, prevEndDate]` and has been marked `billing_period_deferred = true`
- **THEN** transaction B appears in the current period's transaction list (existing behavior, unchanged)
- **AND** the balance anchor `balanceAtEnd` requires no separate adjustment for transaction B, since its effect is already included via the real `accountBalance` minus the sum of transactions after `endDate`

### Requirement: List membership and balance calculation shall use a single consistent deferred-reclassification rule
The set of transactions used to determine which transactions belong to the current billing period for the transaction list (`FindByAccountIDAndDateRangeWithDeferred`) SHALL be the same logical set used to determine the balance anchor calculation, so the two never diverge on whether a given transaction counts as "in this period."

#### Scenario: List and balance stay consistent for a mixed period
- **WHEN** a billing period contains a mix of non-deferred transactions, one transaction deferred out to the next period, and one transaction deferred in from the previous period
- **THEN** the displayed transaction list matches exactly the transactions counted in the `balanceAtEnd` → per-row `RunningBalance` walk-back
- **AND** summing the `RunningBalance` deltas across the displayed list reproduces `balanceAtEnd` exactly (no residual amount from excluded or included transactions)

