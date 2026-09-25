---
phase: 01-bonus-bet-finder
plan: 05
subsystem: ui
tags: [react, next.js, server-actions, shadcn, vitest]

# Dependency graph
requires:
  - phase: 01-bonus-bet-finder (Plan 03)
    provides: FinderForm, ResultsList, ResultRow (finder UI shell, Same-book/Tie-risk badges)
  - phase: 01-bonus-bet-finder (Plan 04)
    provides: refreshOdds server action, getLatestCreditUsage, quota.ts thresholds, getOddsFreshness
provides:
  - "describeOddsAge pure helper + getOddsStatus server loader (odds age, credit meter data, never hardcoded credit estimate)"
  - "OddsStatusBar: sticky age/credit meter with Refresh odds button (pending/confirm/blocked/error states)"
  - "CreditBanner: amber warning / red blocked alerts driven by quota.ts thresholds"
  - "RefreshConfirmDialog: shadcn AlertDialog for the D-10 15-minute re-refresh confirmation (no window.confirm)"
  - "FinderScreen composition owning recomputeKey, wired to FinderForm for post-refresh recompute (ODDS-04)"
  - "Sport tabs over ranked results (owner-requested scope change) replacing the per-search sport form field"
  - "Owner sign-off on NFL moneyline 'Tie risk' disclosure badge (CALC-05 / RESEARCH.md Open Question 1), closing the last open research question"
affects: [04-opportunities-feed]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side age timer recomputes only a label from an already-loaded timestamp; never fetches (ODDS-01 no-polling grep gate)"
    - "Server-authoritative refresh gate: client disabled state is UX only, refreshOdds() re-evaluates the credit gate on every call"
    - "findHedges returns top 10 overall plus top 10 per sport, independently ranked, so sport tabs filter client-side without a second server round-trip"

key-files:
  created:
    - src/components/finder/oddsAge.ts
    - src/components/finder/oddsAge.test.ts
    - src/ingestion/odds/status.ts
    - src/ingestion/odds/status.test.ts
    - src/components/finder/OddsStatusBar.tsx
    - src/components/finder/CreditBanner.tsx
    - src/components/finder/RefreshConfirmDialog.tsx
    - src/components/finder/FinderScreen.tsx
    - src/components/ui/tabs.tsx
  modified:
    - src/components/finder/FinderForm.tsx
    - src/components/finder/ResultsList.tsx
    - src/components/finder/EmptyState.tsx
    - src/app/actions/find-hedges.ts
    - src/app/actions/find-hedges.test.ts
    - src/app/actions/refresh-odds.test.ts
    - src/domain/finder/finderInput.ts
    - src/domain/finder/types.ts
    - src/app/page.tsx

key-decisions:
  - "Sport filter moved from a form input to tabs over the results list; findHedges now computes and returns top 10 overall plus top 10 per in-season sport independently, so switching tabs is instant with no re-submit (owner-requested scope change, not a plan deviation)"
  - "Owner accepted the CALC-05 NFL moneyline 'Tie risk' disclosure badge over excluding NFL entirely -- research Open Question 1 resolved, no code change required"

requirements-completed: [ODDS-02, ODDS-03, ODDS-04]

# Metrics
duration: 35min
completed: 2026-09-25
---

# Phase 01 Plan 05: Finder UI Refresh Loop & Phase Walkthrough Summary

**Sticky odds-age/credit-meter status bar with a guarded Refresh odds button (15-min confirm dialog, credit block, error retry, and post-refresh recompute), plus owner-approved sport tabs and NFL tie-risk disclosure sign-off closing out all five Phase 1 success criteria.**

## Performance

