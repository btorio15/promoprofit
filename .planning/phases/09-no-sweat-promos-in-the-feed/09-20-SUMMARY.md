---
phase: 09-no-sweat-promos-in-the-feed
plan: 20
subsystem: refresh
tags: [refresh, odds, credits]
requirements-completed: [FEED-03]
key-files:
  modified:
    - src/domain/promos/promoRefreshScope.ts
    - src/app/actions/refresh-promos.ts
    - src/app/actions/refresh-promos.test.ts
metrics:
  completed: 2026-11-03
---

# Phase 9 Plan 20: Refresh covers no-sweat sports Summary

Refresh promos now adds the sports of the member's active, not-done no-sweats to the refresh sport list and the no_promos check; alt-spread work stays guaranteed-only.

## What changed
- `promoRefreshSportKeys` takes a minimal `RefreshScopePromo` shape (no cast needed for `ActiveNoSweatPromo`).
- `refreshPromos` loads `getActiveNoSweatPromos(now, userId)` (viewer-scoped), drops done ids, merges into sport keys. `estimatePromoAltGames` and `buildAltSpreadRequests` still receive `feedPromos` only (A-01).
- Tests: no-sweat-only member refreshes its sport; done no-sweat ignored; none of either yields no_promos.

## Deviations
- Worktree base was reset to e986f87 (wave 1 merged) per the branch check. No other deviations.

## Verification
Vitest (19 tests) pass; typecheck only shows the known `LayoutProps` worktree artifact.

Commit: see git log (feat(09-20)).

## Self-Check: PASSED
