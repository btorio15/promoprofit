---
phase: 01-bonus-bet-finder
reviewed: 2026-09-25T00:00:00Z
depth: standard
files_reviewed: 52
files_reviewed_list:
  - src/domain/hedge/americanOdds.ts
  - src/domain/hedge/bonusBet.ts
  - src/domain/hedge/bonusBet.test.ts
  - src/domain/hedge/marketFilter.ts
  - src/domain/hedge/marketFilter.test.ts
  - src/domain/hedge/rankBonusBetHedges.ts
  - src/domain/hedge/rankBonusBetHedges.test.ts
  - src/domain/finder/finderInput.ts
  - src/domain/finder/types.ts
  - src/domain/odds/schemas.ts
  - src/app/actions/find-hedges.ts
  - src/app/actions/find-hedges.test.ts
  - src/app/actions/refresh-odds.ts
  - src/app/actions/refresh-odds.test.ts
  - src/app/page.tsx
  - src/app/layout.tsx
  - src/components/finder/CreditBanner.tsx
  - src/components/finder/EmptyState.tsx
  - src/components/finder/FinderForm.tsx
  - src/components/finder/FinderScreen.tsx
  - src/components/finder/OddsStatusBar.tsx
  - src/components/finder/RefreshConfirmDialog.tsx
  - src/components/finder/ResultDetails.tsx
  - src/components/finder/ResultRow.tsx
  - src/components/finder/ResultsList.tsx
  - src/components/finder/oddsAge.ts
  - src/components/finder/oddsAge.test.ts
  - src/config/books.ts
  - src/config/sports.ts
  - src/db/client.ts
  - src/db/queries.ts
  - src/db/schema.ts
  - src/ingestion/odds/client.ts
  - src/ingestion/odds/client.test.ts
  - src/ingestion/odds/quota.ts
  - src/ingestion/odds/quota.test.ts
  - src/ingestion/odds/refresh.ts
  - src/ingestion/odds/status.ts
  - src/ingestion/odds/status.test.ts
  - src/ingestion/odds/store.ts
  - src/lib/format.ts
  - src/lib/format.test.ts
  - src/lib/utils.ts
  - src/test/fixtures/oddsEvents.ts
  - scripts/db-check.ts
  - scripts/odds-smoke.ts
  - scripts/refresh-odds.ts
  - scripts/seed.ts
  - drizzle.config.ts
  - next.config.ts
  - vitest.config.ts
findings:
  critical: 1
  warning: 5
  info: 8
  total: 14
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-25
**Depth:** standard
**Files Reviewed:** 52
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the bonus-bet hedge engine, the market filter and ranking, the findHedges and refreshOdds server actions, the Odds API ingestion, quota and store code, the finder UI, and the scripts.

**The money math holds up.** `americanToDecimal` and `calculateBonusBetHedge` use decimal.js throughout. The stake formula `H = B(Ob-1)/Oh` is correct. Both payouts are floored to whole cents. I checked the floor/ceil stake choice with a brute-force script covering 1,572,528 combinations: 12 bonus amounts from $1 to $999.99, every American price from ±100 to ±1000 in steps of 5, and every other whole-cent stake within ±5 cents of the chosen one. None gave a higher guaranteed profit. The per-sport ranking in `findHedges` really is independent for each sport, and it uses the same algorithm as the "all" ranking. All 80 tests pass.

**The main risk is the credit guard.** It can permanently lock out odds refresh (CR-01). Several lesser problems let stale odds, or credits that were spent but never recorded, go unnoticed.

## Critical Issues

### CR-01: The low-credit block never lifts after the monthly credit reset, so odds refresh is permanently locked

**File:** `src/ingestion/odds/refresh.ts:58-74`, `src/ingestion/odds/quota.ts:55-64`, `src/ingestion/odds/status.ts:35-51`, `src/components/finder/OddsStatusBar.tsx:125`
**Issue:** `evaluateRefreshGate` blocks whenever the latest `credit_usage.requestsRemaining` is below 20, or below the estimated cost. It does not look at when that row was recorded. The only thing that writes a new `credit_usage` row is a successful refresh, and a blocked refresh never runs. So once a month ends with fewer than 20 credits left, every later refresh is blocked forever, even after the Odds API resets the quota on the 1st:
- `getOddsStatus` reports `level: "blocked"`.
- The UI disables the Refresh button.
- The CLI (`scripts/refresh-odds.ts`) goes through the same gate and is blocked too.

The only way out is a manual DB edit. The UI text even promises "disabled until next month's reset (1st)", but that never happens.

`refresh.ts:118` makes this more likely: if the `x-requests-remaining` header is missing, it records `requestsRemaining: lastRemaining ?? 0`. A header-less response therefore locks refresh out immediately.

The test suite locks in the bug. `refresh-odds.test.ts:91-113` uses a row recorded on 2026-09-30 with `now` = 2026-10-01, which is after a monthly reset, and expects `blocked`.

