---
phase: 04-opportunities-feed
plan: 03
subsystem: domain/promos
tags: [pair-discovery, matching, tdd, decimal.js]
requires: [04-02]
provides:
  - findPairCandidates, selectPairs, singleProfitMap, marketKeyOf, PairCandidate
  - candidatesFor / passesBaseMinOdds exported from rankPromoHedges.ts
affects: [04-06 Best pairs section, 04-07 Mark pair done recompute]
key-files:
  created:
    - src/domain/promos/pairPromos.ts
    - src/domain/promos/pairPromos.test.ts
  modified:
    - src/domain/promos/rankPromoHedges.ts
key-decisions:
  - "Best market per promo pair is chosen by profit desc, then commence, eventId, market, line, side, lower id, so the feed and the Mark-done recompute agree"
  - "Matching ties: greater gain, then fewer pairs, then lexicographically smaller sorted pair-id list"
requirements-completed: [CALC-07, DASH-05, DASH-03]
duration: ~15 min
completed: 2026-09-29
---

# Phase 4 Plan 03: Pair discovery and exact selection Summary

Pure module that finds boost+boost and boost+bonus pairs on opposite sides of one market at two different member books, gates them on beating separate hedges (D-08), and picks the exact max-gain set with each promo in at most one pair (D-10).

## Commits
- RED `8a62303` test(04-03): failing tests; candidatesFor and passesBaseMinOdds exported (keyword only)
- GREEN `b821ba0` feat(04-03): pairPromos.ts

## Results
- `npx vitest run src/domain/promos src/domain/hedge`: 27 files, 462 tests pass (rankPromoHedges tests unchanged and green).
- `npx tsc --noEmit`: clean (after `npx next typegen` for the known LayoutProps issue).
- `npx eslint src/domain/promos`: clean.
- Acceptance greps: no db imports, no parseFloat/Number(, 4 exports.

## Behavior notes
- Unpinned promos get leg options on both sides of each market (own-book quote on that side, flipped selection); pinned promos only their pinned side. Options are deduped by market key and side.
- Decimal-only prune: boost+boost needs 1/OA + 1/OB < 1; both kinds need an uncapped upper bound above singleA + singleB before the solver runs.
- RangeError from a leg or the solver is skipped with console.warn.
- selectPairs: union-find components, memoized bitmask DP up to 20 promos, greedy-by-gain fallback above (onFallback callback observable in tests).

## Deviations from Plan
None. Worktree base was corrected with a hard reset to 5420355 at startup per the startup check.

## Known Stubs
None.

## Threat Flags
None. T-04-08 (member filter, tested), T-04-09 (prune and DP cap), T-04-10 (Decimal weights, deterministic ties) applied.

## Self-Check: PASSED
