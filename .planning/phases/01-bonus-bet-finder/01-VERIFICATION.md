---
phase: 01-bonus-bet-finder
verified: 2026-09-25T23:59:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Press 'Refresh odds' once (or run `npm run odds:refresh`) now that migration 0001 (refresh_lock table) is applied to the live Neon DB, and confirm a normal single refresh completes with status ok — not blocked/error/busy."
    expected: "Refresh succeeds, the credit meter updates, and the status bar age resets to '0 min ago'. No 'Couldn't refresh odds' generic error (the failure mode REVIEW-FIX.md documented before the migration was applied)."
    why_human: "WR-03's tryAcquireRefreshLock/releaseRefreshLock code path (drizzle/0001_amazing_northstar.sql) has never been exercised against the live database — it is only covered by unit tests against a mocked DB client. REVIEW-FIX.md explicitly flags this as 'requires human verification (concurrency logic; needs npm run db:migrate)'. The verifier cannot make a live Odds API call (credit budget), so this is the one remaining untested path between the code and production."
---

# Phase 1: Bonus Bet Finder Verification Report

**Phase Goal:** A user can enter a bonus bet they have at a book and see, from real cached Colorado odds, the best market to convert it and the best book to hedge at, with exact stakes and guaranteed profit.
**Verified:** 2026-09-25
**Status:** human_needed
**Re-verification:** No — initial verification

## User Flow Coverage (MVP mode)

**User Story (from plan frontmatter):** As a group member holding a bonus bet at a Colorado sportsbook, I want to enter the book and bonus amount and see the best market to convert it on and the best book to hedge at, so that I can lock in a guaranteed profit with exact stakes computed from real cached Colorado odds.

| Step | Expected | Evidence in codebase | Status |
|---|---|---|---|
| Enter book + bonus amount | `FinderForm` book Select (7 free-tier books only) + amount Input, RHF+Zod validated | `src/components/finder/FinderForm.tsx:120-157`, `src/domain/finder/finderInput.ts` | VERIFIED |
| See ranked conversion markets | `findHedges` returns top-10 (+ per-sport top-10) ranked by guaranteed profit | `src/app/actions/find-hedges.ts:86-139`, `src/domain/hedge/rankBonusBetHedges.ts:105-139`, e2e test passes | VERIFIED |
| See hedge book, both stakes, guaranteed profit, conversion % per row | `ResultRow` renders bonus/hedge leg, `formatUsd(guaranteedProfit)`, `formatPct(conversionPct)` | `src/components/finder/ResultRow.tsx:20-92` | VERIFIED |
| Stakes/profit exact to the cent, same regardless of winner | `calculateBonusBetHedge` decimal.js solver, fixture-tested incl. the two roadmap-cited examples | `src/domain/hedge/bonusBet.ts`, `src/domain/hedge/bonusBet.test.ts:20-46` | VERIFIED |
| Only 2-way, no-push markets considered | `extractTwoWayMoneylines`: h2h only, exactly 2 outcomes, names must match home/away | `src/domain/hedge/marketFilter.ts:35-89` | VERIFIED |
| Press refresh, recompute, see age/timestamp between refreshes | `OddsStatusBar` → `refreshOdds` → `FinderScreen.recomputeKey` → `FinderForm` re-submits last search | `src/components/finder/OddsStatusBar.tsx`, `FinderScreen.tsx`, `FinderForm.tsx:88-106` | VERIFIED (owner walkthrough already approved this flow pre-fix; see note below) |
| See remaining credits, blocked/warned before exhausting budget | `CreditBanner`/`OddsStatusBar` thresholds (warn<100, block<20), `evaluateRefreshGate` | `src/ingestion/odds/quota.ts:7-78`, `src/components/finder/CreditBanner.tsx` | VERIFIED |
| Book list w/ Odds API keys verified live | `usableOddsBooks()` + `scripts/odds-smoke.ts` checked against live API in 01-04 (owner-approved) | `src/config/books.ts`, `scripts/odds-smoke.ts` | VERIFIED (live smoke test already run/approved) |

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | User enters book + bonus amount, sees ranked list with hedge book, both stakes, guaranteed profit, conversion % | VERIFIED | `FinderForm` → `findHedges` → `ResultsList`/`ResultRow` render all required fields; `find-hedges.test.ts` e2e happy path passes (100/100 tests green) |
| 2 | Guaranteed profit identical to the cent whichever leg wins, matches documented fixtures ($100@+300/-275→$220/$80/80%) | VERIFIED | `bonusBet.test.ts` fixture "reference fixture" asserts exactly `hedgeStake=220.00, guaranteedProfit=80.00, conversionPct=80.00`; second fixture `$50@+290/-310→$109.63/$35.36 (lower of the two nets)` also matches roadmap's cent-rounding example verbatim |
| 3 | Hedge search only considers 2-way, no-push markets | VERIFIED | `extractTwoWayMoneylines` requires `h2h` market key, `outcomes.length === 2`, and outcome names to match `home_team`/`away_team` exactly; unit-tested (`marketFilter.test.ts`, 8 cases incl. 3rd-outcome rejection and name-mismatch rejection) |
| 4 | Refresh button re-fetches + recomputes; between refreshes last results + age shown | VERIFIED | `refreshOdds` server action → `runOddsRefresh`; `OddsStatusBar` shows sticky age label (`describeOddsAge`, amber past 120 min) and calls `onRefreshed` → `FinderScreen.recomputeKey` → `FinderForm` silently re-submits last search (`ODDS-04: findHedges recomputes from the current cache` test passes). Owner-approved live walkthrough already exercised this end-to-end (01-05 Task 3, per phase context) |
| 5 | Credit meter shown, blocked/warned before exhausting budget; book list (incl. theScore Bet) configured + live-verified | VERIFIED | `CreditBanner`/`OddsStatusBar` implement warn(<100)/block(<20) per `quota.ts` thresholds; `src/config/books.ts` lists `espnbet: "theScore Bet"` with rebrand note; `scripts/odds-smoke.ts` performs the live ODDS-05 verification (already run and approved in 01-04 per phase context) |

