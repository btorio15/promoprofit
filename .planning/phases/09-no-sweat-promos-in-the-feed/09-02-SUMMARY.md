---
phase: 09-no-sweat-promos-in-the-feed
plan: 02
status: partial (Task 3 pending owner approval)
requirements: [FEED-05, FEED-03]
tags: [schema, migration, drizzle, tracking, low-profile]
key-files:
  created:
    - src/domain/promos/noSweatSnapshot.ts
    - src/domain/promos/noSweatSnapshot.fixture.ts
    - src/domain/promos/lowProfile.ts
    - src/db/trackedNoSweats.ts
    - src/db/lowProfile.ts
    - drizzle/0018_small_wrecking_crew.sql
  modified:
    - src/db/schema.ts
---

# Phase 9 Plan 02: Tracking storage and Low-profile settings Summary

Two new tables (tracked_no_sweats, user_low_profile_settings) with migration 0018 generated (NOT applied), versioned zod snapshot/settings schemas, and DB modules that degrade to []/defaults if the tables are missing.

## Tasks

| Task | Status | Commit |
|------|--------|--------|
| 1. Snapshot and Low-profile domain schemas | done | c62a27b |
| 2. Tables, migration 0018, DB modules | done | see git log (feat(09-02) tables commit) |
| 3. [BLOCKING] Apply migration 0018 | PENDING owner approval | - |

## Task 3 status

`npm run db:migrate` was deliberately not run. The orchestrator must get the owner's OK, then apply from the main checkout and run `npm run db:check`. `git fetch origin` showed no newer drizzle migration on origin/main or origin/codex/deepbook-ui (both end at 0017), so 0018 is the next free index.

## Deviations

- Worktree base was reset to 064b92f per the startup check; node_modules was symlinked from the main checkout to run tests (untracked, not committed).
- `npm run typecheck` reports one error, `LayoutProps` not found in src/app/layout.tsx. It is in a file this plan did not touch (likely missing generated Next types in the worktree).

## Self-Check: PASSED (Tasks 1-2; vitest 33 tests pass)
