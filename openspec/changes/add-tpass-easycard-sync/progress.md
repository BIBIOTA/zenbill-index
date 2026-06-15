## Session 1 — 2026-06-08 23:17
- Stage: SDD
- Task: 1.1 新增 TPASS domain model
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add TPASS domain models and compile/JSON serialization coverage for task 1.1.

## Session 2 — 2026-06-08 23:31
- Stage: SDD
- Task: 1.1 新增 TPASS domain model
- Transition: in_progress → passing
- Evidence:
  - Commits: 3fadd240197a5f75882e53ef4974f59eb80ef2d4 Add TPASS domain models; 7457bbbfcaa9955f541536f19468a8426e810b1f Align TPASS encrypted fields with ER contract
  - Tests: `go test ./internal/domain/... -count=1 -v` passed
  - Spec reviewer: APPROVE — scenario coverage, diagram contract, design contract, no-extra-features, and no-missing-scenarios checks passed
  - Code-quality reviewer: APPROVE — no Critical or Important issues
- Next action: Dispatch task 1.2 to add TPASS database migrations.

## Session 3 — 2026-06-08 23:32
- Stage: SDD
- Task: 1.2 新增 TPASS 資料庫 migration
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add TPASS database migration coverage for credentials, cards, summaries, and uniqueness constraints.

## Session 4 — 2026-06-08 23:37
- Stage: SDD
- Task: 1.2 新增 TPASS 資料庫 migration
- Transition: in_progress → passing
- Evidence:
  - Commits: 9d4374ba2762bbbeb79e8986813bec2d67344c9d feat: register TPASS models in migrations
  - Tests: `go test ./cmd/migrate/... -count=1 -v` passed; `go test ./internal/domain/... -count=1` passed
  - Spec reviewer: APPROVE — migration model registration and TPASS uniqueness constraints matched the ER contract
  - Code-quality reviewer: APPROVE — no Critical or Important issues
- Next action: Dispatch task 1.3 to add TPASS repository interfaces.

## Session 5 — 2026-06-08 23:38
- Stage: SDD
- Task: 1.3 新增 TPASS repository interfaces
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add TPASS repository interfaces and account projection domain types without importing framework packages.

## Session 6 — 2026-06-08 23:44
- Stage: SDD
- Task: 1.3 新增 TPASS repository interfaces
- Transition: in_progress → passing
- Evidence:
  - Commits: 88698b393600d9b45c03a1eacdc47726e13d6840 feat: add TPASS domain repository interfaces
  - Tests: `go test ./internal/domain/... -count=1 -v` passed; `go test ./cmd/migrate/... -count=1 -v` passed
  - Spec reviewer: APPROVE — credential, card, summary, and account TPASS projection interfaces covered the domain contract without framework imports
  - Code-quality reviewer: APPROVE — no Critical, Important, or Minor issues
- Next action: Dispatch task 2.1 to create de-identified TPASS HTML fixtures.

## Session 7 — 2026-06-08 23:45
- Stage: SDD
- Task: 2.1 建立去識別化 TPASS HTML fixture
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will create repo-local de-identified TPASS HTML fixtures preserving query, card-list, and card-detail DOM contracts.

## Session 8 — 2026-06-09 10:44
- Stage: SDD
- Task: 2.1 建立去識別化 TPASS HTML fixture
- Transition: in_progress → passing
- Evidence:
  - Commits: 3112794cd7ea7f20a7da4b85c440df40bea83bfa test: add deidentified TPASS HTML fixtures
  - Tests: `go test ./pkg/tpass/... -count=1 -v` passed; `go test ./internal/domain/... ./cmd/migrate/... -count=1` passed
  - Spec reviewer: APPROVE — fixtures are repo-local, readable, de-identified, and preserve query/card-list/card-detail DOM contracts
  - Code-quality reviewer: APPROVE — no Critical or Important issues
- Next action: Dispatch task 2.2 to implement TPASS query-page DTOs and parser.

## Session 9 — 2026-06-09 10:44
- Stage: SDD
- Task: 2.2 實作 TPASS 查詢頁 DTO 與 parser
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add typed TPASS parser DTOs and fixture-backed parsing for card lists and monthly detail tables.

