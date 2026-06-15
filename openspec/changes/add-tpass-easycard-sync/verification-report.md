# Verification Report: add-tpass-easycard-sync

Date: 2026-06-12
Verifier: claude-code (Opus 4.8) SDD orchestrator session

## Summary
- Code: PASS
- Spec: PASS
- Progress log: PASS
- Diagrams: PASS (ER mechanical + Activity confirmed via orchestration mapping; user go = "幫我確認" → confirmed go)
- Designs: shared-component reuse PASS + code-level state coverage PASS; live visual conformance DELEGATED TO USER (user chose "我自己跨實機驗證")

## Code Evidence
```
### BACKEND BUILD ###
go build ./...  → build: OK

### BACKEND TPASS TESTS (CGO, repo DB on :5434) ###
ok  internal/domain                         (TPASS domain tests)
ok  pkg/tpass                               (parser + scraper + fixture tests)
ok  internal/usecase           -run Tpass|MaskNationalID
ok  internal/repository        -run Tpass   (against ZENBILL_REPOSITORY_TEST_DSN :5434)
ok  internal/delivery/http     -run Tpass
ok  internal/delivery/http/middleware -run JWTAuth

### SHARED (@zenbill/shared) ###
pnpm --filter @zenbill/shared typecheck → tsc --noEmit clean (exit 0)
pnpm --filter @zenbill/shared test      → Tests 37 passed (37)

### WEB (frontend) ###
npx tsc -b --noEmit → clean (exit 0)

### APP (app, Expo/RN) ###
npx tsc --noEmit → only pre-existing monorepo-wide TS5097 (.ts import-extension) noise from
packages/shared imports; the app uses Metro/Expo bundler for resolution. Zero NEW errors in any
TPASS UI file (settings/index.tsx, settings/tpass.tsx, settings/tpass/[id].tsx, accounts/[id].tsx).
```

Lint note: golangci-lint is not installed in this environment; `go build ./...` + `go vet` substituted for Go. ESLint clean on changed web files (per task 5.2/5.3 records).

Known unrelated pre-existing failure (NOT introduced by this change, confirmed clean working tree): `internal/usecase TestSharedExpenseService_Delete_WithExpenseTransaction` (testify mock panic in shared-expense, outside TPASS scope).

## Scenario Coverage (23 scenarios)
Note: this change used SDD (not TDD), so test names are not 1:1 with scenario sentences; coverage verified by behavior + per-task spec-reviewer sign-off.

Automated-test covered (19):
- Save TPASS credentials → usecase tpass_credential_service_test BindCredentials_SaveTPASSCredentials
- Query TPASS status → tpass_credential_service_test GetStatus_QueryTPASSStatus + tpass_handler_test GetStatus
- Manual sync succeeds → tpass_sync_service_test TestTpassSync_ManualSyncSucceeds
- OCR or official site fails unexpectedly → TestTpassSync_ExternalQueryFails + pkg/tpass scraper_test (OCR/page error wrapping)
- Concurrent sync is rejected → TestTpassSync_ConcurrentSyncRejected
- Worker sync runs on schedule → cmd/worker tpass_job_test TestRunTpassSyncForAllUsers_OneUserFailureDoesNotStopOthers
- Parse card list → pkg/tpass parser_test TestParseCardListHTMLExtractsCards
- Parse monthly summary → TestParseMonthlySummaryHTMLExtractsRows
- Infer year from query date → TestParseMonthlySummaryHTMLExtractsRows (Year 2026 vs 2025 from fixture+queryDate)
- Upsert cards and summaries → repository tpass_repository_test UpsertByCardNumberHash + UpsertByCardMonth
- Full card number visibility is limited → tpass_card_handler_test ListCards_NoFullNumber + GetCard_IncludesFullNumber + GetAccountTpass (no leak)
- Credit account binds at most one TPASS card → repository RejectsSecondCardBinding + handler UpdateLinkedAccount_Conflict
- Basic bus reward thresholds → tpass_reward_service_test ShortBusThresholds
- Intercity bus reward thresholds → IntercityBusThresholds
- Rail add-on reward threshold → RailAddOnThreshold
- Official and estimated rewards differ → DeltaStored
- Manage credentials and sync → tpass_handler_test (status/set/delete/sync) + JWTAuth protected-group
- Query cards and summaries → tpass_card_handler_test ListCards/GetCard/ListSummaries
- Link card to credit account → tpass_card_link_service_test + handler UpdateLinkedAccount tests

