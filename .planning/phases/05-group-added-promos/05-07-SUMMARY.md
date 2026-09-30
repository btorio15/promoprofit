---
phase: 05-group-added-promos
plan: 07
subsystem: promos-manage
tags: [server-actions, soft-delete, ownership, added-promos]
requires: [05-04, 05-05]
provides:
  - expireOwnAddedPromo, softDeleteOwnAddedPromo, buildExpireOwnStatement, buildSoftDeleteStatements
  - expirePromo and deletePromo server actions
  - ExpirePromoDialog, DeletePromoDialog, AddedPromoActions (reusable on Done rows in Plan 09)
affects: [05-08, 05-09]
key-files:
  created: [src/app/actions/expire-promo.ts, src/app/actions/delete-promo.ts, src/app/actions/added-promo-actions.test.ts, src/db/addedPromos.test.ts, src/components/promos/ExpirePromoDialog.tsx, src/components/promos/DeletePromoDialog.tsx, src/components/promos/AddedPromoActions.tsx]
  modified: [src/db/addedPromos.ts, src/components/promos/PromoRow.tsx, src/components/promos/UnprofitablePromoRow.tsx, src/components/promos/PromosScreen.tsx]
key-decisions:
  - "Delete is a soft delete (status 'deleted'); never a SQL DELETE on promos, so Done history survives"
  - "A4: soft delete also removes that promo's profit observations, scoped by an ownership subquery; completions kept"
duration: 15min
completed: 2026-09-30
---

# Phase 5 Plan 07: Expire and delete own added promos Summary

A member can Expire now or Delete a promo they added from its Active row in Promos (profitable or not), behind confirm dialogs. Ownership is inside the UPDATE WHERE, so anyone else's id gets the generic "That promo isn't available any more." and nothing changes.

## Commits
- 3890401: owner-checked db functions and actions with tests
- see git log: dialogs, AddedPromoActions, row and screen wiring

## Notes
- Expire only applies to active promos; delete applies to active or expired ones.
- Row actions render only when `addedActions` is passed (Promos > Active); OpportunitiesScreen is unchanged.
- PromosScreen shows a destructive alert above the list on failure and clears it on the next successful change.
- Not verified in a browser (manual check left for verify-work). No live DB writes.

## Deviations from Plan
- Minor: removed an unneeded eslint-disable in DeletePromoDialog (the copy sits in a string literal, so no unescaped-entities warning).
- Worktree base was 914da50; reset to 735fb1c per instructions. node_modules symlink removed before return.

## Verification
- `npm test`: 88 files, 1297 tests pass. Lint clean.
- `npm run typecheck`: only the known `src/app/layout.tsx LayoutProps` artifact.

## Known Stubs
None.

## Self-Check: PASSED
