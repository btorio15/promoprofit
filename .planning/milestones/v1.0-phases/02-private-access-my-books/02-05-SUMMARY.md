---
phase: 02-private-access-my-books
plan: 05
subsystem: api
tags: [server-actions, session-scoping, drizzle, zod]

requires:
  - phase: 02-private-access-my-books (Plan 03)
    provides: requireUser() login-gate pattern for credit-spending/searching server actions
  - phase: 02-private-access-my-books (Plan 04)
    provides: getUserBookKeys(userId), getBonusBooks(allowedKeys?)/getHedgeBookKeys(allowedKeys?)
provides:
  - findHedges/findArbs resolve the session user's book set and scope both the bonus/hedge legs (finder) and both arb legs plus the Multiple-books tie list (arb) to only that user's books (BONUS-02, D-13..D-17)
  - booksExcludedAll on FindHedgesResponse/FindArbsResponse's ok branch, computed in-memory from the same cached events at zero extra Odds API cost (D-18, D-19)
  - "no-books-covered" empty-state variant on both EmptyState and ArbEmptyState, linking to /settings
affects: []

tech-stack:
  added: []
  patterns:
    - "booksExcludedAll is computed only when the 'all' scope is already empty and the user hasn't selected every usable book, by re-running the same in-memory market extraction (extractTwoWayMoneylines / buildMarkets+rankArbs) against the full usable-book set from the SAME cached events -- no second DB read, no Odds API call, so the 'hidden by your books' signal is derived, never fetched"
    - "The finder's and arb's EmptyState components handle their new 'no-books-covered' variant via an early-return branch (same idiom as their existing runtime-interpolated variants), rendering a Button rendered as a next/link Link via base-ui's render= prop rather than composing a separate anchor"

key-files:
  created: []
  modified:
    - src/app/actions/find-hedges.ts
    - src/app/actions/find-arbs.ts
    - src/app/actions/find-hedges.test.ts
    - src/app/actions/find-arbs.test.ts
    - src/app/actions/refresh-odds.test.ts
    - src/domain/finder/types.ts
    - src/domain/arb/types.ts
    - src/components/finder/EmptyState.tsx
    - src/components/finder/ResultsList.tsx
    - src/components/arb/ArbEmptyState.tsx
    - src/components/arb/ArbResultsList.tsx

key-decisions:
  - "requireUser() is the first statement in both findHedges and findArbs, before Zod validation, so a logged-out request never reaches getCachedEvents/getCachedExtendedEvents (closes T-02-26)"
  - "booksExcludedAll guards its recompute behind 'the user hasn't selected every usable book' so a user with the full 7-book selection never pays the extra in-memory pass -- the guard is an optimization, not a correctness requirement, since a full selection's recompute would trivially reproduce the same (already-computed) empty result"

patterns-established:
  - "Any future server action that both spends/reads shared resources and must respect a user's saved preference set should follow this file's shape: requireUser() first, resolve the preference set once, thread it through the existing optional-parameter query functions, and only recompute an 'excluded because of your selection' flag when the primary result is already empty (avoids a second DB round-trip in the common case)"

requirements-completed: [BONUS-02]

duration: 4min
completed: 2026-09-26
---

# Phase 2 Plan 5: Suggestions Only At My Books Summary

**findHedges and findArbs now resolve the logged-in user's saved book set and thread it through the existing `getBonusBooks`/`getHedgeBookKeys` allowedKeys seam, so every hedge leg, arb leg, and the arb "Multiple books" tie list only ever names a book the user actually has — with a "No games at your books right now" empty state (linking to Settings) when the user's own selection is why nothing surfaced.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-09-26T03:53:00-06:00 (first RED test run)
- **Completed:** 2026-09-26T03:57:37-06:00 (last commit)
- **Tasks:** 3 completed
- **Files modified:** 11 (0 created, 11 modified)

