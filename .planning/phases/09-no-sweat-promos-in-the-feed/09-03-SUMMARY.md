---
phase: 09-no-sweat-promos-in-the-feed
plan: 03
subsystem: ingestion
tags: [ingestion, scraper, no-sweat, exclusions]
requires: []
provides:
  - classifyNoSweat / parseNoSweatRefundCap (src/ingestion/promos/noSweat.ts)
  - new_customer fixture-sweep guard
affects: [09-08, 09-10, 09-11]
tech-stack:
  added: []
  patterns: [exclusions run before no-sweat detection]
key-files:
  created:
    - src/ingestion/promos/noSweat.ts
    - src/ingestion/promos/noSweat.test.ts
    - src/ingestion/promos/exclusions.fixtures.test.ts
    - src/ingestion/promos/exclusions.fixtures.expected.json
  modified:
    - src/ingestion/promos/exclusions.ts
    - src/ingestion/promos/exclusions.test.ts
    - src/ingestion/promos/books/draftkings.test.ts
    - src/ingestion/promos/signupOffers.ts
    - src/ingestion/promos/signupOffers.test.ts
requirements-completed: [FEED-01]
duration: ~15min
completed: 2026-11-03
---

# Phase 9 Plan 03: No-sweat detection core Summary

Pure `classifyNoSweat` detector (bonus-bet vs cash refund, decimal.js-normalised refund cap) that runs only after `classifyExclusion`, which no longer blanket-skips no-sweats and has a tightened new-customer rule guarded by a pre-committed fixture sweep.

## Commits
- 2fdfefc test(09-03): pin new_customer fixture classifications (committed before touching exclusions.ts)
- 5398c1c feat(09-03): classifyNoSweat detector, exclusion reorder, tighter new-customer rule
- (task 3) feat(09-03): sign-up offers never show a no-sweat cap as a bonus amount

## Deviations from Plan
- The bare-"first bet" tightening also exposed that DK racing entry 1127122 now skips as `not_a_promo` (not `no_sweat`); the draftkings.test.ts expectation was updated accordingly (still a skip, never a candidate).
- Fixture sweep keys on skipped entries only (scrapers do not expose `mentionsNewCustomer` text); 24 entries pinned.
- Worktree base was behind the expected base; reset to 064b92f per instructions. A node_modules symlink (git-ignored) was used to run vitest.

## Issues
- Pre-existing, unrelated: `tsc` reports `LayoutProps` not found in src/app/layout.tsx.
- `no_sweat` left in SKIP_REASONS; reconcile.test.ts (g2) untouched (owned by 09-08).

## Self-Check: PASSED
src/ingestion tests: 27 files, 489 tests pass.
