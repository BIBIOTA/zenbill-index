# Progress: add-cross-currency-transfer-rate

## Session 1 — 2026-06-21 00:00
- Stage: TDD
- Task: 1.1 新增 computeCrossCurrencyAmount() 純函式
- Transition: not_started → in_progress
- Next action: Write failing Vitest scenarios for computeCrossCurrencyAmount in packages/shared/src/utils/__tests__/crossCurrency.test.ts.

## Session 2 — 2026-06-21 00:10
- Stage: TDD
- Task: 1.1 新增 computeCrossCurrencyAmount() 純函式
- Transition: in_progress → passing
- Evidence:
  - Commits: test red (crossCurrency scenarios); 491d2bd feat: green - computeCrossCurrencyAmount shared conversion helper
  - Tests: src/utils/__tests__/crossCurrency.test.ts — 4 passed (4)
- Next action: Start task 1.2 — write failing tests for useExchangeRate hook (rate inversion, empty-currency skip, failure fallback).

## Session 3 — 2026-06-21 00:20
- Stage: TDD
- Task: 1.2 新增 useExchangeRate(from, to) hook
- Transition: in_progress → passing
- Evidence:
  - Commits: test red (useExchangeRate); 435b8ba feat: green - useExchangeRate prefill hook with rate inversion
  - Tests: src/hooks/__tests__/useExchangeRate.test.ts — 4 passed (4); tsc --noEmit clean
- Next action: Start task 1.3 — add shared unit tests covering both helpers (1.1/1.2 tests already cover scenarios; verify full shared suite green).

## Session 4 — 2026-06-21 00:30
- Stage: TDD
- Task: 1.3 撰寫共享層單元測試
- Transition: in_progress → passing
- Evidence:
  - Commits: 13dfeae test: green - cross-currency recency coverage (task 1.3 consolidation)
  - Tests: full @zenbill/shared suite — 46 passed (7 files); crossCurrency 5, useExchangeRate 4
  - Note: 1.3 is a test-aggregation task; the missing-field/<=0/precision/rate-inversion scenarios were already red->green tested under 1.1/1.2, so no separate red was needed for the consolidation test (implementation predates it).
- Next action: Start task 2.1 — refactor frontend TransactionForm to call shared computeCrossCurrencyAmount (behavior unchanged).

## Session 5 — 2026-06-21 00:45
- Stage: TDD
- Task: 2.1 重構 Web TransactionForm 改用共享 computeCrossCurrencyAmount
- Transition: in_progress → passing
- Evidence:
  - Commits: red (isCrossCurrencyTransfer/buildTransferPayloadFields); root ea8edfd feat: green - share cross-currency detection and payload helpers; frontend b70d28b refactor: use shared cross-currency helpers in TransactionForm
  - Tests: shared crossCurrency.test.ts — 10 passed; frontend `tsc -b` clean
  - Decision: no FE component test infra (per user); UI-agnostic logic extracted to shared with TDD; pure-UI wiring marked verification-pending: manual smoke. Pre-existing eslint findings (set-state-in-effect, _/_oa/_er unused) left untouched (out of scope).
- Next action: Start task 2.2 — extract shouldPrefillRate to shared (TDD) and wire Web form rate prefill via useExchangeRate.

## Session 6 — 2026-06-21 00:55
- Stage: TDD
- Task: 2.2 Web 表單接上匯率自動預填
- Transition: in_progress → passing
- Evidence:
  - Commits: red (shouldPrefillRate); root 51e3058 feat: green - shouldPrefillRate shared helper; frontend 82d9ae3 feat: prefill editable exchange rate in Web transfer form
  - Tests: shared full suite — 52 passed; frontend tsc -b clean
  - Note: UI prefill effect + reset-on-currency-change wiring verification-pending: manual smoke.
- Next action: Start task 3.1 — add cross-currency detection + target/rate inputs to APP (app/) TransactionForm using shared helpers.

## Session 7 — 2026-06-21 01:10
- Stage: TDD
- Task: 3.1 + 3.2 APP TransactionForm 跨幣別 UI、預填與 payload
- Transition: in_progress → passing
- Evidence:
  - Commits: app b2757f3 feat: cross-currency transfer with editable rate in APP form
  - Tests: app/ TransactionForm.tsx has no own type errors (tsc); shared helpers TDD-covered (52 passed). The shared/index.ts `.ts`-extension tsc warnings are a pre-existing app-tsconfig quirk affecting all exports, not introduced here.
  - Decision: 3.1/3.2 are pure-UI wiring over already-TDD'd shared helpers; no new red/green possible without FE component infra (per user). Detection/auto-compute/prefill/payload all delegate to shared (tested); UI behavior verification-pending: manual smoke.
- Next action: Run task 4.1 cross-platform consistency check, then invoke verification-before-completion.

## Session 8 — 2026-06-21 01:20
- Stage: TDD
- Task: 4.1 兩端元件測試與跨平台同步驗證
- Transition: in_progress → passing
- Evidence:
  - Commits: (verification task — no production code change)
  - Tests: shared suite 52 passed; grep confirms Web & APP forms reference the same 5 shared helpers (computeCrossCurrencyAmount x3, isCrossCurrencyTransfer x2, buildTransferPayloadFields x2, shouldPrefillRate x2, useExchangeRate x2) with identical counts; no leftover inline compute math in either form.
- Next action: Invoke verification-before-completion; Web/APP component behavior remains verification-pending: manual smoke.

