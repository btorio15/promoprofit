---
phase: 07-dashboard
plan: 01
subsystem: domain
tags: [decimal.js, vitest, dashboard, totals]
requires: []
provides:
  - buildDashboardTotals pure function and DashboardTotalsDTO / DashboardBestPromo / DashboardTotalsInput contract
affects: [07-03, 07-04, 07-05]
key-files:
  created:
    - src/domain/promos/dashboardTotals.ts
    - src/domain/promos/dashboardTotals.test.ts
key-decisions:
  - "Extracted totals use raw completions, never clipped at graphStartDay; available comes only from member series days"
requirements-completed: [STATS-08, STATS-09]
duration: 10min
completed: 2026-10-16
---

# Phase 7 Plan 01: Dashboard Totals Math Summary

Pure decimal.js module computing extracted (all-time, 7d, 30d), available (since graph start, 7d, 30d), promos done, average, and best promo for the Dashboard totals card.

## Commits
- 11ddeb4: test(07-01): add failing tests for dashboard totals (RED)
- d07f1e5: feat(07-01): implement dashboard totals (GREEN)

## Verification
20 Vitest tests pass. Owner fixture gives extracted 33.09, 10 done, average 3.31, best 9.05 DraftKings. No Number()/parseFloat on money.

## Deviations from Plan
None in code. The worktree base was reset to daf8217 per the startup check.

## Deferred Issues
`npx tsc --noEmit` reports a pre-existing error in src/app/layout.tsx (`LayoutProps` not found, a generated Next type). It is unrelated to this plan, and there are no type errors in the new files.

## Known Stubs
None.

## Self-Check: PASSED
