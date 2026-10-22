---
phase: 08-no-sweat-bet-math
plan: 01
subsystem: domain/hedge
tags: [no-sweat, hedge-math, decimal, oracle, tdd]
requires: [americanOdds, arbMath.StakePrecision, profitBoost.clean/floorCents, pairMath.oracle PRNG]
provides: [solveNoSweat, NoSweatInput, NoSweatSolution, noSweat.oracle]
affects: [Phase 9 feed, Phase 10 intro offers, Plan 03 ranker]
tech-stack:
  added: []
  patterns: [local Decimal clone precision 40, floor payouts to cents, brute-force integer-cent oracle]
key-files:
  created:
    - src/domain/hedge/noSweat.ts
    - src/domain/hedge/noSweat.test.ts
    - src/domain/hedge/noSweat.oracle.ts
  modified: []
key-decisions:
  - "Candidate window: floor/ceil of exact stake at the chosen precision, each +-2 units, plus a single-unit stake; non-positive candidates dropped"
  - "Result is an estimate: estimated: true, estimatedProfit / worstCaseProfit, no guaranteedProfit field"
requirements-completed: [NSB-01, NSB-04]
duration: ~10 min
completed: 2026-10-22
---

# Phase 8 Plan 01: No-Sweat Solver Summary

Exact single-line `solveNoSweat` (refund-as-bonus-bet) with whole-dollar/cent stake rounding, proven against an independent integer-cent brute-force oracle.

## What was built
- `solveNoSweat` returns hedge stake, profit if the qualifying bet wins, profit if it loses (refund at estimated value), estimated profit (the min of the two) and worst case (refund worth $0) at the same chosen stake. All figures are recomputed from the rounded stake with payouts floored to the cent.
- Validation throws RangeError for non-positive or over-2-dp stake and cap, negative or over-2-dp refund value, and invalid American odds.
- Oracle (test-only, independent of the solver, rational integer-cent odds) reuses the PRNG from `pairMath.oracle`.

## Verification
- All 7 research fixtures (A, A-w, B, B-w, C, HR, HR-w) reproduce to the cent.
- Oracle agrees on all fixtures and a 300-case seeded sweep (seed 0x5eed08, both precisions), including win/lose/worst-case at the chosen stake. The initial +-2 unit window passed with no widening needed.
- `npm test`: 140 files, 2021 tests pass. `tsc --noEmit` clean. ESLint clean. Prettier applied.

## Deviations from Plan
None. Plan executed as written. (Prettier formatting was applied to the three new files before the final task commit.)

## Known Stubs
None.

## Commits
- 9a4141d test(08-01): add failing test for solveNoSweat fixtures (RED)
- 054fac0 feat(08-01): implement solveNoSweat exact solver (GREEN)
- 150bfb4 test(08-01): add brute-force oracle and seeded sweep for solveNoSweat

## Self-Check: PASSED
