---
phase: 05-group-added-promos
reviewed: 2026-09-30T06:59:23Z
depth: standard
files_reviewed: 58
files_reviewed_list:
  - drizzle/0010_added_promos.sql
  - scripts/db-check.ts
  - src/app/actions/add-promo.test.ts
  - src/app/actions/add-promo.ts
  - src/app/actions/added-promo-actions.test.ts
  - src/app/actions/delete-promo.ts
  - src/app/actions/edit-promo.ts
  - src/app/actions/expire-promo.ts
  - src/app/actions/get-add-promo-options.test.ts
  - src/app/actions/get-add-promo-options.ts
  - src/app/actions/get-opportunities.test.ts
  - src/app/actions/get-opportunities.ts
  - src/app/actions/get-promos.test.ts
  - src/app/actions/get-promos.ts
  - src/app/actions/mark-promo-used.test.ts
  - src/components/promos/AddedPromoActions.tsx
  - src/components/promos/AddPromoForm.tsx
  - src/components/promos/BonusBetFields.tsx
  - src/components/promos/BoostFields.tsx
  - src/components/promos/DeletePromoDialog.tsx
  - src/components/promos/DonePromoRow.tsx
  - src/components/promos/ExpirePromoDialog.tsx
  - src/components/promos/ExpiryField.tsx
  - src/components/promos/PromoDetails.tsx
  - src/components/promos/PromoRow.tsx
  - src/components/promos/PromosEmptyState.tsx
  - src/components/promos/PromosScreen.tsx
  - src/components/promos/UnprofitablePromoRow.tsx
  - src/db/addedPromoPipeline.ts
  - src/db/addedPromos.test.ts
  - src/db/addedPromos.ts
  - src/db/feedContext.ts
  - src/db/memberPairState.test.ts
  - src/db/memberPromoState.ts
  - src/db/promos.test.ts
  - src/db/promos.ts
  - src/db/promoTracking.test.ts
  - src/db/promoTracking.ts
  - src/db/schema.ts
  - src/domain/promos/addedPromoInput.test.ts
  - src/domain/promos/addedPromoInput.ts
  - src/domain/promos/addPromoDraft.test.ts
  - src/domain/promos/addPromoDraft.ts
  - src/domain/promos/buildAddedPromo.test.ts
  - src/domain/promos/buildAddedPromo.ts
  - src/domain/promos/doneSnapshot.test.ts
  - src/domain/promos/doneSnapshot.ts
  - src/domain/promos/dto.ts
  - src/domain/promos/duplicateHint.test.ts
  - src/domain/promos/duplicateHint.ts
  - src/domain/promos/promoRowDto.ts
  - src/domain/promos/rankPromoHedges.test.ts
  - src/domain/promos/reviewInput.ts
  - src/domain/promos/scope.test.ts
  - src/domain/promos/scope.ts
  - src/domain/promos/types.ts
  - src/ingestion/promos/store.test.ts
  - src/ingestion/promos/store.ts
findings:
  critical: 1
  warning: 6
  info: 4
  total: 11
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-09-30T06:59:23Z
**Depth:** standard
**Files Reviewed:** 58
**Status:** issues_found

## Summary

I reviewed the whole Phase 5 surface: the migration, the add/edit/expire/delete actions, the shared validation pipeline, the viewer-scoped read paths (`getActivePromos`, `promoVisibilityCondition`, the observation join), the scraper expire-unseen change, the Done snapshot changes, and the UI. `tsc --noEmit` is clean and the 484 phase-related unit tests pass.

**The security core holds:**
- Every write puts ownership (`added_by_user_id = session user`) in the SQL WHERE.
- No input schema has an owner field.
- A forged `bookKey` is rejected against the member's own usable books.
- Pins and games are re-checked against the cached odds.
- The scraper's expire-unseen now excludes added promos.
- Soft delete never issues a SQL DELETE on `promos`, so `promo_completions` survive.

**The main defect is a lifecycle gap.** Nothing ever moves a hand-added promo out of `status='active'`: the scraper deliberately skips them, and the only other exit is the manual Expire. Once an added promo's expiry passes, its game starts, or its window ends, it disappears from every UI list. But it still counts toward the 100-active cap forever, and the member has no way to reach it to delete it. A regular user will eventually be permanently blocked from adding promos.

The smaller issues:
- Edits leave inflated profit observations.
- Editing becomes a dead end when the promo's book is no longer usable.
- The expiry time is entered without saying it is Eastern Time, and the app's users are in Colorado.
- A small existence leak through the flag action.

## Critical Issues

### CR-01: Added promos never leave `status='active'`, so the 100-promo cap eventually locks users out

