---
phase: quick-260930-gyl
plan: 01
subsystem: promos / odds ingestion
tags: [alternate-spreads, ranking, profit-boost, bonus-bet]
requires: [260930-gam]
provides:
  - opt-in altSpreadBookKey alt-spread enumeration for unpinned single-game promos
  - buildAltSpreadRequests + generalized selectAltSpreadTargets
key-files:
  modified:
    - src/domain/promos/selection.ts
    - src/domain/promos/rankPromoHedges.ts
    - src/domain/promos/altSpreads.ts
    - src/ingestion/odds/refreshExtended.ts
    - src/app/actions/refresh-spreads-totals.ts
    - src/components/arb/ArbForm.tsx
    - src/components/arb/SearchSpreadsTotalsDialog.tsx
metrics:
  completed: 2026-09-30
---

# Quick 260930-gyl: Alternate spreads raise ROI on single-game promos

Unpinned single-game profit boosts and bonus bets are now ranked across every exact-opposite half-point alternate spread pair (promo side at the promo's book, hedge at another allowed book), and the confirmed "Search spreads & totals" press fetches alt spreads for those games.

## Commits
- eea1f12 feat: opt-in alt-spread candidates + ranking (selection.ts, rankPromoHedges.ts, tests)
- bc84d60 feat: request builder, generalized targets, `altSpreads` option (altSpreads.ts, refreshExtended.ts, action, tests)
- (third) chore: banner/dialog copy reworded to "promo games"

## Results (hand-derived fixture, cents)
- Boost, min odds -200: Browns -6.5 alt, hedge 69.69 at DK -230, profit 5.30 (main line 3.13).
- Boost, min odds null: Steelers +7.5 alt, hedge 8.00, profit 7.00 (min odds gates it when -200).
- Bonus $50: Browns -6.5 alt, hedge 69.69, profit 30.30 (main 21.64).
- Browns -5.5 (no exact opposite) never chosen; sport_window and any-scope promos stay on main line (3.13 / 21.64).
- correctionOptions output unchanged (test added).

## Deviations from Plan
None. No existing test expectation changed. client.test.ts has no pin-only assumptions and was left untouched. Task 3's grep verify was replaced by `grep -rn -i pinned src/components/arb` (0 hits) because the multi-file comment filter is unreliable.

## Gates
vitest 93 files / 1415 tests pass; `tsc --noEmit` only the known `LayoutProps` artifact in src/app/layout.tsx; eslint clean. No schema/migration/arb/bonus-finder/correctionOptions/pairPromos changes; no DB or Odds API use.

## Follow-ups
- Orchestrator: mark the 260930-gam STATE row "Superseded by 260930-gyl".
- Owner: press "Search spreads & totals" once live to confirm alternate-spread outcome names match team names (the unmatchedOutcomes counter will show if not).

## Self-Check: PASSED
