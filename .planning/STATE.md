---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 02-04-PLAN.md
last_updated: "2026-09-26T09:48:04.284Z"
last_activity: 2026-09-26
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 19
  completed_plans: 17
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-25)

**Core value:** Show every profitable opportunity from current promos, ranked by guaranteed profit, with the exact stakes and hedge book — correct to the cent, so a user can just pick and place bets.
**Current focus:** Phase 2 — Private Access & My Books

## Current Position

Phase: 2 (Private Access & My Books) — EXECUTING
Plan: 5 of 6
Status: Ready to execute
Last activity: 2026-09-26

Progress: [█████████░] 89%

## Performance Metrics

**Velocity:**

- Total plans completed: 13
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |
| 01.1 | 8 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 20min | 3 tasks | 51 files |
| Phase 01 P02 | 10min | 3 tasks | 10 files |
| Phase 01 P03 | 15min | 2 tasks | 10 files |
| Phase 01 P04 | 25min | 3 tasks | 10 files |
| Phase 01 P01 | 25min | 3 tasks | 7 files |
| Phase 01.1 P02 | 12min | 3 tasks | 7 files |
| Phase 01.1 P03 | 10min | 2 tasks | 12 files |
| Phase 01.1 P04 | 20min | 3 tasks | 11 files |
| Phase 01.1 P05 | 20min | 2 tasks | 7 files |
| Phase 01.1 P06 | 6min | 2 tasks | 6 files |
| Phase 01.1 P07 | 7min | 2 tasks | 8 files |
| Phase 01.1 P08 | 15min | 2 tasks | 0 files |
| Phase 02 P01 | 25min | 3 tasks | 21 files |
| Phase 02 P02 | 6min | 3 tasks | 15 files |
| Phase 02 P03 | 5min | 3 tasks | 16 files |
| Phase 02 P04 | 5min | 3 tasks | 12 files |

## Accumulated Context

### Roadmap Evolution

