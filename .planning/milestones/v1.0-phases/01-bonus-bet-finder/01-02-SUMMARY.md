---
phase: 01-bonus-bet-finder
plan: 02
subsystem: database
tags: [drizzle, neon, postgres, nextjs-server-actions, zod, decimal.js]

# Dependency graph
requires:
  - phase: 01-bonus-bet-finder (Plan 01)
    provides: hedge engine (calculateBonusBetHedge, extractTwoWayMoneylines, rankBonusBetHedges), Odds API Zod schemas, sport/book config, finder DTOs/input schema, RED e2e finder test
provides:
  - Drizzle pg-core schema (books, cached_odds, credit_usage) with a committed SQL migration, applied to a live Neon Postgres 18 database
  - src/db/client.ts getDb() lazy singleton (neon-http driver, throws if DATABASE_URL unset)
  - src/db/queries.ts (getBonusBooks, getHedgeBookKeys, getCachedEvents, getOddsFreshness) reading real Postgres rows, re-validating raw_response JSON with OddsEventSchema per row
  - src/app/actions/find-hedges.ts "use server" findHedges action: server-side FinderInputSchema re-validation + bookKey membership check, zero Odds API calls, turns Plan 01's e2e test GREEN
  - scripts/seed.ts (COLORADO_BOOKS upsert + optional --fixtures odds seed) and scripts/db-check.ts (bonus-book list + cached-odds freshness/count, exit 1 if unseeded)
  - A provisioned, migrated, and seeded Neon project (muddy-art-42171722) with 13 books (7 free-tier bonus-eligible incl. theScore Bet) and 5 fixture odds events
  - Real README.md with local-run instructions, scripts list, and the Phase 2 auth/local-only note
affects: [01-03, 01-04, 01-05]

# Tech tracking
tech-stack:
  added:
    - "drizzle-orm@0.45 neon-http driver + drizzle-kit@0.31 generate/migrate (not push), @neondatabase/serverless@1.1"
  patterns:
    - "Lazy DB singleton (getDb()) so next build and Vitest never require DATABASE_URL at import time"
    - "Raw sql`` aggregate results from neon-http are plain strings, not typed Date instances -- only typed column selects get automatic Date coercion. Any raw sql<T>`` aggregate must be normalized explicitly (new Date(raw)) rather than trusted via the TS cast alone."
    - "Server action re-validates all untrusted input server-side (FinderInputSchema.safeParse + bookKey membership against getBonusBooks()) even though the client already validated it -- never trust client-side validation alone"
    - "cached_odds.raw_response is re-parsed per-row with OddsEventSchema.safeParse on every read; bad rows are dropped and logged, never thrown, so one malformed cached event can't take down the whole finder"

key-files:
  created:
    - src/db/schema.ts
    - src/db/client.ts
    - src/db/queries.ts
    - src/app/actions/find-hedges.ts
    - drizzle.config.ts
    - drizzle/0000_opposite_manta.sql
    - scripts/seed.ts
    - scripts/db-check.ts
  modified:
    - src/app/actions/find-hedges.test.ts (removed temporary @ts-expect-error, now GREEN)
    - README.md (replaced create-next-app scaffold boilerplate)

key-decisions:
  - "Neon project provisioned on Postgres 18.6 (research assumed 16/17) -- Neon's managed offering has moved ahead of the researched version; no schema/driver incompatibility observed, noted here for future reference"
  - "db:migrate/db:seed/db:check load env via dotenv (drizzle.config.ts) or tsx --env-file (scripts), never shell `source .env.local` -- the pooled Neon connection string contains an unescaped & that breaks zsh sourcing"

patterns-established:
  - "getMaxFetchedAt() as the single internal helper backing both getCachedEvents and getOddsFreshness, with explicit raw-value-to-Date normalization documented inline as a neon-http driver gotcha"

requirements-completed: [BONUS-01, ODDS-01, ODDS-05]

# Metrics
duration: 10min (Tasks 2-3, this continuation; Task 1 completed in a prior session, see commit ffc0f73)
completed: 2026-09-25
---

# Phase 1 Plan 02: Database, Server Action, and Neon Provisioning Summary

**Drizzle schema + Neon Postgres (books/cached_odds/credit_usage) wired to a real findHedges server action that turns Plan 01's end-to-end finder test GREEN, with the DB provisioned, migrated, and seeded end-to-end.**

## Performance

- **Duration:** ~10 min (this continuation, Tasks 2-3) + prior session for Task 1 (commit ffc0f73)
- **Completed:** 2026-09-25T19:31:33Z
- **Tasks:** 3 (1 code/TDD task, 1 human-action checkpoint, 1 blocking DB-apply task)
- **Files modified:** 10 created (Task 1) + 2 modified (Task 3: README.md, src/db/queries.ts)

## Accomplishments

- `findHedges` reads cached odds from Postgres, calls the hedge engine, and returns the top-10 ranked conversions with zero Odds API calls -- Plan 01's previously-RED e2e test (`src/app/actions/find-hedges.test.ts`) is GREEN
- The Colorado book config lives in the DB (`books` table) as the single queryable source for the bonus-book dropdown and hedge-book set, seeded from `src/config/books.ts`
- A real Neon Postgres database (project `muddy-art-42171722`) is provisioned, migrated via `drizzle-kit migrate` (not `push`, per CLAUDE.md), and seeded: 13 Colorado books (7 free-tier/bonus-eligible incl. "theScore Bet") and 5 fixture odds events
- `npm run db:check` performs a real DB round trip against the live database and exits 0
- README.md now documents the actual local-run path (migrate, seed, dev) instead of create-next-app boilerplate

