---
phase: 07-dashboard
plan: 05
subsystem: ui
tags: [dashboard, totals-card, react]
requires: [07-03, 07-04]
provides:
  - DashboardTotals card component
  - Dashboard screen layout (header, totals, graph, Opportunities heading, feed)
affects: [07-06]
key-files:
  created:
    - src/components/opportunities/DashboardTotals.tsx
    - src/components/opportunities/dashboardLayout.test.ts
    - src/components/promos/noProfitSummary.test.ts
  modified:
    - src/components/opportunities/OpportunitiesScreen.tsx
    - src/components/opportunities/ProfitGraph.tsx
  deleted:
    - src/components/promos/ProfitSummary.tsx
requirements-completed: [STATS-07, STATS-08, STATS-09, STATS-10]
duration: 10min
completed: 2026-10-16
---

# Phase 7 Plan 05: Dashboard Screen Assembly Summary

New always-visible totals card (2x2 on phone, one row from sm up) mounted above the graph on the Dashboard tab, with the old ProfitSummary removed.

## Tasks
1. DashboardTotals component and ProfitGraph "since" suffix - 0b28ce1
2. Mount on screen, delete ProfitSummary, guard tests - a000c7e

## Deviations from Plan
- The worktree started on an older commit; reset to the specified base b2d98c8 per the branch check so Plans 03/04 files were present. No code deviation.
- Best-promo name is rendered as label plus the remainder of fullName (fullName minus label prefix), truncated to one line with title/aria-label carrying the full text.

## Verification
npm test (1966 passed), eslint clean, tsc clean apart from the known worktree-only LayoutProps error in src/app/layout.tsx.

## Self-Check: PASSED