- Phase 01.1 inserted after Phase 1: Arbitrage Tab: moneyline arbs from cached odds (no extra credits) + separate opt-in spreads/totals refresh button; odds-age + account-risk advisory (URGENT)

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Product reframe (2026-09-25): the opportunities feed and bonus-bet finder are the v1 product; the standalone manual hedge calculator is dropped from v1 (v2 candidate as TOOL-01). Superseded Phase 1 docs (calculator-first plan) archived at `.planning/archive/01-core-hedge-calculator-superseded/`.
- Roadmap rewritten to 5 phases around the new shape: (1) Bonus Bet Finder — scaffold, book config, odds ingestion, hedge engine, finder UI; (2) Private Access & My Books; (3) Promo Scraping & Review (adds boost math + scraping); (4) Opportunities Feed (the main screen); (5) Group-Added Promos.
- Hedge-engine rules and display rules from the superseded calculator discussion carry forward unchanged into Phase 1 and Phase 3 (see PROJECT.md Key Decisions table).
- Phase 01 Plan 01: americanToDecimal uses a local precision-40 Decimal clone (not the default precision-20), and bonusBet.ts snaps intermediate results to 20dp before final cent rounding — American odds that reduce to base-10 repeating decimals (-300, -275, etc.) have no exact finite representation; precision-20 truncation was large enough to flip a 2-decimal rounding decision, producing a one-cent error in the MLB fixture's guaranteed profit
- [Phase 01]: Neon project provisioned on Postgres 18.6 (research assumed 16/17); no schema/driver incompatibility observed with drizzle-orm/drizzle-kit at pinned versions
- [Phase 01]: db:migrate/db:seed/db:check load env via dotenv or tsx --env-file, never shell 'source .env.local' -- the pooled Neon connection string contains an unescaped & that breaks zsh sourcing
- [Phase 01]: Dark mode driven purely by prefers-color-scheme media query (not shadcn's class-based .dark selector), matching UI-SPEC's OS-preference-only requirement without a client-side theme-toggle script
- [Phase 01]: Used z.input<typeof FinderInputSchema> (not the exported FinderInput output type) as the react-hook-form generic to route around the @hookform/resolvers + zod@4 overload mismatch (resolvers issue #842) without touching the shared schema contract
- [Phase 01]: Plan 04: Requested with bookmakers=<7 free-tier keys> instead of regions=us,us2, halving credit cost per in-season sport (1 credit instead of 2)
- [Phase 01]: Plan 04: Live ODDS-05 verification confirmed the D-16 expectation exactly (7 free-tier CO books present, williamhill_us/fanatics absent) -- no book-config drift, src/config/books.ts unchanged
- [Phase 01]: Plan 04: First live refresh spent 4 of 500 monthly Odds API credits (1 smoke + 3 refresh); 496 remaining
- [Phase 01.1]: Plan 01: calculateArb treats the entered total stake as a hard cap (tightens RESEARCH.md's independent-rounding sketch, which could exceed the stake)
- [Phase 01.1]: Plan 01: findBestArbPair does an explicit O(n^2) cross-book pair search, not per-side independent-best lookups, to satisfy D-06 (different books required)
- [Phase 01.1]: Plan 01: spreads are grouped by the home team's signed point (not magnitude) to avoid mispairing a flipped favorite across books
- [Phase 01.1]: Plan 02: cached_extended_odds is a structural twin of cached_odds with its own writer/purge/latest-batch lifecycle, no shared table-parameterized helper, to keep D-16's independence guarantee mechanically enforceable
- [Phase 01.1]: Plan 03: Guarded bonusAmount/maxHedgeAmount Zod refines against non-numeric input, since zod v4 runs every chained check regardless of earlier failures and an unconditional Decimal construction threw on inputs like "abc"
- [Phase 01.1]: Plan 03: limitExcludedAll[scope] only re-ranks without the cap when that scope's capped ranking is empty, so a sport tab with zero markets regardless of the cap never shows a misleading limit message
- [Phase 01.1]: Plan 04: the extended refresh also writes an h2h projection of every fetched event into cached_odds (sharing one timestamp/purge sequence), refining RESEARCH.md's 'cached_odds untouched' sketch, since the user already paid for the h2h market as part of the 3x request
- [Phase 01.1]: Plan 04: estimatedExtendedRefreshCredits re-derives from the latest credit row's sportsFetched with marketCount=3 rather than reusing its refreshCost verbatim, since the shared credit_usage ledger's latest row may reflect either fetch path
- [Phase 01.1]: Plan 05: ArbResultDTO exposes only marketBadge (formatted string), not the raw numeric line, per the plan's exact interface contract
- [Phase 01.1]: Plan 05: fixture (d)'s three-book spread tie was designed so findBestArbPair's alphabetical-bookKey tiebreak can resolve to either candidate book as sideA without breaking the test
- [Phase 01.1]: Plan 06: ArbDetails step markers use literal 'Leg A'/'Leg B' text (a pill badge) instead of the finder's single-letter circle, matching the plan's exact copy contract
- [Phase 01.1]: Plan 06: MultipleBooksPopover uses Popover (not Tooltip) for the tied-book list since it must be reachable by tap on mobile; the trigger's onClick stops propagation so it doesn't also toggle the row's Collapsible
- [Phase 01.1]: Plan 07: SearchSpreadsTotalsDialog's doc comment repeated the literal refreshSpreadsTotals({ confirmed: true }) call-site string, inflating a grep-based acceptance criterion -- reworded to describe the same behavior without the exact literal (Rule 1, pre-commit fix)
- [Phase 01.1]: Plan 07: kept status-derived standing blocked/warning banners and search-outcome-derived blocked/busy/error banners in ArbForm as two separate code paths even though blocked copy is identical, since the plan describes them as distinct concerns (passive credit indicator vs. an active search attempt's own result)
- [Phase 01.1]: Plan 08: No arbs in the live feed at verification time is correct behavior -- a post-verification diagnostic over the live cache (357 two-way markets, 306 with a cross-book pair) found zero implied-sum-under-1.0 opportunities; the closest market was an exact break-even (1.0000), correctly excluded by the strict D-04 threshold
- [Phase 02]: Plan 01: redeemInviteAndCreateUser is the ONLY insert site into users, enforced by a single multi-CTE SQL statement (claim invite FOR UPDATE -> insert user FROM that CTE -> mark invite used) since neon-http has no interactive transactions
- [Phase 02]: Plan 01: SESSION_COOKIE_NAME lives in a dependency-free src/lib/sessionCookie.ts, re-exported from session.ts, so a future proxy.ts can read the cookie name without importing next/headers/iron-session
- [Phase 02]: Plan 02: nextFailedLoginState resets the counter to 0 when it sets lockedUntil, so the lock itself (not a growing counter) blocks further attempts once 5 consecutive failures occur
- [Phase 02]: Plan 02: AccountMenu's Settings item uses router.push('/settings') rather than composing a Link into DropdownMenuItem's render prop, keeping both menu items' click handlers symmetrical
- [Phase 02]: Plan 03: requireUser() is called only from the two server actions (refresh-odds.ts, refresh-spreads-totals.ts), never from refresh.ts/refreshExtended.ts, so the CLI path stays free of next/headers/iron-session; CLI runs record triggeredByUserId null
- [Phase 02]: Plan 03: getSpendAttribution matches on exact credit_usage.recorded_at equality against each cache's own fetched_at, not the single most-recent row, so the Odds tab and the Arbitrage tab's spreads/totals line can each correctly name a different last-refreshing user
- [Phase 02]: Plan 04: getBonusBooks/getHedgeBookKeys extend in place with an optional allowedKeys parameter rather than adding parallel scoped functions, so omitting the argument preserves the original 'every usable book' behavior and every existing call site is unaffected
- [Phase 02]: Plan 04: SaveBooksInputSchema has no user-identifying field at all -- the user id enters saveUserBooks/getUserBookKeys only from requireUser()'s session inside save-books.ts, closing the IDOR threat at the schema level

### Pending Todos

None - "Add max hedge amount input to bonus-bet finder" resolved in Phase 01.1 Plan 03 (moved to `.planning/todos/done/`).

### Blockers/Concerns

- Phase 1/2: Official Colorado sportsbook operator list triangulated from third-party sources only (sbg.colorado.gov returned 403 during research) — spot-check before finalizing book config.
- Phase 3: Event/market matching approach has no single reference architecture — worth a focused spike before committing.
- Phase 3: Per-book scraping feasibility is uncertain (anti-bot posture varies) — research per target book when planning this phase.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260925-wy0 | revert CR-02: apply hedge cap after picking best orientation | 2026-09-26 | 5aef9e1 | [260925-wy0-revert-cr-02-apply-hedge-cap-after-picki](./quick/260925-wy0-revert-cr-02-apply-hedge-cap-after-picki/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-09-26T09:48:04.277Z
Stopped at: Completed 02-04-PLAN.md
Resume file: None
