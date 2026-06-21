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
