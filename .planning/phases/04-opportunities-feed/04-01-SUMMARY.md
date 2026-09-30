---
phase: 04-opportunities-feed
plan: 01
subsystem: ui
tags: [nextjs, server-actions, decimal.js, vitest]

requires:
  - phase: 03-promo-scraping-review
    provides: rankPromoHedges, PromoRow, ProfitSummary, promo completions
provides:
  - Opportunities tab (first and default) with profit summary, Profit/ROI switch, Best promos top 5
  - getOpportunities server action with sources union and four empty variants
  - Pure ranking helpers (pickTop, sortByMeasure) and sort preference helpers
  - Shared feed context (loadMemberFeedContext, loadAvailableProfit)
affects: [04-opportunities-feed]

tech-stack:
  added: []
  patterns:
    - "Sources union (OpportunitySourceDTO) so later plans add arbs/pairs without reworking the screen"
    - "Server returns all own-book rows; client re-picks top 5 on sort change (no refetch)"

key-files:
  created:
    - src/domain/opportunities/types.ts
    - src/domain/opportunities/pick.ts
    - src/domain/opportunities/pick.test.ts
    - src/lib/sortPreference.ts
    - src/lib/sortPreference.test.ts
    - src/db/feedContext.ts
    - src/app/actions/get-opportunities.ts
    - src/app/actions/get-opportunities.test.ts
    - src/components/opportunities/OpportunitiesScreen.tsx
    - src/components/opportunities/OpportunitySection.tsx
    - src/components/opportunities/SortSwitch.tsx
  modified:
    - src/lib/persistentState.ts
    - src/app/actions/get-promos.ts
    - src/components/AppShell.tsx

key-decisions:
  - "Opportunities excludes promos at books the member lacks entirely (D-16), unlike the Promos tab which dims them"
  - "promosVersion counter in AppShell (separate from recomputeKey) triggers refetch after Mark done/Undo"

requirements-completed: [DASH-01, DASH-03]

duration: 15min
completed: 2026-09-29
---

# Phase 4 Plan 01: Opportunities Tab Summary

**New first/default Opportunities tab showing the profit summary, a per-device Profit/ROI switch, and the top 5 own-book promo hedges, built on a sources union so arbs and pairs slot in later.**

## Accomplishments
- Pure ranking (Decimal comparisons, deterministic tie-breaks) and sort-preference helpers with tests.
- getOpportunities: requireUser first, strict input (no userId), own-book promo and hedge filtering, empty variants no-odds / no-books / none-scraped / nothing-profitable, zero Odds API credits (asserted by test).
- loadAvailableProfit moved to src/db/feedContext.ts; getPromos behavior unchanged.
- UI wired into AppShell: default tab, See all promos switches tab, refetch on Mark done/Undo.

## Task Commits
1. Task 1 (RED tests + helpers): 48b3012
2. Task 2 (action + feed context): 644e0ee
3. Task 3 (UI): 8855abe

## Deviations from Plan
None in behavior. Note: the worktree started on a different base than expected and was reset to cd5a23a per protocol. Own-book book filtering for hedge legs relies on getHedgeBookKeys(memberSet) via rankOpts (as planned).

## Verification
- `npx vitest run`: 73 files, 1113 tests pass.
- `npx tsc --noEmit`: only the pre-existing `LayoutProps` error in src/app/layout.tsx (not touched; typegen not run due to low disk).
- `npm run lint`: clean.
- `next build` not run (disk space).

## Known Stubs
None. The "pairs"/"arbs" sections are not rendered yet by design (later plans add union members).

## Self-Check: PASSED
