---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Quick 260930-gyl (alt spreads for game-scoped promos) research running; handoff in .planning/.continue-here.md
last_updated: "2026-09-30T18:15:45.196Z"
last_activity: "2026-09-30 - Completed quick task 260930-gam: Add alternate spread lines for pinned promo games"
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 56
  completed_plans: 56
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-25)

**Core value:** Show every profitable opportunity from current promos, ranked by guaranteed profit, with the exact stakes and hedge book — correct to the cent, so a user can just pick and place bets.
**Current focus:** Phase 5 — Group-Added Promos

## Current Position

Phase: 5 (Group-Added Promos) — EXECUTING
Plan: 1 of 10
Status: Executing Phase 5
Last activity: 2026-09-30 - Completed quick task 260930-gam: Add alternate spread lines for pinned promo games

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 46
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |
| 01.1 | 8 | - | - |
| 2 | 9 | - | - |
| 3 | 15 | - | - |
| 4 | 9 | - | - |

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
| Phase 02 P05 | 4min | 3 tasks | 11 files |
| Phase 02 P06 | 2min | 2 tasks | 1 files |
| Phase 02 P07 | 9min | 2 tasks | 4 files |
| Phase 02 P08 | 9min | 2 tasks | 6 files |
| Phase 02 P09 | 12min | 3 tasks | 5 files |

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
- [Phase 02]: Plan 05: requireUser() is the first statement in findHedges/findArbs, before Zod parsing, so a logged-out request never reaches getCachedEvents/getCachedExtendedEvents
- [Phase 02]: Plan 05: booksExcludedAll is recomputed only when the 'all' scope is already empty and the user hasn't selected every usable book, re-deriving from the same cached events (zero extra DB reads, zero Odds API calls)
- [Phase 02]: Plan 06: Owner completed the live walkthrough approving steps 1-8 (invite bootstrap, book selection, scoped suggestions, shared risk advisory, settings persistence, invite reuse rejection); closed CALC-06 as the phase's last manual-only verification
- [Phase 02]: Plan 07: reserveLoginAttempt's CASE arithmetic mirrors nextFailedLoginState exactly, so sequential lockout behavior is unchanged; only concurrent behavior is fixed (bounded to MAX_FAILED_LOGIN_ATTEMPTS)
- [Phase 02]: Plan 07: recordFailedLogin deleted entirely rather than kept alongside reserveLoginAttempt, closing the lost-update path CR-01/T-02-G2 by removing the second way to write the counter
- [Phase 02]: Plan 08: getUsableUserBooks composes getUserBookKeys + getBonusBooks(new Set(...)) rather than duplicating the intersection logic, so it can never drift from getBonusBooks' own usable-book filtering
- [Phase 02]: Plan 08: getUserBookKeys and getBonusBooks themselves left unchanged -- find-hedges.ts/find-arbs.ts already intersect independently via getHedgeBookKeys, out of this plan's scope
- [Phase 02]: Plan 09: All navigation hrefs added (header wordmark, settings back-link, save-success link) are the hard-coded literal "/" -- no query-param or user-controlled redirect target -- closing the open-redirect threat (T-02-G8) at the source
- [Phase 02]: Plan 09: Owner completed the live click-through approving steps 1-6 (header wordmark link, settings back-link, save-success link, book-change reflected on main page); closed DASH-02 as Phase 2's last outstanding must-have

### Pending Todos

None - "Add max hedge amount input to bonus-bet finder" resolved in Phase 01.1 Plan 03 (moved to `.planning/todos/done/`).

### Blockers/Concerns