## Session 10 — 2026-06-09 10:56
- Stage: SDD
- Task: 2.2 實作 TPASS 查詢頁 DTO 與 parser
- Transition: in_progress → passing
- Evidence:
  - Commits: 97eb66339c698b48cfd6a965f87599d3d2e7f613 Add TPASS card parser; ac78ba87d3af543ee9eaf0f95d679525e2457c5d Harden TPASS monthly parser
  - Tests: `go test ./pkg/tpass/... -count=1 -v` passed; `go test ./internal/domain/... ./cmd/migrate/... -count=1` passed
  - Spec reviewer: APPROVE — card-list and monthly-summary parser DTOs satisfy task 2.2 and stay within parser scope
  - Code-quality reviewer: APPROVE — malformed/invalid month handling and parser tests meet quality gate
- Next action: Dispatch task 2.3 to add cross-year month inference and parser field-count error coverage.

## Session 11 — 2026-06-09 10:56
- Stage: SDD
- Task: 2.3 實作跨年月份推導與欄位錯誤偵測
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add query-date based summary year inference and explicit parser field-count contract errors.

## Session 12 — 2026-06-09 11:02
- Stage: SDD
- Task: 2.3 實作跨年月份推導與欄位錯誤偵測
- Transition: in_progress → passing
- Evidence:
  - Commits: 82b4d1c0ffa46cc1f137e47c5e01072aaf83c37d Add TPASS monthly summary year inference
  - Tests: `go test ./pkg/tpass/... -count=1 -v` passed; `go test ./internal/domain/... ./cmd/migrate/... -count=1` passed
  - Spec reviewer: APPROVE — query-date year inference and exact field-count errors satisfy task 2.3
  - Code-quality reviewer: APPROVE — no Critical or Important issues
- Next action: Dispatch task 2.4 to define TPASS scraper and OCR captcha strategy.

## Session 13 — 2026-06-09 11:02
- Stage: SDD
- Task: 2.4 定義 TPASS scraper 與 OCR 驗證碼策略
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will define the TPASS scraper/OCR captcha strategy, selectors, retry/error contracts, and tests without adding usecase or worker behavior.

## Session 14 — 2026-06-09 11:24
- Stage: SDD
- Task: 2.4 定義 TPASS scraper 與 OCR 驗證碼策略
- Transition: in_progress → passing
- Evidence:
  - Commits: c840e63 Add TPASS scraper OCR strategy; 10236e7 Fix TPASS query form selectors; cc89b82 Fix TPASS hidden form readiness; 7a81817 Allow TPASS headful scraper config
  - Tests: `CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include" CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib" go test ./pkg/tpass/... -count=1 -v` passed
  - Spec reviewer: APPROVE — scraper/OCR selectors, retry loop, typed unexpected errors, and no manual captcha path satisfy task 2.4
  - Code-quality reviewer: APPROVE — no Critical or Important issues after hidden CSRF readiness and config fixes
- Next action: Dispatch task 3.1 to implement TPASS repositories for cards, summaries, account projection, and link uniqueness.

## Session 15 — 2026-06-09 11:25
- Stage: SDD
- Task: 3.1 實作 TPASS repository
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add GORM TPASS repositories for card hash upsert, monthly summary upsert, account projection lookup, and linked-account uniqueness behavior.

## Session 16 — 2026-06-12 (resume)
- Stage: SDD
- Task: 3.1 實作 TPASS repository
- Transition: in_progress → passing
- Evidence:
  - Commits: a40177f feat: implement TPASS repositories; b8ccfe6 test: harden TPASS repository coverage
  - Tests: `ZENBILL_REPOSITORY_TEST_DSN=...:5434 go test ./internal/repository/... -run Tpass -count=1 -v` — 6/6 PASS (card hash dedup+last_seen_at, summary upsert, account projection scoping, second-binding rejection, non-credit rejection, credential CRUD)
  - Spec reviewer: APPROVE — scenario coverage, ER diagram contract, no-extra-features, no-missing-scenarios all pass (design check N/A for backend repo task)
  - Code-quality reviewer: APPROVE — no Critical or Important issues; 3 optional Minor notes (nil-clear test gap, upsert comment, incidental go.mod x/net direct promotion)
- Next action: Dispatch task 3.2 to implement TPASS credential encryption service.

## Session 17 — 2026-06-12 (resume)
- Stage: SDD
- Task: 3.2 實作 TPASS credential 加密服務
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add a TPASS credential service that encrypts national ID + birth date via pkg/crypto, stores only encrypted + masked fields, and exposes a status view without plaintext.

