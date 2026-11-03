---
phase: 09-no-sweat-promos-in-the-feed
plan: 08
subsystem: ingestion
tags: [ingestion, ai-reader, reconcile, review-queue]
requires: ["09-01", "09-03"]
provides:
  - "reader kind no_sweat + refundForm; prompt version 2026-11-03.1"
  - "no_sweat_cash skip reason (review-worthy); no_sweat skip reason removed"
  - "reconcile no-sweat disagreement rule (any confidence) + reviewReadings on review items"
  - "reader pass skips clear skips (stats.clearSkipsNotRead)"
affects: [review-queue UI, run.ts reader stats]
tech-stack:
  patterns: ["exhaustive switch + assertNever over reader kind / promo type"]
key-files:
  modified:
    - src/domain/promos/scraped.ts
    - src/ingestion/promos/reviewTriage.ts
    - src/ingestion/promos/promoReading.ts
    - src/ingestion/promos/reconcile.ts
    - src/ingestion/promos/readerPass.ts
    - src/ingestion/promos/run.ts
decisions:
  - "A no_sweat parser candidate vs reader not_usable goes to review at every confidence (never silently dropped)"
  - "A parser no_sweat_cash skip always goes to review when the reader finds it usable"
metrics:
  tasks: 3
  completed: 2026-11-03
requirements: [FEED-01, FEED-02]
---

# Phase 9 Plan 08: AI reader and reconcile learn no-sweats Summary

The reader now recognises no-sweats (with a refund form), and any no-sweat vs bonus-bet disagreement, cash refund, or differing refund cap goes to review at every confidence level. The "NFL London No Sweat" case is a regression test for high, medium and low confidence.

## Commits
- 95f8e93: vocabulary (skip reasons, no_sweat candidate rule, reader schema and prompt bump, reviewReadings)
- 238c829: reconcile no-sweat rules and structured review readings
- Task 3 commit: reader budget (clear skips never read)

## What changed
- `SKIP_REASONS`: `no_sweat` replaced by `no_sweat_cash` (review-worthy). `ScrapedPromoSchema` requires a refund cap (`bonusAmount`) on a no_sweat and forbids boost fields and `maxStake`. Optional `reviewReadings` on the promo; not part of the dedupe key.
- Reader: kind `no_sweat`, required-nullable `refundForm`, prompt rule added, version bumped so cached readings are bypassed and skipped no-sweats are re-read.
- Reconcile: the no-sweat XOR / cash / cap-mismatch check sits before the high-confidence reader-wins branch. Review items carry `reviewReadings` (scraper vs reader). Reader-only no-sweat rescue needs high confidence, a guard-backed cap and refundForm `bonus_bet`; cash goes to review with reason `no_sweat_cash`. `as PromoType` casts replaced by `readingPromoType` switch.
- Reader pass: clear skips pass through unread; `clearSkipsNotRead` stat.

## Deviations from Plan
- [Rule 3] Added `refundForm: null` to reader-reading test builders in promoReader/run/readerPass/reconcile/verbatimGuard tests and `clearSkipsNotRead: 0` to the stats literal in run.ts (required by the new required key / stat field).
- [Rule 1] Existing readerPass/run tests that expected reader calls and `clearSkipOverrides` on clear skips were updated to the A-08 behavior (clear skips unread).
- verbatimGuard.ts needed no source change (bonusAmount guard reused).
- Added: parser no_sweat + reader not_usable high goes to review (plan only listed XOR cases; this follows A-05 intent).

## Known Stubs
None.

## Verification
`npx vitest run src/ingestion/promos src/domain/promos` (1107 tests) and `tsc --noEmit` pass (aside from the known LayoutProps worktree artifact).

## Self-Check: PASSED
