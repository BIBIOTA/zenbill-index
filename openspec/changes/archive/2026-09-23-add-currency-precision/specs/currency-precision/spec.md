## ADDED Requirements

### Requirement: System shall resolve the decimal places of a currency
The system SHALL provide a shared function in `packages/shared/` that resolves how many decimal places a currency uses, in this order of precedence: the user's `decimal_places` setting for that currency when not null; a built-in override list (TWD, JPY, KRW, VND = 0); the ISO 4217 minor unit from a static table; and 2 for currency codes not found in the table. The function SHALL NOT depend on the runtime `Intl` implementation.

#### Scenario: User setting takes precedence
- **WHEN** the user has set `decimal_places` = 1 for USD
- **THEN** USD resolves to 1 decimal place

#### Scenario: Built-in override applies when the user has no setting
- **WHEN** the user has no `decimal_places` setting for TWD
- **THEN** TWD resolves to 0 decimal places, even though ISO 4217 defines 2

#### Scenario: ISO 4217 minor unit applies to other currencies
- **WHEN** the user has no setting for KWD, and KWD is not in the override list
- **THEN** KWD resolves to 3 decimal places

#### Scenario: Unknown currency falls back to 2
- **WHEN** the currency code is not in the ISO 4217 table
- **THEN** it resolves to 2 decimal places

### Requirement: Users shall configure decimal places per currency
The system SHALL store an optional `decimal_places` value per user and currency in `user_currency_settings`, expose it through `GET /currency-settings` and `PUT /currency-settings`, and let users edit it on the Web and APP currency settings pages.

#### Scenario: Persist a decimal places setting
- **WHEN** the user submits `PUT /currency-settings` with `{ currency_code: "USD", multiplier: 1, decimal_places: 0 }`
- **THEN** the setting is stored and returned by `GET /currency-settings` with `decimal_places` = 0

#### Scenario: Null means use the default
- **WHEN** a setting is submitted without `decimal_places` or with null
- **THEN** the stored `decimal_places` is null and the currency resolves using the override list, ISO table, or fallback

#### Scenario: Reject out-of-range values
- **WHEN** the submitted `decimal_places` is less than 0 or greater than 4
- **THEN** the backend rejects the request with a 400 error

#### Scenario: Keep a currency that only has a decimal places setting
- **WHEN** the user sets a currency's decimal places but leaves its multiplier at 1 and saves
- **THEN** the settings page submits that currency, so it is not deleted by the batch replace

#### Scenario: Pick decimal places from a dropdown
- **WHEN** the user opens the currency settings page
- **THEN** each currency row shows a dropdown with "預設（N）" (N being the resolved default) and the options 0, 1, 2, 3, 4

### Requirement: Amount inputs shall respect currency precision
The Web and APP forms SHALL restrict user-entered amounts to the precision of the relevant currency, applied to the stored value (`input × multiplier`). This covers the transaction amount (source account currency), the transfer target amount (target account currency), the account initial balance (account currency), and the foreign-currency `original_amount` (`original_currency`). The shared ledger expense form is out of scope.

#### Scenario: Block excess decimals when the multiplier is 1
- **WHEN** the multiplier is 1 and the currency has 0 decimal places
- **THEN** the amount input does not accept a decimal point, and the APP shows a numeric keypad without one

#### Scenario: Validate the stored value when a multiplier applies
- **WHEN** VND has 0 decimal places and a multiplier of 1000, and the user enters `50.5`
- **THEN** the input is accepted because the stored value `50500` is an integer

#### Scenario: Reject a stored value that exceeds precision
- **WHEN** VND has 0 decimal places and a multiplier of 1000, and the user enters `50.5005`
- **THEN** the form shows a precision error and does not submit

#### Scenario: Unchanged legacy amounts are not validated
- **WHEN** the user edits an existing transaction whose stored amount exceeds the current precision, and does not change the amount
- **THEN** the form submits without a precision error

### Requirement: Amounts shall be displayed at currency precision
The system SHALL provide a shared `formatAmount(value, currency, settings)` that formats an amount with thousands separators and exactly the resolved number of decimal places, used for account lists and details, transaction lists and details, the dashboard summary, and reports on both platforms.

#### Scenario: Pad to the currency precision
- **WHEN** formatting 5 USD with 2 decimal places
- **THEN** the result is `5.00`

#### Scenario: Round for display without changing stored data
- **WHEN** a stored amount is 1234.57 TWD and TWD resolves to 0 decimal places
- **THEN** the displayed value is `1,235`
- **AND** the stored value is unchanged
