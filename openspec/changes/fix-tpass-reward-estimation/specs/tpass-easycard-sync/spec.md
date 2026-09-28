## MODIFIED Requirements

### Requirement: System shall calculate TPASS estimated rewards from official monthly summaries
The system SHALL calculate estimated TPASS rewards from official monthly summary counts and amounts, while preserving official reward fields as the primary displayed values.

Each transport group's basic reward SHALL be computed as `transaction amount × tier rate` and rounded UP to whole New Taiwan dollars PER GROUP, not on the total. The rail add-on reward SHALL be evaluated PER transport system, because the official reward condition table states that rail add-on ride counts are counted separately per system. The official green transport bonus SHALL be carried over from the official monthly summary fields into the estimated total WITHOUT being recomputed, because the official reward condition table does not publish any green transport bonus rule.

Authoritative rule source: the official TPASS reward condition table at `https://tpass.thb.gov.tw/tpass/image/4%E5%9B%9E%E9%A5%8B%E6%A2%9D%E4%BB%B6%E8%A1%A8%E6%A0%BC.svg`. That table does not specify a decimal rounding rule; rounding up is an empirical conclusion inferred from the official per-group integer reward fields.

#### Scenario: Basic bus reward thresholds
- **WHEN** a monthly summary has short bus, city bus, general road bus, or short highway bus rides from 11 through 30
- **THEN** the estimated basic reward rate for that category is 15 percent
- **AND** when the ride count is 31 or higher, the estimated basic reward rate is 30 percent

#### Scenario: Intercity bus reward thresholds
- **WHEN** a monthly summary has intercity or long highway bus rides from 2 through 3
- **THEN** the estimated basic reward rate for that category is 15 percent
- **AND** when the ride count is 4 or higher, the estimated basic reward rate is 30 percent

#### Scenario: Round each transport group's reward up to a whole dollar
- **WHEN** a transport group has a transaction amount of 498 and a tier rate of 15 percent (exact value 74.7)
- **THEN** the estimated reward for that group is 75
- **WHEN** a transport group has a transaction amount of 1074 and a tier rate of 30 percent (exact value 322.2)
- **THEN** the estimated reward for that group is 323

#### Scenario: Round up per group rather than on the total
- **WHEN** two transport groups each produce a fractional reward
- **THEN** the estimated total equals the sum of each group's individually rounded-up reward
- **AND** the rounding is not applied to the combined total

#### Scenario: Absorb floating point error before rounding up
- **WHEN** a group's amount multiplied by its rate evaluates to 149.99999999999997 in floating point
- **THEN** the estimated reward for that group is 150
- **AND** is not rounded up to 151

#### Scenario: Rail add-on is evaluated per transport system
- **WHEN** Taipei Metro has 10 rides, TRA has 1 ride, and New Taipei Metro has 0 rides in a month
- **THEN** the estimated rail add-on reward is 0
- **AND** the combined rail ride count is not compared against the 11-ride threshold

#### Scenario: Rail add-on applies only to the qualifying system's amount
- **WHEN** Taipei Metro has 12 rides with an amount of 300 and TRA has 3 rides with an amount of 500
- **THEN** the estimated rail add-on reward is the rounded-up 2 percent of 300 only
- **AND** the TRA amount is excluded from the rail add-on reward

#### Scenario: Green transport bonus is carried over from official fields
- **WHEN** a monthly summary has an official green transport bonus on any transport group
- **THEN** the estimated total reward includes the sum of the official green transport bonus fields
- **AND** the system does not derive the green transport bonus from ride counts, amounts, or rates

#### Scenario: Estimated total matches official total for known rules
- **WHEN** a monthly summary's official reward follows the published condition table plus an official green transport bonus
- **THEN** the estimated total reward equals the official total reward
- **AND** the calculation delta amount is zero

#### Scenario: Official and estimated rewards differ
- **WHEN** official total reward and estimated total reward differ for a monthly summary
- **THEN** the system stores the calculation delta amount
- **AND** the UI distinguishes official values from estimated values

#### Scenario: Next-threshold guidance ignores the green transport bonus
- **WHEN** the system reports how many more rides are needed to reach the next reward threshold
- **THEN** the reported count is derived only from published ride-count thresholds
- **AND** the green transport bonus does not affect the reported count

> See: ../../designs/figma.md#happy-path---card-detail

### Requirement: App shall provide TPASS settings, card detail, and account summary UI
The app SHALL provide TPASS screens and states matching the approved Figma designs.

The monthly reward table on the card detail screen SHALL additionally show each transport group's official green transport bonus, and SHALL label that value as an official published amount rather than a system estimate.

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

#### Scenario: Card detail shows the green transport bonus column
- **WHEN** a user views a TPASS card's monthly reward records
- **THEN** each transport group row shows its official green transport bonus
- **AND** the column is shown even when every group's green transport bonus is zero
- **AND** the screen states that the green transport bonus is an official published amount rather than a system estimate

> See: ../../designs/figma.md#happy-path---card-detail

#### Scenario: Credit account TPASS section
- **WHEN** a credit-card account has one linked TPASS card
- **THEN** the account detail page shows the linked card, previous-month and current-month transit ride summaries, remaining ride count to the next reward threshold, previous-month reward, and current-month estimated reward
- **AND** the TPASS summaries are not mixed into the account transaction list

> See: ../../designs/figma.md#happy-path---credit-account-tpass-section
