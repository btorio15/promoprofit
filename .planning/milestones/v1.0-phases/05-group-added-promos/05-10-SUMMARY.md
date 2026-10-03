---
phase: 05-group-added-promos
plan: 10
subsystem: promos
tags: [duplicate-hint, add-promo, empty-state]
requires: [05-08]
provides: [looksLikeDuplicate, duplicateCandidates in getAddPromoFormOptions]
affects: [AddPromoForm, PromosEmptyState]
key-files:
  created:
    - src/domain/promos/duplicateHint.ts
    - src/domain/promos/duplicateHint.test.ts
    - src/app/actions/get-add-promo-options.test.ts
  modified:
    - src/domain/promos/addedPromoInput.ts
    - src/app/actions/get-add-promo-options.ts
    - src/components/promos/AddPromoForm.tsx
    - src/components/promos/PromosEmptyState.tsx
decisions:
  - Duplicate check compares only against the member's own visible scraped promos at their own books
metrics:
  tasks: 2
  completed: 2026-09-30
---

# Phase 5 Plan 10: Duplicate hint and empty-state nudge Summary

Pure Decimal-based duplicate matcher plus a leak-safe candidate list drive a non-blocking "This looks like a promo already in your list." note in the add form, and empty Active states now point members at Add promo.

## Commits
- Task 1: pure matcher `looksLikeDuplicate` with 6 tests (book, type, exact amount/boost %/boosted odds, event/window overlap, incomplete or malformed drafts never throw).
- Task 2: `getAddPromoFormOptions` now calls `getActivePromos(now, user.userId)`, keeps only `!addedByYou` promos at the member's usable books, serializes windows to ISO; form shows an Info Alert above Save (never blocks, never merges); `PromosEmptyState` adds "Seeing a promo in your app that isn't here? Add it yourself." to every variant.

## Deviations from Plan
- Empty-state line is applied to all PromosEmptyState variants (the component only renders on the Active tab), including "no-books", where it sits above the Manage your books button.
- When the draft is a league window and the candidate is a single event, overlap uses the candidate event's kickoff from the cached options list; if the event is not in that list it is treated as non-overlapping (conservative, advisory only).

## Verification
Full suite 1349 tests pass; lint clean; typecheck shows only the known `LayoutProps` worktree artifact in `src/app/layout.tsx`. Manual verify-work rows (360px add/edit/expire/delete; second member cannot see added promos) remain for the phase verifier.

## Known Stubs
None.

## Self-Check: PASSED