## Task Commits

Each task was committed atomically:

1. **Task 1: Drizzle schema, queries, findHedges server action, and seed scripts (TDD)** - `ffc0f73` (feat) -- completed in a prior session, verified present at continuation start
2. **Task 2: Provision Neon and provide DATABASE_URL** - checkpoint only, no repo changes (`.env.local` is gitignored and owner-created); verified `DATABASE_URL` present and `.env.local` gitignored, no commit
3. **Task 3: [BLOCKING] Apply migrations, seed book config and fixture odds, verify a DB round trip** - `3de9bb0` (feat) -- migration applied, seed run, db:check fix, real README

**Plan metadata:** (this commit, following SUMMARY.md)

## Files Created/Modified

- `src/db/schema.ts` - Drizzle pg-core tables: books, cached_odds, credit_usage (Task 1)
- `src/db/client.ts` - getDb() lazy singleton over neon-http (Task 1)
- `src/db/queries.ts` - getBonusBooks/getHedgeBookKeys/getCachedEvents/getOddsFreshness; fixed in Task 3 to normalize the raw `max()` aggregate to a real Date
- `src/app/actions/find-hedges.ts` - "use server" findHedges action (Task 1)
- `drizzle.config.ts`, `drizzle/0000_opposite_manta.sql` - migration config and generated/committed SQL (Task 1), applied to Neon (Task 3)
- `scripts/seed.ts`, `scripts/db-check.ts` - seed and verification scripts (Task 1), run against the live DB (Task 3)
- `README.md` - real project description, local-run steps, scripts list, Phase 2 auth/local-only note (Task 3)

## Decisions Made

- Neon provisioned on Postgres 18.6 rather than the researched 16/17 -- observed no compatibility issues with drizzle-orm/drizzle-kit at the pinned versions; noted for awareness, not a blocker.
- Confirmed and preserved the plan's env-loading approach (dotenv in drizzle.config.ts, `tsx --env-file` in scripts) rather than `source .env.local`, since the pooled connection string's `&` breaks zsh word-splitting on `source`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `getMaxFetchedAt` crashed against the real database: raw sql aggregate is a string, not a Date**
- **Found during:** Task 3, first `npm run db:check` run against the live Neon DB (after migrate + seed succeeded)
- **Issue:** `getCachedEvents`/`getOddsFreshness` share `getMaxFetchedAt()`, which selected `sql<Date | null>\`max(${cachedOdds.fetchedAt})\`` and returned the row value directly. `sql<T>` is a TypeScript-only cast -- it does not perform runtime coercion the way a typed column select does. Against the real neon-http driver, the `max(timestamptz)` aggregate comes back as a plain string, so `db-check.ts`'s `fetchedAt.toISOString()` threw `TypeError: fetchedAt.toISOString is not a function`. This was invisible in Task 1's mocked unit/e2e tests because those tests stub `getDb()`/query results directly and never exercise the real driver's return type for a raw aggregate.
- **Fix:** `getMaxFetchedAt` now normalizes explicitly: returns `null` for a null aggregate, otherwise `raw instanceof Date ? raw : new Date(raw)`.
- **Files modified:** src/db/queries.ts
- **Verification:** `npm run db:check` now exits 0 against the live DB, prints 7 bonus books (incl. "theScore Bet") and 5 cached events with a valid ISO `fetched_at`; `npx tsc --noEmit` clean; full `npx vitest run` (30/30) still green (mocked tests unaffected).
- **Committed in:** 3de9bb0 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 correctness bug, caught only once a real database was in the loop)
**Impact on plan:** Necessary for `db:check`'s stated acceptance criteria ("exits 0") to actually hold against a real Neon database, and for `getOddsFreshness` (consumed by Plan 05's credit/freshness display) to return a genuinely usable `Date`. No scope creep -- fix is scoped to the one function with the bug.

## Issues Encountered

None beyond the deviation above. Migration, seed, and full test suite all succeeded on the first attempt after the fix.

## User Setup Required

Completed as part of this plan's Task 2 checkpoint: the owner provisioned a Neon project (`muddy-art-42171722`, production branch) and placed the pooled `DATABASE_URL` in `.env.local` (verified gitignored, never printed/logged/committed). No `ODDS_API_KEY` was provided yet -- not required by this plan; Plan 04 will need it.

## Next Phase Readiness

- Plan 03 (finder UI) can call `findHedges` against a real, seeded Neon database today -- the finder works end-to-end with fixture odds even before an Odds API key exists.
- Plan 04 (odds ingestion) can write to the already-migrated `cached_odds`/`credit_usage` tables with no further schema changes.
- One open item carried forward (not a blocker): confirm `ODDS_API_KEY` provisioning before Plan 04 executes its live-fetch tasks.

---
*Phase: 01-bonus-bet-finder*
*Completed: 2026-09-25*

## Self-Check: PASSED

All key files (src/db/schema.ts, src/db/client.ts, src/db/queries.ts,
src/app/actions/find-hedges.ts, drizzle.config.ts, drizzle/0000_opposite_manta.sql,
scripts/seed.ts, scripts/db-check.ts, README.md) confirmed present on disk. Both
task commits (ffc0f73, 3de9bb0) confirmed present in git history.
