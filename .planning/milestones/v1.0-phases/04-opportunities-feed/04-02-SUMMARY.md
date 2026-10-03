---
phase: 04-opportunities-feed
plan: 02
subsystem: domain/hedge
tags: [decimal.js, pair-math, tdd, oracle-test]
requires: []
provides:
  - solveBoostBoostPair / solveBoostBoostPairUnfiltered
  - solveBoostBonusPair / solveBoostBonusPairUnfiltered
  - BoostLegInput, BonusLegInput, PairLegResult, PairResult
affects: [04-03 pairPromos, 04-06 Best pairs section]
tech-stack:
  added: []
  patterns: [breakpoint-seed solver, seeded brute-force oracle]
key-files:
  created:
    - src/domain/hedge/pairMath.ts
    - src/domain/hedge/pairMath.test.ts
    - src/domain/hedge/pairMath.oracle.ts
  modified:
    - src/domain/hedge/profitBoost.ts
key-decisions:
  - "profitBoost.ts exports exactly four helpers (clean, floorCents, promoPayoutRaw, kinkStake); pairMath keeps its own LocalDecimal/dedupe/clamp"
  - "Search window +/-4 units in both whole and cents mode was sufficient; no widening needed"
requirements-completed: [CALC-07]
duration: ~25 min
completed: 2026-09-29
---

# Phase 4 Plan 02: Two-promo pair solver Summary

Exact decimal.js solver for boost + boost and boost + bonus bet pairs (stake-not-returned bonus leg costing $0, max stake, winnings caps of all three kinds, min-odds gate), proven against every research vector and a seeded brute-force oracle.

## Commits
- RED `5886e7b` test(04-02): failing tests, oracle, four helper exports in profitBoost.ts
- GREEN `6ae0b38` feat(04-02): pairMath.ts implementation

## Results
- `npx vitest run src/domain/hedge`: 8 files, 122 tests pass (profitBoost tests unchanged and green); pairMath.test.ts: 21 tests, ~0.5s total.
- Oracle cases (all seeded mulberry32, no Math.random): whole boost+boost 500 (195ms), whole boost+bonus 200 (34ms), exact cents boost+boost 40 (22ms), exact cents boost+bonus 100 (51ms), coarse 25-cent bound 60 (24ms). Each test asserts a minimum count of profitable cases so it is not vacuous. Cents blocks total well under the 5s budget.
- Acceptance greps: native-math gate 0, 4 solver exports, one `Decimal.clone({ precision: 40 })`, no profitBoost import of LocalDecimal/dedupe/clamp, no Math.random.
- eslint on src/domain/hedge clean.

## Deviations from Plan
None to the algorithm. The oracle was never loosened and the window never needed widening. Base worktree HEAD differed from the expected base and was reset to cd5a23a per the startup check.

## Deferred Issues
`npx tsc --noEmit` reports one pre-existing error unrelated to this plan: `src/app/layout.tsx(21,50): Cannot find name 'LayoutProps'` (Next-generated type, needs typegen/build which was avoided for disk space). Logged in deferred-items-04-02.md. No tsc errors in any hedge file.

## Known Stubs
None.

## Threat Flags
None. Threat mitigations T-04-06 (decimal-only, oracle-proven) and T-04-07 (bounded seeds x window, brute force only in test oracle) are in place.

## Self-Check: PASSED
