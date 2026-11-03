---
phase: 12-add-kalshi-and-polymarket-as-hedge-venues
plan: 01
subsystem: config/odds-ingestion/db
tags: [books, kalshi, polymarket, hedge-venues, odds-api]
requires: []
provides:
  - "venue-aware book config (kalshi, polymarket_us)"
  - "usableMarketVenues/usableHedgeBooks/refreshBookmakerKeys/isMarketVenue/groupHedgeBookKeys"
  - "getMyBookOptions, getUserMyBookKeys, market-aware getHedgeBookKeys(allowedKeys)"
affects: [refresh, credit meter, My Books, saveBooks]
key-files:
  created: [src/config/books.test.ts, src/domain/books/bookSelection.test.ts]
  modified:
    - src/config/books.ts
    - src/ingestion/odds/refresh.ts
    - src/ingestion/odds/refreshExtended.ts
    - src/ingestion/odds/status.ts
    - src/ingestion/odds/status.test.ts
    - scripts/odds-smoke.ts
    - src/db/queries.ts
    - src/db/queries.test.ts
    - src/domain/books/bookSelection.ts
    - src/db/feedContext.ts
    - src/db/promoObservations.ts
    - src/app/actions/find-hedges.test.ts
    - src/app/actions/get-opportunities.test.ts
decisions:
  - "Group/site-wide lists stay sportsbook-only via groupHedgeBookKeys(); market hedges are per-member (D-03)"
  - "Refresh list = 7 sportsbooks + 2 odds_api markets (9 keys, one bucket, zero extra credits, D-06)"
metrics:
  tasks: 3
  completed: 2026-11-02
---

# Phase 12 Plan 01: Venue-aware book config Summary

Kalshi and Polymarket US added as hedge-only market venues in the single book config, with refresh and the credit meter using one venue-inclusive list (9 keys, one credit bucket) while promo/bonus books and all group lists stay sportsbook-only.

## Commits
- 09a6e7f: books.ts venue split, helpers, tests (bucket guard <= 10 keys)
- 299465d: refresh, refreshExtended, status wired to refreshBookmakerKeys()
- 5638b3e: queries/feedContext/bookSelection changes and tests

## Deviations from Plan
None to behavior. Notes:
- `usableOddsBooks()` delegates to a private `sportsbooksFrom` helper so the pure helpers share one filter.
- The empty-selection case in `SaveBooksInputSchema` skips the sportsbook refine (`keys.length === 0 ||`) so `[]` yields only "Select at least one book." as specified.
- The existing get-opportunities test expecting `everyUsableHedgeBookKeys` to equal the 3 mocked books was updated to `groupHedgeBookKeys()` (the intended new source).

## Verification
Full vitest suite: 144 files, 2072 tests pass. `tsc --noEmit` shows only a pre-existing `LayoutProps` error in src/app/layout.tsx (Next generated type, unrelated). The plan's `npm run typecheck` script was run via tsc directly; vitest via `node node_modules/vitest/vitest.mjs` because `.bin` links were not created in the worktree.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
