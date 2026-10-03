---
phase: 05-group-added-promos
plan: 04
subsystem: promos-add
tags: [server-actions, zod, decimal, added-promos]
requires: [05-01, 05-02, 05-03]
provides:
  - AddPromoInputSchema (strict, bonus bet), fieldErrorsFromIssues, AddedPromoResponse, AddPromoFormOptions
  - buildAddedPromoRow / etExpiryInstant (pure)
  - insertAddedPromo, countOwnActiveAddedPromos
  - addPromo and getAddPromoFormOptions server actions
affects: [05-05, 05-06]
key-files:
  created: [src/domain/promos/addedPromoInput.ts, src/domain/promos/buildAddedPromo.ts, src/db/addedPromos.ts, src/app/actions/add-promo.ts, src/app/actions/get-add-promo-options.ts]
  modified: [src/domain/promos/reviewInput.ts, src/domain/promos/rankPromoHedges.test.ts]
key-decisions:
  - "A bonus bet with no game chosen is stored as scope_kind 'any' (A2)"
  - "Stored parsed.title is the plain promoTitle (e.g. $50.00 bonus bet); bookName is accepted by the builder but unused"
duration: 20min
completed: 2026-09-30
---

# Phase 5 Plan 04: Bonus-bet add server half Summary

A member's bonus bet can now be saved through addPromo: strict input, book limited to the member's own books, expiry and any game/league scope re-checked server-side, stored active and owned by the session user, and it survives the read path (round-trip tested through mapActivePromoRow).

## Commits
- 79e5ab3 test: bonus-bet input contract, any-scope ranking test, RED addPromo test
- f346bc7 feat: row builder, db insert, addPromo, getAddPromoFormOptions (GREEN)

## Notes
- addPromo checks in order: schema, own book, 100-active cap, expiry in the future, scope resolution, build, insert, revalidate "/" (only on ok).
- getAddPromoFormOptions reads the odds cache only (0 credits); no import from src/ingestion/odds.
- Money uses Decimal.toFixed(2) only. No live DB writes were made (tests mock the db layer).

## Deviations from Plan

**1. [Rule 3] Worktree base was 914da50**; reset to 15eb9d3 per instructions. node_modules symlinked for tests and removed before return.

**2. Minor:** the plan's "generic" failure text for a builder failure is "Something is off with that promo. Check the fields and try again." (form error); not in UI-SPEC, only reachable if the built payload fails ScrapedPromoSchema.

## Verification
- Full `npm test`: 85 files, 1272 tests pass; lint clean.
- `npm run typecheck`: only the pre-existing `src/app/layout.tsx LayoutProps` error.
- Acceptance greps: no userId in addedPromoInput.ts, no z.object( there, no parseFloat/Number( in buildAddedPromo.ts, no db.delete in addedPromos.ts.

## Known Stubs
None.

## Self-Check: PASSED
