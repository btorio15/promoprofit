---
phase: 12-add-kalshi-and-polymarket-as-hedge-venues
plan: 04
subsystem: domain/market
tags: [tdd, decimal.js, prediction-markets, hedge-solvers]
requires: [12-02]
provides:
  - solveMarketHedgeForPayout, solveBonusBetMarketHedge, solveProfitBoostMarketHedge, solveArbWithMarket (src/domain/market/solveMarketHedge.ts)
affects: [plans 05, 06, 08-16]
key-files:
  created:
    - src/domain/market/solveMarketHedge.ts
    - src/domain/market/solveMarketHedge.oracle.ts
    - src/domain/market/solveMarketHedge.test.ts
decisions:
  - Arb scan evaluates three book stakes per N (B*, B* minus one unit, and the largest cap-affordable stake)
  - Pre-check fee-rate lower bound is applied to Kalshi only (ceil rounding); Polymarket US uses 0
metrics:
  completed: 2026-11-02
---

# Phase 12 Plan 04: Whole-contract market hedge solvers Summary

Whole-contract bonus-bet, profit-boost and arbitrage solvers for a market leg ($1 per contract, exact nonlinear fee), with profit always computed from the rounded contract buy plus fee and verified against an independent integer-cent brute-force oracle.

## Commits
- 581b49a test(12-04): failing tests and oracle for bonus/boost (RED)
- fd241f0 feat(12-04): bonus and boost market hedge solvers (GREEN, task 1)
- 624282b test(12-04): failing arb-with-market tests (RED)
- f3662f7 feat(12-04): arbitrage solver with one market leg (GREEN, task 2)

## Verification
`vitest run src/domain/market`: 51 tests pass (seeds 1201 bonus x2000, 1202 boost x1000, 1203 arb x1000). `tsc --noEmit`: only the pre-existing `LayoutProps` error in src/app/layout.tsx.
Worked example: $50 bonus at +150 vs Kalshi YES 61c gives 75 contracts, cost 45.75, fee 1.25, outlay 47.00, profit 28.00, conversion 56.00.

## Deviations from Plan

**1. [Rule 1 - Bug] Arb stake search missed the cap-bound case**
- **Found during:** Task 2 (oracle mismatch, seed 1203 case #4)
- **Issue:** The plan's candidates (B* and B* minus one unit) miss the optimum when B + outlay(N) <= totalStake binds below B*.
- **Fix:** also evaluate the largest affordable unit-multiple (totalStake - outlay, rounded down). Profit is nondecreasing in B up to B*, so this is exact.
- **Commit:** feat(12-04) task 2

**2. [Rule 1 - Precision] Boost oracle tolerance for derived prices**
- **Issue:** `effectiveBoostedDecimal` (existing, shared with the sportsbook engine) snaps a derived boosted price to 20dp, so when an exact payout lands on a cent boundary the engine floors one cent low (e.g. 64.50 becomes 64.49). The market boost solver intentionally reuses that function so it matches the sportsbook engine.
- **Handling:** the seed-1202 test requires exact oracle equality for published prices and allows solver <= oracle within 1 cent for derived prices (never optimistic; at least 90 percent exact). profitBoost.ts was not modified (out of scope).

**3. Arb no-arb pre-check** uses the fee-rate lower bound for Kalshi only. Polymarket US rounds half-even and can round below the unrounded fee, so it contributes 0 to keep the check a true necessary condition.

**4. availableContracts** (when non-null) caps N in all solvers; the plan did not specify this but a fill beyond displayed depth would be wrong.

## Known Stubs
None.

## Self-Check: PASSED