## Session 18 — 2026-06-12 (resume)
- Stage: SDD
- Task: 3.2 實作 TPASS credential 加密服務
- Transition: in_progress → passing
- Evidence:
  - Commits: 5b7db24 feat: add TPASS credential encryption service
  - Tests: `go test ./internal/usecase/... -run Tpass -count=1 -v` — PASS (save stores encrypted+masked only, GetStatus secret-free DTO, decrypt round-trip, delete, MaskNationalID boundaries); go build ./... OK
  - Spec reviewer: APPROVE — both scenarios covered, ER contract honored (no key_id, unique user_id), no over-reach
  - Code-quality reviewer: APPROVE — no Critical/Important; MaskNationalID slice bounds proven safe; only minor optional notes (exported helper, comments)
- Next action: Dispatch task 3.3 to implement the TPASS reward recalculation service.

## Session 19 — 2026-06-12 (resume)
- Stage: SDD
- Task: 3.3 實作 TPASS 回饋重算服務
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add a pure TPASS reward-recalculation service computing bus/highway basic rates, rail add-on, estimated total, and calculation_delta_amount from monthly summary counts/amounts.

## Session 20 — 2026-06-12 (resume)
- Stage: SDD
- Task: 3.3 實作 TPASS 回饋重算服務
- Transition: in_progress → passing
- Evidence:
  - Commits: 084f5a8 feat: add TPASS reward recalculation service
  - Tests: `go test ./internal/usecase/... -run TpassReward -count=1 -v` — PASS (16 subtests: bus 10/11/30/31, intercity 1/2/3/4, rail sum 10/11, rail-excluded-from-bus, total=sum, delta >/=/< official, Apply preserves official); go build OK; gofmt clean
  - Spec reviewer: APPROVE — all 4 scenarios covered with correct boundaries; threshold math sanity-checked; no over-reach
  - Code-quality reviewer: APPROVE — no Critical/Important; named constants, injectable clock, table-driven tests; only minor optional notes (tiered-rate DRY, nil-guard doc, rail aggregate comment)
- Next action: Dispatch task 3.4 to implement the TPASS sync usecase (decrypt credential, query card list, per-card detail, upsert cards + summaries, sync-in-progress guard, error preservation).

## Session 21 — 2026-06-12 (resume)
- Stage: SDD
- Task: 3.4 實作 TPASS 同步 usecase
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add the TPASS sync usecase orchestrating concurrency guard, credential decrypt, scraper query, card/summary upsert, reward recalculation, and sync_status/error/last_synced updates with existing-data preservation on failure.

## Session 22 — 2026-06-12 (resume)
- Stage: SDD
- Task: 3.4 實作 TPASS 同步 usecase
- Transition: in_progress → passing
- Evidence:
  - Commits: 3510914 feat: add TPASS sync usecase; 6d9c0e1 fix: prevent TPASS multi-card summary misattribution
  - Tests: `go test ./internal/usecase/... -run TpassSync -count=1 -v` — 5/5 PASS (ManualSyncSucceeds, MultipleRewardDetailCards_NoCrossCardDuplication, ConcurrentSyncRejected, ExternalQueryFails, DecryptFails); go build OK; gofmt clean. (Unrelated pre-existing failure TestSharedExpenseService_Delete_WithExpenseTransaction in same package — not introduced by this task.)
  - Spec reviewer: first pass ❌ found multi-card summary misattribution (flat summaries duplicated across every reward-detail card → wrong card_id). After fix 6d9c0e1 → APPROVE: summaries attached to at most one card, others recorded as partial-failure limitation, LastDetailSyncedAt set only on the receiving card, concurrency/failure/success scenarios all hold.
  - Code-quality reviewer: APPROVE — concurrency guard release-on-all-paths verified sound; no panics; non-sensitive errors; only minor notes (N+1 card reload, partial_failed semantics with 0 failed_cards, swallowed json.Marshal err).
- Next action: Dispatch task 3.5 to implement the TPASS card link-to-credit-account usecase.
- Blockers: none. Deferred (non-blocking, recorded in tasks.md): real per-card `apply.cardNo` detail fetch is an upstream scraper (2.4) limitation; sync usecase consumes the flat result correctly today; follow-up scraper task should return per-card-keyed summaries.

## Session 23 — 2026-06-12 (resume)
- Stage: SDD
- Task: 3.5 實作 TPASS 卡片關聯信用卡 usecase
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add the TPASS link-to-credit-account usecase wrapping the repo's link/unlink with ownership + CREDIT-type validation and conflict/invalid error mapping (409/400/404), preserving summaries on unlink.

