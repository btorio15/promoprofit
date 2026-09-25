---
phase: 01-bonus-bet-finder
plan: 04
subsystem: api
tags: [the-odds-api, drizzle, neon, zod, vitest, server-actions]

# Dependency graph
requires:
  - phase: 01-bonus-bet-finder (Plan 01)
    provides: src/domain/odds/schemas.ts, src/config/books.ts, src/config/sports.ts, hedge/bonus-bet math
  - phase: 01-bonus-bet-finder (Plan 02)
    provides: src/db/client.ts, src/db/schema.ts (cachedOdds, creditUsage), src/db/queries.ts
provides:
  - "Quota-safe Odds API client (listSports, fetchSportOdds) with key-safe error handling"
  - "Pure credit gate (quota.ts): thresholds, estimateRefreshCredits, evaluateRefreshGate, nextMonthlyReset"
  - "Cache writer (store.ts): replaceSportOdds (atomic db.batch), purgeStartedEvents, recordCreditUsage, getLatestCreditUsage"
  - "runOddsRefresh orchestration (refresh.ts): fetches in-season D-01 sports only, gates on credits, records usage even on mid-way error"
  - "refreshOdds server action (revalidates / on success) and npm run odds:refresh / odds:smoke CLIs"
  - "Live-verified Colorado book config: 7 free-tier keys confirmed present, williamhill_us/fanatics confirmed absent (D-16)"
  - "First real odds snapshot cached in Postgres (107 future events across ncaaf/nfl/mlb/nba)"
affects: [01-bonus-bet-finder (Plan 05 - finder UI refresh button), 04-opportunities-feed]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-only ingestion modules (no 'use client') read ODDS_API_KEY at call time via process.env, never NEXT_PUBLIC_"
    - "Error messages name only the API path, never the full URL (URL contains the secret key)"
    - "Atomic per-sport cache replace via neon-http db.batch([delete, ...inserts])"
    - "Explicit user-triggered refresh only: server action + CLI script, zero setInterval/cron"
    - "Credit usage recorded via try/finally even when a mid-refresh sport fetch fails"

key-files:
  created:
    - src/ingestion/odds/client.ts
    - src/ingestion/odds/client.test.ts
    - src/ingestion/odds/quota.ts
    - src/ingestion/odds/quota.test.ts
    - src/ingestion/odds/store.ts
    - src/ingestion/odds/refresh.ts
    - src/app/actions/refresh-odds.ts
    - src/app/actions/refresh-odds.test.ts
    - scripts/odds-smoke.ts
    - scripts/refresh-odds.ts
  modified: []

key-decisions:
  - "Request with bookmakers=<7 free-tier keys> instead of regions=us,us2 -- halves credit cost per in-season sport (1 credit instead of 2) since bookmakers takes priority over regions and this group fits under 10 keys"
  - "Live verification (ODDS-05) confirmed exactly the D-16 expectation: draftkings, fanduel, betmgm, betrivers, espnbet (theScore Bet), hardrockbet, ballybet all present; williamhill_us and fanatics (paid-only) absent -- no book-config drift, src/config/books.ts left unchanged"
  - "Owner approved the checkpoint without requesting any book-config changes; first live refresh spent 4 of 500 monthly credits total (1 smoke + 3 refresh)"

requirements-completed: [ODDS-01, ODDS-02, ODDS-04, ODDS-05]

# Metrics
duration: 25min
completed: 2026-09-25
---

# Phase 01 Plan 04: Live Odds Ingestion Summary

**Quota-safe Odds API client, pure credit gate, atomic cache writer, and a guarded refreshOdds action -- live-verified against real Colorado bookmaker keys, replacing the fixture odds with a real 107-event snapshot for 4 of 500 monthly credits.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-25T19:40:00Z (approx, per commit history)
- **Completed:** 2026-09-25T20:05:00Z (approx, checkpoint approval)
- **Tasks:** 3 (2 TDD auto tasks + 1 human-verify checkpoint)
- **Files modified:** 10 created, 0 modified

## Accomplishments
- Built a key-safe Odds API client (`listSports`, `fetchSportOdds`) that validates every response with `OddsEventListSchema` and never leaks the API key in thrown errors, verified by a test asserting the sentinel key string is absent from `String(err)`
- Built a pure credit gate (`quota.ts`) enforcing the ODDS-02 thresholds: block below 20 credits, block when the estimate exceeds remaining, require confirmation within 15 minutes of the last refresh
- Built `runOddsRefresh` orchestration that fetches only in-season D-01 sports (skipping NHL and out-of-season sports via the zero-credit `/sports` call), atomically replaces the Postgres cache per sport via `db.batch`, and records credit usage even when a mid-refresh sport fetch fails
- Wired `refreshOdds` server action (revalidates `/` on success) and two CLIs: `npm run odds:smoke` (ODDS-05 live key verification) and `npm run odds:refresh` (explicit, confirmable refresh)
- Ran the live ODDS-05 verification: confirmed all 7 free-tier Colorado book keys present and both paid-only keys (williamhill_us, fanatics) absent, matching D-16 exactly -- no book-config changes needed
- Ran the first real refresh: cached real Colorado odds (ncaaf/nfl/mlb/nba; NCAAB out of season) into Postgres, replacing all fixture data

## Task Commits

Each task was committed atomically:

1. **Task 1: Odds API client, credit gate, and ODDS-05 smoke script** - `0b31d15` (feat, TDD RED+GREEN)
2. **Task 2: Cache writer, refresh orchestration, refreshOdds action, odds:refresh CLI** - `a0cd2fd` (feat, TDD RED+GREEN)
3. **Task 3: Live verification checkpoint** - no code commit (owner approved; no book-config drift found, so `src/config/books.ts` was left untouched)

