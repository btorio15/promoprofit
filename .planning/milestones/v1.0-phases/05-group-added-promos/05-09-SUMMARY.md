---
phase: 05-group-added-promos
plan: 09
subsystem: promos-done
tags: [done-history, added-promos, soft-delete]
requires: [05-07, 05-08]
provides:
  - DonePromoDTO.addedByYou, DonePromoDTO.addedPromoStatus
  - Done-row "Added by you" badge and Expire/Delete actions
affects: []
key-files:
  modified: [src/db/promoTracking.ts, src/domain/promos/doneSnapshot.ts, src/domain/promos/doneSnapshot.test.ts, src/components/promos/DonePromoRow.tsx, src/components/promos/PromosScreen.tsx]
key-decisions:
  - "Done rows show Expire now (active only) and Delete, never Edit; a deleted source ('gone') shows no actions"
requirements-completed: [PROMO-05]
duration: 10min
completed: 2026-09-30
---

# Phase 5 Plan 09: Done rows know their source Summary

A promo a member added and marked done keeps its Done row and its profit in Total profit extracted even after deletion (D-11); Done rows show the "Added by you" badge and the right actions for the source's state.

## Commits
- d605eb9: completion query + DTO fields, tests (deleted source keeps row and profit sum)
- 5d0da1f: DonePromoRow badge + AddedPromoActions (isDone, no onEdit); PromosScreen wiring

## Deviations from Plan
**[Rule 3]** Worktree base was 914da50; reset to d7523ae per instructions. node_modules symlink removed before return.

## Verification
- doneSnapshot and promoTracking tests pass (28). Lint clean. Typecheck: only the known `LayoutProps` artifact in src/app/layout.tsx.
- Manual browser check left for verify-work.

## Known Stubs
None.

## Self-Check: PASSED
