---
phase: 06-profit-graph
plan: 06
subsystem: job
tags: [job, github-actions, batch]
requires: [06-02, 06-03]
provides:
  - listUserIds
  - recordAllMembersObservations (morning member pass)
affects: [06-07]
key-files:
  modified:
    - src/db/queries.ts
    - src/ingestion/odds/morningObserve.ts
    - src/ingestion/odds/morningObserve.test.ts
    - scripts/morning-odds-observe.ts
key-decisions:
  - "Member pass uses whole precision and cached odds only; no extra runOddsRefresh call"
  - "Per-member try/catch; listUserIds failure logged; script exit code unaffected"
requirements-completed: []
duration: 8min
completed: 2026-10-13
---

# Phase 6 Plan 06: Morning member observation pass Summary

The once-daily morning job now records every member's own feed into member_profit_observations after the group-level recording, using the same computeMemberFeed + buildMemberObservationEntries path as the Opportunities load, failure-isolated and spending no extra Odds API credits.

## Tasks
1. listUserIds + recordAllMembersObservations with tests - b005b69
2. Script logs member pass counts - 4e98bb8

## Verification
Full suite 1727 tests pass (123 files); typecheck and lint clean; boundary test green. Migration 0012 not applied; the member recorder never throws, so a missing table cannot break the morning job. No real refresh or API calls made.

## Deviations from Plan
None - plan executed exactly as written. STATS-02 left unmarked: the graph is not yet member-visible.

## Self-Check: PASSED
