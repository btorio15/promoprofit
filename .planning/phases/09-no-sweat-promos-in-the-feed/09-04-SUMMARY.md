---
phase: 09-no-sweat-promos-in-the-feed
plan: 04
subsystem: ingestion-recon
tags: [recon, fixtures, draftkings, fanduel, ballybet]
requires: []
provides:
  - live dated list fixtures for DK, FD, Bally (2026-11-03)
  - 09-RECON-NO-SWEAT.md decision gate for plans 09-10 and 09-11
affects: [09-10, 09-11]
key-files:
  created:
    - scripts/recon-no-sweat.ts
    - src/test/fixtures/promos/draftkings-promos-2026-11-03.json
    - src/test/fixtures/promos/fanduel-promos-2026-11-03.json
    - src/test/fixtures/promos/ballybet-promos-2026-11-03.json
    - src/test/fixtures/promos/ballybet-promo-detail-sbk-second-chance-bet-01.json
    - .planning/phases/09-no-sweat-promos-in-the-feed/09-RECON-NO-SWEAT.md
decisions:
  - "DraftKings: build from reconstructed fixture (no live no-sweat today)"
  - "FanDuel: fixture pending (only Bet Protect+ injury protection live)"
  - "Bally Bet: build from live Second Chance Bet detail fixture"
metrics:
  tasks: 2
  completed: 2026-11-03
---

# Phase 9 Plan 04: No-Sweat Recon Summary

Fetched live public promo lists for DraftKings, FanDuel and Bally Bet with the scrapers' own requests, saved sanitised fixtures, and recorded a per-book build/pending decision.

## Findings
- DraftKings: no live no-sweat; regex hits were false positives. Decision: BUILD from reconstructed fixture.
- FanDuel: no no-sweat; only "NBA Bet Protect+" (injury protection, no terms in list). Decision: FIXTURE PENDING.
- Bally Bet: live "Second Chance Bet" (up to 100% of stake back as a Bonus Bet Token on loss, no dollar cap, existing customers via Rewards tab). Currently dropped by `isQualifyingTitle`. Decision: BUILD from the live detail fixture.

## Commits
- 599ccfa: recon script and live fixtures
- Task 2 note committed with this summary.

## Deviations from Plan
- Fixtures are dated 2026-11-03 (today), not the 2026-10 pattern the plan assumed. Content is unaffected.
- A first pass of the script failed to fetch the Bally detail because the slug is derived from `link.url`, not a `slug` key; fixed in the script before the committed run (Rule 1).
- A `node_modules` symlink to the main checkout was created in the worktree to run tsx (git-ignored, not committed).

## Self-Check: PASSED