## Session 24 — 2026-06-12 (resume)
- Stage: SDD
- Task: 3.5 實作 TPASS 卡片關聯信用卡 usecase
- Transition: in_progress → passing
- Evidence:
  - Commits: 2174074 feat: add TPASS card link-to-account usecase
  - Tests: `go test ./internal/usecase/... -run TpassCardLink -count=1 -v` — 7/7 PASS (link own CREDIT, conflict preserves existing, non-CREDIT invalid, foreign invalid, card-not-owned not-found, unlink clears + preserves summaries, unlink not-owned); go build OK; gofmt clean
  - Spec reviewer: APPROVE — all scenarios covered; ER one-card-per-account constraint delegated to repo (not bypassed); 400-or-404 disjunction satisfied by single ErrTpassLinkedAccountInvalid + distinct ErrTpassCardNotFound
  - Code-quality reviewer: APPROVE — thin service, no duplicated repo validation, gorm.ErrRecordNotFound wrapping consistent with existing usecases; only minor notes on FindByID pre-check asymmetry (intentional)
- Next action: Section 3 complete. Dispatch task 4.1 (TPASS HTTP handler + routes: GET /tpass/status, PUT/DELETE /tpass/credentials, POST /tpass/sync).

## Session 25 — 2026-06-12 (resume)
- Stage: SDD
- Task: 4.1 新增 TPASS HTTP handler 與 routes
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add the TPASS HTTP handler (GET /tpass/status, PUT/DELETE /tpass/credentials, POST /tpass/sync), wire TPASS repos/services/scraper-factory in cmd/api/main.go, and map sync-in-progress to 409 with no manual-captcha path.

## Session 26 — 2026-06-12 (resume)
- Stage: SDD
- Task: 4.1 新增 TPASS HTTP handler 與 routes
- Transition: in_progress → passing
- Evidence:
  - Commits: 9cc3d92 feat: add TPASS credential and sync HTTP endpoints
  - Tests: `go test ./internal/delivery/http/... -run Tpass -count=1 -v` — 8/8 PASS (status configured/not-configured, PUT valid/invalid, DELETE preserves synced data, sync success/in-progress-409/unexpected-500); go build ./... (incl cmd/api DI) OK; gofmt clean
  - Spec reviewer: APPROVE — GET /tpass/status, PUT/DELETE /tpass/credentials, POST /tpass/sync on JWT-protected group; no plaintext/encrypted leak (TpassCredentialStatus serialized); 409 in-progress; no manual-captcha path; no out-of-scope endpoints
  - Code-quality reviewer: APPROVE — thin handler mirrors credential_handler.go; correct error mapping; DI scraper factory correct (&local config, per-sync scraper Closed, no long-lived browser); deterministic concurrency test; only minor cosmetic notes
- Next action: Dispatch task 4.2 (TPASS card/summary/account API: GET /tpass/cards, GET /tpass/cards/:id, PUT /tpass/cards/:id/linked-account, GET /tpass/summaries, GET /accounts/:id/tpass with conflict on already-bound credit account).

## Session 27 — 2026-06-12 (resume)
- Stage: SDD
- Task: 4.2 新增 TPASS card、summary、account API
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add GET /tpass/cards (masked), GET /tpass/cards/:id (full number), PUT /tpass/cards/:id/linked-account (link/unlink, 409 conflict), GET /tpass/summaries, and GET /accounts/:id/tpass (single card + prev/current summaries + remaining-to-threshold + rewards), filling RemainingRideCountToNextThreshold via a testable reward-tier method.

## Session 28 — 2026-06-12 (resume)
- Stage: SDD
- Task: 4.2 新增 TPASS card、summary、account API
- Transition: in_progress → passing
- Evidence:
  - Commits: 65b6022 feat: add TPASS card, summary, and account endpoints
  - Tests: `go test ./internal/delivery/http/... -run Tpass` + `./internal/usecase/... -run TpassReward` — 19 PASS (list masked/no-leak, detail full number, link/409/400/404, unlink, summaries filter, account section + remaining-threshold, non-CREDIT 404, no-card empty 200, threshold boundaries incl nil); go build OK; gofmt clean
  - Spec reviewer: APPROVE — full-card-number boundary structurally enforced (list/account masked DTOs, detail decrypts); 409/400/404 mapping; ownership scoped; one-card-per-account ER honored; threshold semantics defensible+documented (advisory)
  - Code-quality reviewer: APPROVE — thin handlers, shared DTO mapper + handleLinkError, decryptCardNumber no-panic/500-on-corrupt, period math (Jan→Dec rollback) correct; minor notes (RecentSummary/summary DTO couples to domain entity; threshold product-confirm)