**Plan metadata:** (this commit) `docs(01-04): complete live odds ingestion plan`

_Note: TDD tasks were completed by the previous executor session; commits `0b31d15` and `a0cd2fd` verified present in git log before continuing._

## Files Created/Modified
- `src/ingestion/odds/client.ts` - `listSports`, `fetchSportOdds`, `parseQuotaHeaders`, `OddsApiError`; key-safe, server-only
- `src/ingestion/odds/client.test.ts` - Mocked-fetch tests for the client contract and key-leak assertion
- `src/ingestion/odds/quota.ts` - Pure credit gate: `creditLevel`, `estimateRefreshCredits`, `evaluateRefreshGate`, `nextMonthlyReset`, thresholds
- `src/ingestion/odds/quota.test.ts` - Table-driven tests for gate thresholds and boundary conditions
- `src/ingestion/odds/store.ts` - `replaceSportOdds` (atomic `db.batch`), `purgeStartedEvents`, `recordCreditUsage`, `getLatestCreditUsage`
- `src/ingestion/odds/refresh.ts` - `runOddsRefresh` orchestration: gate check, per-sport fetch+replace, credit recording via try/finally
- `src/app/actions/refresh-odds.ts` - `refreshOdds` server action, zod-validated input, `revalidatePath("/")` on success
- `src/app/actions/refresh-odds.test.ts` - Mocked client/store tests covering ok/blocked/confirm_required/error/ODDS-04-recompute paths
- `scripts/odds-smoke.ts` - ODDS-05 live bookmaker-key verification CLI
- `scripts/refresh-odds.ts` - `npm run odds:refresh` CLI wrapper around `runOddsRefresh`

## Decisions Made
- Used `bookmakers=<7 keys>` instead of `regions=us,us2` to halve per-sport credit cost (1 credit vs. 2), since bookmakers takes API priority over regions and the D-15 book set fits in one group of 10
- Live smoke test used 9 keys (7 free-tier + williamhill_us + fanatics) to positively confirm the paid-only keys are absent on a free-tier response, still costing only 1 credit
- No book-config changes were needed; live results matched `src/config/books.ts` exactly

## Deviations from Plan

None - plan executed exactly as written. Task 3's conditional book-config-update branch was not triggered (no drift found).

## Issues Encountered

None. The live verification (`npm run odds:smoke`, `npm run odds:refresh -- --yes`, `npm run db:check`) was run once by the prior executor session and results were carried into this continuation without re-running the API calls, to avoid spending additional credits. This continuation re-confirmed state cheaply via `npx vitest run` (71/71 passing), `npx tsc --noEmit` (clean), and `npm run db:check` (no API cost) rather than re-invoking the live Odds API.

### Live Verification Results (recorded from prior execution, owner-approved)

- `npm run odds:smoke` exit 0: active sports NCAAF/NFL/MLB/NBA; 70 NCAAF events; draftkings, fanduel, betmgm, betrivers, espnbet (theScore Bet), hardrockbet, ballybet all seen; williamhill_us and fanatics (paid_only) absent -- matches D-16. 1 credit spent.
- `npm run odds:refresh -- --yes` exit 0: status "ok", fetchedAt 2026-09-25T19:59:14.992Z, sports fetched ncaaf/nfl/mlb/nba (NCAAB out of season), 3 credits spent, 496 remaining.
- `npm run db:check` exit 0: 7 bonus books configured, 109 future cached events at the time, fetched_at matched the refresh timestamp exactly.
- Re-confirmed in this continuation session (no API cost): `npm run db:check` now shows 107 future cached events (2 fewer -- events that have since started were purged by `purgeStartedEvents`), `fetched_at` still `2026-09-25T19:59:14.992Z`, and `git log -1 -- src/config/books.ts` shows the file's last change predates this plan (Plan 01), confirming no drift.
- Total credits spent across the live checkpoint: 4 of 500 monthly.

## User Setup Required

None - `ODDS_API_KEY` was already present and working in `.env.local` (owner completed this before the checkpoint).

## Next Phase Readiness
- The finder can now compute hedges from real cached Colorado odds via `findHedges` reading the same `cachedOdds` table this plan populates (ODDS-04 satisfied)
- Plan 05 can safely wire the finder UI's refresh button to the `refreshOdds` server action built here -- it already revalidates `/` on success
- Credit budget is healthy: 496 of 500 remaining after this plan's live verification; subsequent refreshes will cost roughly 1 credit per in-season sport (currently 4: ncaaf, nfl, mlb, nba)
- No blockers carried forward from this plan

---
*Phase: 01-bonus-bet-finder*
*Completed: 2026-09-25*

## Self-Check: PASSED

- FOUND: src/ingestion/odds/client.ts
- FOUND: src/ingestion/odds/quota.ts
- FOUND: src/ingestion/odds/store.ts
- FOUND: src/ingestion/odds/refresh.ts
- FOUND: src/app/actions/refresh-odds.ts
- FOUND: scripts/odds-smoke.ts
- FOUND: scripts/refresh-odds.ts
- FOUND commit: 0b31d15 (Task 1)
- FOUND commit: a0cd2fd (Task 2)
- `npx vitest run`: 8 files / 71 tests passed
- `npx tsc --noEmit`: clean
- `npm run db:check`: 107 future cached events, fetched_at 2026-09-25T19:59:14.992Z