**Fix:** Treat a credit row from an earlier billing month as unknown when gating and when showing status. Never make up 0 for a missing header.
```ts
// quota.ts
export function effectiveRemaining(latest: { requestsRemaining: number; recordedAt: Date } | null, now: Date): number | null {
  if (!latest) return null;
  // Stale if a monthly reset happened between recordedAt and now.
  return nextMonthlyReset(latest.recordedAt) <= now ? null : latest.requestsRemaining;
}
// refresh.ts / status.ts: use effectiveRemaining(latest, now) instead of latest?.requestsRemaining
// refresh.ts:117 -- only record when lastRemaining !== null; otherwise skip or keep the previous value
```
Change the test at `refresh-odds.test.ts:91` to use a `recordedAt` in the same month. Add a test showing that a row from last month does not block.

## Warnings

### WR-01: Odds age uses the newest row across every sport, so one sport's stale odds can show as fresh

**File:** `src/db/queries.ts:28-38,47-70`, `src/ingestion/odds/refresh.ts:95-110`, `src/ingestion/odds/store.ts:27-47`
**Issue:** `getCachedEvents` and `getOddsFreshness` report `max(fetched_at)` over all rows. Some rows can be much older than that:
- A refresh can fail partway. If sport A's replace succeeds and sport B's fetch throws, sport B's rows stay from the earlier refresh.
- A sport can drop out of `inSeason`. Its rows are never replaced and stay until they commence, which can be up to 7 days.

Those rows are ranked and shown under an "Odds updated 1 min ago" label, and `findHedges` returns the newest timestamp as `oddsFetchedAt`. The user sees exact-looking stakes built on odds that may be days old. That breaks the promise that results are correct to the cent.
**Fix:** Carry `fetchedAt` per event through to the DTOs. Either filter out rows older than the latest refresh (for example `fetched_at = max(fetched_at)`), or flag them as stale for each result. At minimum, in `runOddsRefresh` delete the cached rows of any D-01 sport that was not refreshed successfully in this run.

### WR-02: Spent credits go unrecorded when the first cache write fails

**File:** `src/ingestion/odds/refresh.ts:95-108`
**Issue:** `quotaCaptured`, `refreshCost`, `lastRemaining` and `lastUsed` are only updated after `replaceSportOdds` succeeds. If `fetchSportOdds` returns 200 (credits spent) and the DB write then throws, that spend is not recorded. On the first sport, no `credit_usage` row is written at all. As a result:
- The meter overstates the remaining credits.
- `lastRefreshAt` is not updated, so the 15-minute confirm window does not apply to the user's immediate retry. The retry spends credits again without asking.
**Fix:** Record the quota right after the fetch returns, before writing to the cache:
```ts
const { events, quota } = await fetchSportOdds(...);
quotaCaptured = true;
if (quota.last !== null) refreshCost += quota.last;
if (quota.remaining !== null) lastRemaining = quota.remaining;
if (quota.used !== null) lastUsed = quota.used;
await replaceSportOdds(sport.key, events, now);
sportsFetched.push(sport.key);
```

### WR-03: Nothing on the server stops two refreshes running at once, so credits can be spent twice

**File:** `src/ingestion/odds/refresh.ts:37-142`, `src/app/actions/refresh-odds.ts:14-27`
**Issue:** The gate reads the latest `credit_usage` row, then makes several API calls. It only writes a new row at the end. Two refreshes that start close together both see the old `lastRefreshAt`, for example from two browser tabs, two friends, or the UI plus `npm run odds:refresh`. Both pass the 15-minute confirm gate and both spend credits. The disabled button only protects a single client.
**Fix:** Take a server-side lock before evaluating the gate. For example, use `pg_try_advisory_lock(<const>)` through `getDb().execute(sql\`select pg_try_advisory_lock(42)\`)`, or insert a "refresh started" row with a unique constraint. Return a `busy` outcome when the lock is held. Note that neon-http is stateless, so a session-level advisory lock will not hold across queries. A small `refresh_lock` table updated with a conditional `UPDATE ... WHERE started_at < now() - interval '2 min'` works over HTTP.

### WR-04: `db:seed --fixtures` writes fake odds into the real cache as if they were just fetched

**File:** `scripts/seed.ts:48-77`
**Issue:** Fixture events are written to the production `cached_odds` table with `fetchedAt: now`. The finder then ranks made-up prices, such as a -275 FanDuel line, as real opportunities, and the status bar calls them fresh. A refresh only replaces fixtures for sports that are in season. Fixtures for any other D-01 sport stay for up to 7 days, and nothing in the UI marks them as fake. Running this against the shared Neon DB, which is the only DB configured, puts fake money data in front of users.
**Fix:** Refuse to run `--fixtures` unless an explicit env flag is set, such as `ALLOW_FIXTURE_SEED=1`, or unless `DATABASE_URL` points at a non-production branch. Alternatively, prefix fixture IDs (such as `fixture-`) and have `getCachedEvents` exclude them outside development.

