---
phase: 05-group-added-promos
plan: 08
subsystem: promos-manage
tags: [server-actions, edit, ownership, added-promos]
requires: [05-06, 05-07]
provides:
  - prepareAddedPromoValues (shared add/edit validation pipeline)
  - editPromo server action, getOwnActiveAddedPromo, updateOwnAddedPromo
  - getAddPromoFormOptions({ promoId }) prefill, draftFromEditValues
  - Edit button and form edit mode in Promos > Active
affects: [05-09]
key-files:
  created: [src/db/addedPromoPipeline.ts, src/app/actions/edit-promo.ts]
  modified: [src/app/actions/add-promo.ts, src/app/actions/get-add-promo-options.ts, src/db/addedPromos.ts, src/domain/promos/addedPromoInput.ts, src/domain/promos/addPromoDraft.ts, src/domain/promos/addPromoDraft.test.ts, src/app/actions/added-promo-actions.test.ts, src/components/promos/AddPromoForm.tsx, src/components/promos/AddedPromoActions.tsx, src/components/promos/PromoRow.tsx, src/components/promos/UnprofitablePromoRow.tsx, src/components/promos/PromosScreen.tsx]
key-decisions:
  - "Edit updates in place (same id); owner, active status, book and type are all in the UPDATE WHERE"
  - "Edit is refused (generic not_found) for another member's, expired, deleted or missing promos"
requirements-completed: [PROMO-05]
duration: 25min
completed: 2026-09-30
---

# Phase 5 Plan 08: Edit own added promos Summary

A member can tap Edit on a promo they added, get the same form prefilled inline at the top of Promos > Active with Book and Type locked, save, and the promo updates in place with the same server validation as adding.

## Commits
- 4d6ded3: shared pipeline, owner-checked editPromo, db functions, tests
- df7ef26: options action prefill and draftFromEditValues with tests
- 274250d: Edit button, form edit mode, PromosScreen form state

## Notes
- addPromo behaviour is unchanged; its existing tests pass after moving the pipeline into prepareAddedPromoValues.
- editPromo compares book/type to the stored row and the UPDATE WHERE also pins them (T-5-17). The input schema has no userId key (T-5-idor).
- Edit form focus returns to the originating Edit button when it is still mounted, otherwise the Add promo button.
- The Edit button shows on Active rows only; Done rows get no onEdit (Plan 09).

## Deviations from Plan

**1. [Rule 3] Worktree base was 914da50**; reset to 3da6f31 per instructions. node_modules symlink removed before return.

**2. Minor:** the locked-fields note renders under the Type label (Book select is disabled above it) as one note for both fields. The Task 1 commit alone leaves typecheck failing in AddPromoForm until Tasks 2 and 3 (the options type gained a branch); final state is clean.

## Verification
- `npm test`: 88 files, 1338 tests pass. Lint clean.
- `npm run typecheck`: only the known `src/app/layout.tsx LayoutProps` artifact.
- Acceptance greps pass. No live DB writes; manual browser check left for verify-work.

## Known Stubs
None.

## Self-Check: PASSED
