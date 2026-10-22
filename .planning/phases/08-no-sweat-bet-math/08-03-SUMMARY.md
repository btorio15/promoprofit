---
phase: 08-no-sweat-bet-math
plan: 03
subsystem: domain/promos
tags: [no-sweat, ranker, candidate-search, tdd]
requires: [solveNoSweat, makeConversionRateFor, enumerateScopeSelections, bestHedgeQuote]
provides: [rankNoSweat, noSweatScope, NoSweatPromo, NoSweatRankOptions, NoSweatOpportunity, NoSweatRankResult]
affects: [Phase 9 feed]
key-files:
  created:
    - src/domain/promos/rankNoSweat.ts
    - src/domain/promos/rankNoSweat.test.ts
  modified: []
key-decisions:
  - "Standalone module; rankPromoHedges.ts and selection.ts untouched"
  - "Result is a discriminated union (ok / cant_price / no_qualifying_line); cant_price carries no profit fields"
requirements-completed: [NSB-01, NSB-02, NSB-03]
duration: ~10 min
completed: 2026-10-22
---

# Phase 8 Plan 03: No-Sweat Candidate Search Summary

`rankNoSweat` values the refund once through the injected conversion rate, searches every in-scope moneyline, spread and total line meeting min odds (including the promo book's alternate spreads), solves each with `solveNoSweat` at stake = refund cap, and returns the highest estimated profit.

## What was built
- `rankNoSweat(promo, opts)` returns `ok` (opportunity with qualifying quote, hedge quote, conversion rate used, solution), `cant_price` (rate null, checked before search, D-04), or `no_qualifying_line`.
- `noSweatScope(sportKey, now)`: null gives `any`; otherwise a `sport_window` through max Date.
- Tie-break chain: estimated profit desc, worst case desc, commence asc, eventId, market, line, side. Hedges use only member books. Non-positive best estimates are returned. RangeErrors are warned and skipped.

## Verification
- 15 rankNoSweat tests pass: Hard Rock example in cents and whole precision (hedge 0.52 / est 0.47 / worst -3.03; whole 1.00 / 0.00 / -1.20), cant_price, min-odds boundary, member-books-only hedge, highest-estimate over longest odds, spread/total selection with no whole lines, sport limit, tie-breaks, negative estimate kept, real finder rate parity, non-member refund book still priced.
- `npm test` 142 files / 2042 tests pass; `tsc --noEmit` and `npm run lint` clean; existing rankers unchanged (git diff gate).

## Deviations from Plan
None in source. One test scenario was initially mis-designed (a +400 line hedged at +200 was legitimately the best); the test data was corrected, not the ranker.

## Known Stubs
None.

## Commits
- test(08-03): add failing tests for rankNoSweat (RED)
- 2a8e83a feat(08-03): implement rankNoSweat candidate search (GREEN)
- test(08-03): cover highest-estimate search, markets, sport limit, tie-breaks, finder wiring

## Self-Check: PASSED
