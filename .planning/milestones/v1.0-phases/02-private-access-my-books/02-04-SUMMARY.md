---
phase: 02-private-access-my-books
plan: 04
subsystem: auth
tags: [drizzle, zod, next16-app-router, shared-component, book-selection]

requires:
  - phase: 02-private-access-my-books (Plan 01)
    provides: user_books schema (composite PK, FK to users/books), src/lib/session.ts requireUser()
  - phase: 02-private-access-my-books (Plan 02)
    provides: AppHeader/AccountMenu (Settings link), login-gated main page
provides:
  - getUserBookKeys/saveUserBooks (per-user book persistence, one all-or-nothing db.batch per save)
  - getBonusBooks/getHedgeBookKeys accept an optional allowedKeys set, scoping the usable-book list to a user's selection (D-13)
  - SaveBooksInputSchema (dedupe, min 1, usable-books-only) + saveBooks server action, session-scoped userId only
  - BookPicker shared 7-row checkbox list, reused by OnboardingBooksForm and SettingsBooksForm
  - /onboarding/books (one-time "Pick your books" step, D-08) and /settings ("My books" card, D-11/D-12)
  - src/app/page.tsx redirects to /onboarding/books when a user's usable book set is empty; bonusBooks passed to AppShell is scoped to the user's selection
affects: [02-05 (finder/arb book filtering threads user book keys into hedge/arb suggestions)]

tech-stack:
  added: []
  patterns:
    - "getBonusBooks(allowedKeys?)/getHedgeBookKeys(allowedKeys?) extend in place rather than adding parallel functions -- omitting the argument preserves the original 'every usable book' behavior exactly, so Plan 01-04's existing call sites are unaffected"
    - "saveUserBooks follows store.ts's replaceSportStatements/db.batch idiom: one delete-then-insert batch per save, all-or-nothing"
    - "SaveBooksInputSchema dedupes via .transform() before the min(1)/allowlist .refine()s run, so a double-submitted key can never spuriously trip either check"

key-files:
  created:
    - src/domain/books/bookSelection.ts
    - src/app/actions/save-books.ts
    - src/app/actions/save-books.test.ts
    - src/components/settings/BookPicker.tsx
    - src/components/settings/OnboardingBooksForm.tsx
    - src/components/settings/SettingsBooksForm.tsx
    - src/app/onboarding/books/page.tsx
    - src/app/settings/page.tsx
  modified:
    - src/db/queries.ts (getUserBookKeys, saveUserBooks; getBonusBooks/getHedgeBookKeys allowedKeys param)
    - src/db/queries.test.ts
    - src/app/page.tsx (redirect to onboarding when scoped bonusBooks is empty; getBonusBooks(new Set(userBookKeys)))

key-decisions:
  - "userId is threaded into saveUserBooks/getUserBookKeys only from requireUser()'s session -- SaveBooksInputSchema has no user-identifying field at all, closing the IDOR threat (T-02-21) at the schema level, not just the action level"
  - "SettingsBooksForm disables 'Save changes' when the current selection exactly equals the last-persisted set (not just when non-empty), avoiding a no-op save and matching the UI-SPEC's disabled-state contract"

patterns-established:
  - "BookPicker is the single shared checkbox-list component for both the onboarding step and Settings -- any future picker screen (if one is added) should reuse it rather than re-implementing the row idiom"

requirements-completed: [DASH-02, BONUS-02]

duration: 5min
completed: 2026-09-26
---

# Phase 2 Plan 4: My Books — Onboarding, Settings & Scoped Finder Summary

**Per-user Colorado sportsbook selection persisted in `user_books` via one atomic db.batch per save, edited from a shared 7-row checkbox picker on a one-time onboarding step and on `/settings`, with the bonus-bet finder's dropdown and hedge-book pool now scoped to each user's own books.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-26T03:39:41-06:00 (first commit)
- **Completed:** 2026-09-26T03:44:10-06:00 (last commit)
- **Tasks:** 3 completed
- **Files modified:** 12 (9 created, 3 modified)

## Accomplishments
- `getUserBookKeys`/`saveUserBooks` give each user a persisted book selection backed by `user_books`; `saveUserBooks` replaces a user's entire selection in one all-or-nothing `db.batch` (delete-then-insert), following the same idiom as `store.ts`'s refresh-commit batches
- `getBonusBooks`/`getHedgeBookKeys` now accept an optional `allowedKeys` set that intersects with the usable-books config list, in config order, silently dropping unknown/unusable keys — the no-argument call still returns exactly the original 7 usable books, so every pre-existing call site is unaffected (verified by the retained WR-05 tests)
- `SaveBooksInputSchema` dedupes the submitted keys before checking `min(1)` and "every key ∈ usableOddsBooks()", server-enforcing D-09/D-10 regardless of what the disabled-Continue-button UX allows through; `saveBooks` takes the user id only from `requireUser()`'s session, never from input (T-02-21), and never imports anything from the odds-fetch pipeline (D-19)
- `BookPicker` is one shared full-row-tappable checkbox list used verbatim by both `OnboardingBooksForm` ("Pick your books", nothing pre-ticked, Continue disabled until ≥1 book) and `SettingsBooksForm` ("My books", pre-checked with the saved selection, Save changes disabled while empty/pending/unchanged, confirmation Alert on success)
- `src/app/page.tsx` now redirects any user whose usable book set is empty (brand-new user, or a user whose only books lost API coverage) to `/onboarding/books`, and passes the finder's `bonusBooks` prop already scoped to the user's own selection (D-13)

