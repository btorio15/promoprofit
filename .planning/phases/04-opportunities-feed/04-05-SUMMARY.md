---
phase: 04-opportunities-feed
plan: 05
subsystem: ui
tags: [nextjs, server-actions, arbitrage, vitest]

requires:
  - phase: 04-opportunities-feed
    provides: getOpportunities sources union, OpportunitiesScreen (plan 01)
provides:
  - Best arbs source on Opportunities (member books only, fixed $100 stake)
  - Pure arb builders in src/domain/arb/build.ts shared with findArbs
affects: [04-opportunities-feed]

key-files:
  created:
    - src/domain/arb/build.ts
  modified:
    - src/app/actions/find-arbs.ts
    - src/app/actions/get-opportunities.ts
    - src/app/actions/get-opportunities.test.ts
    - src/domain/opportunities/types.ts
    - src/components/opportunities/OpportunitiesScreen.tsx

key-decisions:
  - "Best arbs ranked at a fixed $100 total stake (OPPORTUNITIES_ARB_TOTAL_STAKE), stated in the section caption, independent of the Arbitrage tab stake (D-21)"
  - "Arbs built only from the member's hedge books, so both legs are at books the member has (D-18)"

requirements-completed: [DASH-01, DASH-03]

duration: 12min
completed: 2026-09-29
---

# Phase 4 Plan 05: Best Arbs on Opportunities Summary

**Opportunities now shows a Best arbs section (top 5, cached odds only, member books on both legs, fixed $100 stake), with the arb builders extracted so the Arbitrage tab is unchanged.**

## Accomplishments
- Moved toLegDTO, toArbResultDTO, buildMarkets (now buildArbMarkets) and the 7-day window (ARB_WINDOW_DAYS) into src/domain/arb/build.ts; findArbs imports them, no duplicates.
- getOpportunities returns an "arbs" source; input stays strict (precision only), so a client cannot change the stake.
- All-empty classification: if a promo or an arb exists at any usable book but not at the member's books, result is "no-books"; otherwise "nothing-profitable". The every-book arb ranking only runs in the all-empty branch.
- OpportunitiesScreen renders ArbRow list; caption is "<sort caption> at a $100.00 total stake"; See all arbs goes to the Arbitrage tab; the switch is exhaustive over the union.

## Task Commits
1. Task 1 (extraction, arbs source, tests): 619ae99
2. Task 2 (Best arbs UI section): 574c590

## Deviations from Plan
- Existing get-opportunities tests were adjusted for the wider union type (narrowing on source id). No behavior change.
- The fixed-stake test asserts total laid is within $1 of $100 (cents-rounded stakes give e.g. 99.88) rather than exactly 100.00.
- Worktree started on a different base and was reset to 5420355 per protocol.

## Verification
- `npx vitest run`: 74 files, 1138 tests pass (includes find-arbs.test.ts unchanged).
- `npx tsc --noEmit`: only the pre-existing `LayoutProps` error in src/app/layout.tsx (typegen not run).
- `npm run lint`: clean. `next build` not run (disk).

## Known Stubs
None.

## Self-Check: PASSED
