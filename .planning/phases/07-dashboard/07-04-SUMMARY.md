---
phase: 07-dashboard
plan: 04
subsystem: ui
tags: [view-model, vitest]
requires: [07-01]
provides:
  - buildTotalsView (pure totals-card copy)
  - GraphView.sinceLabel
affects: [07-05]
key-files:
  created:
    - src/components/opportunities/dashboardTotalsView.ts
    - src/components/opportunities/dashboardTotalsView.test.ts
  modified:
    - src/components/opportunities/profitGraphView.ts
    - src/components/opportunities/profitGraphView.test.ts
requirements-completed: [STATS-08, STATS-09]
completed: 2026-10-16
---

# Phase 7 Plan 04: Totals view model Summary

Pure, tested view model for every totals-card string (cells, captions, counts line, empty/not-ready states) plus a "since <start day>" suffix on the graph view for the All time range.

## Commits
- 9 tests RED: test(07-04) failing test for totals view model
- feat(07-04): implement totals view model
- feat(07-04): add since label to graph view

## Notes
- Start day is derived with formatTickDate; no arithmetic in the view model, only formatUsd.
- Pair `bookLabel` from the DTO already contains "pair", so it is used as-is.
- ariaFor and graph math untouched; existing tests unchanged and green (19 tests pass).

## Deviations from Plan
- The worktree started behind the expected base; reset to c44e5f1 per the branch check so Plan 01's dashboardTotals was present.

## Self-Check: PASSED
