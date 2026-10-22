---
phase: 06-profit-graph
plan: 04
subsystem: server-action
tags: [server-action, wiring, security]
requires: [06-01, 06-02, 06-03]
provides:
  - loadProfitSeries (member-only series, degrades to not-ready/error)
  - profitSeries on every ok OpportunitiesResponse
affects: [06-06, 06-07]
key-files:
  modified:
    - src/db/feedContext.ts
    - src/domain/opportunities/types.ts
    - src/app/actions/get-opportunities.ts
    - src/app/actions/get-opportunities.test.ts
key-decisions:
  - "Recording happens before series build so today's number is included; no-odds branch skips recording but still returns the series"
  - "Feed singles/pairs now come only from computeMemberFeed (one copy of the pair rule)"
requirements-completed: []
duration: 10min
completed: 2026-10-13
---

# Phase 6 Plan 04: Wire profitSeries into getOpportunities Summary

getOpportunities now records the member's own feed into member_profit_observations on each load and returns a member-only `profitSeries` in every ok response, tolerant of the table not existing yet.

## Tasks
1. loadProfitSeries + response type field - 7693aa8
2. get-opportunities rewired with computeMemberFeed, recording, profitSeries; tests - 47ba489

## Verification
27 tests pass in get-opportunities.test.ts, 78 in src/db; typecheck and lint clean. Migration 0012 not applied; no DB changes made.

## Deviations from Plan
- Did not add a dedicated test asserting pair entries' profits sum to the pair row's guaranteedProfit in the action test (covered by Plan 02's memberObservationEntries tests); the action test asserts call args, ordering and session-id scoping instead.
- STATS requirements left unmarked: the graph is not yet member-visible (UI in later plans).

## Self-Check: PASSED
