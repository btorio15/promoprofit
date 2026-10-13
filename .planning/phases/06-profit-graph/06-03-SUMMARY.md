---
phase: 06-profit-graph
plan: 03
subsystem: db
tags: [db, drizzle, migration, neon]
requires: []
provides:
  - memberProfitObservations table + migration 0012 (generated, NOT applied)
  - recordMemberProfitObservations, getMemberProfitHistory, buildMemberObservationsQuery, buildGraphStartDayQuery
  - isUndefinedTableErrorFor(err, tableName)
affects: [06-04, 06-06, 06-07]
key-files:
  created:
    - drizzle/0012_member_profit_observations.sql
    - drizzle/meta/0012_snapshot.json
    - src/db/undefinedTable.ts
    - src/db/memberObservations.ts
    - src/db/memberObservations.test.ts
  modified:
    - src/db/schema.ts
    - drizzle/meta/_journal.json
key-decisions:
  - "Writes never throw (covers missing table); reads map 42P01 to status not-ready, rethrow everything else"
  - "Upsert keeps greatest profit; partner_promo_id follows the higher profit"
requirements-completed: [STATS-02]
duration: 10min
completed: 2026-10-13
---

# Phase 6 Plan 03: Member observations table and DB module Summary

Per-member observation table (PK user_id, promo_id, denver_date) with migration 0012 generated but not applied (owner applies in Plan 07), plus a DB module that records with GREATEST upserts and never throws, and reads session-scoped history that returns not-ready when the table is missing.

## Tasks
1. Schema + migration 0012 (CREATE TABLE, PK, 3 FKs, index only; no DROP) - 7d4a46e
2. memberObservations module, undefinedTable helper, tests - f7765e0

## Verification
17 tests pass (memberObservations + promoCaps); typecheck and eslint on src/db clean. Migration file name matches plan. Live DB untouched; promoCaps.ts unchanged.

## Deviations from Plan
None - plan executed exactly as written.

## Self-Check: PASSED
