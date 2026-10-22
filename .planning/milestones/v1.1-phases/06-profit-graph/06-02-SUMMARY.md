---
phase: 06-profit-graph
plan: 02
subsystem: domain
tags: [domain, pairs, decimal, tdd]
requires: []
provides:
  - computeMemberFeed (single shared feed singles + pairs composition)
  - buildMemberObservationEntries (per-member observation rows with exact pair shares)
affects: [06-04, 06-06]
tech-stack:
  added: []
  patterns: [pure domain helpers, Decimal-only money math]
key-files:
  created:
    - src/domain/promos/memberFeed.ts
    - src/domain/promos/memberFeed.test.ts
    - src/domain/promos/memberObservationEntries.ts
    - src/domain/promos/memberObservationEntries.test.ts
  modified: []
key-decisions:
  - "Pair share: shareA = separateProfitA (cent-rounded, clamped to [0, pairProfit]); shareB = pairProfit - shareA, so shares sum exactly"
requirements-completed: [STATS-02]
duration: 15min
completed: 2026-10-05
---

# Phase 6 Plan 02: Member feed helper and observation entries Summary

One shared `computeMemberFeed` helper holds the feed's singles + chosen-pairs rule, and `buildMemberObservationEntries` turns it into per-promo rows whose pair shares sum exactly to the pair profit at the cent.

## Tasks
1. computeMemberFeed shared helper - 89b3b3d
2. buildMemberObservationEntries with exact pair shares - e32a5e2

## Verification
12 tests pass across both test files. `npm run typecheck` reports one error, `src/app/layout.tsx` `LayoutProps` not found; it is pre-existing (Next generated route types absent in this worktree) and unrelated to these files.

## Deviations from Plan
- [Rule 3 - Blocking] Disk was nearly full, so `npm ci` was impossible; node_modules was symlinked to the main checkout's (untracked, not committed).
- Test fixture note: with the default fixture the real singles beat the pair (pair rule correctly yields none), so the parity test uses a hedge book with no quotes (`betmgm`) to make singles weak and force a chosen pair; it asserts pairs > 0.
- get-opportunities.ts not edited (Plan 04 rewires it), per plan.

## Self-Check: PASSED