**File:** `src/db/addedPromos.ts:15-22` (with `src/app/actions/add-promo.ts:32`, `src/ingestion/promos/store.ts:545-558`, `src/db/promos.ts:262-275`)

**Issue:** `countOwnActiveAddedPromos` counts every row with `added_by_user_id = user AND status = 'active'`, with no time filter. The only code that sets an added promo to `expired` is the manual `expireOwnAddedPromo`:
- `buildExpireUnseenStatement` now excludes added promos on purpose, via `isNull(promos.addedByUserId)`.
- No other job expires promos by time.

So every added bonus bet whose expiry passes, and every boost whose game starts or window ends, stays `active` in the DB indefinitely.

Those rows fail `activePromoWhere(now, …)`, so they never appear in Promos > Active. That means the member cannot Expire or Delete them either. The only exception is a promo they happened to mark Done, which shows up in the Done tab.

After about 100 naturally lapsed promos (a few months of normal use for someone logging daily bonus bets), `addPromo` returns `MSG_TOO_MANY` permanently. The message says "Delete some before adding more", but there is nothing visible to delete. This breaks the phase's core "add a promo" flow with no way out for the user.

**Fix:** Count only promos that are still live, using the same rule the feed uses. For example, reuse `activePromoWhere` and add the owner condition:
```ts
export async function countOwnActiveAddedPromos(userId: number, now: Date = new Date()): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(promos)
    .where(and(eq(promos.addedByUserId, userId), activePromoWhere(now, userId)));
  return Number(row?.n ?? 0);
}
```
Optionally, also run a lazy sweep that sets `status='expired'` on the member's lapsed added promos (in `getPromos`, or in `addPromo` before the count) so the DB status matches reality.

## Warnings

### WR-01: Editing a promo leaves its higher profit observation in place, inflating "available profit"

**File:** `src/db/addedPromos.ts:114-143` (interaction with `src/db/promoTracking.ts:140-161`)

**Issue:** `recordProfitObservations` upserts with `greatest(existing, excluded)`, so it can only ever raise a day's value. Example: a member saves a $100 bonus bet, the Promos tab records today's observation, and then the member corrects the amount to $10. `updateOwnAddedPromo` rewrites the promo in place under the same id but leaves the old observation rows alone. Today's figure (and any earlier days) keeps the $100-based profit, so the today/week/month "available profit" totals overstate what the promo was ever worth. Soft delete already clears observations (A4); edit should too, because the old numbers no longer describe this promo.

**Fix:** Run the update and an owner-scoped delete of the promo's observations in one `db.batch`, reusing the ownership-subquery pattern from `buildSoftDeleteStatements`. At minimum, delete today's `denverDate` row. The next Promos load then records the corrected value.

### WR-02: The member's own hand-added promos are hidden when the odds cache is empty

**File:** `src/app/actions/get-promos.ts:163-177`

**Issue:** When `oddsFetchedAt === null && extendedOddsFetchedAt === null`, `getPromos` returns `emptyVariant: "no-odds"` with empty `rows`/`unprofitableRows`, even when the member has active added promos. Edit, Expire now and Delete only exist on those rows (`PromoRow` / `UnprofitablePromoRow` with `addedActions`). So while odds are uncached, a member cannot see or manage the promos they just added. The success toast ("It's live in your Promos") is also wrong in that state.

**Fix:** In the no-odds branch, still return the member's own added promos as `unprofitableRows` with a "No odds loaded yet" note, or return a separate `addedPromos` list the screen renders with `AddedPromoActions`.

### WR-03: Editing cannot succeed when the promo's book is no longer one of the member's usable books

**File:** `src/db/addedPromoPipeline.ts:37-41`, `src/components/promos/AddPromoForm.tsx:207, 247-252`

**Issue:** `prepareAddedPromoValues` rejects any `bookKey` that is not in `getUsableUserBooks(userId)`. In edit mode, Book is locked (`disabled={isSaving || isEdit}`), and the form also skips the "no books" guard (`&& !isEdit`). If the member has since removed that book in Settings, every save fails with "Pick a sportsbook." on a field they cannot change.

**Fix:** In `editPromo`, skip the usable-book check. The book is already locked to `existing.bookKey`, which was validated when the promo was added. Alternatively, have `getAddPromoFormOptions` return `not_found` or a specific message when `editing.bookKey` is not in `books`, so the form explains the situation ("You no longer have this book. Delete this promo instead.").

### WR-04: The expiry time is taken as Eastern Time, but the UI never says so, and the app's users are in Colorado

