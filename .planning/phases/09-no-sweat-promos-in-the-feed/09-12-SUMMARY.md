---
phase: 09-no-sweat-promos-in-the-feed
plan: 12
subsystem: opportunities
tags: [opportunities, server-action, estimates, invariants]
requires: ["09-02", "09-05", "09-06", "09-07"]
provides:
  - loadNoSweatFeed, priceOneNoSweat (src/db/noSweatFeed.ts)
  - TrackedNoSweatCardDTO, buildTrackedCardDTO, WAITING_REMINDER_AFTER_HOURS
  - Opportunities response fields tracking and noSweatNotes; RankKey.estimated; isNoSweatRow
key-files:
  created:
    - src/db/noSweatFeed.ts
    - src/db/noSweatFeed.test.ts
    - src/domain/promos/trackedCardDto.ts
    - src/domain/promos/trackedCardDto.test.ts
  modified:
    - src/domain/opportunities/types.ts
    - src/app/actions/get-opportunities.ts
    - src/app/actions/get-opportunities.test.ts
    - src/components/opportunities/OpportunitiesScreen.tsx
requirements-completed: [FEED-03, FEED-04]
completed: 2026-11-03
---

# Phase 9 Plan 12: No-sweats in the Opportunities response Summary

Opportunities now returns priced no-sweat estimates (Est. ROI, estimated flag) inside the promos source, unsliced notes for can't-price / not-worth-it / Low-profile-blocked, and Tracking cards, all computed after and separately from the recorders and dashboard.

## Commits
- 20c5672: response types + buildTrackedCardDTO (kickoff, 6h waiting reminder, up to 3 refund options with allInTotal via lostTotal)
- a6825a3: loadNoSweatFeed / priceOneNoSweat and get-opportunities wiring
- 5951293: tests incl. "guaranteed outputs are unchanged by no-sweat presence" (recorder args, dashboard, profitSeries deep-equal)

## Decisions
- loadNoSweatFeed also returns `activeCount` so the "none-scraped" empty state is shown only when both guaranteed and no-sweat active lists are empty.
- Empty variant is null when any source has items, or noSweatNotes / tracking is non-empty (A-10).
- A failure in loadNoSweatFeed is logged and degrades to no no-sweat data, never failing the guaranteed feed.
- Exactly one makeConversionRateFor per request (inside a shared rankPromos helper used by both loadNoSweatFeed and priceOneNoSweat).

## Deviations from Plan

**1. [Rule 3 - Blocking] OpportunitiesScreen.tsx type error.** Widening promos items to `PromoRowDTO | NoSweatRowDTO` broke typecheck in the screen. Added a minimal `isNoSweatRow` skip in the promos render loop; a later UI plan renders no-sweat cards.

**2. [Rule 3] Existing test narrowed.** The existing "own-book promo" test now narrows with `isNoSweatRow` for the union type.

Worktree note: reset to base de373b3 at start; node_modules symlinked (untracked).

## Verification
Full suite: 155 files, 2209 tests pass. Typecheck: only the known worktree `LayoutProps` artifact. Grep confirms no no-sweat references in memberFeedRecording, promoObservations or memberFeed.

## Known Stubs
No-sweat rows are skipped in OpportunitiesScreen until the UI plan renders them (intentional, see Deviation 1).

## Self-Check: PASSED
