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