- Next action: Dispatch task 4.3 (TPASS worker schedule: ZENBILL_WORKER_TPASS_SYNC_SCHEDULE cron syncing all active credentials, per-user failure isolation).
- Product-confirm (non-blocking): RemainingRideCountToNextThreshold tier choice (recorded in tasks.md 4.2).

## Session 29 — 2026-06-12 (resume)
- Stage: SDD
- Task: 4.3 新增 TPASS worker 排程設定
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add worker.tpass_sync_schedule config (ZENBILL_WORKER_TPASS_SYNC_SCHEDULE), register a conditional cron job iterating active TPASS credentials and calling the sync usecase per user with per-user failure isolation, extracting a testable run function.

## Session 30 — 2026-06-12 (resume)
- Stage: SDD
- Task: 4.3 新增 TPASS worker 排程設定
- Transition: in_progress → passing
- Evidence:
  - Commits: 4b1dc4d feat: add TPASS worker sync schedule
  - Tests: `go test ./cmd/worker/... -run Tpass -count=1 -v` — PASS (TestRunTpassSyncForAllUsers_OneUserFailureDoesNotStopOthers: 3 users, 1 fails, all attempted, processed=2/failed=1); go build OK; gofmt clean
  - Spec reviewer: APPROVE — ZENBILL_WORKER_TPASS_SYNC_SCHEDULE config + conditional registration; reuses same TpassSyncService.Sync path; failure isolation; status updates via sync service; non-sensitive logging
  - Code-quality reviewer: APPROVE — extracted testable runTpassSyncForAllUsers with minimal tpassSyncRunner interface; empty default consistent with conditional registration; only minor notes (DI duplication across composition roots — acceptable; unused test mutex)
- Next action: Section 4 complete (4.1-4.3). All backend tasks (3.x + 4.x) done. Per user instruction, pausing to report before frontend Section 5 (5.1-5.5) and Section 6 tests/verification.

## Session 31 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 5.1 新增 shared TPASS types 與 hooks
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add @zenbill/shared TPASS types + react-query hooks (status, credential set/delete, sync, cards, card detail, summaries, account tpass) matching the 4.1/4.2 API DTOs, with correct tpass + accounts query-key invalidation.

## Session 32 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 5.1 新增 shared TPASS types 與 hooks
- Transition: in_progress → passing
- Evidence:
  - Commits: 54926c6 feat: add shared TPASS types and hooks
  - Tests: `pnpm --filter @zenbill/shared typecheck` clean; `pnpm --filter @zenbill/shared test` 23 passed (4 new useTpass key-contract/export tests)
  - Spec reviewer: APPROVE — all 9 hooks exported + correct endpoint/verb mapping; tpass+accounts invalidation correct (account key under ['accounts',id,'tpass']); types match backend JSON field-for-field, no mismatches
  - Code-quality reviewer: APPROVE — mirrors useInvoices.ts; tpassKeys factory sound; no dead/missing invalidations; enabled guards present; only minor stylistic notes; deeper renderHook tests deferred to 6.4
- Next action: Dispatch task 5.2 (settings home list entry → TPASS 2.0 EasyCard entry navigating to TPASS settings page), cross-platform APP + Web.

## Session 33 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 5.2 將設定首頁調整為列表式入口
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will convert the APP and Web settings home into a list-style entry hub (電子發票 / TPASS 2.0 悠遊卡 / 幣別設定) per Figma frame 5:2, relocate the inline e-invoice form to a sub-page, and make the TPASS entry navigate to a TPASS settings route (placeholder for 5.3).

## Session 34 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 5.2 將設定首頁調整為列表式入口
- Transition: in_progress → passing
- Evidence:
  - Commits: frontend 9880e0b; app 9a032e4 (frontend/ and app/ are separate git repos, both on main)
  - Tests: Web `tsc -b --noEmit` clean + eslint clean; APP `tsc --noEmit` zero new errors in 5.2-touched files (only pre-existing packages/shared .ts-extension errors)
  - Spec reviewer: APPROVE — both platforms render 電子發票/TPASS 2.0 悠遊卡/幣別 entries; TPASS entry navigates to /settings/tpass (Web App.tsx route + APP _layout Stack.Screen + placeholder pages); badges via useSyncStatus/useTpassStatus; e-invoice form relocated intact; auto-pay still reachable on account pages
  - Code-quality reviewer: APPROVE — reusable SettingsRow (no dup markup), form genuinely moved (no dead code), behavior preserved verbatim, 360px no-wrap handled; minor cosmetic notes only
  - Extra verification: APP logout confirmed still reachable in app/(tabs)/more.tsx (was never on settings home — no regression)
