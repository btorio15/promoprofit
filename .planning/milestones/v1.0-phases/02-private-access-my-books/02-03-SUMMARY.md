---
phase: 02-private-access-my-books
plan: 03
subsystem: auth
tags: [iron-session, drizzle, credit-attribution, shared-component]

requires:
  - phase: 02-private-access-my-books (Plan 01)
    provides: users schema, credit_usage.triggeredByUserId column, src/lib/session.ts (requireUser)
  - phase: 02-private-access-my-books (Plan 02)
    provides: login/proxy gate, AppHeader/AccountMenu
provides:
  - refreshOdds/refreshSpreadsTotals gated by requireUser() before any lock/gate/API/credit call (closes 01.1 review WR-05)
  - credit_usage rows attributed to the triggering user via triggeredByUserId (CLI runs record null)
  - store.getSpendAttribution(recordedAt) -> display name lookup, selecting only users.display_name
  - OddsStatus.oddsRefreshedBy / extendedSearchedBy, rendered via oddsAge.withAttribution in OddsStatusBar
  - src/components/RiskAdvisory.tsx, the single shared source of the account-risk advisory, used by both ArbForm and FinderForm
affects: [02-04 (settings page), 02-05 (finder/arb book filtering)]

tech-stack:
  added: []
  patterns:
    - "Attribution is keyed by exact timestamp equality: a refresh commits its cache rows' fetched_at and its credit_usage.recorded_at with the SAME `now`, so getSpendAttribution(fetchedAt) reliably names the user who produced the currently-displayed odds/spreads-totals"
    - "withAttribution(label, verb, displayName) returns the label unchanged (never a dash/unknown placeholder) when displayName is null -- same discipline as the rest of the status bar's null-handling"

key-files:
  created:
    - src/components/RiskAdvisory.tsx
  modified:
    - src/app/actions/refresh-odds.ts
    - src/app/actions/refresh-spreads-totals.ts
    - src/app/actions/refresh-odds.test.ts
    - src/app/actions/refresh-spreads-totals.test.ts
    - src/ingestion/odds/refresh.ts
    - src/ingestion/odds/refreshExtended.ts
    - src/ingestion/odds/refreshExtended.test.ts
    - src/ingestion/odds/store.ts
    - src/ingestion/odds/status.ts
    - src/ingestion/odds/status.test.ts
    - src/components/finder/oddsAge.ts
    - src/components/finder/oddsAge.test.ts
    - src/components/finder/OddsStatusBar.tsx
    - src/components/arb/ArbForm.tsx
    - src/components/finder/FinderForm.tsx

key-decisions:
  - "requireUser() is called only from the two server actions (refresh-odds.ts, refresh-spreads-totals.ts), never from refresh.ts/refreshExtended.ts themselves -- keeps scripts/refresh-odds.ts (the CLI path) free of any next/headers/iron-session dependency, and CLI runs simply omit triggeredByUserId, recording null"
  - "getSpendAttribution looks up by credit_usage.recorded_at equality against the cache's own fetched_at, not 'most recent row overall' -- so the Odds tab and the Arbitrage tab's spreads/totals line can each correctly name a different user when they were last refreshed by different people"

patterns-established:
  - "A shared warning/advisory component (RiskAdvisory) lives at src/components/ root (not under finder/ or arb/) since both tabs render it identically -- future cross-tab shared copy should follow the same placement"

requirements-completed: [DASH-04, CALC-06]

duration: 5min
completed: 2026-09-26
---

# Phase 2 Plan 3: Shared Credits Are Members-Only and Attributed Summary

**Login-gated refresh/search actions with per-spend user attribution surfaced as "Refreshed by / Searched by {name}" in the status bar, plus a shared RiskAdvisory component now warning bonus-bet finder users the same way the Arbitrage tab already does.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-26T09:28:35Z (first test run)
- **Completed:** 2026-09-26T09:32:40Z (last commit)
- **Tasks:** 3 completed
- **Files modified:** 16 (1 created, 15 modified)

## Accomplishments
- `refreshOdds`/`refreshSpreadsTotals` now call `requireUser()` as their first statement -- before `safeParse`, the refresh lock, the credit gate, or any Odds API call -- so a logged-out request can never spend shared credits (D-20, closes 01.1 review WR-05)
- Every user-triggered credit spend records `triggeredByUserId` in `credit_usage`, sourced only from the server session, never client input (D-21, T-02-20); `scripts/refresh-odds.ts`'s CLI path is untouched and continues to record `null`
- `store.getSpendAttribution(recordedAt)` resolves a credit_usage row's user by exact `recorded_at` match, selecting only `users.display_name` (T-02-19) -- never email or password hash
- `getOddsStatus` exposes `oddsRefreshedBy`/`extendedSearchedBy`, looked up independently by each cache's own `fetched_at` so the moneyline age line and the spreads/totals age line can correctly name two different people
- `oddsAge.withAttribution` appends " · Refreshed by {name}" / " · Searched by {name}" to the existing age label, and is a no-op (returns the label unchanged) when there's no known attribution -- never a placeholder like "Refreshed by —"
- New `src/components/RiskAdvisory.tsx` is the single copy source for the account-risk advisory; `ArbForm` now renders it (no visual change) and `FinderForm` renders it above results once a search has been made, closing CALC-06/D-23

