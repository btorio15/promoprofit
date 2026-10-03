---
phase: 05-group-added-promos
fixed_at: 2026-09-30T07:12:35Z
review_path: .planning/phases/05-group-added-promos/05-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-09-30T07:12:35Z
**Source review:** .planning/phases/05-group-added-promos/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (1 critical, 6 warnings; Info findings out of scope)
- Fixed: 7
- Skipped: 0

No schema change or migration was needed, and nothing was written to the live database.

**Final checks (after all fixes):**
- `npm test`: 92 files, 1368 tests passed
- `npm run typecheck`: clean
- `npm run lint`: clean

## Fixed Issues

### CR-01: Added promos never leave `status='active'`, so the 100-promo cap eventually locks users out

**Files modified:** `src/db/addedPromos.ts`, `src/app/actions/add-promo.ts`, `src/db/addedPromos.test.ts`, `src/app/actions/add-promo.test.ts`
**Commit:** 419c30e
**Applied fix:** The cap now counts only the member's added promos that are still live, using the same rule as the feed (`activePromoWhere(now, userId)` plus the owner condition). The query is a new `buildCountOwnLiveAddedPromosQuery`. `addPromo` passes one `now` to both the cap count and the validation pipeline. Promos whose expiry, game start or window end has passed no longer count toward the cap. The optional lazy sweep that would set them to `expired` was not added. Status: fixed, requires human verification (logic change).

### WR-01: Editing a promo leaves its higher profit observation in place, inflating "available profit"

**Files modified:** `src/db/addedPromos.ts`, `src/db/addedPromos.test.ts`
**Commit:** 0fde4fb
**Applied fix:** A new `buildUpdateOwnStatements` returns the in-place update and a delete of that promo's `promo_profit_observations` rows. The delete is limited by an ownership subquery (id, owner, `status='active'`), following the same pattern as soft delete. `updateOwnAddedPromo` runs both in one `db.batch`. The next Promos load records the corrected value. Status: fixed, requires human verification (logic change).

### WR-02: The member's own hand-added promos are hidden when the odds cache is empty

**Files modified:** `src/app/actions/get-promos.ts`, `src/app/actions/get-promos.test.ts`, `src/components/promos/PromosScreen.tsx`
**Commit:** 6af6a8b
**Applied fix:** When no odds are cached, the response still uses the `no-odds` empty state. It now also returns the viewer's own added promos (`addedByYou`) in `unprofitableRows` with the note "No odds loaded yet". Scraped promos are still left out. `PromosScreen` shows those rows, with their Edit / Expire / Delete actions, below the empty-state card. In every other empty state `unprofitableRows` is empty, so nothing else changes on screen.

### WR-03: Editing cannot succeed when the promo's book is no longer one of the member's usable books

**Files modified:** `src/db/addedPromoPipeline.ts`, `src/db/addedPromoPipeline.test.ts` (new), `src/app/actions/edit-promo.ts`, `src/app/actions/get-add-promo-options.ts`, `src/app/actions/added-promo-actions.test.ts`, `src/app/actions/get-add-promo-options.test.ts`
**Commit:** 406b68e
**Applied fix:** `prepareAddedPromoValues` has a new optional `lockedBookKey`. `editPromo` passes `existing.bookKey`, the stored book that it has already checked matches the request. That book is accepted even when the member no longer has it; its name comes from `COLORADO_BOOKS`. Any other book the member doesn't have is still rejected, and adding a promo is unchanged. In edit mode, `getAddPromoFormOptions` adds the locked book to the form's book list, so the disabled Book field shows the book's name instead of its raw key. New test file: `src/db/addedPromoPipeline.test.ts`.

### WR-04: The expiry time is taken as Eastern Time, but the UI never says so

**Files modified:** `src/domain/promos/addPromoDraft.ts`, `src/domain/promos/addPromoDraft.test.ts`, `src/components/promos/ExpiryField.tsx`
**Commit:** d9b4e74
**Applied fix:** Every expiry time option now ends in "ET" (for example "11:59 PM ET"), matching the UI-SPEC wording "11:59 PM ET". The time select's accessible label is now "Expiry time (Eastern Time)". The stored meaning is unchanged (still ET wall-clock). The review's alternative, switching the form to `America/Denver`, was not done because it would change stored values and the UI-SPEC's ET contract.

### WR-05: The flag action tells users whether another member's private promo exists

**Files modified:** `src/db/promoReview.ts`, `src/db/promoReview.test.ts` (new), `src/app/actions/flag-promo-match.ts`, `src/app/actions/promo-review.test.ts`
**Commit:** 4a5a1f2
**Applied fix:** `getActivePromoForFlag(id, viewerUserId)` now filters with `promoVisibilityCondition(viewerUserId)`, through a new exported `activePromoForFlagWhere`. Another member's added promo now gets the same "Someone else already handled this promo." response as an unknown id. `flagPromoMatch` passes `user.userId` from the session, and the input schema is unchanged.

### WR-06: The server accepts expiries any distance in the future

**Files modified:** `src/db/addedPromoPipeline.ts`, `src/db/addedPromoPipeline.test.ts`, `src/domain/promos/addedPromoInput.ts`, `src/domain/promos/addPromoDraft.ts`
**Commit:** 8a285b0
**Applied fix:** A new shared constant `ADDED_PROMO_EXPIRY_DAYS = 30` lives in `addedPromoInput.ts`; the form's `EXPIRY_DAY_COUNT` now uses it. `prepareAddedPromoValues` rejects an expiry later than now + 31 days (30 plus one day of slack for time-zone edges) with the new message "Pick a day in the next 30 days." on the `expires` field. Tests cover the last day the form offers (accepted), a 2099 date (rejected) and a date just past the window (rejected).

---

_Fixed: 2026-09-30T07:12:35Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