- Next action: Dispatch task 5.3 (TPASS settings + card overview page: credential form when unset, status+sync actions+card list when set), cross-platform.

## Session 35 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 5.3 新增 TPASS 設定與卡片總覽頁
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will flesh out the TPASS settings page (both platforms): empty-state credential form (national ID + birth date + 儲存並同步), configured-state credential card (masked ID/birth/last-synced + sync/unbind actions + sync status/error), and the card list (masked number, type, registration status, early-bird, linked account name, recent official reward) with cards navigable to the detail route placeholder.

## Session 36 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 5.3 新增 TPASS 設定與卡片總覽頁
- Transition: in_progress → passing
- Evidence:
  - Commits: frontend f528dae + 8ebf67e(fix); app 1991d5c + ac621ee(fix); root 68e3b4c (shared TPASS badge constants)
  - Tests: Web `tsc -b --noEmit` clean; APP `tsc --noEmit` no new errors in 5.3 files (pre-existing shared .ts-extension noise only)
  - Spec reviewer: first pass ❌ — registration/early-bird badges compared English literals never matching backend Chinese values (已登錄/符合) → badges misrendered both platforms. After fix → APPROVE: badges drive off TPASS_REGISTERED/TPASS_EARLY_BIRD_QUALIFIED constants matching backend verbatim; empty/configured/loading/error states + save-then-sync + unbind confirm all intact
  - Code-quality reviewer: APPROVE — reusable components, correct save-then-sync chain, null-safe formatting, shared constants; only minor notes (cross-platform helper duplication, O(n) account lookup, English Alert titles, unused TPASS_NOT_REGISTERED)
- Next action: Dispatch task 5.4 (TPASS card detail page: full card number, status, linked-account selector, official monthly summary table, external transaction link), cross-platform — fills the detail placeholder created in 5.3.

## Session 37 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 5.4 新增 TPASS 卡片詳情頁
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will fill the card detail page (both platforms): full card number + status badge, linked credit-account selector (CREDIT accounts, link/unlink), official monthly summary table (5 transports: count/amount/official reward + total + delta + redeemed date), and an external official transaction-record link with a no-per-ride-sync disclaimer.

## Session 38 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 5.4 新增 TPASS 卡片詳情頁
- Transition: in_progress → passing
- Evidence:
  - Commits: frontend c63a8d4; app 3dfa3b7
  - Tests: Web `tsc -b --noEmit` clean; APP `tsc --noEmit` no new errors in [id].tsx (pre-existing shared .ts-extension noise only)
  - Spec reviewer: APPROVE — full card number shown (detail-only), registration badge (TPASS_REGISTERED), CREDIT-account selector link/unlink/409, monthly table field-mapping audited correct (5 transports count/amount/reward + total + signed delta + redeemed date), external official link (scraper QueryURL) + no-per-ride-sync disclaimer; both platforms
  - Code-quality reviewer: APPROVE — config-driven TRANSPORT_ROWS, cross-platform parity, complete state handling, 409 reset-on-retry, no card_number logging; only minor notes (web↔app helper/config duplication could move to @zenbill/shared, inline money formatting)
- Next action: Dispatch task 5.5 (credit account detail page TPASS section: single linked card, prev/current transit ride summaries, remaining-to-threshold, prev reward + current estimated, not mixed into transaction list), cross-platform — final Section 5 task.

## Session 39 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 5.5 在信用卡帳戶詳情頁新增 TPASS 區塊
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add a TPASS section to the credit-account detail page (both platforms) via useAccountTpass: single linked card, prev/current transit ride counts (短途公車/客運, 中長途國道, 軌道加碼), remaining-to-threshold, prev official reward + current estimated, link to card detail; shown only for CREDIT accounts with a linked card and never mixed into the transaction list.

## Session 40 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 5.5 在信用卡帳戶詳情頁新增 TPASS 區塊
- Transition: in_progress → passing
- Evidence:
  - Commits: root a1b68f7 (shared getTpassTierHint + TPASS_TIERS + test); frontend b93715a; app 830086a
  - Tests: `pnpm --filter @zenbill/shared test` 31 passed (8 new tpassTier boundary tests); Web `tsc -b --noEmit` clean; APP `tsc --noEmit` no new errors in [id].tsx (pre-existing shared .ts-extension noise only)
  - Spec reviewer: APPROVE — visibility guard (CREDIT + non-null card → else null), single card, prev/current counts for 3 categories, rail = taipei+tra+newtaipei summed (prev+current), headline remaining from backend, prev official + current estimated rewards, separate block not in tx list, navigation to card detail; both platforms
  - Code-quality reviewer: APPROVE — pure shared helper with named TPASS_TIERS + union type + boundary tests, data-driven rows, null-safe, clean layering; minor notes (差 0 次 wording, web↔app row-config dup)
  - Note: implementer prematurely set tasks.md status to 'done'; orchestrator corrected to 'passing' after both reviewers approved.
