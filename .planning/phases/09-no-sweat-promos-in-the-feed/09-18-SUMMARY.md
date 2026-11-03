---
phase: 09-no-sweat-promos-in-the-feed
plan: 18
status: partial
requirements: [FEED-01, FEED-02, FEED-03, FEED-04, FEED-05]
---

# Phase 9 Plan 18: Wire the Opportunities screen (PARTIAL)

Status: partial. Task 1 done and committed (1cdbd9a). Task 2 (audit dry run/apply, dev server, owner phone check) is pending the owner checkpoint and was NOT run here (no DB credentials in the worktree).

## Task 1
- TrackingStrip rendered under the Opportunities heading / stale line, above SortSwitch.
- Promos source renders NoSweatRow vs PromoRow via isNoSweatRow (temporary skip from 09-12 removed).
- "Can't price yet" section last (with sub-copy) plus "Not worth it right now" sub-heading; unsliced, never through pickTop.
- Edit host for hand-added no-sweats: AddPromoForm in edit mode hosted in OpportunitiesScreen, wired to NoSweatRow/NoSweatNoteRow addedActions (only when addedByYou).
- sortCaption(sort, hasEstimate): "Top 5 by Est. ROI" when an estimate is visible; no new sort option. OpportunitySection and SortSwitch needed no changes.

## Verification
Full suite: 162 files, 2328 tests pass. Lint: 0 errors (4 pre-existing warnings). Typecheck: only the known worktree LayoutProps artifact.

## Pending (Task 2)
Dry run `npm run promos:audit-no-sweat`, owner OK for `-- --apply`, phone check, and per-book FEED-01 fixture status (FanDuel / Bally): not yet recorded.

## Deviations
None.
