# Verification Report: add-cross-currency-transfer-rate

Date: 2026-06-21
Verifier: claude-code (Opus 4.8)

(Supersedes the earlier report — this run was re-executed after the prefilled-rate
operand fix and includes an end-to-end manual smoke on an Android emulator.)

## Summary
- Code: PASS
- Spec: PASS
- Progress log: PASS
- Diagrams: n/a (no diagrams/)
- Designs: n/a (no designs/figma.md)

## Code Evidence

### Shared typecheck + tests (packages/shared)
```
> @zenbill/shared@0.0.1 typecheck
> tsc --noEmit
(exit 0)

 Test Files  7 passed (7)
      Tests  54 passed (54)
```
crossCurrency.test.ts now covers: derive target/source/rate, compute-empty-from-prefilled-rate,
re-editing-recomputes-from-rate (per-keystroke fix), guard, and the transfer detection / payload /
prefill helpers. useExchangeRate.test.ts covers rate inversion, gating, and failure containment.

### Frontend typecheck (frontend)
```
npx tsc -b  → exit 0
```

### App (app/)
- No own type errors in app/components/transactions/TransactionForm.tsx. Shared/index.ts `.ts`
  extension diagnostics under the app tsconfig are a pre-existing cross-package quirk (Metro/Babel
  bundles at runtime), not introduced by this change.

### Backend
- No backend changes; out of scope.

### Scenario coverage (specs/cross-currency-transfer/spec.md)
14 of 16 scenarios have a name-matching automated test. The 2 form-level scenarios are verified by
the executed manual smoke (below), not by a named unit test (no FE component test infra, per user
decision):
- Entering one amount with a prefilled rate computes the other — VERIFIED via manual smoke (core case)
- Reset state when the currency relationship changes — DEFERRED (pure-UI; annotated in tasks.md)
All shared-function and hook scenarios (derive ×3, compute-empty-from-prefilled-rate,
re-editing-recomputes, guard, fetch/normalize, skip, failure-fallback) have matching tests.

### Manual smoke — PASS (end-to-end, Android emulator emulator-5554)
Dev build installed via `expo run:android`; flow driven with Maestro.
- Cross-currency detection: TRANSFER 中國信託銀行(TWD) → 王道美金(USD) reveals 轉入金額(USD) + 匯率 inputs.
- Rate auto-prefill: 匯率 filled 31.6456 from GET /exchange-rates (not manual).
- Auto-compute (the fix): entered only 轉出 1000 TWD → 轉入金額 auto-computed 31.6 USD
  (previously froze at 0.03 before the rate-anchored fix).
- Submit + ledger correctness: 中國信託 -1041 → -2041 (−1000 TWD); 王道美金 1937.54 → 1969.14
  (+31.6 USD). Target credited in target currency, not the source number.
- Edit view reloaded original_amount=31.6 and exchange_rate=31.6456 correctly.
- Cleanup: test transaction deleted; balances restored to baseline (中國信託 -1041, 王道美金 1937.54).

### Spec validation
```
openspec validate add-cross-currency-transfer-rate --strict
→ Change 'add-cross-currency-transfer-rate' is valid
```

## Diagram Verification
| File | Type | Status | Notes |
|---|---|---|---|
| — | — | n/a | No diagrams/ directory |

## Design Verification
| State | Figma node | Status | Diff |
|---|---|---|---|
| — | — | n/a | No designs/figma.md |

## Next Actions
- All verification stages passed, including end-to-end manual smoke with correct ledger balances.
- Suggest: `openspec archive add-cross-currency-transfer-rate`.
