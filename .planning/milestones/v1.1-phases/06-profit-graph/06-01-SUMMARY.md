---
phase: 06-profit-graph
plan: 01
subsystem: domain
tags: [domain, decimal, denver-day, tdd]
requires: []
provides:
  - profitSeries pure module (buildDailyGains, cumulate, rangeStartDate, withZeroAnchor, hasAnyGain, rangeTotals, parseGraphRange)
  - addDays exported from profitTotals
affects: [06-03, 06-04, 07]
tech-stack:
  added: []
  patterns: [pure domain helpers, Decimal-only money math, string 2dp money]
key-files:
  created:
    - src/domain/promos/profitSeries.ts
    - src/domain/promos/profitSeries.test.ts
  modified:
    - src/domain/promos/profitTotals.ts
    - src/domain/promos/profitTotals.test.ts
key-decisions:
  - "Zero anchor point always added (day before range start); UI suppresses its label and tooltip"
requirements-completed: [STATS-02, STATS-03, STATS-04]
duration: 10min
completed: 2026-10-13
---

# Phase 6 Plan 01: Profit series math Summary

Exact, decimal-only per-day series math for the profit graph (available at best-per-promo on first Denver day, extracted by completion Denver day), with range slicing that starts both running totals at $0.

## Tasks
1. addDays export, A5 check, failing series tests - 5c37f5d
2. profitSeries.ts implementation - cb5df46

## A5 result
A5 verified: primary = pair profit, member = 0.00 (pairSnapshot.ts), so a plain sum counts a pair once.

## Verification
56 tests pass (profitSeries + profitTotals); `npm run typecheck` clean.

## Deviations from Plan
None - plan executed exactly as written.

## Self-Check: PASSED
