---
phase: 05-group-added-promos
plan: 01
subsystem: database
tags: [drizzle, migration, visibility, promos]
requires: []
provides:
  - promos.added_by_user_id owner column (migration 0010, generated, NOT applied)
  - promoVisibilityCondition / activePromoWhere / mapActivePromoRow / getActivePromos(now, viewerUserId?)
  - PromoScope kind "any"; PromoStatus "deleted"
  - buildExpireUnseenStatement scraper guard
affects: [05-02, 05-03]
key-files:
  created: [drizzle/0010_added_promos.sql, drizzle/meta/0010_snapshot.json, src/db/promos.test.ts, src/ingestion/promos/store.test.ts]
  modified: [src/db/schema.ts, src/db/promos.ts, src/ingestion/promos/store.ts, src/domain/promos/scope.ts, src/domain/promos/types.ts, drizzle/meta/_journal.json]
key-decisions:
  - "Owner FK uses ON DELETE cascade so a private promo never becomes shared when its owner is deleted"
  - "Unrestricted bonus bets stored as scope_kind='any' (orchestrator default A2); requires a future expires_at to be active"
duration: 15min
completed: 2026-09-30
---

# Phase 5 Plan 01: Owner column, visibility choke point, any scope Summary

One nullable owner column on promos plus a single viewer-scoped visibility rule in getActivePromos (no viewer = scraped only), an `any` scope, a `deleted` status, and a scraper guard so runs never expire hand-added promos.

## DO NOT USE THE APP YET

Code now selects `added_by_user_id`, which the live Neon DB does not have until Plan 03 applies the migration with the owner's OK. The Promos and Opportunities screens will error if used manually (dev server or deploy) before then. Automated tests are unaffected.

## Commits
- 2b08937 test: failing tests (RED)
- 2ee65d5 feat: schema column + migration + deleted status + any scope
- 6c89b0e feat: visibility choke point, any mapping, expire guard (GREEN)

## Migration
Exact generated filename: `drizzle/0010_added_promos.sql` (journal idx 10, snapshot `drizzle/meta/0010_snapshot.json`). Additive only: ADD COLUMN, FK (ON DELETE cascade), CREATE INDEX. Not applied; db:migrate was not run.

## Deviations from Plan

**1. [Rule 3 - Blocking] Symlinked node_modules** into the worktree (gitignored) from the main checkout, since the worktree had none.

**2. [Rule 1 - Type fix] Added `addedByYou: false` to ActivePromo fixtures** in get-promos.test.ts, get-opportunities.test.ts, memberPairState.test.ts, required by the new ActivePromo field (in the Task 3 commit).

## Verification
- Full `npm test`: 82 files, 1223 tests pass; lint clean.
- `npm run typecheck`: only `src/app/layout.tsx(21,50) Cannot find name 'LayoutProps'`, which is pre-existing (Next generated route types, unrelated to this plan; not touched).

## Known Stubs
None.

## Self-Check: PASSED
