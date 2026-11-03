---
phase: quick-261103-mok
plan: 01
status: partial
subsystem: hedge / ingestion
tags: [bonus-bet, conversion-rate, history, drizzle]
requires: []
provides: [bonus_conversion_snapshots history recording]
affects: [Phase 10 no-sweat / intro offer valuation (future reader)]
key-files:
  created:
    - src/domain/hedge/conversionSnapshot.ts
    - src/domain/hedge/conversionSnapshot.test.ts
    - src/db/bonusConversionSnapshots.ts
    - src/db/bonusConversionSnapshots.test.ts
    - drizzle/0019_bonus_conversion_snapshots.sql
    - drizzle/meta/0019_snapshot.json
  modified:
    - src/db/schema.ts
    - src/ingestion/odds/morningObserve.ts
    - src/ingestion/odds/morningObserve.test.ts
    - drizzle/meta/_journal.json
metrics:
  tasks: "2/3 (Task 3 pending owner approval)"
  completed: 2026-11-03
---

# Quick 261103-mok: Record bonus-bet conversion rate history (partial)

Every scheduled odds run now builds one row per usable Colorado book valuing a fixed $100.00 bonus bet (top-1 profit/pct, median pct of the top 5, candidate count, top event/sport/hedge book) from cached odds only, written to a new `bonus_conversion_snapshots` table. Migration 0019 is generated but NOT applied to Neon.

## Status

- Task 1 (pure row builder + tests): done, commit 643dcae
- Task 2 (table, migration 0019, recorder, wiring, tests): done (commit in git log after 643dcae)
- Task 3 (apply migration 0019 to live Neon): PENDING owner approval. Until applied, the scheduled run logs "recordCurrentBonusConversionSnapshots: failed to record conversion snapshots" and carries on by design.

## Verification

Full `npx vitest run` (165 files, 2375 tests), `npm run typecheck`, `npm run lint` (0 errors, pre-existing warnings only) all pass.

## Deviations from Plan

None. Test case (a) literal values (80.00 / 80.00) were hand-checked in a comment.

## Task 3 steps (for orchestrator)

After owner OK: `git fetch origin`, confirm origin/main has no migration >= 0019, run `npm run db:migrate`, confirm table exists.