### WR-05: The refresh gets its book list from the config file, but the finder gets it from the DB `books` table

**File:** `src/ingestion/odds/refresh.ts:55`, `src/ingestion/odds/status.ts:44`, `src/db/queries.ts:12-27`
**Issue:** `runOddsRefresh` chooses which bookmakers to fetch with `usableOddsBooks()` from `src/config/books.ts`. `findHedges` chooses bonus books and hedge books from the DB `books` table, via `getBonusBooks` and `getHedgeBookKeys`. If `db:seed` isn't re-run after a config change, the two lists drift apart. The dropdown can then offer a book whose odds are never fetched, which silently returns no results. Or a newly paid-only book is still fetched and offered as a hedge venue. The code comment says the config is the "single source of truth", but two runtime sources are in use.
**Fix:** Read the book list from one place at runtime. Either `findHedges` uses `usableOddsBooks()` (the DB table then only holds display metadata), or `runOddsRefresh` uses `getBonusBooks()`.

## Info

### IN-01: Both server actions have no authentication, so anyone who can reach the server can spend Odds API credits

**File:** `src/app/actions/refresh-odds.ts:14`, `src/app/actions/find-hedges.ts:86`
**Issue:** Auth is planned for Phase 2. For now, anyone who can reach the dev server can call `refreshOdds({ confirmed: true })` directly. That skips the confirm dialog and spends credits until the low-credit block kicks in.
**Fix:** In Phase 2, check the iron-session at the top of both actions before doing any work. Until then, keep the server bound to localhost.

### IN-02: The "no-results" message on the All tab still refers to the sport filter that was removed

**File:** `src/components/finder/EmptyState.tsx:12-15`
**Issue:** The text says "No games in the selected sport ... Clear the sport filter". That filter no longer exists, and this text is what the "all" tab shows.
**Fix:** Change it to something like "No profitable markets in the next 7 days. Refresh odds to look for new games."

### IN-03: Kickoff time shows no date or time zone

**File:** `src/lib/format.ts:7-12`
**Issue:** The 7-day window includes its end point (`marketFilter.ts:46`), so the same weekday can appear twice: today's game and next week's both show as "Sun 11:00 AM". The displayed time is in America/Denver, but nothing says "MT".
**Fix:** Add `month: "short", day: "numeric", timeZoneName: "short"`.

### IN-04: The error for an amount over $100,000 is misleading

**File:** `src/domain/finder/finderInput.ts:17-25`
**Issue:** Amounts over 100000 pass the regex but fail the refine check, which reports "Enter a bonus amount greater than $0."
**Fix:** Split this into two refine checks with separate messages, for example "Maximum bonus is $100,000."

### IN-05: The previous results stay on screen after a new search is rejected by the server

**File:** `src/components/finder/FinderForm.tsx:70-85`
**Issue:** When the server returns `invalid`, the field errors are set but `response` is not cleared. The results for the old book and amount stay visible under the new, rejected input.
**Fix:** Call `setResponse(null)` or `setHasSearched(false)` in the invalid branch, or dim the stale results.

### IN-06: The market filter uses the hedge-book list for the bonus side as well

**File:** `src/app/actions/find-hedges.ts:69-74`, `src/domain/hedge/marketFilter.ts:52`
**Issue:** `allowedBookKeys: rankOpts.hedgeBookKeys` filters bonus-side quotes too. Today the two lists are the same, so nothing breaks. If a book is ever allowed as a bonus book but not as a hedge book, its quotes would silently disappear and the search would return nothing.
**Fix:** Pass `new Set([...hedgeBookKeys, bookKey])` as `allowedBookKeys`.

### IN-07: The odds age is computed from the current time during render, which can cause a hydration mismatch

**File:** `src/components/finder/OddsStatusBar.tsx:57-58`
**Issue:** `describeOddsAge(fetchedAt, new Date())` runs during both the server render and the client render. If a minute boundary passes in between, the label text differs and React reports a hydration mismatch.
**Fix:** Hold `now` in state, set it in `useEffect` or on the tick, and render a neutral label until it is set. Or add `suppressHydrationWarning` on the label span.

### IN-08: The credit estimate can be too low after a partial refresh

**File:** `src/ingestion/odds/status.ts:41-44`
**Issue:** The estimate uses the previous refresh's `refreshCost`. If that refresh was partial (WR-02), or covered fewer sports in season, the warning banner and confirm dialog understate the next refresh's cost. The server-side gate is not affected, because it recomputes the estimate.
**Fix:** Use `max(latest.refreshCost, estimateRefreshCredits(SPORT_KEYS.length, books))`. Or estimate from the number of sports actually in season, using the free `/sports` call.

---

_Reviewed: 2026-09-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
