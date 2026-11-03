---
phase: 12-add-kalshi-and-polymarket-as-hedge-venues
plan: 09
subsystem: finder
tags: [hedge, market-venues, finder, kalshi, polymarket]
requires: [12-01, 12-04, 12-06]
provides:
  - "rankBonusBetHedges chooses best of book vs market hedge by after-fee profit"
  - "FinderResultDTO.hedgeMarket: MarketLegDTO | null"
key-files:
  modified:
    - src/domain/hedge/rankBonusBetHedges.ts
    - src/domain/hedge/rankBonusBetHedges.test.ts
    - src/domain/hedge/conversionRate.ts
    - src/domain/hedge/conversionRate.test.ts
    - src/domain/finder/types.ts
    - src/app/actions/find-hedges.ts
    - src/app/actions/find-hedges.test.ts
    - src/components/finder/ResultRow.tsx
    - src/components/finder/ResultDetails.tsx
decisions:
  - "Market hedge replaces the book hedge only on strictly greater after-fee profit (D-02); markets tie-break by venue key"
  - "Book path (bestHedgeQuote) excludes market venues so a fee-less American price is never shown as a book hedge"
  - "conversionRate strips market keys: no-sweat stays sportsbook-only (D-01 deferred)"
metrics:
  completed: 2026-11-02
  tasks: 2
---

# Phase 12 Plan 09: Finder market hedges Summary

The bonus-bet finder now suggests a Kalshi or Polymarket US hedge only when its after-fee profit strictly beats the best sportsbook hedge, and it shows the contract fill on the card.

## Commits
- 854e86b: ranker (book vs market), conversionRate guard, tests
- 717e5dd: DTO, action, ResultRow/ResultDetails, action tests (see git log)

## What changed
- `BonusBetOpportunity.market: MarketFill | null`; `buildOrientation` runs `solveBonusBetMarketHedge` for each opted-in market quote and compares to the book candidate. `sameBook` is false for markets; `maxHedgeStake` compares the outlay (cost + fee).
- `topConversionFor` filters market keys out of the hedge set.
- `findHedges` sets `hedgeMarket` via `toMarketLegDTO`, with venue/book names falling back to config (`usableHedgeBooks`).
- `ResultRow`: market hedge shows `MarketLegLine`, `MarketLegBadges` after the venue name, no fee-less American on the team line, and `tieRiskTooltipText(true)`. `ResultDetails`: step B reads the `marketLegText` instruction; table shows outlay and contract payout.

## Tests
Hand-computed fixtures (bonus +250 at $100: book -150 nets 100.00; Kalshi 55c nets 108.16; Kalshi 59c nets 98.26; exact tie found by search: bonus +110, book +114 vs Kalshi 45c both 58.59). Full suite: 151 files, 2182 tests pass. `tsc --noEmit` shows only the known `LayoutProps` error.

## Deviations
None to plan behavior. `npm run lint` could not run (`eslint: command not found` in this worktree install); lint is unverified.

## Known Stubs
None.

## Self-Check: PASSED