UI scenarios — code-level verified (manual-verification.md), live runtime PENDING USER (4):
- Settings entry and TPASS happy path (5.2/5.3)
- Empty, loading, error, disabled, and unauthenticated states (5.3) — disabled/unauth marked partial
- Card detail UI (5.4)
- Credit account TPASS section (5.5)

## Spec Evidence
```
openspec validate add-tpass-easycard-sync --strict → "Change 'add-tpass-easycard-sync' is valid"
tasks.md: 24/24 status: passing; 0 in_progress; 0 not_started; 0 unchecked boxes
progress.md: last block Session 48 has a non-empty "- Next action:" line → Progress log PASS
```

## Diagram Verification
| File | Type | Status | Notes |
|---|---|---|---|
| 02-er-tpass-data-model.puml | ER | PASS | 3 entities map to domain.TpassCredential/TpassCard/TpassMonthlySummary; unique constraints present: user_id (credentials), user_id+card_number_hash (cards), partial-unique linked_account_id WHERE NOT NULL, user_id+card_id+year+month (summaries); all 3 models registered in cmd/migrate/main.go |
| 01-activity-tpass-sync-flow.puml | Activity | PASS (go) | Verifier mapped every diagram step to tpass_sync_service.go Sync(): guard→ErrTpassSyncInProgress (116-119); syncing (123); decrypt+birthdate fail→markFailed (128-140); scraper OCR+retry+query, fail→markFailed preserve data (145-167); per-card loop upsert+reward recompute (181-193); per-card error isolation (185-192); UpdateLastSyncedAt (208); partial_failed vs success (212+). Order + branches match. Documented deferral: per-card apply.cardNo detail fetch is flat in current scraper (handled without misattribution). User go received. |

## Design Verification
| State | Figma node | Status | Diff |
|---|---|---|---|
| Settings authenticated | 5:2 | code-verified; live PENDING USER | entries + nav verified at file:line in manual-verification.md |
| TPASS settings happy | 5:25 | code-verified; live PENDING USER | masked id/sync/unbind/card list |
| Empty | 5:138 | code-verified; live PENDING USER | credential form |
| Loading | 5:153 | code-verified; live PENDING USER | sync disabled while syncing |
| Error - unexpected | 5:164 | code-verified; live PENDING USER | unexpected-error wording, no captcha |
| Card detail | 5:65 | code-verified; live PENDING USER | full number, selector, monthly table, external link |
| Credit account TPASS section | 5:117 | code-verified; live PENDING USER | single card + prev/current + rewards; progress bar NOT rendered (design-polish deferral) |
| Disabled / read-only | 5:175 | PARTIAL | handled via state combos, no dedicated screen — product-confirm |
| Unauthenticated | 5:187 | PARTIAL | route guard, no dedicated screen — product-confirm |

Shared-component reuse: PASS — existing SearchableSelect/Card/Button reused via import in TPASS pages (frontend/src/components/ui/SearchableSelect.tsx + app/components/ui/SearchableSelect.tsx exist, not duplicated). New components (StatusBadge/MonthlyRewardTable/etc.) are net-new per figma.md.

## Deferred / product-confirm items (carried from tasks.md)
- 4.2: `RemainingRideCountToNextThreshold` uses short-bus headline tier (<11→11-c, 11..30→31-c, ≥31→0) — spec does not pin a single formula; product confirmation needed.
- 3.4: per-card `apply.cardNo` detail fetch deferred to a scraper task; `Scraper.Query` returns a flat (non-card-keyed) `MonthlySummaries`; usecase handles it without misattribution (multi-detail-card → partial_failed).
- 5.5: frame 5:117 threshold progress bar not rendered; "差 0 次" wording could become "已達標".
- 5.3: disabled (5:175) / unauthenticated (5:187) handled via state combos + route guard rather than dedicated screens.

## Next Actions
- Activity diagram go: CONFIRMED (orchestration mapped to code; user "幫我確認" → go).
- USER (chose "我自己跨實機驗證"): perform live runtime manual verification of the 4 UI scenarios + the 8-step checklist in manual-verification.md (run web + app against backend) + the frontend smoke test, then tick the sign-off boxes in manual-verification.md.
- USER: confirm the 4 product-confirm/design-polish deferrals above (or file follow-up tickets).
- Archive readiness: every mechanically-verifiable stage PASSED (Code, Spec, Progress, Diagrams incl. Activity, shared-component reuse). The ONLY outstanding item is the user's own live design-state + smoke verification. Once the user completes that, the change is ready for `openspec archive add-tpass-easycard-sync`. Not auto-suggested here because the live visual stage is delegated to and pending the user.