## Session 9 — 2026-06-21 17:11
- Stage: updating-spec
- Scope change requested: Manual smoke on the APP emulator found that when the exchange rate is auto-prefilled (untouched) and only the source amount is entered, the target amount stays 0 (auto-compute requires 2 entries in lastEdited; a prefilled rate is not counted as "edited"). Submitting would debit source but credit target 0 — a ledger-correctness bug.
- Artifacts updated:
  - specs/cross-currency-transfer/spec.md — MODIFIED shared-function requirement to add the "single empty field" primary rule (prefilled rate counts as a usable operand); reworded derive scenarios to value-based conditions; added scenario "Compute the empty amount from a prefilled rate"; added form scenario "Entering one amount with a prefilled rate computes the other"; tightened Guard scenario to "two or more fields empty".
  - design.md §4 — documented the precedence (single-empty-field rule before lastEdited tie-break).
  - tasks.md — added Group 5 (5.1 shared fn rule, 5.2 form early-return removal, 5.3 re-run manual smoke).
  - proposal.md — noted the fix under What Changes.
- Validation: `openspec validate add-cross-currency-transfer-rate --strict` → valid (exit 0).
- Note: verification-report.md (Session prior) is SUPERSEDED — a new verification run is required after the fix lands.
- Next action: User approves spec update → run TDD on tasks 5.1/5.2, then re-run manual smoke (5.3), then re-verify.

## Session 10 — 2026-06-21 17:15
- Stage: TDD
- Task: 5.1 computeCrossCurrencyAmount single-empty-field rule
- Transition: not_started → in_progress
- Next action: Write failing test "Compute the empty amount from a prefilled rate" (prefilled rate + only source entered → target computed).

## Session 11 — 2026-06-21 17:20
- Stage: TDD
- Task: 5.1 computeCrossCurrencyAmount single-empty-field rule
- Transition: in_progress → passing
- Evidence:
  - Commits: red (compute empty amount from prefilled rate); a2b785a feat: green - single-empty-field rule treats prefilled rate as operand
  - Tests: crossCurrency.test.ts — 12 passed (incl. new scenario + all prior backward-compat); tsc clean
- Next action: Start task 5.2 — remove the lastEdited<2 early-return in both forms so the shared function decides; re-wire Web + APP.

## Session 12 — 2026-06-21 17:24
- Stage: TDD
- Task: 5.2 remove form early-return; drive auto-compute via shared fn
- Transition: not_started → in_progress
- Next action: Remove `lastEdited<2` early-return in Web + APP forms; APP switches to diff-based field application; typecheck both.

## Session 13 — 2026-06-21 17:28
- Stage: TDD
- Task: 5.2 remove form early-return; drive auto-compute via shared fn
- Transition: in_progress → passing
- Evidence:
  - Commits: frontend 34e2b3f feat: drive cross-currency auto-compute via shared fn (remove early-return); app 6fc1bb4 feat: prefilled rate computes amount on single edit (diff-based apply)
  - Tests: frontend `tsc -b` exit 0; app form file no own type errors. Behavior to be confirmed by 5.3 manual smoke.
- Next action: Start task 5.3 — reload app on emulator and re-run the prefilled-rate + source-only smoke (target must auto-compute non-zero).

## Session 14 — 2026-06-21 17:30
- Stage: TDD
- Task: 5.4 rate-anchored edited-field model (fix per-keystroke freeze)
- Transition: not_started → in_progress
- Evidence: 5.3 manual smoke (interim) showed 轉入金額=0.03 instead of ~31.6 — the single-empty-field rule freezes after the first keystroke computes target (target then non-empty, tie-break needs 2 edits). Spec refined to rate-anchored edited-field model; openspec validate passed.
- Next action: Write failing test "Re-editing an amount recomputes the other from the rate", then rewrite computeCrossCurrencyAmount to anchor on rate by the last-edited field.

## Session 15 — 2026-06-21 17:32
- Stage: TDD
- Task: 5.4 rate-anchored edited-field model
- Transition: in_progress → passing
- Evidence:
  - Commits: red (re-editing recomputes); dc3fb73 feat: green - rate-anchored edited-field model fixes per-keystroke freeze
  - Tests: crossCurrency.test.ts — 13 passed (incl. re-edit + all backward-compat); tsc clean. Removed unused ALL_FIELDS.
- Next action: Resume task 5.3 — reload app on emulator (Metro hot-reload) and re-run the prefilled-rate + source-only smoke; target must show ~31.6 and submit/balance correct.

## Session 16 — 2026-06-21 17:35
- Stage: TDD
- Task: 5.3 re-run manual smoke (APP emulator)
- Transition: in_progress → passing
- Evidence:
  - emulator-5554, fresh bundle (5.4 fix). 中國信託(TWD)→王道美金(USD), prefilled rate 31.6456, entered only 轉出 1000 → 轉入金額 auto-computed 31.6 (previously froze at 0.03).
  - Submitted: 中國信託 -1041→-2041 (−1000 TWD), 王道美金 1937.54→1969.14 (+31.6 USD). Target credited in target currency, not the source number.
  - Edit view reloaded original_amount=31.6, exchange_rate=31.6456 correctly.
  - Cleanup: deleted the test transaction; balances restored to baseline (中國信託 -1041, 王道美金 1937.54). Did not touch the user's pre-existing -1041 transfer.
- Next action: Invoke verification-before-completion to write a fresh report superseding the prior one.
