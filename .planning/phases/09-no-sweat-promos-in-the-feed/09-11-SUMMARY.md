---
phase: 09-no-sweat-promos-in-the-feed
plan: 11
subsystem: ingestion
tags: [scraper, fanduel, ballybet, no-sweat]
requires: ["09-03", "09-04", "09-08"]
provides: ["FanDuel and Bally Bet no-sweat candidates or review skips"]
affects: [src/ingestion/promos/books/fanduel.ts, src/ingestion/promos/books/ballybet.ts]
key-files:
  modified:
    - src/ingestion/promos/books/fanduel.ts
    - src/ingestion/promos/books/fanduel.test.ts
    - src/ingestion/promos/books/ballybet.ts
    - src/ingestion/promos/books/ballybet.test.ts
    - src/ingestion/promos/reviewTriage.test.ts
requirements-completed: [FEED-01]
metrics:
  completed: 2026-11-03
---

# Phase 9 Plan 11: FanDuel and Bally Bet no-sweat path Summary

FanDuel and Bally Bet no-sweats now bypass the boost/bonus title gates and become `no_sweat` candidates when a dollar refund cap is readable, or review-worthy `unrecognized` skips (with evidence) when it is not.

**Fixture status:** FanDuel: fixture pending (tests labelled `SYNTHETIC:`). Bally Bet: BUILD from `ballybet-promo-detail-sbk-second-chance-bet-01.json`; the live offer is "up to 100%" of stake with no dollar cap, so it lands as a review skip. The dollar-cap and cash-refund Bally cases are `SYNTHETIC:`.

## Commits
- d0c1aa2: FanDuel (classifyNoSweat before BOOST_OR_BONUS_TOKEN_RE; acq/new-customer routing unchanged; cash -> no_sweat_cash; no cap -> unrecognized; buildCandidate emits no_sweat with bonusAmount = cap, boost fields null)
- a0ece79: Bally Bet (isQualifyingTitle accepts no-sweat titles; planBallybetDetails orders boosts before no-sweats under the 6 cap; detail builder; list-only no-sweat -> unrecognized, never priced)

## Deviations
- **[Rule 1 - Test pins]** Existing tests pinned "Second Chance Bet" as not_a_promo / planDetails length 1 / not review-worthy. Updated in `ballybet.test.ts` and `reviewTriage.test.ts` (outside listed files) to the new intended behavior.
- Two `promoType: "profit_boost"` literals remain in ballybet.ts, but only in the boost-only builders (list fallback and boost detail); no-sweat has its own builder, so no switch/assertNever was needed. fanduel.ts has none.
- Bally title detection uses a local no-sweat title regex (noSweat.ts's classifyNoSweat returns none for a bare title like "Second Chance Bet" with no body text); noSweat.ts left untouched to avoid conflicts with parallel plans.

## Verification
`npx vitest run src/ingestion src/domain`: 87 files, 1519 tests pass. `tsc --noEmit` clean (apart from the known LayoutProps artifact).

## Known Stubs
None.

## Self-Check: PASSED
