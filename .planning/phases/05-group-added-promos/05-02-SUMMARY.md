---
phase: 05-group-added-promos
plan: 02
subsystem: promos-feed
tags: [visibility, viewer-scope, observations, badge]
requires: [05-01]
provides:
  - viewer-scoped getPromos, getOpportunities, pairs, mark-done recompute
  - getProfitObservationsSince(sinceDate, viewerUserId) filtered by promoVisibilityCondition
  - addedByYou on PromoRowDTO (optional) and UnprofitablePromoRowDTO (required)
  - "Added by you" badge and "You added this promo." line
affects: [05-03]
key-files:
  modified: [src/db/feedContext.ts, src/db/memberPromoState.ts, src/db/promoTracking.ts, src/app/actions/get-promos.ts, src/app/actions/get-opportunities.ts, src/domain/promos/dto.ts, src/domain/promos/promoRowDto.ts, src/components/promos/PromoRow.tsx, src/components/promos/PromoDetails.tsx, src/components/promos/UnprofitablePromoRow.tsx]
key-decisions:
  - "Viewer id is a required parameter on getProfitObservationsSince and loadAvailableProfit so a caller cannot forget it"
  - "PromoRowDTO.addedByYou is optional so frozen Done snapshots and _rowShapeGuard still compile"
duration: 12min
completed: 2026-09-30
---

# Phase 5 Plan 02: Viewer-scoped reads and Added-by-you badge Summary

Every member-facing promo read now passes the session user to getActivePromos, and profit-available totals join observations to promos with the visibility rule, so another member's private promo can no longer inflate my numbers or be marked done by id.

## Commits
- 6c3cd20 test: failing tests (RED)
- 15c5165 feat: viewer propagation + observation visibility filter (GREEN)
- af7cc5b feat: badge, DTO field, details line

## Deviations from Plan

**1. [Rule 1 - Type fix] Added `addedByYou: false`** to UnprofitablePromoRowDTO fixtures in doneSnapshot.test.ts, mark-promo-used.test.ts, get-promos.test.ts (required field), and updated the existing get-promos test that asserted getProfitObservationsSince with one argument to expect the viewer id.

**2. [Rule 3] Worktree base was 914da50**; reset to 4899781 per instructions. node_modules symlinked for tests and removed before return.

## Verification
- Full `npm test`: 82 files, 1227 tests pass; lint clean.
- `npm run typecheck`: only pre-existing `src/app/layout.tsx LayoutProps` error.
- promoObservations.ts and scripts/promos-check.ts left on the scraped-only default.

## Known Stubs
None.

## Self-Check: PASSED
