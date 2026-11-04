---
phase: 09-no-sweat-promos-in-the-feed
plan: 01
subsystem: promos
tags: [promos, types, leak-guard, statistics, drizzle]
requires:
  - phase: 08
    provides: rankNoSweat NoSweatPromo shape
provides:
  - no_sweat promo type, GuaranteedPromoType narrowing, assertNever
  - getActivePromos guaranteed-only; getActiveNoSweatPromos / ActiveNoSweatPromo / mapActiveNoSweatRow
  - Statistics funnel and daily history exclude no_sweat
affects: [09-05 feed wiring]
key-files:
  modified:
    - src/domain/promos/types.ts
    - src/domain/promos/rankPromoHedges.ts
    - src/db/promos.ts
    - src/db/profitHistory.ts
    - src/domain/stats/dailyHistory.ts
  created:
    - src/domain/promos/types.test.ts
key-decisions:
  - "SQL exclusion lives in new guaranteedPromoWhere (not inside activePromoWhere) so other callers of activePromoWhere are unchanged"
  - "dailyHistoryStats also drops no_sweat rows up front so totals/groups/averages stay guaranteed-only, not just conversion stats"
requirements-completed: [FEED-02, FEED-04]
duration: ~10min
completed: 2026-11-03
---

# Phase 9 Plan 01: no_sweat type and leak guards Summary

no_sweat is now a promo type that cannot enter the guaranteed pipeline (compile-time narrowing, SQL exclusion, mapper null) and is excluded from Statistics.

## Tasks
1. Widened PROMO_TYPES, added GuaranteedPromoType/isGuaranteedPromoType/assertNever; RankablePromo.promoType narrowed; boost/bonus ternary became an exhaustive switch. Commit 57c2c06.
2. getActivePromos now uses guaranteedPromoWhere (`promo_type <> 'no_sweat'`); mapActivePromoRow returns null for no_sweat; added getActiveNoSweatPromos, ActiveNoSweatPromo, mapActiveNoSweatRow, noSweatPromoWhere with the same viewer visibility rule. Select list and row-mapping core are shared so the two readers cannot drift. Commit a6fe0b0.
3. Funnel and daily-history queries exclude no_sweat (daily history keeps null promo_type from the left join); dailyHistoryStats filters and switches on no_sweat. Existing end-anchored WHERE regexes in profitHistory.test.ts were updated for the extra condition. Commit bc4938d.

## Deviations from Plan
- ActiveNoSweatPromo gained `title`, `expiresAt`, `addedByUserId` and ActivePromoRow gained optional `expiresAt` (selected in the shared column list); no schema change.
- No fallout for 09-05: typecheck shows no errors from this change.

## Issues
- `npm run typecheck` reports a pre-existing `src/app/layout.tsx(21,50): Cannot find name 'LayoutProps'` (Next typegen types absent in the fresh worktree); unrelated.
- Worktree needed a node_modules symlink to the main checkout (gitignored, not committed).

## Verification
Full suite: 143 files, 2066 tests pass.

## Self-Check: PASSED
