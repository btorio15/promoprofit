---
phase: 03-promo-scraping-review
plan: 04
subsystem: domain
tags: [drizzle, neon, migration, zod, decimal.js, hedge-math, promo-scope, vitest, tdd]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: "03-02: calculateProfitBoostHedge/calculateBonusBetHedge; 03-03: promos table (live), promo domain contract (types.ts), Promos tab scaffold"
provides:
  - "promos.scope_kind/window_start/window_end columns (migration 0005, live on Neon) -- game-wide or sport+date-wide promo scope, additive/nullable only"
  - "src/domain/promos/scope.ts: PromoScope/ScopeGuess types, ScopeGuessSchema (strict discriminated union), scopeFromGuess, eventInScope"
  - "src/domain/promos/selection.ts: resolveSelection (single pinned/candidate selection -> both sides' book quotes) and enumerateScopeSelections (every 2-way half-point candidate inside a promo's scope, sorted deterministically)"
  - "src/domain/promos/rankPromoHedges.ts: per-promo best-candidate search + ranking across the member's hedge books, applying D-02/D-03/D-04/D-05/D-16/D-17/D-18"
affects: [03-07, 03-08, 03-09, 03-10, 03-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scope model (event | sport_window) as a discriminated union with a jsonb-safe ScopeGuess counterpart, mirroring PromoSelection/BestGuess's existing split between typed domain value and jsonb-storable guess"
    - "rankPromoHedges.ts composes selection.ts's pure candidate enumerator with Plan 02's calculateProfitBoostHedge/calculateBonusBetHedge -- the ranker itself never does hedge math, only candidate search, min-odds gating, and tie-break ordering"
    - "D-17 (books apply minimum odds to the bet's OWN odds before the boost) implemented as an explicit base-odds decimal comparison in rankPromoHedges.ts, layered in front of profitBoost.ts's existing boosted-odds-only check, per the plan's documented gap between the two"

key-files:
  created:
    - src/domain/promos/scope.ts
    - src/domain/promos/scope.test.ts
    - src/domain/promos/selection.ts
    - src/domain/promos/selection.test.ts
    - src/domain/promos/rankPromoHedges.ts
    - src/domain/promos/rankPromoHedges.test.ts
    - drizzle/0005_promo_scope.sql
    - drizzle/meta/0005_snapshot.json
  modified:
    - src/db/schema.ts
    - drizzle/meta/_journal.json

key-decisions:
  - "eventInScope's window-membership check treats windowStart/windowEnd as inclusive boundaries on both ends (>= and <=), matching the plan's explicit boundary test cases rather than a half-open interval"
  - "rankPromoHedges's tie-break's secondary rank (after guaranteedProfit) uses roiPct for profit-boost results and conversionPct for bonus-bet results -- both are the module's existing 'profitability ratio' field for their respective result type, since the plan's behavior spec describes 'higher roiPct' generically across both promo types but only ProfitBoostResult actually has a field named roiPct"
  - "getPinnedCandidates re-verifies eventInScope for a pinned selection's own event before resolving it (defensive; not explicitly required by the interface) -- mirrors the threat model's T-03-04-01 mitigation ('Only in-scope... candidates') so a pinned selection can never silently escape its promo's own recorded scope"

requirements-completed: [CALC-02, CALC-03]

# Metrics
duration: ~25min
completed: 2026-09-27
---

# Phase 3 Plan 4: Promo Scope Model and Best-Candidate Hedge Ranker Summary

**Live migration adding game-wide/sport+date-wide scope columns to `promos`, plus a pure scope-candidate enumerator (`selection.ts`) and per-promo best-hedge ranker (`rankPromoHedges.ts`) that search every eligible market/side the same way the bonus-bet finder does, built test-first (RED -> GREEN).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-26T23:32:00-06:00 (approx, file reads before first commit)
- **Completed:** 2026-09-26T23:57:09-06:00
- **Tasks:** 2 (Task 2 executed as TDD RED -> GREEN, two commits)
- **Files modified:** 10 (8 created, 2 modified)

## Accomplishments

- Migration 0005 (`ADD COLUMN` only -- `scope_kind`, `window_start`, `window_end`, all nullable) generated, verified to contain zero `DROP`/`ALTER COLUMN`/`NOT NULL` statements, and applied live to the shared Neon database via `npm run db:migrate` (never `push`), per the plan's BLOCKING requirement.
- `scope.ts`: typed `PromoScope`/`ScopeGuess` discriminated union (`event` | `sport_window`), a strict Zod schema (`ScopeGuessSchema`) rejecting unknown sports, malformed ISO datetimes, and `windowStart >= windowEnd`, plus `eventInScope` for scope-membership tests -- 13 tests covering both scope kinds and window boundaries.
- `selection.ts`: `resolveSelection` (a single pinned or candidate `PromoSelection` -> both sides' live book quotes, honoring exactly-2-outcome h2h, half-point-only spreads/totals per CALC-05) and `enumerateScopeSelections` (every 2-way moneyline/spread/total candidate inside a promo's scope, filtered by "not yet started," sorted deterministically) -- 15 tests.
- `rankPromoHedges.ts`: for each promo, evaluates its pinned selection or every scope candidate at the member's hedge books, applies D-17's base-odds minimum-odds check *before* boosting (the gap profitBoost.ts's own boosted-odds-only check leaves open), honors D-03's published-price-over-derived precedence, D-18's maxStake-required rule, and D-04's same-book-allowed rule, catches engine `RangeError`s per candidate without failing the whole promo, and returns one opportunity per promo sorted by guaranteed profit -- 16 tests, including an end-to-end reproduction of Plan 02's B1 fixture through a pinned promo.
- Followed the plan's TDD protocol exactly: Task 2's two implementation files were removed and both test files committed alone first (verified `Cannot find module` failures = genuine RED), then the implementations were restored and committed as GREEN once all 44 tests (13 scope + 15 selection + 16 rank) and typecheck passed.

## Task Commits

1. **Task 1: [BLOCKING] Promo scope columns (migration 0005, applied live) and the scope contract** - `b8b86fb` (feat)
2. **Task 2: Enumerate scope candidates and rank each promo's best hedge** - TDD, two commits:
   - `eae89b8` (test) -- RED: `selection.test.ts` / `rankPromoHedges.test.ts` fail with `Cannot find module` (implementation files did not exist at this commit)
   - `5ce0017` (feat) -- GREEN: `selection.ts`, `rankPromoHedges.ts`; all 44 tests pass

## Files Created/Modified

- `src/db/schema.ts` - Adds `scopeKind`/`windowStart`/`windowEnd` nullable columns to `promos`; extends the table's doc comment to describe the scope model and the now-optional pinned market_type/line/side
- `drizzle/0005_promo_scope.sql` - Generated migration; 3x `ALTER TABLE "promos" ADD COLUMN` only, applied live to Neon
- `drizzle/meta/0005_snapshot.json`, `drizzle/meta/_journal.json` - drizzle-kit metadata for migration 0005 (renamed tag to `0005_promo_scope` matching 0004's precedent)
- `src/domain/promos/scope.ts` / `scope.test.ts` - `PROMO_SCOPE_KINDS`, `PromoScope`, `ScopeGuess`, `ScopeGuessSchema`, `scopeFromGuess`, `eventInScope`
- `src/domain/promos/selection.ts` / `selection.test.ts` - `SelectionQuote`, `ResolvedSelection`, `resolveSelection`, `enumerateScopeSelections`
- `src/domain/promos/rankPromoHedges.ts` / `rankPromoHedges.test.ts` - `RankablePromo`, `PromoOpportunity`, `rankPromoHedges`

## Decisions Made

- **eventInScope's window boundaries are inclusive on both ends** (`commence >= windowStart && commence <= windowEnd`), matching the plan's explicit "true exactly at the windowStart/windowEnd boundary" test cases.
- **rankPromoHedges's tie-break secondary rank uses roiPct (boost) / conversionPct (bonus)** as the analogous "profitability ratio" field per result type, since the plan's behavior spec names `roiPct` generically but that field only exists on `ProfitBoostResult`.
- **getPinnedCandidates re-verifies `eventInScope` for a pinned selection** before resolving it, even though the interface doesn't explicitly require it -- a defensive mirror of the threat model's T-03-04-01 mitigation ("Only in-scope... candidates") so a pinned selection can never escape its promo's own recorded scope if the matcher (Plans 07-09) or a manual correction ever produced an inconsistent pin.

## Deviations from Plan

None - plan executed exactly as written. The TDD RED/GREEN protocol was followed literally (implementation files physically absent during the RED commit, not merely reverted-looking), and every hand-derived expectation in the plan's `<behavior>` block (B1 known-answer reproduction, min-odds base-vs-boosted-odds distinction, derived-price D-03 case, maxStake-null D-18 skip, bonus_bet whole-dollar known-answer) matched the implementation without needing to adjust either the code or the test expectations to make them agree.

## Issues Encountered

None. `npm run typecheck`, `npm run lint`, `npm run test` (378 tests across the whole project), and `npx next build --webpack` (this worktree's documented Turbopack-symlink workaround, not a code issue) all passed cleanly after Task 2's GREEN commit.

## User Setup Required

None - no external service configuration required. Migration 0005 used the same `DATABASE_URL`/`.env.local` already configured in prior phases.

## Next Phase Readiness

- `scope.ts`, `selection.ts`, and `rankPromoHedges.ts` are ready for Plan 15 (hedge-rows rendering) to consume `rankPromoHedges`'s output directly, and for Plans 07-10 (matcher/review actions) to write `scope_kind`/`window_start`/`window_end`/`best_guess` (as a `ScopeGuess`) into the live `promos` table.
- `src/domain/promos/types.ts` (Plan 03's contract) was verified untouched (`git diff --stat` empty) -- Plans 04-10 can keep depending on its existing shape without drift.
- No blockers identified for downstream plans consuming this module.

## Self-Check: PASSED

- FOUND: src/db/schema.ts (modified)
- FOUND: drizzle/0005_promo_scope.sql
- FOUND: drizzle/meta/0005_snapshot.json
- FOUND: drizzle/meta/_journal.json (modified)
- FOUND: src/domain/promos/scope.ts
- FOUND: src/domain/promos/scope.test.ts
- FOUND: src/domain/promos/selection.ts
- FOUND: src/domain/promos/selection.test.ts
- FOUND: src/domain/promos/rankPromoHedges.ts
- FOUND: src/domain/promos/rankPromoHedges.test.ts
- FOUND commit: b8b86fb
- FOUND commit: eae89b8
- FOUND commit: 5ce0017

---
*Phase: 03-promo-scraping-review*
*Completed: 2026-09-27*
