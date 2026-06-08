## ADDED Requirements

### Requirement: User shall configure encrypted TPASS credentials
The system SHALL allow an authenticated user to configure TPASS query credentials using a national ID or ARC number and birth date, and SHALL store those values only in encrypted form.

#### Scenario: Save TPASS credentials
- **WHEN** an authenticated user submits a valid national ID or ARC number and a valid birth date
- **THEN** the system stores encrypted credential values
- **AND** stores only a masked national ID for display
- **AND** does not persist plaintext national ID or birth date

> See: ../../diagrams/02-er-tpass-data-model.puml
> See: ../../designs/figma.md#states

#### Scenario: Query TPASS status
- **WHEN** an authenticated user queries TPASS status
- **THEN** the system returns whether TPASS is configured, the masked national ID, last sync timestamp, sync status, and sync error
- **AND** the response does not include plaintext national ID or birth date

> See: ../../designs/figma.md#acceptance-criteria

### Requirement: System shall synchronize TPASS EasyCard data from the official TPASS site
The system SHALL synchronize the authenticated user's TPASS card list and monthly reward summaries from the official EasyCard TPASS query site through a backend scraper and typed parser.

#### Scenario: Manual sync succeeds
- **WHEN** an authenticated user triggers manual TPASS sync and no sync is already running for that user
- **THEN** the system decrypts the stored TPASS credentials
- **AND** uses OCR to solve the official site's image verification code
- **AND** fetches the official card list and each card's monthly summary
- **AND** upserts TPASS cards and monthly summaries
- **AND** updates the credential sync status to success

> See: ../../diagrams/01-activity-tpass-sync-flow.puml

#### Scenario: OCR or official site fails unexpectedly
- **WHEN** OCR verification, official page loading, official response parsing, or DOM contract matching fails after retry
- **THEN** the system marks the sync status as failed or partial_failed according to the failure scope
- **AND** stores a non-sensitive sync error
- **AND** preserves previously synced cards and monthly summaries
- **AND** does not ask the user to manually enter a verification code

> See: ../../diagrams/01-activity-tpass-sync-flow.puml
> See: ../../designs/figma.md#error---unexpected-sync-error

#### Scenario: Concurrent sync is rejected
- **WHEN** a user triggers TPASS sync while another TPASS sync for the same user is running
- **THEN** the system returns or records a sync-in-progress error
- **AND** does not start a second sync job for that user

> See: ../../diagrams/01-activity-tpass-sync-flow.puml

#### Scenario: Worker sync runs on schedule
- **WHEN** the TPASS worker schedule is due
- **THEN** the worker syncs all active TPASS credentials using the same scraper, parser, OCR, and persistence behavior as manual sync
- **AND** a failure for one user does not stop processing remaining users

> See: ../../diagrams/01-activity-tpass-sync-flow.puml

### Requirement: System shall parse TPASS card lists and monthly summaries from official HTML
The system SHALL parse official TPASS HTML into typed DTOs without exposing DOM details outside the TPASS integration package.

#### Scenario: Parse card list
- **WHEN** the parser reads the official card list HTML
- **THEN** it extracts each card number, card type, registration status, registration date when present, early-bird qualification, and reward-detail availability
- **AND** parser tests use de-identified fixtures that preserve required selectors and table structure

#### Scenario: Parse monthly summary
- **WHEN** the parser reads a single-card monthly detail table
- **THEN** it extracts each month, transport category counts, transaction amounts, official reward amounts, official total reward, and redeemed date
- **AND** it does not claim to extract per-ride transaction details

> See: ../../designs/figma.md#acceptance-criteria

#### Scenario: Infer year from query date
- **WHEN** the query date is 2026-06-08 and the official detail row month is 04
- **THEN** the summary year is 2026
- **AND** when the official detail row month is 12, the summary year is 2025

### Requirement: System shall persist TPASS cards and monthly summaries with secure card-number boundaries
The system SHALL persist TPASS card and monthly summary records with de-duplication, account-link constraints, and clear API boundaries for full card numbers.

#### Scenario: Upsert cards and summaries
- **WHEN** a synchronized card number already exists for the same user
- **THEN** the system uses `card_number_hash` to update the existing card record
- **AND** uses `user_id + card_id + year + month` to update the existing monthly summary record

> See: ../../diagrams/02-er-tpass-data-model.puml

#### Scenario: Full card number visibility is limited
- **WHEN** a user lists TPASS cards or views TPASS data inside a credit-card account
- **THEN** the API does not return the decrypted full card number
- **AND** the UI does not show the full card number in those list or account contexts
- **AND** when the user opens a single TPASS card detail, the detail API may return and display the full card number

