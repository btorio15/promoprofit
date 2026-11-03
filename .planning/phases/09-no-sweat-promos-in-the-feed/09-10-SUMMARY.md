---
phase: 09-no-sweat-promos-in-the-feed
plan: 10
subsystem: ingestion
tags: [scraper, draftkings, no-sweat]
requires: [09-03, 09-04, 09-08]
provides: ["DraftKings no_sweat candidates"]
key-files:
  created:
    - src/test/fixtures/promos/draftkings-no-sweat-reconstructed.json
  modified:
    - src/ingestion/promos/books/draftkings.ts
    - src/ingestion/promos/books/draftkings.test.ts
requirements-completed: [FEED-01, FEED-02]
duration: 10min
completed: 2026-11-03
---

# Phase 9 Plan 10: DraftKings no-sweat Summary

DraftKings scraper now emits `no_sweat` candidates (refund cap as bonusAmount, min odds, game scope, opt-in) via `buildNoSweatCandidate`, after `classifyExclusion` returns null and before the boost gates.

## Tasks
1. Reconstructed fixture (London single, SGP, cash, racing Bet Back) - 3c278f5. Recon found no live DK no-sweat, so the fixture is labelled RECONSTRUCTED.
2. buildNoSweatCandidate + classifyNoSweat branch + tests - see git log (feat(09-10)).

## Behavior
- London text: `no_sweat`, bonusAmount 10.00, minOdds -200, opt_in, NFL, Texans/Jaguars; never bonus_bet.
- SGP title: skipped `sgp` (exclusions). Cash refund: skipped `no_sweat_cash` with evidence. No parseable cap: `unrecognized`.
- Racing Bet Back: stays skipped (`not_a_promo`, unchanged); a no-sweat is only built with a supported sport or parseable game scope.
- All 384 tests in src/ingestion/promos pass; tsc clean.

## Deviations
- [Rule 1] Initial design sent racing to `unrecognized`, breaking the pinned skip map (1127122 = not_a_promo). Narrowed the branch so no-sweats lacking sport/scope fall through to existing gates.
- Worktree base was reset to de373b3 (stale base at start).

## Known Stubs
None.

## Self-Check: PASSED