## Task Commits

1. **Task 1: Credit-spending actions require a session and record who triggered them** - `ed87126` (feat)
2. **Task 2: Show "Refreshed by / Searched by" next to the odds age** - `ede9489` (test, RED), `ad1256d` (feat, GREEN)
3. **Task 3: Finder shows the Arbitrage tab's account-risk advisory (CALC-06)** - `3ceeca4` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/components/RiskAdvisory.tsx` - shared account-risk advisory Alert, single copy source (CALC-06, D-23)
- `src/app/actions/refresh-odds.ts` / `refresh-spreads-totals.ts` - `requireUser()` first statement, `triggeredByUserId` threaded to the runner
- `src/app/actions/refresh-odds.test.ts` / `refresh-spreads-totals.test.ts` - session mock, logged-out and attribution cases
- `src/ingestion/odds/refresh.ts` / `refreshExtended.ts` - `triggeredByUserId?: number | null` opt threaded into `recordCreditUsage`
- `src/ingestion/odds/refreshExtended.test.ts` - CLI-path null-attribution + explicit-attribution cases
- `src/ingestion/odds/store.ts` - `CreditUsageRow.triggeredByUserId`, new `getSpendAttribution`
- `src/ingestion/odds/status.ts` / `status.test.ts` - `oddsRefreshedBy`/`extendedSearchedBy` fields
- `src/components/finder/oddsAge.ts` / `oddsAge.test.ts` - new `withAttribution` helper
- `src/components/finder/OddsStatusBar.tsx` - both age lines rendered through `withAttribution`
- `src/components/arb/ArbForm.tsx` - inline advisory Alert replaced with `<RiskAdvisory />`
- `src/components/finder/FinderForm.tsx` - `<RiskAdvisory />` rendered above results once `hasSearched`

## Decisions Made
- Kept `requireUser()` calls confined to the two server actions rather than pushing them into `refresh.ts`/`refreshExtended.ts`, so the CLI script and its tests never need `next/headers`/`iron-session` in scope.
- `getSpendAttribution` matches on exact `recorded_at` equality (not "most recent row") since the two caches (moneyline vs. spreads/totals) can each have their own last-refreshing user.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded oddsAge.ts's `withAttribution` doc comment to avoid tripping its own acceptance-criteria grep**
- **Found during:** Task 2, self-verification of `grep -rn "Refreshed by —\|Refreshed by unknown" -r src`
- **Issue:** The doc comment explaining what `withAttribution` does NOT render contained the literal placeholder strings the grep is designed to catch in rendered UI copy
- **Fix:** Reworded to describe the same intent ("never a dash or 'unknown' placeholder appended after the verb") without the flagged literals; no functional change
- **Files modified:** src/components/finder/oddsAge.ts
- **Verification:** `grep -rn "Refreshed by —\|Refreshed by unknown" -r src` returns no match
- **Committed in:** ad1256d (Task 2 GREEN commit)

**2. [Rule 1 - Bug] Put the RiskAdvisory sentence on one source line so the plan's grep can match it**
- **Found during:** Task 3, self-verification of `grep -rl "known pattern sportsbooks use to detect" src`
- **Issue:** Wrapping the copy across two source lines (matching ArbForm's original formatting) meant the single-line grep pattern the plan's own verification depends on found zero matches, not one
- **Fix:** Reflowed the JSX text onto a single line (JSX collapses whitespace at render time, so the rendered copy is identical); no wording change
- **Files modified:** src/components/RiskAdvisory.tsx
- **Verification:** `grep -rl "known pattern sportsbooks use to detect" src` now prints exactly `src/components/RiskAdvisory.tsx`
- **Committed in:** 3ceeca4 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 self-consistency fixes to satisfy the plan's own grep-based acceptance criteria)
**Impact on plan:** Cosmetic doc-comment/line-wrapping only; no behavior or rendered-copy change. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no new environment variables or external service configuration; reuses `SESSION_SECRET`/session infra from Plan 01/02, and the `credit_usage.triggered_by_user_id` column already live-migrated in Plan 01.

## Next Phase Readiness

- WR-05 (01.1 review) is closed: both credit-spending server actions are login-only.
- `getSpendAttribution`/`withAttribution` establish the attribution pattern any future credit-spending action should reuse.
- `RiskAdvisory` is available for any future tab that needs the same warning.
- No blockers. No new database migrations were needed (the `triggered_by_user_id` column shipped in Plan 01's 0003 migration).

## Self-Check: PASSED

All 16 files listed under Files Created/Modified verified present on disk (created or modified as expected); all 4 commits (ed87126, ede9489, ad1256d, 3ceeca4) verified present in git log.

---
*Phase: 02-private-access-my-books*
*Completed: 2026-09-26*