- Next action: Section 5 complete (5.1-5.5). Dispatch Section 6 task 6.1 (domain + usecase tests: reward tiers, cross-year inference, credential encryption, sync errors, concurrent sync, credit-link rules).

## Session 41 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 6.1 新增 domain 與 usecase 測試
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will audit existing TPASS domain/usecase tests against the 6.1 acceptance list (reward tiers, cross-year inference, credential encryption, sync errors, concurrent sync, credit-link rules), fill any genuine coverage gaps, and confirm `go test ./internal/domain/... ./internal/usecase/...` passes.

## Session 42 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 6.1 新增 domain 與 usecase 測試
- Transition: in_progress → passing
- Evidence:
  - Commits: none (coverage-consolidation audit — all 6 acceptance items already covered by 3.2–3.5 tests; no new code needed, no empty commit)
  - Tests: `go test ./internal/domain/...` PASS; `go test ./internal/usecase/... -run 'Tpass|MaskNationalID'` PASS (18 TPASS/mask funcs). Pre-existing unrelated failure TestSharedExpenseService_Delete_WithExpenseTransaction confirmed not introduced by this change (clean working tree).
  - Spec reviewer: APPROVE — independently verified each of 6 acceptance items maps to a real passing test; cross-year inference legitimately lives in pkg/tpass (no year-derivation in domain/usecase) so deferral to 6.3 is correct
  - Code-quality reviewer: APPROVE — existing TPASS test suite is genuine behavior testing (exact tier boundaries, no-plaintext+masked+round-trip, data-preservation+no-secret-leak+deterministic channel-based concurrency, conflict-preserves-existing); no shallow tests hiding gaps; no-new-test conclusion sound
- Next action: Dispatch task 6.2 (repository + HTTP tests: card hash dedup, summary upsert, single-binding constraint, account projection; handler success/unauth/error-code/full-number boundaries).

## Session 43 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 6.2 新增 repository 與 HTTP 測試
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will audit repository (3.1) + handler (4.1/4.2) test coverage for card-hash dedup / summary upsert / single-binding / account projection / success / error-codes / full-number boundary, and fill the 'unauthorized' gap (no 401 test currently in TPASS handler tests) — adding a representative 401 test unless JWTAuth middleware has central coverage that makes per-route redundant.

## Session 44 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 6.2 新增 repository 與 HTTP 測試
- Transition: in_progress → passing
- Evidence:
  - Commits: none (coverage-consolidation audit — all items covered by 3.1 repo tests + 4.1/4.2 handler tests + central JWTAuth middleware 401 tests; no new code, no empty commit)
  - Tests: repository TPASS 6/6 PASS (port 5434 DB); delivery/http + middleware Tpass|JWTAuth 26 PASS
  - Spec reviewer: APPROVE — independently verified each repo item (hash dedup, summary upsert, single-binding, projection cross-user isolation) + handler items (success/400/409/404/500/full-number boundary); 401 confirmed central: auth_test.go asserts 401 + TPASS routes on JWT-protected group (cmd/api/main.go:248-267)
  - Code-quality reviewer: APPROVE — repo tests use real isolated-schema Postgres asserting row count+identity+values+cross-user isolation; handler tests assert codes+body+real full-number boundary via real encryptor; deterministic channel-based Sync_InProgress; JWTAuth 401 genuine; only minor dead test field (findIDErr)
  - Note: implementer prematurely set status 'done'; orchestrator corrected to 'passing' after both reviewers approved.
- Next action: Dispatch task 6.3 (parser fixture tests: card list, monthly summary, official total reward, redeemed date, cross-year inference from de-identified fixtures).

## Session 45 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 6.3 新增 parser fixture 測試
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will audit pkg/tpass parser fixture tests (card list, monthly summary, official total reward, redeemed date, cross-year inference) against 6.3 acceptance and confirm all pass from de-identified fixtures; fill any genuine gap.

