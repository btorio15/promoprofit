---
phase: 06-profit-graph
plan: 07
subsystem: ui
tags: [ui, wiring, migration-gate, manual-check]
requires: [06-04, 06-05, 06-06]
provides:
  - ProfitGraph mounted at top of Opportunities
  - migration 0012 applied (member_profit_observations)
key-files:
  modified:
    - src/components/opportunities/OpportunitiesScreen.tsx
    - src/components/opportunities/ProfitGraph.tsx
key-decisions:
  - "Graph start day is 2026-10-13 (first recorded production row); rows must not be deleted"
requirements-completed: [STATS-01, STATS-02, STATS-03, STATS-04, STATS-05, STATS-06]
completed: 2026-10-13
---

# Phase 6 Plan 07: Mount graph, apply migration, phone check Summary

The profit graph now sits at the top of Opportunities, migration 0012 is applied to production with owner approval, and the owner signed off the live graph on an iPhone.

## Tasks
1. Mount ProfitGraph above the stale warning, ProfitSummary and feed (skeleton while loading, error state on failed/invalid response) - 5578674
2. Owner replied "apply it". Read-only pre-check: drizzle.__drizzle_migrations had 12 rows, last created_at 1790869789802 = 0011_user_promo_caps, so only 0012 was pending. `npm run db:migrate` ran (no drizzle-kit push): "migrations applied successfully", member_profit_observations count = 0, __drizzle_migrations = 13.
3. Owner phone check (iPhone Safari, dark mode, local dev server on LAN 10.201.25.135:3000 against production Neon). Owner was told beforehand that this writes real production rows. First recorded row: user Ben, denver_date 2026-10-13, 1 promo, profit 2.56. That day is the permanent graph start day; rows must not be deleted. Owner signed off "All good": card at top about 160px with feed below, touch tooltip, range switching, hide/show persisting across reload, dark-mode legibility.

## Verification
Full suite 124 files / 1735 tests pass; typecheck and lint clean. Nothing pushed.

## Deviations from Plan

**1. [Rule 1 - Bug] Selected range invisible** - Found during phone check. The card is bg-secondary, identical to the toggle's pressed bg-muted in both themes. Fixed by styling the selected ToggleGroupItem from the component's own range state ("bg-background font-semibold text-foreground shadow-sm hover:bg-background aria-pressed:bg-background"; unselected "text-muted-foreground"). aria-pressed:bg-background is repeated because the base aria-pressed:bg-muted is more specific. Verified in desktop Chrome and on the owner's iPhone. Commit 37d6d22.

**2. Local dev only: stale Turbopack cache.** Next 16 Turbopack's persistent .next cache served a stale Tailwind stylesheet missing every ProfitGraph class (h-40, sm:w-72, ...) for files created after the cache was built. Fixed by deleting .next and restarting. Production builds are unaffected; worth noting for future local checks.

## Known Stubs
None.

## Self-Check: PASSED
