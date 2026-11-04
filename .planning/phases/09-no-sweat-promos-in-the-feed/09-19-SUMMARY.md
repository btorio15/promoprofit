---
phase: 09-no-sweat-promos-in-the-feed
plan: 19
subsystem: review-queue
tags: [review-queue, classify, server-actions]
requires: ["09-05", "09-08"]
provides:
  - ClassifyNoSweatInputSchema in ClassifyPromoInputSchema
  - QueueRow.readings and QueueRow.cashRefund
key-files:
  modified:
    - src/domain/promos/reviewInput.ts
    - src/app/actions/classify-promo.ts
    - src/db/promoReview.ts
    - src/db/promoReview.test.ts
    - src/app/actions/get-promos.test.ts
    - src/app/actions/promo-review.test.ts
  created:
    - src/domain/promos/reviewInput.test.ts
requirements-completed: [FEED-02]
completed: 2026-11-03
---

# Phase 9 Plan 19: Review queue server side for no-sweats Summary

A reviewer can classify a queued promo as a no-sweat (refund cap stored as bonus_amount), and review items now expose scraper and reader readings plus a cash-refund flag.

## Commits
- 7a11a74: classify-as-no-sweat schema and exhaustive action switch (assertNever, requireUser still first)
- decd546: QueueRow `readings` and `cashRefund`

## Decisions
- cashRefund derivation: the skip reason is not persisted as a column, so cashRefund is true for a classify row when rawText contains "[Promo reader check: no_sweat_cash]" (stamped by reconcile.ts) or reviewReadings.reader.refundForm === "cash".
- Reader kind not_usable is labelled "Not usable"; a scraper reading with no promoType has label null.
- mapPendingPromoRow is now exported for tests.

## Deviations from Plan
- [Rule 3] Added `readings: null, cashRefund: false` to QueueRow fixtures in get-promos.test.ts and promo-review.test.ts so typecheck stays clean.
- Worktree base was wrong at start; reset to the specified base per the startup step.

## Verification
Vitest (22 files, 367 tests) passes; typecheck clean except the known LayoutProps worktree artifact.

## Self-Check: PASSED
