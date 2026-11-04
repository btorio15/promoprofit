---
phase: quick-261103-mok
plan: 01
status: complete
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
  tasks: "3/3"
  completed: 2026-11-03
---

# Quick 261103-mok: Record bonus-bet conversion rate history (partial)

Every scheduled odds run now builds one row per usable Colorado book valuing a fixed $100.00 bonus bet (top-1 profit/pct, median pct of the top 5, candidate count, top event/sport/hedge book) from cached odds only, written to a new `bonus_conversion_snapshots` table. Migration 0019 is generated but NOT applied to Neon.

## Status

- Task 1 (pure row builder + tests): done, commit 643dcae
- Task 2 (table, migration 0019, recorder, wiring, tests): done (commit in git log after 643dcae)
- Task 3 (apply migration 0019 to live Neon): done 2026-11-03 with owner approval. `git fetch origin` showed no migration 0019+ on origin/main or origin/codex/deepbook-ui; `npm run db:migrate` applied it. A one-off manual run of `recordCurrentBonusConversionSnapshots` wrote the first rows (e.g. ballybet top 77.27% / median 73.07%, betmgm 69.44% / 67.85%, draftkings 69.41% / 66.66%), proving the path end to end with 0 Odds API credits.

## Verification

Full `npx vitest run` (165 files, 2375 tests), `npm run typecheck`, `npm run lint` (0 errors, pre-existing warnings only) all pass.

## Deviations from Plan

None. Test case (a) literal values (80.00 / 80.00) were hand-checked in a comment.

## Task 3 steps (for orchestrator)

After owner OK: `git fetch origin`, confirm origin/main has no migration >= 0019, run `npm run db:migrate`, confirm table exists.