## Session 46 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 6.3 新增 parser fixture 測試
- Transition: in_progress → passing
- Evidence:
  - Commits: none (coverage-consolidation audit — all items covered by 2.1–2.3 pkg/tpass tests; no new code)
  - Tests: `go test ./pkg/tpass/...` PASS
  - Spec reviewer: APPROVE — verified card list, monthly summary, official total (59/185), redeemed date (""/02/22), cross-year inference (byMonth[4]=2026 vs byMonth[12]=2025 from same fixture+queryDate 2026-06-08) all fixture-derived; de-identification guard real+strict; DOM-contract tests present
  - Code-quality reviewer: APPROVE — concrete value assertions (struct equality), specific-error negative tests, deterministic two-branch cross-year boundary, real DOM-drift guards, de-id guard strict enough to block real PII; no shallow tests
- Next action: Dispatch task 6.4 (shared renderHook query-invalidation tests deferred from 5.1, + manual verification record for settings entry / TPASS settings / card detail / credit-account section states).

## Session 47 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 6.4 新增 APP/shared 測試與手動驗證紀錄
- Transition: not_started → in_progress
- Evidence:
  - Commits: pending
  - Tests: pending
- Next action: Implementer will add shared renderHook query-invalidation tests for the TPASS mutation hooks (set/delete/sync/link → correct tpass+accounts key invalidation) and produce a manual-verification record mapping settings entry / TPASS settings / card detail / credit-account section states to implementation + figma frames, marking live-runtime sign-off as user-pending.

## Session 48 — 2026-06-12 (resume, Sec5~6)
- Stage: SDD
- Task: 6.4 新增 APP/shared 測試與手動驗證紀錄
- Transition: in_progress → passing
- Evidence:
  - Commits: 1f73987 (shared invalidation tests + manual-verification.md); 4a27b97 (refactor: extract tpassInvalidators so tests exercise real hook logic)
  - Tests: `pnpm --filter @zenbill/shared typecheck` clean; `pnpm --filter @zenbill/shared test` 37 passed (useTpass.test.ts 10)
  - Spec reviewer: APPROVE — Part 1 query invalidation genuinely tested (set/delete/sync/link key sets + seeded prefix-match incl ['accounts',id,'tpass']); hooks types covered; Part 2 manual-verification.md records all required states (5:2/5:138/5:25/5:153/5:164/5:65/5:117/5:175/5:187) with accurate file:line refs, addresses single-card+prev/current+rewards clause, honest about live-runtime sign-off being user-pending
  - Code-quality reviewer: first pass ❌ Important — 4 mutation tests were tautological (static invalidationContract table fed to spy via replay(), never invoking real hooks). After fix 4a27b97 → APPROVE: extracted tpassInvalidators helpers shared by hooks + tests; key drift now fails tests (verified by removing ['accounts'] → sync+link tests fail); behavior unchanged; non-mutation tests retained.
  - Note: implementer prematurely marked tasks.md done; orchestrator confirmed 'passing' after both reviewers approved.
- Next action: All tasks 1.1–6.4 passing. Run final pass (openspec validate --strict + full test confirmation) then invoke spec-driven-dev:verification-before-completion.

## Session 49 — 2026-06-12 (verification-before-completion)
- Stage: verification
- Task: full-change verification
- Transition: (verification run, no task status change)
- Evidence:
  - Stage 1 Code: PASS — backend build OK; TPASS tests green (domain/pkg/usecase/repository/http/middleware); shared 37 tests; web tsc clean; app tsc only pre-existing shared .ts-extension noise. golangci-lint absent → go build+vet substituted. Pre-existing unrelated failure TestSharedExpenseService_Delete_WithExpenseTransaction noted (not introduced).
  - Stage 1 scenario coverage: 19/23 automated-test covered; 4 UI scenarios code-verified (manual-verification.md), live PENDING USER.
  - Stage 2 Spec: PASS — openspec validate --strict valid; tasks 24/24 passing; progress last entry has Next action.
  - Stage 3 Diagrams: PASS — ER mapped to domain models + constraints + migration registration; Activity diagram mapped step-by-step to tpass_sync_service.go Sync() (user "幫我確認" → confirmed go); per-card-fetch deferral documented.
  - Stage 4 Designs: shared-component reuse PASS (SearchableSelect/Card/Button reused, not duplicated); 9 figma states code-verified; live visual + smoke DELEGATED TO USER ("我自己跨實機驗證").
  - verification-report.md written.
- Next action: User completes live design-state + smoke verification (manual-verification.md 8-step checklist) and the 4 product-confirm deferrals, then runs `openspec archive add-tpass-easycard-sync`.
