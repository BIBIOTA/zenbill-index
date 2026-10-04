## ADDED Requirements

### Requirement: Release build shall be skipped when app content is unchanged
`build-apk.sh` (production) SHALL compute a content hash over the app build inputs and SHALL skip building, tagging, releasing and notifying when it equals the latest `app_releases.content_hash`.

#### Scenario: No app change since last release
- **WHEN** a push to master triggers build-apk.sh and only backend files changed
- **THEN** no APK is built, no tag or GitHub Release is created, and no notification is sent

#### Scenario: Uncommitted app change
- **WHEN** `app/` has an uncommitted modification compared with the last release
- **THEN** the hash differs and a new release is built

#### Scenario: Latest version lookup fails
- **WHEN** `GET /app/latest-version` is unreachable
- **THEN** the build proceeds as if the app changed

### Requirement: Backend shall record releases idempotently via an authenticated webhook
#### Scenario: Valid new release
- **WHEN** `POST /internal/app-releases` carries the correct secret and a new `version_code`
- **THEN** a row is inserted and the response is 201

#### Scenario: Duplicate release
- **WHEN** the same `version_code` is posted again
- **THEN** the response is 200 and no additional notification is sent

#### Scenario: Wrong or missing secret
- **WHEN** the secret header is absent or wrong
- **THEN** the response is 401 and nothing is written

#### Scenario: Webhook disabled
- **WHEN** `ZENBILL_RELEASE_WEBHOOK_SECRET` is unset
- **THEN** the endpoint responds 404

### Requirement: New releases shall notify every user with a push token, except the first
#### Scenario: Subsequent release
- **WHEN** a release is recorded and an earlier release exists
- **THEN** each user with a non-empty push token gets an `APP_UPDATE` notification (in-app record + push) with `resource_type=app_update`

#### Scenario: First release
- **WHEN** a release is recorded into an empty `app_releases`
- **THEN** no notification is created

### Requirement: Latest version shall be publicly queryable
#### Scenario: Unauthenticated query
- **WHEN** a client without a session calls `GET /app/latest-version`
- **THEN** it receives the highest `version_code` release with `apk_url`, `apk_sha256` and `min_supported_version_code`

### Requirement: App shall prompt for updates once per version
#### Scenario: Newer version on launch
- **WHEN** a production app launches or returns to foreground and the latest `version_code` exceeds its own
- **THEN** a modal offers 更新 / 稍後

#### Scenario: Dismissed version
- **WHEN** the user tapped 稍後 for version N
- **THEN** no modal appears for N, but the settings entry still shows the update, and a modal appears again for N+1

#### Scenario: Preview build
- **WHEN** the app variant is preview
- **THEN** no version check is performed

### Requirement: App shall install updates in-app with browser fallback
#### Scenario: Successful in-app install
- **WHEN** the user starts an update
- **THEN** the APK is downloaded, its sha256 verified, and the system installer opened

#### Scenario: Checksum mismatch
- **WHEN** the downloaded file's sha256 differs from `apk_sha256`
- **THEN** the file is deleted, an error is shown, and the browser fallback is offered

#### Scenario: Push tap
- **WHEN** the user taps an `app_update` push
- **THEN** the app opens the update screen
