---
phase: 01-bonus-bet-finder
fixed_at: 2026-09-25T23:20:00Z
review_path: .planning/phases/01-bonus-bet-finder/01-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-09-25T23:20:00Z
**Source review:** .planning/phases/01-bonus-bet-finder/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, WR-01..WR-05; Info findings out of scope)
- Fixed: 6
- Skipped: 0

Final verification: `npx vitest run` passes 100/100 tests in 12 files. `npx tsc --noEmit` and `npm run lint` are both clean. No live Odds API calls were made; every test mocks the client/store.

**ACTION REQUIRED:** WR-03 adds a `refresh_lock` table (migration `drizzle/0001_amazing_northstar.sql`). Run `npm run db:migrate` before the next odds refresh. Until you do, refresh returns the generic "Couldn't refresh odds" error, because the lock query fails. It fails safe: no credits are spent. The migration has NOT been run against the live DB.

## Fixed Issues

### CR-01: The low-credit block never lifts after the monthly credit reset

**Files modified:** `src/ingestion/odds/quota.ts`, `src/ingestion/odds/refresh.ts`, `src/ingestion/odds/status.ts`, `src/components/finder/OddsStatusBar.tsx`, `src/ingestion/odds/quota.test.ts`, `src/ingestion/odds/status.test.ts`, `src/app/actions/refresh-odds.test.ts`
**Commit:** 871c901
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- Added `effectiveRemaining(latest, now)` and `isFromEarlierBillingMonth()` in quota.ts. A credit row from before the most recent 1st-of-month (UTC) reset is treated as unknown (`null`).
- `runOddsRefresh` passes that value to the gate, so a row from last month no longer blocks. `getOddsStatus` also reports `remaining: null` / `level: "unknown"` / `total: 500` for a stale row, so the UI re-enables the Refresh button.
- A missing `x-requests-remaining` header no longer records a fake `0`:
  - A later response without the header no longer overwrites an earlier sport's reported value.
  - If no response carried the header, the fix records the prior same-month balance minus the credits this run reported spending.
  - If no same-month balance is known, it skips the row instead of writing 0.
- Changed "Credit balance appears after the first refresh" to "...next refresh", because this state now also appears after a monthly reset.
- Tests:
  - The existing low-credit block test now uses a same-month row (now = 2026-10-15).
  - New tests cover: a last-month row does not block, the carry-forward when the header is missing, no row recorded when nothing is known, the earlier header value being kept, `effectiveRemaining` edge cases (month boundary and year rollover), and status reporting unknown for a stale row.

### WR-02: Spent credits go unrecorded when the first cache write fails

**Files modified:** `src/ingestion/odds/refresh.ts`, `src/app/actions/refresh-odds.test.ts`
**Commit:** ef3eb96
**Applied fix:** Quota capture (`quotaCaptured`, `refreshCost`, `lastRemaining`, `lastUsed`) now happens right after `fetchSportOdds` returns and before `replaceSportOdds`. A new test makes the first sport's cache write fail. It asserts that the `credit_usage` row is still recorded with the spent credit and `sportsFetched: 0`.

### WR-01: Odds age uses the newest row across every sport

**Files modified:** `src/db/queries.ts`, `src/ingestion/odds/store.ts`, `src/ingestion/odds/refresh.ts`, `src/app/actions/refresh-odds.test.ts`
**Commit:** 16ddd5d
**Status:** fixed: requires human verification (logic change; the SQL filter is not exercised against a real DB in tests)
**Applied fix:**
- `getCachedEvents` now returns only rows from the latest refresh batch: `fetched_at = (select max(fetched_at) from cached_odds)`. Every row a refresh writes shares that run's timestamp, so the returned `fetchedAt` is the real age of every event shown. I checked the generated SQL offline with drizzle's `.toSQL()`.
- Added `purgeUnrefreshedEvents(now)` in store.ts. `runOddsRefresh` calls it only when the whole loop succeeds, and it deletes rows that run did not write, such as out-of-season sports.
- After a partial failure, nothing is purged. The failed sport's old rows are hidden by the latest-batch filter instead.
- Tests assert that the purge runs on full success and does not run on a partial failure.

### WR-03: Nothing on the server stops two refreshes running at once

**Files modified:** `src/db/schema.ts`, `drizzle/0001_amazing_northstar.sql` (new, generated), `drizzle/meta/0001_snapshot.json` (new, generated), `drizzle/meta/_journal.json`, `src/ingestion/odds/store.ts`, `src/ingestion/odds/refresh.ts`, `src/components/finder/OddsStatusBar.tsx`, `scripts/refresh-odds.ts`, `src/app/actions/refresh-odds.test.ts`
**Commit:** 2f8f7ec
**Status:** fixed: requires human verification (concurrency logic; needs `npm run db:migrate`)
**Applied fix:**
- **Schema:** new single-row `refresh_lock(id, holder, locked_until)` table. The migration was generated with `drizzle-kit generate` using a dummy DATABASE_URL and has not been applied.
- **Taking the lock:** `tryAcquireRefreshLock(holder, ttlMs)` runs one atomic `INSERT ... ON CONFLICT (id) DO UPDATE ... WHERE locked_until < now RETURNING`. It returns true only when no lock is held or the existing lock has expired. This works over stateless neon-http.
- **Releasing the lock:** `releaseRefreshLock(holder)` deletes the row only if this holder still owns it.
- **Refresh wrapper:** `runOddsRefresh` takes the lock (random UUID holder, 5-minute TTL) before reading the gate, and releases it in `finally`.
- **New outcome:** `{ status: "busy", message }` is returned when another refresh holds the lock.
  - The UI shows it as an error banner.
  - The CLI prints the message and exits with code 1.
- **Tests** cover:
  - busy returns before the gate or any fetch
  - the lock is taken before the gate and released after credits are recorded, with the same holder
  - the lock is released on error
  - a failure to take the lock returns the key-free error message

### WR-04: `db:seed --fixtures` writes fake odds into the real cache

**Files modified:** `src/db/fixtureSeedGuard.ts` (new), `src/db/fixtureSeedGuard.test.ts` (new), `scripts/seed.ts`
**Commit:** 3b9c9ab
**Applied fix:**
- `--fixtures` now refuses to run unless `ALLOW_FIXTURE_SEED=1` is set.
- Even with the flag, it refuses if any `credit_usage` row exists, meaning live Odds API data is already in this DB.
- The check runs before any write.
- The pure guard function lives in `src/db/fixtureSeedGuard.ts` so it can be unit-tested.

### WR-05: The refresh gets its book list from config, but the finder gets it from the DB

**Files modified:** `src/db/queries.ts`, `src/db/queries.test.ts` (new), `scripts/db-check.ts`, `src/db/schema.ts` (comment only)
**Commit:** c72682e
**Applied fix:**
- `getBonusBooks()` (and therefore `getHedgeBookKeys()`) now come from `usableOddsBooks()` in `src/config/books.ts`. That is the same list `runOddsRefresh` fetches, so the dropdown, the hedge venues and the refresh can no longer drift apart. The DB `books` table is now a metadata mirror only.
- No migration is needed.
- `db:check` now counts DB `books` rows directly, so it still detects a DB that was never seeded.
- The new test mocks `getDb` to throw and asserts that both functions match the config.

---

_Fixed: 2026-09-25T23:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
