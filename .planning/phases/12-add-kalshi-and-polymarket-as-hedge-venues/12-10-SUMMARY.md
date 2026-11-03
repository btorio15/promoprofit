---
phase: 12-add-kalshi-and-polymarket-as-hedge-venues
plan: 10
subsystem: domain/hedge + arb UI
tags: [arbitrage, prediction-markets, ui]
requires: [12-01, 12-04, 12-06]
provides:
  - book-vs-market arbs in rankArbs (ArbLeg.market), ArbLegDTO.market, market rendering in ArbRow/ArbDetails
key-files:
  modified:
    - src/domain/hedge/rankArbs.ts
    - src/domain/hedge/rankArbs.test.ts
    - src/domain/arb/types.ts
    - src/domain/arb/build.ts
    - src/components/arb/ArbRow.tsx
    - src/components/arb/ArbDetails.tsx
    - src/app/actions/find-arbs.test.ts
metrics:
  completed: 2026-11-02
---

# Phase 12 Plan 10: Book-vs-market arbs Summary

The Arbitrage tab now surfaces sportsbook-vs-Kalshi/Polymarket sure bets with whole contracts and after-fee stakes under the total-stake cap, chosen over a book-vs-book arb only when strictly more profitable.

## Commits
- 9ea38d0 feat(12-10): book-vs-market arb candidates in rankArbs
- feat(12-10): render market leg in arb DTO, rows and details (second commit on this branch)

## What changed
- `findBestArbPair` filters market quotes out (book-vs-book only, no market keys in tie lists).
- `rankArbs` tries each market quote against the best sportsbook quote on the opposite side (highest decimal odds, ties by bookKey) in both orientations via `solveArbWithMarket`; no market-vs-market (D-04); market wins only on strictly greater guaranteed profit (D-02). Solver stakes/payouts are swapped when the market sits on side A.
- `ArbSideQuote` gained optional `askSize`/`contractSide` (passed to `toMarketLeg`; the odds extractors do not populate them yet, so depth is unset until a later plan wires market quotes in).
- `ArbLegDTO.market`, `toLegDTO` uses `toMarketLegDTO`; venue name falls back to `usableHedgeBooks()`.
- ArbRow shows `MarketLegLine` + `MarketLegBadges` (no tie popover) and the market-aware tie tooltip; ArbDetails reads "At {venue}, buy N SIDE on {selection} @ P¢ ($cost + $fee fee)".
- find-arbs test mock: scoped `getHedgeBookKeys` filters `usableHedgeBooks()`, no-arg stays `groupHedgeBookKeys()`; new opt-in test.

## Verification
`vitest run src/domain src/app/actions`: 1378 tests pass. `tsc --noEmit`: only the pre-existing `LayoutProps` error. eslint clean on touched dirs.

## Deviations from Plan
- Worktree base corrected via `git reset --hard` per startup check; `npm ci` run.
- `npm run typecheck`/`lint` replaced by direct `node node_modules/...` invocations.

## Known Stubs
None. Depth (`askSize`) is not yet populated by the odds extractors, so the Thin market badge stays off until wired (12-16).

## Self-Check: PASSED
