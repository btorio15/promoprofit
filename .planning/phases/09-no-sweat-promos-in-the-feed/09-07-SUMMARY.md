---
phase: 09-no-sweat-promos-in-the-feed
plan: 07
subsystem: promos
tags: [tdd, settle, refund, decimal]
requires: [09-02]
provides:
  - rankRefundOpportunities shared by topConversionFor (estimate) and the Bet-lost card
  - noSweatSettle: effectiveBets, refundAmountFor, wonProfit, lostTotal, settleProfit, toRefundConversion, PUSH_OR_VOID_PROFIT
key-files:
  created:
    - src/domain/promos/noSweatSettle.ts
    - src/domain/promos/noSweatSettle.test.ts
  modified:
    - src/domain/hedge/conversionRate.ts
    - src/domain/hedge/conversionRate.test.ts
    - src/domain/hedge/noSweat.ts
requirements-completed: [FEED-05]
completed: 2026-11-03
---

# Phase 9 Plan 07: Settle math and shared refund ranker Summary

Cent-exact no-sweat settle functions (Decimal only, floorCents like the solver) and a single refund ranker so the estimate and the Bet-lost card cannot disagree.

## Commits
- 98db2c2 test(09-07): failing settle + refund ranker tests (RED)
- feat(09-07): settle math + rankRefundOpportunities (GREEN)

## Deviations
- floorCents already lived in profitBoost.ts and was imported by noSweat.ts, so noSweat.ts re-exports it (`export { floorCents }`) rather than declaring `export function floorCents`; the literal acceptance grep for that declaration will not match, behavior is identical.
- The shared snapshot fixture's estimate numbers (profitIfLose -2.00) are not solver-consistent. The lostTotal consistency test builds a consistent snapshot via override (14.37) instead of editing the 09-02 fixture.
- settleProfit validates correction odds through americanToDecimal (RangeError) for every outcome.
- Amount validation extracted to shared assertAmount, used by rankRefundOpportunities and makeConversionRateFor (same message).

## Verification
src/domain/promos and src/domain/hedge suites: 51 files, 906 tests pass; tsc clean (except known LayoutProps artifact). No float-money grep hits.

## Self-Check: PASSED
