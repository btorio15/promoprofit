---
phase: 09-no-sweat-promos-in-the-feed
plan: 13
subsystem: promos
tags: [manual-add, server-actions, no-sweat]
requires: [09-02, 09-05, 09-06]
provides:
  - AddNoSweatInputSchema in the add-promo union
  - no-sweat draft/build/describe/duplicate-hint arms
  - tracked-or-done guard on edit/expire/delete
  - edit prefill (refundCap, marketType) for no-sweats
affects: [09-17 add-promo UI]
key-files:
  created: [src/db/noSweatGuard.ts]
  modified:
    - src/domain/promos/addedPromoInput.ts
    - src/domain/promos/addPromoDraft.ts
    - src/domain/promos/buildAddedPromo.ts
    - src/domain/promos/describe.ts
    - src/domain/promos/duplicateHint.ts
    - src/db/addedPromos.ts
    - src/db/addedPromoPipeline.ts
    - src/app/actions/get-add-promo-options.ts
    - src/app/actions/delete-promo.ts
    - src/app/actions/expire-promo.ts
    - src/app/actions/edit-promo.ts
requirements-completed: [FEED-03]
duration: ~25m
completed: 2026-11-03
---

# Phase 9 Plan 13: Manual no-sweat add/edit/expire/delete Summary

Members can add a no-sweat by hand (whole-cent refund cap capped at $10,000, required expiry, optional min odds and bet-type limit; refund assumed to be a bonus bet), and edit, expire or delete it until they track or finish it.

## Commits
- a29b17e: no-sweat add input, draft, build, describe, duplicate hint, edit-value mapping
- 9bc0110: guard, options action, tests

## What changed
- `AddNoSweatInputSchema` (strict, no owner field) with the message "Enter a whole-cent amount, like 25 or 25.00." for 25.005, 0, -5 and over 10000 (T-09-37).
- `AddPromoType` is now `PromoType`; draft gained `refundCap` and `marketType`; `switchPromoType` and `payloadFromDraft` are exhaustive switches with `assertNever`; `buildAddedPromoRow` is exhaustive too. The cap is stored in `bonus_amount`; the market limit is `parsed.eligibleMarketTypes` (one entry, or all three).
- `getOwnActiveAddedPromo` now goes through `mapOwnPromoToEditValues`, which returns `refundCap` and reads `marketType` from the parsed payload for no-sweats.
- `isNoSweatTrackedOrDone` (new `src/db/noSweatGuard.ts`): a tracked row or a no-sweat completion makes edit/expire/delete return `invalid` with "This one is already being tracked. Stop tracking it first." and write nothing. Only no-sweats are guarded, so completed bonus bets keep their existing delete behavior.
- `getAddPromoFormOptions` adds the member's visible scraped no-sweats (refund cap as amount) to duplicate candidates.

## Deviations from Plan
- [Rule 3] The edit-values mapping (`src/db/addedPromos.ts`) landed in the Task 1 commit instead of Task 2, because the new required `refundCap` field broke typecheck otherwise.
- The book check in `prepareAddedPromoValues` was not changed: it already restricts to the member's books that have odds, which is the rejection the plan describes. The pin branch is unchanged (no-sweats have no pin); only a comment was added.
- Tests for the actions were added to the existing `added-promo-actions.test.ts` rather than a new `delete-promo.test.ts`.

## Verification
`npx vitest run src/domain/promos src/app/actions src/db`: 1269 tests pass. `npm run typecheck`: only the known worktree `LayoutProps` artifact.

## Known Stubs
None. The add-promo UI for the new type is plan 09-17.

## Self-Check: PASSED