## Accomplishments
- `findHedges`/`findArbs` call `requireUser()` as their very first statement — before Zod validation, before any cache read — so a logged-out request can never even read `getCachedEvents`/`getCachedExtendedEvents` (D-20, T-02-26)
- Both actions resolve `getUserBookKeys(user.userId)` and pass that set into `getBonusBooks(userBookSet)`/`getHedgeBookKeys(userBookSet)` (Plan 04's existing optional-parameter seam), so an out-of-selection bonus book is rejected server-side with the same `bookKey` field error (D-13, T-02-27), the same-book hedge badge still fires when that book is one of the user's own (D-15), and the arb engine's `tiedBookKeys` — and therefore the "Multiple books" popover — can never name a book the user doesn't have (D-16, D-17)
- `booksExcludedAll` is a new field on both `FindHedgesResponse`'s and `FindArbsResponse`'s `ok` branch: true only when the "all" scope is empty, the user hasn't selected every usable book, and the SAME cached events do qualify at least one market/arb at the full usable-book set — computed by re-running `extractTwoWayMoneylines`/`buildMarkets`+`rankArbs` in memory, zero extra DB reads and zero Odds API calls (D-18, D-19, T-02-29)
- `EmptyState` and `ArbEmptyState` both gained a `"no-books-covered"` variant — "No games at your books right now" / "None of the upcoming games are offered at the sportsbooks you've selected. Add more books to see more opportunities." plus an outline `Button` rendered as a `next/link` Link to `/settings` labelled "Manage your books" — the only empty state in the app that links elsewhere
- `ResultsList`/`ArbResultsList` apply the correct precedence on the "all" tab only: the hedge-cap message (`limitExcludedAll`) still wins first when both conditions are true, then `booksExcludedAll`'s new copy, then the existing no-results/no-arbs copy; sport tabs are unchanged

## Task Commits

1. **Task 1: Failing tests — suggestions scoped to the session user's books (RED)** - `68a5e06` (test)
2. **Task 2: Thread the user's books through findHedges / findArbs (GREEN)** - `86c4971` (feat)
3. **Task 3: "No games at your books right now" empty state on both tabs** - `7bec55d` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/app/actions/find-hedges.ts` - `requireUser()` first, `userBookSet` threaded into `getBonusBooks`/`getHedgeBookKeys`, `booksExcludedAll` computed and returned
- `src/app/actions/find-arbs.ts` - `requireUser()` first, `userBookSet` threaded into `getBonusBooks`/`getHedgeBookKeys` (parallelized with the cache reads), `booksExcludedAll` computed and returned
- `src/app/actions/find-hedges.test.ts` / `find-arbs.test.ts` - `@/lib/session` mock, `getUserBookKeys` added to the `@/db/queries` mock with real-intersection-honoring `getBonusBooks`/`getHedgeBookKeys` stubs, new per-user scoping and logged-out-rejection cases
- `src/app/actions/refresh-odds.test.ts` - `getUserBookKeys` added to its `@/db/queries` mock (resolves all 7 usable keys) so its ODDS-04 `findHedges` cases keep passing
- `src/domain/finder/types.ts` / `src/domain/arb/types.ts` - `booksExcludedAll: boolean` added to each response's `ok` branch
- `src/components/finder/EmptyState.tsx` / `src/components/arb/ArbEmptyState.tsx` - `"no-books-covered"` variant with the Settings link
- `src/components/finder/ResultsList.tsx` / `src/components/arb/ArbResultsList.tsx` - `booksExcludedAll`-aware precedence on the "all" tab

## Decisions Made
- Kept `requireUser()` as the literal first statement in both actions (ahead of Zod parsing) so the tests' "rejects when logged out, before any cache read" assertion is structurally guaranteed, not just incidentally true.
- Computed `booksExcludedAll` by re-deriving from the already-fetched cached events rather than re-querying the DB, matching D-19's zero-extra-cost requirement and mirroring the existing `limitExcludedAll` re-rank pattern already in `find-hedges.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reflowed the "no-books-covered" body copy onto one source line so the plan's own grep can match it**
- **Found during:** Task 3, self-verification of `grep -n "Add more books to see more opportunities." src/components/finder/EmptyState.tsx src/components/arb/ArbEmptyState.tsx`
- **Issue:** Wrapping the sentence across two JSX lines (matching the file's existing line-wrapping style) meant the single-line grep pattern this plan's acceptance criteria implies found zero matches, even though the rendered copy is identical (JSX collapses whitespace at render time). Same self-consistency issue Plans 02/03/04 hit and fixed the same way.
- **Fix:** Reflowed the sentence onto one source line in both files; no wording or rendered-output change.
- **Files modified:** src/components/finder/EmptyState.tsx, src/components/arb/ArbEmptyState.tsx
- **Verification:** `grep -n "Add more books to see more opportunities." src/components/finder/EmptyState.tsx src/components/arb/ArbEmptyState.tsx` now matches both files.
- **Committed in:** 7bec55d (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 self-consistency fix to satisfy the plan's own grep-based acceptance criteria)
**Impact on plan:** Cosmetic line-wrapping only; no behavior or rendered-copy change. No scope creep.

## Issues Encountered

None.

## User Setup Required

None — no new environment variables or external services; reuses the `user_books` table, session infrastructure, and `getBonusBooks`/`getHedgeBookKeys` allowedKeys seam already live from Plans 01/04.

## Next Phase Readiness

- BONUS-02 (phase success criterion 3) is closed: the bonus-bet finder and the Arbitrage tab both only ever suggest bets at the logged-in user's own books, on every leg and in the "Multiple books" tie list.
- The "requireUser() first, thread the user's preference set through an existing allowedKeys-shaped query, recompute an 'excluded by your selection' flag only when the primary result is already empty" pattern is available for any future action with the same shape.
- No blockers. This closes out Phase 2 (Private Access & My Books)'s remaining plan.

## Self-Check: PASSED

All 11 modified files verified present on disk with expected content; all 3 task commits (68a5e06, 86c4971, 7bec55d) verified present in git log.

---
*Phase: 02-private-access-my-books*
*Completed: 2026-09-26*
