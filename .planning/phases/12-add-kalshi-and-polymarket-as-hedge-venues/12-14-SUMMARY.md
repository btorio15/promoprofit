---
phase: 12-add-kalshi-and-polymarket-as-hedge-venues
plan: 14
subsystem: promos
tags: [pairs, kalshi, polymarket, market-topup, snapshot]
requires: [12-06, 12-12, 12-13]
provides:
  - "PairTopUpLegDTO.market and PairTopUpSnapshotSchema.market (nullable, optional)"
  - "Pair card / details / Done row render the contract top-up"
key-files:
  modified:
    - src/domain/promos/pairRowDto.ts
    - src/domain/promos/pairRowDto.test.ts
    - src/domain/promos/pairSnapshot.ts
    - src/domain/promos/pairSnapshot.test.ts
    - src/app/actions/mark-pair-done.test.ts
    - src/components/opportunities/PairCard.tsx
    - src/components/opportunities/PairDetails.tsx
    - src/components/promos/DonePairRow.tsx
decisions:
  - "Market legC: stake = all-in outlay, payout = contracts as N.00, bookName = venue display name, oddsAmerican = display American of the contract price"
  - "Snapshot change is additive Zod only; no db schema or migration"
metrics:
  tasks: 2
  completed: 2026-11-02
---

# Phase 12 Plan 14: Pair market top-up through DTO, snapshot and UI Summary

Pair market top-ups (plan 13 `topUpMarket`) now flow through the pair DTO into the frozen pair snapshot and render as the third bet on the pair card, details panel and Done row.

## What changed
- `toTopUpLegDTO` builds `legC.market` via `toMarketLegDTO` for market top-ups; book top-ups and 2-bet pairs unchanged (`market: null`).
- `PairTopUpSnapshotSchema.market = MarketLegDTOSchema.nullable().optional()`; pre-phase snapshots still parse. `DonePairLegC` carries `market`.
- PairCard shows venue, selection, `MarketLegLine` and `MarketLegBadges` (Settlement differs, price may move); NFL tie-risk tooltip uses `tieRiskTooltipText(hasMarketLeg)`. PairDetails step reads "At {venue}, buy {N} {SIDE} on {label} @ {P}¢ ($cost + $fee fee)". DonePairRow renders from the stored snapshot only.

## Tests
New: market legC DTO mapping, snapshot round trip and priceCents 100 rejection, mark-pair-done stores `legC.market` and records pair profit. Existing legC expectations updated for `market: null`. 1217 tests pass in components/promos/app; eslint clean; tsc clean except the known `LayoutProps` error.

## Deviations
None. No db/schema or drizzle changes.

Commits: a65c7cf (task 1), see git log for task 2 (feat(12-14) render).

## Self-Check: PASSED