**File:** `src/components/promos/ExpiryField.tsx:33-77`, `src/domain/promos/addPromoDraft.ts:126-136`, `src/domain/promos/buildAddedPromo.ts:21-34`

**Issue:** `etExpiryInstant` reads the chosen day and time as an ET wall-clock time, but the field is labelled only "Expires" and the options read "11:59 PM" with no zone. A Colorado member who picks "11:59 PM" for a bonus bet that expires at 11:59 PM Mountain gets a stored expiry of 9:59 PM MT. The promo then drops out of the feed two hours early. The day list is also built from the ET calendar, so late in the Mountain evening the first option is already "tomorrow" ET.

**Fix:** Add "ET" to the time labels and the helper text (for example "11:59 PM ET"). The better fix is to make the form's wall-clock zone `America/Denver` so it matches the users' sportsbook apps.

### WR-05: The flag action tells users whether another member's private promo exists

**File:** `src/db/promoReview.ts:590-619` (called by `src/app/actions/flag-promo-match.ts`)

**Issue:** `getActivePromoForFlag(id)` loads any `status='active'` promo by id without `promoVisibilityCondition`. Another member's active hand-added promo is found and has `autoMatched=false`, so `flagPromoMatch` returns "Only auto-matched promos can be flagged." An unknown or inactive id returns "Someone else already handled this promo." Promo ids are sequential, so any member can enumerate which ids are other members' live personal promos. No write happens, because `applyFlag` requires `auto_matched = true`. However, T-5-14 promises that responses never reveal whether an id exists or belongs to someone else.

**Fix:** Pass the viewer in and add the visibility rule:
```ts
.where(and(eq(promos.id, id), eq(promos.status, "active"), promoVisibilityCondition(viewerUserId)))
```
Or simply require `isNull(promos.addedByUserId)`, since added promos are never auto-matched.

### WR-06: The server accepts expiries any distance in the future

**File:** `src/domain/promos/addedPromoInput.ts:67-70`, `src/db/addedPromoPipeline.ts:43-50`

**Issue:** The UI only offers the next 30 ET days (`EXPIRY_DAY_COUNT`). The server only checks that the expiry is in the future. A crafted request (or a stale tab) can store an expiry such as `2099-12-31`. For an "any game" bonus bet (`scope_kind='any'`, which is kept only by `expires_at > now`), that makes the promo effectively permanent in the feed and permanently counted toward the cap (see CR-01). The client and server rules should match.

**Fix:** In `prepareAddedPromoValues`, reject `expiresAt > now + EXPIRY_DAY_COUNT days` (plus a day of slack for time-zone edges) with `MSG_EXPIRY_PASSED`, or with a new "Pick a day in the next 30 days" message.

## Info

### IN-01: The cap check and the insert are separate steps

**File:** `src/app/actions/add-promo.ts:32-44`
**Issue:** `countOwnActiveAddedPromos` and `insertAddedPromo` do not run in one statement or transaction, so parallel requests can go past 100. The impact is low for a private group.
**Fix:** Accept as a soft cap, or use a single `INSERT ... SELECT ... WHERE (SELECT count(*) ...) < 100`.

### IN-02: `MSG_TOO_MANY` hard-codes "100" separately from `ADDED_PROMO_MAX_ACTIVE`

**File:** `src/domain/promos/addedPromoInput.ts:19, 25`
**Fix:** Build it with a template string: `` `You have ${ADDED_PROMO_MAX_ACTIVE} active promos...` ``.

### IN-03: The duplicate hint ignores your own added promos, and fires before a boost has a game

**File:** `src/app/actions/get-add-promo-options.ts:46`, `src/domain/promos/duplicateHint.ts:46, 53, 65`
**Issue:** `!p.addedByYou` leaves out the member's own added promos. Adding the same personal promo twice therefore shows no hint, even though the copy says "already in your list". Separately, `draftScope` treats "no game or league picked yet" as `any`, which overlaps everything. So a boost draft shows the hint as soon as book and amount match, before any scope is chosen.
**Fix:** Include the member's own added promos in the candidates. Return `null` from `draftScope` for an incomplete scope when `draft.promoType === "profit_boost"`.

### IN-04: The Expire/Delete failure message says "Try again" even when retrying cannot work

**File:** `src/components/promos/AddedPromoActions.tsx:28-35`
**Issue:** A `not_found` outcome (promo already deleted, or expired in another tab) shows "Couldn't delete that promo. Try again." and does not refresh, so the stale row stays and retrying fails again.
**Fix:** On `not_found`, call `onChanged()` to refresh and show "That promo isn't available any more."

---

_Reviewed: 2026-09-30T06:59:23Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
