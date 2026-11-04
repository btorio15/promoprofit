---
phase: 12-add-kalshi-and-polymarket-as-hedge-venues
plan: 11
subsystem: domain/promos
tags: [prediction-markets, ranker, hedge]
requires: [12-01, 12-04]
provides:
  - PromoOpportunity.hedgeMarket (MarketFill | null)
  - market hedge path for bonus bets and profit boosts in rankPromoHedges
key-files:
  modified:
    - src/domain/promos/rankPromoHedges.ts
    - src/domain/promos/rankPromoHedges.test.ts
    - src/domain/promos/rankNoSweat.test.ts
decisions:
  - Market hedge wins a candidate only when its after-fee profit strictly beats the sportsbook hedge; among markets highest profit then venue key
  - bestHedgeQuote excludes market venues for all callers (rankNoSweat, pairPromos)
  - findUnprofitablePromos (allowNonPositive) stays sportsbook-only
metrics:
  completed: 2026-11-02
---

# Phase 12 Plan 11: Promo-hedge ranker market integration Summary

rankPromoHedges now compares the best sportsbook hedge with each opted-in Kalshi/Polymarket hedge per candidate selection (whole contracts, exact fees via the 12-04 solvers) and keeps the market only when it strictly wins on after-fee profit; the result flows through the unchanged sort.

## Commits
- 0b83318 feat(12-11): market hedge path for bonus and boost promos with strict-beat selection
- test(12-11): no-sweat ranking stays sportsbook-only with Kalshi saved

## Details
- Boost book and market solvers share one input object (`sharedInput`) so they cannot drift; the RangeError catch covers both.
- Market candidates have `sameBook = false`; `hedge` is the market quote, `hedgeMarket` the MarketFill, and the solver's extra `market` field is stripped from `result`.
- Market-only selections (no sportsbook hedge) now yield opportunities.
- Depth: `SelectionQuote` carries no ask size, so `availableContracts` is null here; per D-13 depth drives only the Thin market badge (12-16).

## Verification
`vitest run src/domain/promos src/db src/app`: 77 files, 1205 tests pass. `tsc --noEmit`: only the pre-existing `LayoutProps` error. (`npm run typecheck` fails with "tsc not found" in this worktree, so tsc was invoked via node.)

## Deviations from Plan
- Test adjustment (not a code change): the plan bullet "a market quote never counts as the promo book" is enforced upstream (usableOddsBooks, plan 01) and by the lookup keyed on promo.bookKey; the test asserts a draftkings promo does not match a Kalshi quote. A promo literally keyed "kalshi" would still find its own quote, as before; not reachable via validated promos.
- Worktree base was corrected with `git reset --hard 774a3e6` at startup per the worktree check (merge-base mismatch).

## Known Stubs
None.

## Self-Check: PASSED