- **Duration:** 35 min (prior session Tasks 1-2 + this continuation's Task 3 record + summary)
- **Started:** 2026-09-25T20:12:00Z (approx, per STATE.md session continuity)
- **Completed:** 2026-09-25T21:05:00Z (approx, checkpoint approval)
- **Tasks:** 3 (2 TDD/auto tasks + 1 human-verify checkpoint) plus 1 owner-requested mid-plan scope change
- **Files modified:** 9 created, 9 modified

## Accomplishments
- Built `describeOddsAge` (pure) and `getOddsStatus` (server loader combining `getOddsFreshness` + `getLatestCreditUsage`) so the finder page shows real odds age and credit balance with zero client-side fetching
- Built `OddsStatusBar` (sticky, amber past 2h per D-12) and `CreditBanner` (amber warning under 100 credits, red blocked under 20, per D-11) with no hardcoded credit estimates
- Built the D-10 15-minute re-refresh confirmation as a shadcn `AlertDialog` (`RefreshConfirmDialog`) -- never `window.confirm`
- Wired `Refresh odds` through `useTransition` into `refreshOdds()`, handling `ok` / `confirm_required` / `blocked` / `error` outcomes, with a `Try again` retry path and cached results staying visible throughout (D-13)
- Composed `FinderScreen` to own `recomputeKey`, incrementing it after a successful refresh so `FinderForm` re-submits the last search and results recompute against the fresh cache (ODDS-04)
- Owner-requested scope change mid-plan: replaced the per-search sport dropdown with sport tabs rendered over the results; `findHedges` now independently ranks and returns top 10 overall plus top 10 per in-season sport so tab switches are instant
- Ran the full phase walkthrough (steps 1-6) in the browser; owner approved the end-to-end flow and signed off on the CALC-05 NFL "Tie risk" disclosure treatment (step 7), resolving RESEARCH.md Open Question 1 with no code change

## Task Commits

Each task was committed atomically:

1. **Task 1: Odds age and credit meter visible on the finder page** - `9b1df73` (feat, TDD RED+GREEN)
2. **Scope change (owner request): sport tabs replace per-search sport filter** - `3a84268` (feat)
3. **Task 2: Refresh odds button, 15-min confirm dialog, block/error, recompute** - `869890e` (feat)
4. **Task 3: Phase walkthrough checkpoint** - no code commit (owner approved; dev server was already running and returned 200 before and after the pause)

**Plan metadata:** (this commit) `docs(01-05): complete finder UI refresh loop and phase walkthrough`

_Note: Tasks 1-2 and the scope change were completed by the previous executor session; commits `9b1df73`, `3a84268`, and `869890e` verified present in git log before continuing this session._

## Files Created/Modified
- `src/components/finder/oddsAge.ts` - `describeOddsAge` pure helper, `STALE_AFTER_MINUTES = 120` (D-12)
- `src/components/finder/oddsAge.test.ts` - Table-driven tests for age labels and staleness boundary
- `src/ingestion/odds/status.ts` - `getOddsStatus` server loader combining freshness + credit usage, upper-bound estimate fallback
- `src/ingestion/odds/status.test.ts` - Tests for normal/unknown credit levels and estimate fallback (never hardcoded)
- `src/components/finder/OddsStatusBar.tsx` - Sticky age line + credit Progress meter + Refresh odds button with pending/confirm/blocked/error states
- `src/components/finder/CreditBanner.tsx` - Amber warning / red blocked Alert banners
- `src/components/finder/RefreshConfirmDialog.tsx` - shadcn AlertDialog for the D-10 15-min confirmation
- `src/components/finder/FinderScreen.tsx` - Composes status bar, banner, and form; owns `recomputeKey`
- `src/components/ui/tabs.tsx` - shadcn Tabs primitive added for the sport-tab scope change
- `src/components/finder/FinderForm.tsx` - `recomputeKey` prop triggers re-submit of the last search; sport field removed from form
- `src/components/finder/ResultsList.tsx` - Renders sport tabs over ranked rows using the per-sport top-10 lists
- `src/components/finder/EmptyState.tsx` - Updated copy for the tabbed-results layout
- `src/app/actions/find-hedges.ts` - Returns top 10 overall plus top 10 per in-season sport, independently ranked
- `src/domain/finder/finderInput.ts`, `src/domain/finder/types.ts` - Schema/type updates for the sport-tabs response shape
- `src/app/page.tsx` - Renders `FinderScreen` in place of separately-placed status/banner/form components

## Decisions Made
- Sport filter moved from a form input to tabs over the results, with `findHedges` computing top 10 overall and top 10 per sport independently -- owner-requested during this plan, tracked as a scope change (not a deviation) since it changes UX shape rather than fixing/adding correctness behavior
- Owner accepted the CALC-05 NFL moneyline "Tie risk" disclosure badge (implemented in 01-01/01-03) over excluding NFL rows, resolving RESEARCH.md Open Question 1 -- "approved. the tie is fine"

## Deviations from Plan

None - Tasks 1 and 2 executed as written. The sport-tabs change was an owner-requested scope change made explicit before Task 2 landed, not an unplanned auto-fix, so it is not logged under deviation rules.

## Issues Encountered

None. This continuation re-verified the prior session's work cheaply (no Odds API calls): `npx vitest run` (10 files / 80 tests passing), `npx tsc --noEmit` (clean), `npm run lint` (clean). The dev server (`next dev`, PID from a prior `npm run dev` invocation) was already running and returned HTTP 200 at the start of this continuation; it was left untouched per instructions rather than restarted.

### Owner Walkthrough Results (this continuation)

- Steps 1-6 (status bar, ranked hedge search, expand-panel profit-equality check, sport tabs with tie-risk badge, refresh confirm/cancel/refresh-anyway cycle, mobile 375px layout) all approved by the owner.
- Step 7 (CALC-05 sign-off): owner response "approved. the tie is fine" -- NFL moneylines continue to ship with the "Tie risk" disclosure badge rather than exclusion. RESEARCH.md Open Question 1 is now fully resolved (previously marked RESOLVED pending sign-off; sign-off now recorded here).
- Credits: this executor made zero Odds API calls. Per Plan 04's summary, 496 of 500 monthly credits remained before this walkthrough; the owner may have spent a small number (roughly 1 credit per in-season sport, ~4) pressing "Refresh anyway" during step 5 of the walkthrough. Exact post-walkthrough balance was not re-queried to avoid spending additional credits confirming it -- next refresh's `OddsStatusBar` will show the authoritative current balance.

## User Setup Required

None - `ODDS_API_KEY` and `DATABASE_URL` were already present and working in `.env.local` (confirmed in Plan 04).

## Next Phase Readiness
- All five ROADMAP Phase 1 success criteria are now observable and owner-approved in the running app: ranked hedge search with exact stakes, cent-equal guaranteed profit, 2-way no-push market filtering with NFL tie-risk disclosure, guarded refresh with recompute, and visible credit/age status
- REQUIREMENTS.md Phase 1 traceability: CALC-01, CALC-04, CALC-05, ODDS-01, ODDS-02, ODDS-03, ODDS-04, ODDS-05, BONUS-01 all complete -- Phase 1 requirements fully satisfied
- Phase 2 (Private Access & My Books) can build directly on `FinderScreen`/`FinderForm` to scope hedge suggestions to a user's selected books (BONUS-02) once auth and book-selection land
- No blockers carried forward from this plan

---
*Phase: 01-bonus-bet-finder*
*Completed: 2026-09-25*

## Self-Check: PASSED

- FOUND: src/components/finder/oddsAge.ts
- FOUND: src/components/finder/oddsAge.test.ts
- FOUND: src/ingestion/odds/status.ts
- FOUND: src/ingestion/odds/status.test.ts
- FOUND: src/components/finder/OddsStatusBar.tsx
- FOUND: src/components/finder/CreditBanner.tsx
- FOUND: src/components/finder/RefreshConfirmDialog.tsx
- FOUND: src/components/finder/FinderScreen.tsx
- FOUND: src/components/ui/tabs.tsx
- FOUND commit: 9b1df73 (Task 1)
- FOUND commit: 3a84268 (scope change)
- FOUND commit: 869890e (Task 2)
- `npx vitest run`: 10 files / 80 tests passed
- `npx tsc --noEmit`: clean
- `npm run lint`: clean
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`: 200