> See: ../../designs/figma.md#happy-path---card-detail

#### Scenario: Credit account binds at most one TPASS card
- **WHEN** a user links a TPASS card to a credit-card account that already has another TPASS card linked
- **THEN** the system rejects the request with a conflict error
- **AND** preserves the existing linked card
- **AND** the persistence layer enforces one non-null `linked_account_id` per credit-card account

> See: ../../diagrams/02-er-tpass-data-model.puml
> See: ../../designs/figma.md#happy-path---credit-account-tpass-section

### Requirement: System shall calculate TPASS estimated rewards from official monthly summaries
The system SHALL calculate estimated TPASS rewards from official monthly summary counts and amounts, while preserving official reward fields as the primary displayed values.

#### Scenario: Basic bus reward thresholds
- **WHEN** a monthly summary has short bus, city bus, general road bus, or short highway bus rides from 11 through 30
- **THEN** the estimated basic reward rate for that category is 15 percent
- **AND** when the ride count is 31 or higher, the estimated basic reward rate is 30 percent

#### Scenario: Intercity bus reward thresholds
- **WHEN** a monthly summary has intercity or long highway bus rides from 2 through 3
- **THEN** the estimated basic reward rate for that category is 15 percent
- **AND** when the ride count is 4 or higher, the estimated basic reward rate is 30 percent

#### Scenario: Rail add-on reward threshold
- **WHEN** Taipei Metro, TRA, and New Taipei Metro rides total 11 or higher in a month
- **THEN** the estimated rail add-on reward is 2 percent of rail transaction amount
- **AND** rail amount does not participate in bus basic reward calculation

#### Scenario: Official and estimated rewards differ
- **WHEN** official total reward and estimated total reward differ for a monthly summary
- **THEN** the system stores the calculation delta amount
- **AND** the UI distinguishes official values from estimated values

> See: ../../designs/figma.md#happy-path---card-detail

### Requirement: System shall expose protected TPASS API endpoints
The system SHALL expose TPASS APIs only to authenticated users and SHALL enforce ownership, account type, and sensitive-data boundaries.

#### Scenario: Manage credentials and sync
- **WHEN** an authenticated user calls TPASS credential or sync endpoints
- **THEN** the system allows status query, credential create/update, credential deletion, and manual sync according to the user's ownership
- **AND** deleting credentials removes encrypted query credentials but preserves already synced TPASS cards and summaries

#### Scenario: Query cards and summaries
- **WHEN** an authenticated user queries TPASS cards, card detail, or monthly summaries
- **THEN** the system returns only records owned by that user
- **AND** card list responses exclude full card numbers
- **AND** single-card detail responses may include the full card number

#### Scenario: Link card to credit account
- **WHEN** an authenticated user links or unlinks a TPASS card to an account
- **THEN** the account must belong to the same user
- **AND** the account type must be `CREDIT`
- **AND** a target account already linked to another TPASS card returns a conflict error

### Requirement: App shall provide TPASS settings, card detail, and account summary UI
The app SHALL provide TPASS screens and states matching the approved Figma designs.

#### Scenario: Settings entry and TPASS happy path
- **WHEN** an authenticated user opens app settings
- **THEN** the settings list includes a TPASS 2.0 EasyCard entry
- **AND** tapping the entry opens the TPASS settings page
- **AND** the TPASS settings page shows credential status, sync actions, card list, linked credit account name when present, and recent official reward

> See: ../../designs/figma.md#states

#### Scenario: Empty, loading, error, disabled, and unauthenticated states
- **WHEN** the user has not configured credentials, sync is running, sync has an unexpected error, current-month data is read-only, or the user is unauthenticated
- **THEN** the app renders the corresponding approved state
- **AND** the error state describes an unexpected sync error rather than a manual verification-code flow
- **AND** badge and button labels remain centered and unclipped in a 360px mobile viewport

> See: ../../designs/figma.md#states

#### Scenario: Card detail UI
- **WHEN** a user opens a TPASS card detail page
- **THEN** the app shows the full card number, registration status, linked credit-card selector, official monthly summary table, official total reward, estimated delta, redeemed date, and official external transaction-record link
- **AND** the app does not state that ZenBill synchronizes per-ride details

> See: ../../designs/figma.md#happy-path---card-detail

#### Scenario: Credit account TPASS section
- **WHEN** a credit-card account has one linked TPASS card
- **THEN** the account detail page shows the linked card, previous-month and current-month transit ride summaries, remaining ride count to the next reward threshold, previous-month reward, and current-month estimated reward
- **AND** the TPASS summaries are not mixed into the account transaction list

> See: ../../designs/figma.md#happy-path---credit-account-tpass-section