## Task Commits

1. **Task 1: Failing tests for per-user book persistence and the saveBooks action (RED)** - `923ed2c` (test)
2. **Task 2: User-book queries, selection schema and saveBooks action (GREEN)** - `1b2ecbf` (feat)
3. **Task 3: Pick-your-books onboarding, Settings page, and book-gated main page with a scoped dropdown** - `3947523` (feat)

## Files Created/Modified
- `src/db/queries.ts` - `getUserBookKeys`, `saveUserBooks`; `getBonusBooks`/`getHedgeBookKeys` gained an optional `allowedKeys` parameter
- `src/db/queries.test.ts` - allowedKeys-intersection cases + fake-db `getUserBookKeys`/`saveUserBooks` cases (existing WR-05 throwing-getDb tests untouched)
- `src/domain/books/bookSelection.ts` - `SaveBooksInputSchema` (dedupe, min 1, usable-books-only)
- `src/app/actions/save-books.ts` / `save-books.test.ts` - `saveBooks` server action, session-scoped userId, revalidates `/` and `/settings`
- `src/components/settings/BookPicker.tsx` - shared 7-row checkbox list
- `src/components/settings/OnboardingBooksForm.tsx` - onboarding "Continue" flow
- `src/components/settings/SettingsBooksForm.tsx` - settings "Save changes" flow with success confirmation
- `src/app/onboarding/books/page.tsx` - one-time "Pick your books" step, redirects away once satisfied
- `src/app/settings/page.tsx` - "Settings" page with "My books" card, `AppHeader`, no odds/credit UI
- `src/app/page.tsx` - redirect to onboarding when scoped `bonusBooks` is empty; `getBonusBooks(new Set(userBookKeys))`

## Decisions Made
- Kept `getBonusBooks`/`getHedgeBookKeys` as the same two functions with an added optional parameter (RESEARCH Pattern 3) rather than introducing parallel `getScopedBonusBooks` functions, so every existing caller (finder/arb server actions, tests) needed zero changes.
- `SaveBooksInputSchema` has no user-identifying field at all — the id only ever enters via `requireUser()` inside `save-books.ts` — so an IDOR attempt would have to bypass the session itself, not just spoof a field.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded two doc comments to avoid tripping their own acceptance-criteria greps**
- **Found during:** Task 2 and Task 3 self-verification
- **Issue:** `save-books.ts`'s doc comment said "Never imports from src/ingestion" and `bookSelection.ts`'s said "userId is deliberately NOT a field here" — both contained the literal substrings (`ingestion`, `userId`) that this plan's own acceptance-criteria greps check are *absent* from those files. Same self-consistency issue Plans 02/03 hit and fixed the same way.
- **Fix:** Reworded both comments to describe the identical intent ("imports nothing from the odds-fetch pipeline", "who the selection belongs to is deliberately NOT a field here") without the flagged literals; no functional change.
- **Files modified:** src/app/actions/save-books.ts, src/domain/books/bookSelection.ts
- **Verification:** `grep -n "ingestion" src/app/actions/save-books.ts` and `grep -n "userId" src/domain/books/bookSelection.ts` both return no match.
- **Committed in:** 1b2ecbf (Task 2 commit)

**2. [Rule 1 - Bug] Reworded settings page doc comment to avoid tripping its own acceptance-criteria grep**
- **Found during:** Task 3 self-verification
- **Issue:** `src/app/settings/page.tsx`'s doc comment said "no OddsStatusBar/CreditBanner", tripping the plan's own `grep -n "OddsStatusBar\|CreditBanner" src/app/settings/page.tsx` (expected to find nothing).
- **Fix:** Reworded to "omits the odds status bar and credit banner shown on the main app page" — same meaning, no flagged literals.
- **Files modified:** src/app/settings/page.tsx
- **Verification:** grep now returns no match.
- **Committed in:** 3947523 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 self-consistency fixes to satisfy the plan's own grep-based acceptance criteria)
**Impact on plan:** Cosmetic doc-comment wording only; no behavior or rendered-copy change. No scope creep.

## Issues Encountered

None.

## User Setup Required

None — no new environment variables or external services; reuses the `user_books` table and session infrastructure already live from Plan 01.

## Next Phase Readiness

- `getUserBookKeys`, `saveUserBooks`, and the `allowedKeys`-scoped `getBonusBooks`/`getHedgeBookKeys` are all in place for Plan 05 to thread the user's book set into hedge suggestions and arb legs (D-14, D-16, D-17) without any further schema or query-shape changes.
- The D-18 "no games at your books" empty-state variant and the "Manage your books" link mentioned in the UI-SPEC are explicitly out of this plan's file list (`FinderScreen`/`EmptyState` aren't in `files_modified`) — left for Plan 05, which owns the finder/arb filtering behavior end to end.
- No blockers.

## Self-Check: PASSED

All 8 created files and 3 modified files verified present on disk with expected content; all 3 task commits (923ed2c, 1b2ecbf, 3947523) verified present in git log.

---
*Phase: 02-private-access-my-books*
*Completed: 2026-09-26*
