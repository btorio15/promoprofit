---
phase: 02-private-access-my-books
plan: 08
subsystem: auth
tags: [nextjs, drizzle, redirect, book-selection, gap-closure]

# Dependency graph
requires:
  - phase: 02-private-access-my-books
    provides: getUserBookKeys/getBonusBooks (Plan 04), Home/OnboardingBooksPage/SettingsPage routing (Plan 06)
provides:
  - getUsableUserBooks(userId) — the single "usable saved books" predicate in src/db/queries.ts
  - Loop-free routing between / and /onboarding/books for any saved-books state, including stale-only
  - Settings initialKeys always seedable from checkboxes that actually render, so Save changes can never be unconditionally blocked
affects: [phase-03-promo-scraping, phase-04-opportunities-feed]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Shared predicate function to keep two mutually-redirecting pages' conditions provably complementary"]

key-files:
  created:
    - src/app/book-routing.test.ts
  modified:
    - src/db/queries.ts
    - src/db/queries.test.ts
    - src/app/page.tsx
    - src/app/onboarding/books/page.tsx
    - src/app/settings/page.tsx

key-decisions:
  - "getUsableUserBooks composes getUserBookKeys + getBonusBooks(new Set(...)) rather than duplicating the intersection logic, so it can never drift from getBonusBooks' own usable-book filtering"
  - "getUserBookKeys and getBonusBooks themselves are unchanged — find-hedges.ts/find-arbs.ts already intersect independently via getHedgeBookKeys, and touching them was out of this plan's scope"

patterns-established:
  - "When two pages redirect to each other based on related-but-not-identical conditions, extract one shared predicate function and have both pages call it, so the two conditions are provably complementary rather than independently maintained"

requirements-completed: [DASH-02]

# Metrics
duration: 9min
completed: 2026-09-26
---

# Phase 02 Plan 08: Redirect Loop + Stale Settings Keys Gap Closure Summary

**Added `getUsableUserBooks(userId)` as the single usable-saved-books predicate and switched `/`, `/onboarding/books`, and `/settings` to it, closing the CR-02 infinite redirect loop and the WR-01 unsaveable-settings bug for users whose saved books lose API/free-tier coverage.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-26T19:51:37Z (approx, following completion of 02-07-PLAN.md)
- **Completed:** 2026-09-26T19:57:33Z
- **Tasks:** 2 completed
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments
- `getUsableUserBooks(userId)` in `src/db/queries.ts` is now THE single source of truth for "does this user have at least one usable saved book" — an intersection of their saved keys with `usableOddsBooks()`, in config order, stale keys silently dropped
- `/` and `/onboarding/books` now branch on the exact same value with complementary conditions (`length === 0` vs `length > 0`), so a user whose every saved book loses usability lands on "Pick your books" instead of looping between the two routes
- `/settings` seeds `initialKeys` from usable saved books only, so a stale key can never survive in `selected` with no checkbox to clear it, unblocking `Save changes` unconditionally
- New `src/app/book-routing.test.ts` (143 lines) proves the invariant across empty/stale-only/usable-saved-book states and asserts no page calls `getUserBookKeys` directly anymore

## Task Commits

Each task was committed atomically (TDD RED → GREEN pairs):

1. **Task 1: getUsableUserBooks shared predicate in queries.ts**
   - `cd76108` (test) — add failing test for getUsableUserBooks (4 new cases: stale-only, mixed, empty, userId pass-through)
   - `eb54a2e` (feat) — add getUsableUserBooks shared predicate (CR-02, WR-01)
2. **Task 2: Switch /, /onboarding/books and /settings to the shared predicate + routing invariant test**
   - `8dcceb3` (test) — add book routing invariant test (CR-02, WR-01)
   - `cee63e3` (fix) — switch /, /onboarding/books and /settings to getUsableUserBooks (CR-02, WR-01)

_Note: both tasks used `tdd="true"`; each has a RED (`test`) commit confirmed failing against pre-fix code, followed by a GREEN (`feat`/`fix`) commit that made all tests pass._

## Files Created/Modified
- `src/db/queries.ts` - Added exported `getUsableUserBooks(userId)`, composing `getUserBookKeys` + `getBonusBooks(new Set(...))`
- `src/db/queries.test.ts` - Added 4 tests for `getUsableUserBooks` (stale-only, mixed order, empty, userId pass-through)
- `src/app/page.tsx` - `Home()` now calls `getUsableUserBooks(user.userId)` instead of `getUserBookKeys` + `getBonusBooks(new Set(...))`
- `src/app/onboarding/books/page.tsx` - Redirect-back check now uses `getUsableUserBooks(user.userId).length > 0` instead of raw `existingKeys.length > 0`
- `src/app/settings/page.tsx` - `initialKeys` now derived from `getUsableUserBooks(user.userId).map((b) => b.key)` instead of raw `getUserBookKeys`
- `src/app/book-routing.test.ts` (new) - Table-driven invariant test over three saved-books states for Home/OnboardingBooksPage/SettingsPage, plus a spy proving none of the three pages call `getUserBookKeys` directly

## Decisions Made
- `getUsableUserBooks` composes the two existing functions rather than introducing new query logic — keeps it mechanically impossible to drift from `getBonusBooks`' own filtering rules
- Left `getUserBookKeys` and `getBonusBooks` themselves untouched, per the plan's explicit scope boundary — `find-hedges.ts`/`find-arbs.ts` already intersect independently via `getHedgeBookKeys` and were not part of this gap

## Deviations from Plan

None - plan executed exactly as written. One minor lint fix (unused destructured parameter in a test mock, resolved with `void _props;` inside the mock body) was applied inline during Task 2 to keep `npm run lint` clean; not a deviation from the plan's behavior, just test hygiene.

## Issues Encountered
None. RED phase for both tasks failed exactly as predicted by the plan's `<behavior>` bullets before the corresponding GREEN commit; no debugging required beyond one TypeScript inference fix for the mocked `SettingsBooksForm` component's prop type in the test file (typed the mock's parameter explicitly so `mock.calls[0][0]` had the right shape for the typecheck gate).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 2 must-have "the user always has a working path to reach or fix their book selection" (02-VERIFICATION.md gap 2) is now closed: `npx vitest run src/app/book-routing.test.ts src/db/queries.test.ts` (17/17), `npm run typecheck`, `npm test` (290/290), and `npm run build` all pass. `/onboarding/books` remains a gated one-time step with no header or back link (D-08), unchanged by this plan. CR-01 (login lockout concurrency) was already closed in Plan 02-07 — with this plan's completion, both CRITICAL findings from `02-REVIEW.md` are resolved and Phase 2 has no outstanding BLOCKER gaps. Ready for re-verification and Phase 3 (Promo Scraping & Review).

---
*Phase: 02-private-access-my-books*
*Completed: 2026-09-26*

## Self-Check: PASSED

All 7 claimed files found on disk; all 4 claimed commit hashes (cd76108, eb54a2e, 8dcceb3, cee63e3) found in git log.
