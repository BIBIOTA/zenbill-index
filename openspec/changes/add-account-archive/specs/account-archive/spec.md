## ADDED Requirements

### Requirement: System shall archive an account only when it is settled and unreferenced
The system SHALL let an authenticated user archive their own account by setting `archived_at`,
only when the account's balance rounds to zero at its currency precision, a STOCK account holds
zero shares, auto-pay is disabled on a CREDIT account, and no credit card uses it as auto-pay source,
no merchant uses it as default account, and no TPASS card is linked to it.

#### Scenario: Settled, unreferenced account is archived
- **WHEN** the user archives an account with zero balance and no references
- **THEN** the system sets `archived_at` to the current time and returns the account

#### Scenario: Archive blocked lists every reason
- **WHEN** the user archives an account with a non-zero balance that is also the auto-pay source of a credit card
- **THEN** the system responds HTTP 409
- **AND** `data.reasons` contains both a `NON_ZERO_BALANCE` and an `AUTO_PAY_SOURCE` entry with human-readable messages naming the amount and the credit card
- **AND** `archived_at` stays NULL and no reference is modified

#### Scenario: Residual fractional balance counts as zero
- **WHEN** a TWD account's stored balance is 0.0001
- **THEN** archive is not blocked by `NON_ZERO_BALANCE`

#### Scenario: Archiving an already archived account
- **WHEN** the user archives an account that is already archived
- **THEN** the system succeeds without changing `archived_at`

### Requirement: System shall unarchive unconditionally
#### Scenario: Unarchive
- **WHEN** the user unarchives an archived account
- **THEN** `archived_at` becomes NULL

### Requirement: System shall permanently delete only archived, fully unreferenced accounts
#### Scenario: Delete active account
- **WHEN** the user deletes an account whose `archived_at` is NULL
- **THEN** the system responds HTTP 409 with a `NOT_ARCHIVED` reason

#### Scenario: Delete account that received transfers
- **WHEN** the user deletes an archived account that appears only as `target_account_id` of a TRANSFER
- **THEN** the system responds HTTP 409 with a `HAS_TRANSACTIONS` reason and the account remains

#### Scenario: Delete clean archived account
- **WHEN** the user deletes an archived account with no transactions and no references
- **THEN** the account row is removed

### Requirement: System shall reject new transactions on archived accounts
#### Scenario: Create transaction on archived account
- **WHEN** a new transaction (including stock buy/sell/dividend, auto-pay and shared-expense conversion) uses an archived account as `account_id` or `target_account_id`
- **THEN** the system responds HTTP 400 "帳戶已封存" and writes nothing

#### Scenario: Edit existing transaction on archived account
- **WHEN** the user edits or deletes an existing transaction belonging to an archived account
- **THEN** the system processes it as usual, keeping `accounts.balance` consistent

### Requirement: System shall not send payment reminders for archived credit cards
#### Scenario: Archived card due today
- **WHEN** the reminder job runs on an archived credit card's payment due day
- **THEN** no reminder or auto-pay is produced for it

### Requirement: Clients shall hide archived accounts from everyday use
#### Scenario: Account list
- **WHEN** the user opens the account list
- **THEN** archived accounts appear only in a collapsed「已封存」section at the bottom

#### Scenario: Transaction form
- **WHEN** the user creates a transaction
- **THEN** archived accounts are not selectable
- **AND** when editing an existing transaction, its current archived account is still displayed

#### Scenario: History unaffected
- **WHEN** the user views net asset trend or filters transactions by account
- **THEN** archived accounts are still included
