---
phase: 07-dashboard
plan: 03
subsystem: opportunities-action
tags: [dashboard, server-action, stats]
requires: [07-01]
provides: ["getOpportunities ok responses carry dashboard: DashboardTotalsDTO"]
affects: [src/components/opportunities/OpportunitiesScreen.tsx (Plan 05 must switch totals -> dashboard)]
key-files:
  modified:
    - src/domain/opportunities/types.ts
    - src/app/actions/get-opportunities.ts
    - src/app/actions/get-opportunities.test.ts
requirements-completed: [STATS-08, STATS-09]
metrics:
  tasks: 2
  files: 3
  completed: 2026-10-16
---

# Phase 7 Plan 03: Wire dashboard totals into getOpportunities Summary

getOpportunities now returns a member-scoped `dashboard` (via `buildDashboardTotals` on the member profit series, raw completions and doneRows) in every ok branch, replacing `totals` and dropping the group-wide `loadAvailableProfit` read.

## Commits
- 0610efb feat(07-03): return dashboard totals from getOpportunities
- 66c1fb7 test(07-03): cover dashboard totals in getOpportunities

## What changed
- types.ts: removed `OpportunitiesTotals`/`AvailableProfit`; ok branch has `dashboard: DashboardTotalsDTO`.
- get-opportunities.ts: removed `loadAvailableProfit` and `sumPortfolioProfit`; `respond(emptyVariant, sources)`; `recordCurrentProfitObservations` kept; `requireUser()` still first; no new inputs or odds client.
- Tests: 32 passing; cover dashboard in all branches, pre-start completions, pair marker counted once, not-ready available null, group path not called, banned `loadAvailableProfit` in source guard.

## Deviations from Plan
- The worktree started at an older base; reset to the specified base c44e5f1 (per the branch check) so Plan 01 files existed. Otherwise none.

## Known issues
- tsc errors remain in `OpportunitiesScreen.tsx` (`ok.totals`, lines 180-182); resolved by Plan 05 as planned. `layout.tsx` LayoutProps error is the environment artifact.

## Self-Check: PASSED