- Phase 1/2: Official Colorado sportsbook operator list triangulated from third-party sources only (sbg.colorado.gov returned 403 during research) — spot-check before finalizing book config.
- Phase 3: Event/market matching approach has no single reference architecture — worth a focused spike before committing.
- Phase 3: Per-book scraping feasibility is uncertain (anti-bot posture varies) — research per target book when planning this phase.
- Scheduled scrape never fires (tracked open item, owner decision 2026-09-29): GitHub has never created a `schedule` run for Scrape promos (cron `7 14,18,23 * * *`; timezone key, minute shifts and disable/re-enable all tried). Manual dispatch works. Next: external trigger of workflow_dispatch or GitHub support — do not reshuffle cron. Fix alongside Phase 4.
- Phase 3 deferred walkthrough steps (owner: "approved, queue steps later"): Confirm, Correct (new search/date-range picker, check on phone), Enter cap details, Dismiss, Needs a look card, Auto-matched flag — check on the next scrape that queues a promo.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260925-wy0 | revert CR-02: apply hedge cap after picking best orientation | 2026-09-26 | 5aef9e1 |  | [260925-wy0-revert-cr-02-apply-hedge-cap-after-picki](./quick/260925-wy0-revert-cr-02-apply-hedge-cap-after-picki/) |
| 260927-edt | show unprofitable promos greyed out on Promos tab | 2026-09-27 | b86f24e |  | [260927-edt-show-unprofitable-promos-greyed-out](./quick/260927-edt-show-unprofitable-promos-greyed-out/) |
| fast | fix Base UI nativeButton console errors (empty-state links, Multiple books badge) | 2026-09-27 | 06f67f8 |  | — |
| 260927-n12 | promos total profit, mark-used state, daily/weekly/monthly profit tracking + morning odds refresh | 2026-09-27 | 8254f50 |  | [260927-n12-promos-total-profit-mark-used-state-dail](./quick/260927-n12-promos-total-profit-mark-used-state-dail/) |
| 260927-ov2 | scraper: don't fail job when a book has no usable promos; morning step runs after failed scrape; Actions v7 | 2026-09-27 | be48e83 |  | [260927-ov2-scraper-do-not-fail-job-when-book-has-no](./quick/260927-ov2-scraper-do-not-fail-job-when-book-has-no/) |
| 260927-pcc | DraftKings: parse single-game boosts; label player-stat Super Boosts as prop | 2026-09-27 | fcc35c1 |  | [260927-pcc-draftkings-single-game-boosts-and-super-](./quick/260927-pcc-draftkings-single-game-boosts-and-super-/) |
| 260928-i3r | DK HR Bet-and-Get as prop, missing-boost guard, FanDuel pre-live fix, cron to :07 | 2026-09-28 | 3f429c2 |  | [260928-i3r-draftkings-bet-and-get-prop-skip-and-sch](./quick/260928-i3r-draftkings-bet-and-get-prop-skip-and-sch/) |
| 260928-it1 | uncertain promos to 'Needs a look' review queue; NHL support | 2026-09-28 | 69f47e9 | Needs Review | [260928-it1-uncertain-promos-to-review-queue-and-add](./quick/260928-it1-uncertain-promos-to-review-queue-and-add/) |
| 260928-kc5 | Claude Haiku promo reader with field-bound verbatim guard, reconcile, cache, fallback | 2026-09-28 | 022b8fc | Verified | [260928-kc5-claude-haiku-promo-reader-with-verbatim-](./quick/260928-kc5-claude-haiku-promo-reader-with-verbatim-/) |
| 260928-mgi | reader review tightening (clear skips win, rescue needs amount); Sign-up offers tab | 2026-09-28 | 9121429 | Verified | [260928-mgi-reader-review-tightening-and-new-custome](./quick/260928-mgi-reader-review-tightening-and-new-custome/) |
| fast | Sign-up offers: 'Show books I already have' checkbox | 2026-09-28 | df1e868 |  | — |
| fast | scrape cron switched to plain UTC 7 14,18,23 (timezone key never fired) | 2026-09-28 | c9eb35b |  | — |
| 260929-gcn | multi-day promo windows: FanDuel date parsing + review-queue date range | 2026-09-29 | 549284d | Verified | [260929-gcn-multi-day-promo-windows-fanduel-date-par](./quick/260929-gcn-multi-day-promo-windows-fanduel-date-par/) |
| 260929-hht | review game picker: search box for one game, league + From/Through date range (replaces the single dropdown) | 2026-09-29 | b52bdbb | Needs Review | [260929-hht-review-game-picker-searchable-multi-game](./quick/260929-hht-review-game-picker-searchable-multi-game/) |
| 260929-igk | Mark done saves a frozen snapshot, Active/Done tabs, per-account Total profit extracted (migration 0009 applied) | 2026-09-29 | 79bff9c | Needs Review | [260929-igk-mark-done-snapshots-promo-done-tab-total](./quick/260929-igk-mark-done-snapshots-promo-done-tab-total/) |
| 260930-fge | Exclude Done promos from the Available today profit counter (week/month unchanged) | 2026-09-30 | 14fd59c |  | [260930-fge-exclude-done-promos-from-the-available-t](./quick/260930-fge-exclude-done-promos-from-the-available-t/) |
| fast | Remove 'Available today' from the profit summary (headline total covers it) | 2026-09-30 | 5fb8d44 | ✅ | - |
| 260930-gam | Alternate spread lines for pinned promo games (Refresh button only, max 5 games, exact opposite line) | 2026-09-30 | 10eb4c1 | Needs Review | [260930-gam-add-alternate-spread-lines-for-pinned-pr](./quick/260930-gam-add-alternate-spread-lines-for-pinned-pr/) |
| fast | Phone login on dev server: allowedDevOrigins for LAN IP; auth forms POST so credentials never go in the URL | 2026-09-30 | 4c5009e | ✅ | - |
| fast | removed descriptor lines under Total profit possible / Total profit extracted | 2026-09-29 | 4b3af2a | | - |
| fast | headline renamed Total profit possible -> Total profit available | 2026-09-29 | 84ed15b | | - |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-09-30T18:15:45.179Z
Stopped at: Quick 260930-gyl (alt spreads for game-scoped promos) research running; handoff in .planning/.continue-here.md
Resume file: .planning/.continue-here.md
