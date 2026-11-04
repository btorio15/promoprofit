---
phase: 12-add-kalshi-and-polymarket-as-hedge-venues
plan: 13
subsystem: promos
tags: [pairs, kalshi, polymarket, market-topup]
requires: [12-05, 12-11]
provides:
  - "PairCandidate.topUpMarket: MarketFill | null"
  - "market top-up path in findPairCandidates (boost_boost only)"
affects: [pair DTO/UI plans that read topUp / topUpMarket]
key-files:
  modified:
    - src/domain/promos/pairPromos.ts
    - src/domain/promos/pairPromos.test.ts
decisions:
  - "Market top-up is its own path next to the sportsbook-only bestHedgeQuote path; it replaces the book result (top-up or plain pair) only on strictly greater after-fee profit"
  - "Prune uses price + unrounded fee rate as a lower-bound per-contract cost, min'd with the book inverse"
metrics:
  tasks: 1
  completed: 2026-11-02
---

# Phase 12 Plan 13: Pair market top-up Summary

Boost + boost pairs now evaluate a Kalshi/Polymarket whole-contract top-up per venue (via `solveBoostBoostPairWithMarketTopUp`) after the existing sportsbook solve, and keep it only when its guaranteed profit is strictly greater than the book result. This also covers plan 05's N0 < 1 gap, since the plain pair / book result is the baseline being compared against.

## What changed
- `PairCandidate.topUpMarket` (null for book/no top-up). For a market winner, `topUp = { side, selection, bookKey: venueKey, oddsAmerican: quote price }`, and `result.topUp.leg` has stake = market outlay, payout = contracts.
- Market quotes come only from the leg's `promoSideQuotes`, filtered by `hedgeBookKeys` and `isMarketVenue`; one solver call per venue.
- Fee-aware prune: `helpsOnA/B` and the bound branches now consider market legs, using `p + coefficient*multiplier*p*(1-p)` from `VENUE_FEES` (a lower bound on real cost), so a market-only pair is never skipped.
- D-08 strict gate vs singles, `selectPairs`, and boost_bonus pairs are unchanged.

## Tests
Added: Kalshi top-up wins (49 contracts, profit 5.98); beats a worse book top-up; not-strictly-better keeps the book top-up (5.91); no market ticked gives no market top-up; seeded prune-safety against the direct market solver. All 707 promos tests pass; tsc clean apart from the known `LayoutProps` error.

## Deviations
None. An exact book/market profit tie fixture was not constructed (fees make an exact tie impractical); strictness is enforced by `.gt` and covered by the not-strictly-better case.

Commit: see git log (feat(12-13)).

## Self-Check: PASSED