**Score:** 5/5 roadmap success criteria verified; 9/9 plan-level must-have truths verified (see below).

### Plan-Level Must-Have Truths (01-01 through 01-05 frontmatter)

All must_haves truths across the five PLAN.md files were checked individually against source and/or passing tests:

| Plan | Truth (abbreviated) | Status |
|---|---|---|
| 01-01 | `npm run dev`/`build` work | VERIFIED (`npm run build` succeeds, confirmed live) |
| 01-01 | $100@+300/-275 → $220.00/$80.00/80.00% | VERIFIED (fixture test) |
| 01-01 | $50@+290/-310 → $109.63/$35.36 (lower net) | VERIFIED (fixture test) |
| 01-01 | Only h2h, 2-outcome, home/away-matched, 7-day-window markets | VERIFIED (`marketFilter.ts` + tests) |
| 01-01 | NFL rows carry `tieRisk` flag, not excluded | VERIFIED (`isTieRiskSport`, `marketFilter.test.ts`) |
| 01-01 | Ranking returns ≤10, one per game, best-priced hedge book, bonus book can be hedge book | VERIFIED (`rankBonusBetHedges.ts` + tests incl. "allows the bonus book to also be the hedge book (D-17)") |
| 01-01 | Failing e2e test exists at `find-hedges.test.ts` | VERIFIED (now green, per 01-02) |
| 01-02 | `findHedges` reads Postgres cache, returns top 10, zero Odds API calls | VERIFIED (`find-hedges.ts:86-139`, no odds-client import) |
| 01-02 | Invalid input → `status: invalid` with field errors | VERIFIED (tests: zero amount, uncovered book) |
| 01-02 | Books table seeded from `src/config/books.ts` | VERIFIED (`db:check` shows 13 seeded rows incl. `espnbet: theScore Bet`) |
| 01-02 | `books`/`cached_odds`/`credit_usage` tables via committed migrations | VERIFIED (`drizzle/0000_opposite_manta.sql`; live DB confirmed via read-only `information_schema.tables` query: `books, cached_odds, credit_usage, refresh_lock`) |
| 01-02 | E2E finder test green | VERIFIED |
| 01-03 | Finder UI: book dropdown (7 free-tier only), amount, up to 10 ranked rows | VERIFIED (`FinderForm.tsx`, `getBonusBooks()`) |
| 01-03 | Compact row shows game/time, bonus+hedge sides, profit, conversion % | VERIFIED (`ResultRow.tsx`) |
| 01-03 | Expand panel: Display-size profit, A/B steps, per-outcome table | VERIFIED (`ResultDetails.tsx`) |
| 01-03 | Same-book badge + NFL tie-risk note | VERIFIED (`ResultRow.tsx:45-71`) |
| 01-03 | Sport filter limits results | VERIFIED as client-side tabs (owner-requested scope change, `ResultsList.tsx`) — see Gaps note below (deviation, not a gap) |
| 01-03 | Empty/error states use UI-SPEC copy | MOSTLY VERIFIED — `EmptyState.tsx` "All" tab text still references a removed "sport filter" (IN-02, unfixed Info finding); cosmetic only, not a goal blocker |
| 01-04 | Refresh fetches h2h for in-season D-01 sports, skips out-of-season via `/sports`, replaces cache | VERIFIED (`refresh.ts:95-171`, tests) |
| 01-04 | D-15: bookmakers= covers every free-tier CO book | VERIFIED (`usableOddsBooks()` used for fetch) |
| 01-04 | No auto-polling; only `refreshOdds` action / `odds:refresh` CLI | VERIFIED (`grep setInterval` shows only the client-side 60s label-tick timer, no fetch/action call inside it) |
| 01-04 | Every refresh persists remaining/used to `credit_usage` | VERIFIED (`recordCreditUsage`, WR-02 fix moves capture before cache write) |
| 01-04 | Refresh blocked <20 credits or insufficient estimate; 15-min confirm window | VERIFIED (`quota.ts` thresholds + `evaluateRefreshGate`, unit tests) |
| 01-04 | After refresh, `findHedges` computes from new cache | VERIFIED (`ODDS-04` test, `revalidatePath("/")`) |
| 01-04 | Book config live-verified incl. theScore Bet, paid-only confirmed absent | VERIFIED (`odds-smoke.ts`; live-run and approved per 01-04 SUMMARY / phase context) |
| 01-05 | Sticky status bar: age label, amber+"Refresh before betting" after 2h | VERIFIED (`OddsStatusBar.tsx`, `STALE_AFTER_MINUTES=120`) |
| 01-05 | Credit meter text, amber<100/red<20, refresh disabled when blocked | VERIFIED (`CreditBanner.tsx`, `OddsStatusBar.tsx:132`) |
| 01-05 | 15-min re-refresh confirm dialog (AlertDialog, not window.confirm) | VERIFIED (`RefreshConfirmDialog.tsx`) |
| 01-05 | Post-refresh: age resets, credit meter updates, search recomputes; between refreshes last results stay | VERIFIED (`recomputeKey` wiring) |
| 01-05 | Failed refresh: UI-SPEC error copy + Try again, cached results stay visible | VERIFIED (`OddsStatusBar.tsx:97-100,169-178`) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/domain/hedge/bonusBet.ts` | `calculateBonusBetHedge` decimal solver | VERIFIED | Exports match; fixture-tested |
| `src/domain/hedge/marketFilter.ts` | `extractTwoWayMoneylines` (CALC-05 filter) | VERIFIED | Exports match; 8 unit tests |
| `src/domain/hedge/rankBonusBetHedges.ts` | Top-10 ranking | VERIFIED | Exports match; 7 unit tests |
| `src/config/books.ts` | CO book config, single source of truth | VERIFIED | `usableOddsBooks()`/`smokeTestBookKeys()`; now also the sole runtime source for `getBonusBooks`/`getHedgeBookKeys` (WR-05 fix) |
| `src/db/schema.ts` | `books`, `cached_odds`, `credit_usage` (+ `refresh_lock`) tables | VERIFIED | `pgTable("cached_odds"...)` present; live DB has all 4 tables |
| `src/db/queries.ts` | `getBonusBooks`, `getHedgeBookKeys`, `getCachedEvents`, `getOddsFreshness` | VERIFIED | All exported and used |
| `src/app/actions/find-hedges.ts` | `findHedges` server action | VERIFIED | Exported, used by `FinderForm` |
| `drizzle/` | Generated, committed SQL migrations | VERIFIED | `0000_opposite_manta.sql`, `0001_amazing_northstar.sql`, both applied live |
| `scripts/seed.ts` | Book upsert + guarded fixture seed | VERIFIED | `ALLOW_FIXTURE_SEED=1` + no-live-data guard (`fixtureSeedGuard.ts`, WR-04 fix) |
| `src/app/page.tsx` | Finder page (force-dynamic) | VERIFIED | `export const dynamic = "force-dynamic"` |
| `src/components/finder/FinderForm.tsx` | RHF+Zod form calling `findHedges` | VERIFIED | Contains `findHedges(` |
| `src/components/finder/ResultDetails.tsx` | Expanded per-outcome table | VERIFIED | Contains "Net profit" |
| `src/lib/format.ts` | `formatUsd`, `formatAmerican`, `formatPct`, `formatKickoff` | VERIFIED | All exported, tested |
| `src/ingestion/odds/client.ts` | `listSports`, `fetchSportOdds`, `parseQuotaHeaders`, `OddsApiError` | VERIFIED | All exported; key-safe error tested |
| `src/ingestion/odds/quota.ts` | Credit thresholds/gate | VERIFIED | All exports present, incl. `effectiveRemaining` (CR-01 fix) |
| `src/ingestion/odds/refresh.ts` | `runOddsRefresh` orchestration | VERIFIED | Includes lock acquire/release (WR-03) |
| `src/app/actions/refresh-odds.ts` | `refreshOdds` server action | VERIFIED | Revalidates `/` on success |
| `scripts/odds-smoke.ts` | ODDS-05 live bookmaker-key verification | VERIFIED | Reports present/absent per tier |
| `src/components/finder/oddsAge.ts` | `describeOddsAge` pure helper | VERIFIED | Exports match |
| `src/ingestion/odds/status.ts` | `getOddsStatus` server loader | VERIFIED | Exports match |
| `src/components/finder/OddsStatusBar.tsx` | Sticky age/credit/refresh bar | VERIFIED | Contains "Refresh odds" |
| `src/components/finder/RefreshConfirmDialog.tsx` | D-10 confirmation | VERIFIED | Contains `AlertDialog` |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `find-hedges.ts` | `db/queries.ts` | `getCachedEvents`/`getBonusBooks`/`getHedgeBookKeys` | WIRED | All three called |
| `find-hedges.ts` | `rankBonusBetHedges.ts` | `rankBonusBetHedges(` over `extractTwoWayMoneylines` output | WIRED | `rankForSportKeys` composes both |
| `FinderForm.tsx` | `find-hedges.ts` | server action call in `startTransition` | WIRED | `findHedges(values)` inside `startTransition` |
| `page.tsx` | `db/queries.ts` | `getBonusBooks()` for dropdown | WIRED | `Promise.all([getBonusBooks(), ...])` |
| `OddsStatusBar.tsx` | `refresh-odds.ts` | `refreshOdds({ confirmed })` in transition | WIRED | Both direct call and via `RefreshConfirmDialog` |
| `FinderScreen.tsx` | `FinderForm.tsx` | `recomputeKey` prop increments after refresh | WIRED | `onRefreshed={() => setRecomputeKey(k => k+1)}` |
| `page.tsx` | `ingestion/odds/status.ts` | `getOddsStatus()` | WIRED | Called in `Promise.all` |
| `refresh-odds.ts` | `credit_usage` table | `recordCreditUsage` after fetching | WIRED | Called in `finally` block of `runGuardedRefresh` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `ResultsList`/`ResultRow` | `response.resultsBySport` | `findHedges` → `getCachedEvents()` → live Neon `cached_odds` table | Yes — `db:check` confirms 101 live future events, `fetchedAt` real timestamp; not a static/empty fallback | FLOWING |
| `OddsStatusBar` credit meter | `status.remaining`/`status.total` | `getOddsStatus()` → `getLatestCreditUsage()` (real `credit_usage` rows written by past live refreshes) | Yes | FLOWING |
| `FinderForm` book dropdown | `bonusBooks` | `getBonusBooks()` → `usableOddsBooks()` (static config, not a stub — intentionally static per D-14/D-16) | Yes (by design) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Unit test suite (hedge math, market filter, ranking, quota, e2e finder, refresh orchestration) | `npx vitest run` | 100/100 tests passed, 12 files | PASS |
| Type safety | `npx tsc --noEmit` | Clean, no output/errors | PASS |
| Lint | `npm run lint` | Clean, no violations | PASS |
| Production build | `npm run build` | Compiled successfully; `/` route correctly marked dynamic (ƒ) | PASS |
| Live DB reachability + seed state | `npm run db:check` (read-only) | 7 bonus books incl. `espnbet: theScore Bet`; 101 cached future events; real `fetched_at` timestamp | PASS |
| Live DB schema (migration 0001 applied) | Read-only `information_schema.tables` query via a scratch script (deleted after use) | Returns `books, cached_odds, credit_usage, refresh_lock` — confirms `refresh_lock` table from WR-03's migration exists on the live Neon DB | PASS |

No live Odds API calls were made during this verification (credit budget respected, per instructions).

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist in this repository and none are referenced by the phase's plans/summaries. SKIPPED (no probes declared for this phase).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| CALC-01 | 01-01, 01-03 | Bonus-bet hedge: exact stakes, guaranteed profit, conversion % | SATISFIED | `bonusBet.ts` + fixtures + `ResultDetails.tsx` display |
| CALC-04 | 01-01 | Guaranteed profit identical to the cent, known-answer fixtures | SATISFIED | `bonusBet.test.ts` reference fixture matches REQUIREMENTS.md example exactly |
| CALC-05 | 01-01, 01-03 | Only no-push markets (2-way moneylines) | SATISFIED | `marketFilter.ts` filter + NFL tie-risk disclosure |
| ODDS-01 | 01-02, 01-04 | Fetch + cache CO odds, no auto-poll | SATISFIED | `refresh.ts`, no `setInterval`/cron calling refresh |
| ODDS-02 | 01-04, 01-05 | Remaining credits visible, block/warn on low credits | SATISFIED | `quota.ts`, `CreditBanner.tsx`, `OddsStatusBar.tsx` |
| ODDS-03 | 01-05 | User sees odds age | SATISFIED | `oddsAge.ts`, sticky status bar |
| ODDS-04 | 01-04, 01-05 | Refresh button re-fetches + recomputes, shows last results+timestamp between | SATISFIED | `recomputeKey` wiring, `ODDS-04` test |
| ODDS-05 | 01-02, 01-04 | CO book list w/ Odds API keys (incl. theScore Bet) configured + live-verified | SATISFIED | `books.ts`, `odds-smoke.ts` (live-run, owner-approved per 01-04) |
| BONUS-01 | 01-01, 01-02, 01-03 | User enters book+amount, sees ranked conversion markets w/ hedge book, stakes, profit, conversion % | SATISFIED | Full e2e path verified above |

No orphaned requirements: REQUIREMENTS.md's Phase 1 mapping (CALC-01, CALC-04, CALC-05, ODDS-01..05, BONUS-01) exactly matches the union of `requirements:` fields declared across all five 01-*-PLAN.md files.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/components/finder/EmptyState.tsx` | 14 | Stale copy: "Clear the sport filter" — that filter was removed in 01-05's owner-requested scope change (sport became client-side tabs) | Info | Cosmetic only; shown on the "All" tab's no-results state. Documented as REVIEW.md IN-02, explicitly left unfixed ("Info findings out of scope" per REVIEW-FIX.md). Does not block any success criterion. |
| `src/lib/format.ts` | 7-12 | No timezone label on kickoff time (REVIEW.md IN-03) | Info | Unfixed, cosmetic; does not affect correctness of stakes/profit |
| `src/domain/finder/finderInput.ts` | 17-25 | Amount >$100,000 shows a generic "greater than $0" message instead of a max-specific one (REVIEW.md IN-04) | Info | Unfixed, cosmetic edge case |

No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers found in any phase-modified source file (`grep` scan of `src/` and `scripts/` came back empty).

### Human Verification Required

### 1. Live refresh after WR-03's refresh_lock migration

**Test:** Press "Refresh odds" in the browser once (or run `npm run odds:refresh` from the CLI) now that migration `0001_amazing_northstar.sql` (the `refresh_lock` table) has been applied to the live Neon DB.
**Expected:** The refresh completes with `status: "ok"` — the credit meter updates, the odds-age label resets to "Odds updated 0 min ago", and no generic "Couldn't refresh odds" error appears (the exact failure mode REVIEW-FIX.md documented as occurring *before* the migration was applied).
**Why human:** `tryAcquireRefreshLock`/`releaseRefreshLock` (the WR-03 fix) and the SQL-level `fetched_at = max(fetched_at)` filter (WR-01) are covered by unit tests against a mocked DB, but neither has been exercised through an actual refresh against the live database since the fix commits landed (`2f8f7ec`, `16ddd5d`) — the last owner-approved live walkthrough (01-05 Task 3) predates those fixes in the git history. This verifier confirmed the `refresh_lock` table exists on the live DB (read-only schema check) and that `getCachedEvents()`'s new SQL filter already works correctly live (`npm run db:check` returned 101 real cached events with a real timestamp), which de-risks WR-01 significantly. The one remaining unexercised path is a full `runOddsRefresh` invocation through the lock-acquire/release logic — the verifier cannot make a live Odds API call under the stated credit-budget constraint, so this needs a human to run it once.

### Gaps Summary

No must-have truths failed. All 5 roadmap success criteria and all 9 phase requirements (CALC-01, CALC-04, CALC-05, ODDS-01 through ODDS-05, BONUS-01) are backed by passing automated tests, clean typecheck/lint/build, and direct source inspection confirming the described wiring exists and is not stubbed. The hedge-engine fixtures reproduce the roadmap's own worked examples exactly (to the cent). The one open item is not a functional gap in the code — it is an unexercised-in-production concurrency/lock code path (WR-03) introduced by the post-review fix commits, which the code reviewer itself flagged as needing a human to confirm after the migration was applied. That is listed above as the sole human-verification item, which is why phase status is `human_needed` rather than `passed` despite a 9/9 truth score.

---

_Verified: 2026-09-25T23:59:00Z_
_Verifier: Claude (gsd-verifier)_

## Human Verification Outcome

- 2026-09-25: Owner ran a live refresh after migration 0001 (refresh_lock). DB confirmed: cached_odds + credit_usage written at 2026-09-25T23:27:43Z, refresh_cost 3, 487 credits remaining, refresh_lock released (empty). WR-03 lock path verified end-to-end. Status updated human_needed -> passed.
