---
phase: 09-no-sweat-promos-in-the-feed
plan: 14
subsystem: promos
tags: [server-actions, tracking, settle, low-profile]
requires: [09-02, 09-05, 09-07, 09-12]
provides:
  - trackNoSweatAction, untrackNoSweatAction, settleNoSweatAction, undoNoSweatOutcomeAction, completeRefundNoSweatAction, correctSettledNoSweatAction
  - setLowProfileAction
  - buildTrackedSnapshot (pure v2 Track snapshot builder)
  - toDonePromoDTO kind "no_sweat" with a noSweat outcome block
  - updateNoSweatCompletion; markPromoDone accepts NoSweatDoneSnapshot
affects: [09-15..09-18 UI plans consuming these actions]
key-files:
  created:
    - src/app/actions/track-no-sweat.ts
    - src/app/actions/track-no-sweat.test.ts
    - src/app/actions/set-low-profile.ts
    - src/app/actions/set-low-profile.test.ts
    - src/domain/promos/buildTrackedSnapshot.ts
    - src/domain/promos/buildTrackedSnapshot.test.ts
  modified:
    - src/domain/promos/doneSnapshot.ts
    - src/domain/promos/doneSnapshot.test.ts
    - src/db/promoTracking.ts
    - src/db/promoTracking.test.ts
requirements-completed: [FEED-05, FEED-03]
duration: ~20m
completed: 2026-11-03
---

# Phase 9 Plan 14: No-sweat lifecycle actions Summary

Server-enforced Track, settle, refund, undo and fix-amounts for no-sweat promos, plus Low-profile settings save and the Done-list DTO for settled no-sweats. Real profit is written as a completion row only at settle time.

## What was built

- **Track**: re-prices through the same path as the feed (`loadMemberFeedContext` + `priceOneNoSweat`), so Low-profile limits apply. It compares the estimate to the client's `expectedEstimate` (`odds_changed` with `currentEstimate` if it moved) and stores a snapshot built by `buildTrackedSnapshot`. A second Track of an already-tracked promo returns ok without writing.
- **Settle** (won / lost / push / void): reads only `getTrackedNoSweat`, and never the promo or its active state (A-03). It refuses before kickoff with `too_early`. Won, push and void write one `markPromoDone` with a `NoSweatDoneSnapshot` (profitSource computed, corrected or override). Lost calls `markTrackedLost` only and writes no completion row. Overrides are accepted only for push and void.
- **Refund Mark done**: recomputes `rankRefundOpportunities` (limit 3) for `refundAmountFor` at the promo book, with the member's hedge books. An unknown option or a moved profit returns `odds_changed` with fresh options and their all-in totals. Success writes one completion with `lostTotal(...)`.
- **Undo**: `undoNoSweatOutcomeAction` goes from awaiting_refund back to tracking and is refused if a completion exists. A settled row is undone with the existing `unmarkPromoUsedAction`, unchanged. Stop tracking is only allowed while the row is in tracking and has no completion.
- **Fix amounts**: `correctSettledNoSweatAction` recomputes from the stored done snapshot and issues one `updateNoSweatCompletion`.
- **setLowProfileAction**: mirrors `set-book-cap`, revalidates `/` and `/settings`, and returns `unavailable` if the table is missing.
- **Done DTO**: `DonePromoDTO.kind` gains `"no_sweat"`, parsed before the v1 schema. It carries `noSweat` (outcome label Won / Lost, refund converted / Push / Voided, summaries, refund, profitSource). An invalid v2 snapshot falls back to legacy "Saved details unavailable".

## Deviations from Plan

**1. [Rule 3 - Blocking] Worktree base was wrong.** HEAD started at the plan commit rather than the required base `ca379e1`, so earlier-wave code was missing. I reset to `ca379e1`, as the startup check directs.

**2. Choices where the plan left the detail open.**
- `correctSettledNoSweatAction` on a lost row returns `invalid` if the corrected qualifying stake changes the refund amount. The stored refund conversion would no longer fit, so the member must undo and redo the refund.
- `DonePromoDTO` gained a `noSweat: DoneNoSweatDTO | null` field, so existing legacy, pair and hedge DTO constructors set it to null.
- The refund action loads `loadMemberFeedContext` for cached events and hedge books rather than calling the lower-level query helpers directly.

## Verification

- `npx vitest run`: 160 files, 2308 tests pass.
- `npm run typecheck`: only the known `LayoutProps` worktree artifact in `src/app/layout.tsx`.
- Acceptance greps: no `computeMemberPromoState` or `activePromoWhere` in `track-no-sweat.ts`; 6 `await requireUser()` calls for 6 exports; every `userId:` is `user.userId`; `too_early` present.

## Commits

- 44ced3f feat(09-14): add setLowProfileAction
- f656712 feat(09-14): tracked snapshot builder, no-sweat Done DTO, completion correction write
- 9973b9a feat(09-14): no-sweat track/settle/refund/undo/fix server actions

## Known Stubs

None.

## Threat Flags

None. All actions are owner-scoped via the session user id (T-09-40..44).

## Self-Check: PASSED
