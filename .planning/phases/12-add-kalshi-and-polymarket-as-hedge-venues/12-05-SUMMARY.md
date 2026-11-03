---
phase: 12-add-kalshi-and-polymarket-as-hedge-venues
plan: 05
subsystem: domain/market
tags: [tdd, decimal.js, prediction-markets, boost-pairs]
requires: [12-02]
provides:
  - solveBoostBoostPairWithMarketTopUp, PairMarketTopUpResult (src/domain/market/solvePairMarketTopUp.ts)
affects: [plan 13]
key-files:
  created:
    - src/domain/market/solvePairMarketTopUp.ts
    - src/domain/market/solvePairMarketTopUp.oracle.ts
    - src/domain/market/solvePairMarketTopUp.test.ts
decisions:
  - Candidate stakes extended with the unit stake and integer-N balance cross-seeds so the bounded-loss property (<= $1 vs full grid) holds
requirements: [MKT-05]
metrics:
  completed: 2026-11-02
---

# Phase 12 Plan 05: Pair market top-up solver Summary

Boost + boost pair solver that adds N whole prediction-market contracts on either side, priced with the exact venue fee, equal to an independent integer-cent oracle over 1,500 seeded cases in both precisions.

## Commits
- ba6d58e test(12-05): failing tests and oracle (RED)
- 4d3c5ee feat(12-05): solver implementation (GREEN)

## Verification
`vitest run src/domain/market`: 48 tests pass (oracle equality seed 1205 x whole/cents, bounded-loss seed 1206, two hand-worked cases, null cases). `tsc --noEmit`: only the pre-existing `LayoutProps` error. pairMath.ts untouched.

## Deviations from Plan

**1. [Rule 3 - Blocking] Local copy of leg validation.** pairMath.ts does not export `prepareBoost`, and the plan forbids editing it, so the identical RangeError and D-17 min-odds checks were replicated in `prepareBoost` inside the new file.

**2. [Rule 1 - Bug] Candidate stake set widened.** With only {max, kink floor/ceil} stakes, the bounded-loss property failed (case 8: -$2.00 versus the full grid, because a market contract priced better than the promo wants the promo leg at the unit stake; later cases wanted stake pairs balancing at integer N). Added the unit stake and cross-seeds (other leg's stake within +/-1 unit of the largest stake whose payout is within 1..8 dollars above or below this leg's payout). The oracle mirrors the same candidate set (using bisection over integer-cent payouts), so equality still compares independent fee/profit math. The threat-register bound of "9 stake pairs" is now a few hundred pairs at most, still negligible (market outlay is memoised).

**3. [Test definition] Grid restricted to N0 >= 1.** The bounded-loss grid skips (side, sA, sB) where the top-up side already pays at least as much as the other (N0 < 1), matching the plan's explicit "skip a side whose N0 < 1" rule. Otherwise the grid finds "plain pair minus one wasted contract", which the solver intentionally does not return; plan 13 should compare against the plain pair separately.

**4.** Solver also honors `availableContracts` (caps N at the quote's size); not in the plan, harmless when null.

Equality test timeouts raised to 120s (about 10s actual for the cents case).

## Known Stubs
None.

## Self-Check: PASSED
