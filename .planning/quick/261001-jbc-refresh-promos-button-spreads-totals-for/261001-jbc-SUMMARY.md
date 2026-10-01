---
phase: quick-261001-jbc
plan: 01
subsystem: odds-refresh
tags: [odds-api, credits, cache-merge, status-bar]
requires: [261001-e1j]
provides:
  - "Refresh promos status-bar button (confirmed, cost-quoted, promo-sports-only refresh)"
  - "commitPromoSportsRefresh partial-sport cache merge + per-event price age"
affects: [OddsStatusBar, get-promos, get-opportunities, find-hedges odds age]
tech-stack:
  added: []
  patterns: ["per-sport cache merge without fetched_at purge", "oldest-live-row age via SQL now()"]
key-files:
  created:
    - src/domain/promos/promoRefreshScope.ts
    - src/app/actions/refresh-promos.ts
    - src/components/finder/promoRefresh.ts
    - src/components/finder/usePromoRefresh.ts
    - src/components/finder/PromoRefreshDialog.tsx
    - src/ingestion/odds/store.test.ts
  modified:
    - src/ingestion/odds/store.ts
    - src/ingestion/odds/refreshExtended.ts
    - src/db/queries.ts
    - src/domain/promos/priceAge.ts
    - src/db/feedContext.ts
    - src/app/actions/get-promos.ts
    - src/app/actions/get-opportunities.ts
    - src/components/finder/OddsStatusBar.tsx
    - src/components/arb/spreadsTotalsSearch.ts
decisions:
  - "Merge mechanism: delete+insert only the refreshed sports and purge only started events; readers drop the latest-batch filter (no migration)"
  - "Status-bar/find-hedges age = oldest live row (coalesce(min filter live, max)); per-row Prices as of uses the event's own fetched_at"
  - "credit_usage records the real refreshCost and the FULL in-season sport count"
metrics:
  tasks: 3
  completed: 2026-10-01
---

# Quick 261001-jbc: Refresh promos button Summary

"Refresh promos" replaces "Spreads & alt lines" in the status bar: after a confirm dialog quoting sports and "about N credits", it fetches h2h+spreads+totals only for sports covered by the member's visible non-Done promos, then alt spreads for each promo's best game (shared 5-game cap), merging into both caches without touching other sports' rows or their fetched_at.

## Commits
- 25d079d: partial-sport cache merge and per-row price age (Task 1)
- 072a7b6: promo-sports runner, scope helpers, refreshPromos action (Task 2)
- (follow-up) test: type the alt picker mock to clear a lint warning
- 822f41b: status-bar button, dialog, banners (Task 3)

## Plan-checker warnings addressed
1. Oldest-live-row aggregate uses SQL `now()` (no JS Date interpolated into the neon-http template); string results normalized through pure `toDateOrNull` (tested).
2. One commit per task.
3. Dialog copy says "about N credits" and the alt-game quote is an upper bound; the credit_usage row records the real API-reported refreshCost.

## Deviations from Plan
None of substance. `runPromoSportsRefresh` and `runSpreadsTotalsRefresh` share a private `runLocked` wrapper (casts narrow the union; the unscoped path never yields no_promos or sportKeys).

## Verification
- Full vitest: 118 files, 1634 tests pass. Existing Arbitrage tests unmodified (only additive mock entry in refreshExtended.test.ts).
- tsc: only the known worktree `LayoutProps` error.
- eslint: clean.
- `next build`: could not complete in the worktree: Turbopack rejects the symlinked node_modules ("points out of the filesystem root"). Worktree-environment issue, not code.

## Known Stubs
None.

## Self-Check: PASSED
