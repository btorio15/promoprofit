---
phase: 09-no-sweat-promos-in-the-feed
plan: 09
subsystem: ingestion
tags: [backfill, audit, data, d-18]
requires: [09-01, 09-03, 09-08]
provides: [planNoSweatBackfill, promos:audit-no-sweat script]
key-files:
  created:
    - src/ingestion/promos/noSweatAudit.ts
    - src/ingestion/promos/noSweatAudit.test.ts
    - scripts/audit-no-sweat.ts
  modified:
    - package.json
requirements-completed: [FEED-02]
completed: 2026-11-03
---

# Phase 9 Plan 09: No-sweat backfill audit Summary

Pure planner plus a dry-run-by-default script that finds stored promos misread as bonus bets when they are really no-sweats (e.g. DraftKings "NFL London No Sweat", row 94).

## What was built
- `planNoSweatBackfill(rows)` (pure, no DB imports): for live (active/pending_review) non-no_sweat rows, runs exclusions then no-sweat detection. Outputs retype (cap equals stored bonus amount, schema-valid, new dedupe key), expire_duplicate (new key already live), to_review (cash refund or unclear cap), list_only (hand-added). Already-no_sweat rows are never acted on but their keys count for duplicate detection, so callers pass all live rows.
- `scripts/audit-no-sweat.ts` / `npm run promos:audit-no-sweat`: prints a plain-English plan; writes only with `--apply`. Every update is guarded by `added_by_user_id IS NULL`, and retype also by `promo_type <> 'no_sweat'`.
- 6 tests, all passing, including the London text.

## Deviations
- [Rule 1] The `promos` table has no `title` column; the script reads the title from the `parsed` JSON.

## Owner approval needed
The script was NOT run against the live database (not even dry run, no credentials in the worktree). Running `--apply` against live data is for plan 09-18 and needs owner OK.

## Self-Check: PASSED
Typecheck clean apart from the known `LayoutProps` worktree artifact; vitest for noSweatAudit passes.
