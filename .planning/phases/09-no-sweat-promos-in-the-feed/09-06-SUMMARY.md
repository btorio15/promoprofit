---
phase: 09-no-sweat-promos-in-the-feed
plan: 06
subsystem: domain/promos
tags: [no-sweat, ranking, low-profile, estimates, dto]
requires: ["09-01", "09-02"]
provides:
  - rankNoSweat Low-profile/market-limit/expiry support
  - rankNoSweatFeed, deriveLowProfileWarnings, estRoiPct
  - NoSweatRowDTO, NoSweatNoteRowDTO, toNoSweatRowDTO, toNoSweatNoteRowDTO, noSweatAriaLabel
affects: [Opportunities action (later plans)]
key-files:
  created:
    - src/domain/promos/rankNoSweatFeed.ts
    - src/domain/promos/rankNoSweatFeed.test.ts
    - src/domain/promos/noSweatRowDto.ts
    - src/domain/promos/noSweatRowDto.test.ts
  modified:
    - src/domain/promos/selection.ts
    - src/domain/promos/rankNoSweat.ts
    - src/domain/promos/rankNoSweat.test.ts
    - src/domain/promos/promoRowDto.ts
requirements-completed: [FEED-03]
duration: ~15m
completed: 2026-11-03
---

# Phase 9 Plan 06: No-sweat ranking within Low-profile limits Summary

Pure-domain no-sweat feed ranker: line search honours the odds cap (decimal compare), main-lines-only, whole-dollar stakes, promo market limit and expiry, and emits estimate-labelled row DTOs.

## Commits
- 590f07d: Task 1, Low-profile limits, market limit, expiry in rankNoSweat (+ `fromAlternate` marker in selection.ts)
- 757034a: Task 2, rankNoSweatFeed (ranked / notWorthIt / cantPrice / lowProfileBlocked / noLine / invalid), warnings, Est. ROI
- 7c5283c: NoSweatRowDTO / NoSweatNoteRowDTO / aria label

## Deviations from Plan

**1. [Rule 3 - Blocking] Existing test expectation updated.** One Phase 8 test used `toEqual({kind:"no_qualifying_line", candidatesEvaluated: 0})`; the new required `filteredOut` field makes it need `filteredOut: 0`. Only change to an existing assertion.

**2. [Rule 3] Exported `attributionLineFor`** from promoRowDto.ts (was module-private; plan says to reuse it) and loosened its param to `Pick<PresentablePromo,"attribution">`. No behavior change.

Worktree note: reset to base e986f87 at start (HEAD was behind wave 1).

## Verification
All 745 tests in src/domain/promos pass. Typecheck: only the known worktree `LayoutProps` artifact in src/app/layout.tsx. Grep confirms rankNoSweatFeed is not imported by memberFeed or any recorder.

## Known Stubs
None.

## Self-Check: PASSED
