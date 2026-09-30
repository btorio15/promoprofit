---
phase: quick-260930-hor
plan: 01
subsystem: promos / odds refresh
tags: [alt-spreads, league-wide-promos, ranking]
requires: [260930-gyl]
provides: [pickLeagueWideAltSpreadEventIds, AltSpreadEventPicker hook]
key-files:
  created:
    - src/domain/promos/leagueWideAltTargets.ts
    - src/domain/promos/leagueWideAltTargets.test.ts
    - src/app/actions/refresh-spreads-totals.hook.test.ts
  modified:
    - src/domain/promos/rankPromoHedges.ts
    - src/domain/promos/rankPromoHedges.test.ts
    - src/domain/promos/altSpreads.ts
    - src/domain/promos/altSpreads.test.ts
    - src/ingestion/odds/refreshExtended.ts
    - src/ingestion/odds/refreshExtended.test.ts
    - src/app/actions/refresh-spreads-totals.ts
metrics:
  completed: 2026-09-30
---

# Quick 260930-hor: Alt spreads for league-wide promos (top-1 main-line game)

On a confirmed Search spreads & totals press, each unpinned spread-eligible league-wide boost or bonus bet now adds its single best main-line game to the alt-spread fetch. The fetch shares the 5-game soonest-first cap with single-game and pinned targets. Ranking lets league-wide promos use exact-opposite alt pairs on any in-scope game with cached alt lines.

## What changed

- `rankPromoHedges.ts`: `candidatesFor` passes `altSpreadBookKey: promo.bookKey` for every unpinned promo (A1 relaxed). `enumerateScopeSelections` is untouched, so `correctionOptions` is unchanged.
- New `leagueWideAltTargets.ts` (pure): `isLeagueWideAltSpreadPromo` and `pickLeagueWideAltSpreadEventIds`. It strips `alternate_spreads` from copies of the events, ranks each promo alone, and takes the top-1 event id. Results are deduped and inputs are never mutated.
- `refreshExtended.ts`: new `AltSpreadEventPicker` hook and `SpreadsTotalsRefreshOptions`. The hook runs after the main loop and before target selection, in its own try/catch that falls back to `[]`. Picked ids merge into `scopedEventIds`, so the cap, credit gate, and `altLines` shape are unchanged. The unconfirmed path returns before any of this.
- `refresh-spreads-totals.ts`: on a confirmed press it loads the member's promos, then `getUserBookKeys`, `getHedgeBookKeys(new Set(...))` and `getPromoCompletions` (done promos are excluded, mirroring `get-promos.ts`), and builds the picker closure with "cents" precision. A promo-load failure means no `altSpreads` and no hook; a hedge-book load failure means no hook but `altSpreads` stays.

## Advisory notes

1. `candidatesFor` is also used by `pairPromos.ts` and `rankPromoHedges.ts`. The pairPromos and full suites pass with no pairPromos expectation changes. Pairing still needs exact-opposite matches; league-wide promos simply also see alt candidates there.
2. The hedge-book load mirrors `get-promos.ts`: `getUserBookKeys(userId)` then `getHedgeBookKeys(new Set(userBookKeys))`. The promo feed also excludes completed promos (`getPromoCompletions`), and the action does the same.

## Intentional test expectation change

- `rankPromoHedges.test.ts`: the "A1: sport_window boost and any-scope bonus stay on the main line" test became "league-wide ... now use the alt pair (260930-hor relaxes A1)". The expectations changed from 3.13 / 21.64 to line -6.5, hedge 69.69, profit 5.30 / 30.30. They are cross-checked against `calculateProfitBoostHedge` and `calculateBonusBetHedge` called directly. No other existing expectation changed.

## Deviations

None of substance. The "pinned unchanged" check relies on the existing pinned tests, which pass untouched. The action tests live in a new file, `refresh-spreads-totals.hook.test.ts`, which mocks `refreshExtended` so the passed options can be inspected. The existing action test file is unchanged.

## Verification

- `npx vitest run`: 95 files, 1431 tests, all pass.
- `npx tsc --noEmit`: one error, `src/app/layout.tsx(21,50) Cannot find name 'LayoutProps'`. It is in a file this plan does not touch (Next generated types, absent in the worktree) and is out of scope.
- `npm run lint`: clean.
- No migrations, no DB writes, no Odds API calls.
