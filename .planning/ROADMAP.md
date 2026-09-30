# Roadmap: PromoProfit

## Overview

PromoProfit ships as five vertical slices. Phase 1 builds the bonus-bet finder end to end — project scaffold, verified Colorado book config, quota-safe odds ingestion, and the fixture-tested hedge engine — so a user can enter a bonus bet and get a real, correct-to-the-cent hedge on day one. Phase 2 locks the app down to the owner and invited friends and gives each user a persistent book selection that narrows the finder's suggestions. Phase 3 adds profit-boost math (with caps) and automated promo scraping of public Colorado book pages, with a human review queue guarding any uncertain event match. Phase 4 assembles the project's actual differentiator — the opportunities feed, the main screen — auto-computing ranked, book-filtered opportunities from everything scraped so far, including competing-promo tandem detection. Phase 5 closes the gap scraping can't reach: any group member can hand-add a promo they see in their own app, feeding the same feed. By the end, the owner and a small group of friends can log in, work the bonus-bet finder, and scan a ranked opportunities feed built from both scraped and group-added promos — filtered to the books they actually use, correct to the cent.

**Product reframing note:** The original Phase 1 plan led with a standalone manual hedge calculator. On 2026-09-25 the owner reframed the product around the auto-computed opportunities feed and bonus-bet finder; the calculator was dropped from v1 (see PROJECT.md Out of Scope, `TOOL-01` in REQUIREMENTS.md v2). Those superseded docs live in `.planning/archive/01-core-hedge-calculator-superseded/`. The hedge-engine rules established in that discussion — equal profit on both outcomes, boost stake defaults to the cap-allowed max, binding caps auto-reduce stake with an explanation, boost % applies to profit, American odds only, money to the cent — carry forward into this roadmap's Phase 1 and Phase 3 (see PROJECT.md Key Decisions).

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Bonus Bet Finder** - Scaffold, verified book config, odds ingestion/cache/refresh, fixture-tested bonus-bet hedge engine, finder screen (completed 2026-09-25)
- [x] **Phase 01.1: Arbitrage Tab** (INSERTED) - Moneyline arbs from cached odds, opt-in spreads/totals refresh, odds-age + account-risk advisory (completed 2026-09-26)
- [x] **Phase 2: Private Access & My Books** - Invite-only login, persistent book selection, finder scoped to the user's books (completed 2026-09-26)
- [x] **Phase 3: Promo Scraping & Review** - Scheduled scraping of public promo pages, profit-boost math with caps, review queue for uncertain matches (completed 2026-09-29)
- [ ] **Phase 4: Opportunities Feed** - Main screen: auto-computed, sortable, book-filtered opportunities with competing-promo tandem detection
- [ ] **Phase 5: Group-Added Promos** - Any group member can hand-add a promo, shared or private, feeding the same feed

## Phase Details

### Phase 1: Bonus Bet Finder

**Goal**: A user can enter a bonus bet they have at a book and see, from real cached Colorado odds, the best market to convert it and the best book to hedge at, with exact stakes and guaranteed profit
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: CALC-01, CALC-04, CALC-05, ODDS-01, ODDS-02, ODDS-03, ODDS-04, ODDS-05, BONUS-01
**Success Criteria** (what must be TRUE):

  1. User can enter a book and bonus-bet dollar amount and see a ranked list of conversion markets, each with the hedge book, both stakes, guaranteed profit, and conversion % of the bonus amount
  2. Guaranteed profit is identical to the cent whichever leg wins, verified against documented fixtures (e.g. $100 bonus at +300 hedged at -275 → $220 hedge, $80 profit, 80%)
  3. Hedge search only considers 2-way, no-push markets (moneylines, whole-number-free lines)
  4. User can press a refresh button to re-fetch odds from The Odds API and recompute; between refreshes the finder shows the last computed results with a visible timestamp/age
  5. User sees remaining monthly API credits and is blocked or warned before a refresh that would exhaust the budget; the Colorado book list (with Odds API keys, including theScore Bet) is stored as configuration and verified against a live API call

**Plans**: 5 plans
**UI hint**: yes

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Scaffold (Next.js, Vitest, shadcn), failing E2E finder test, fixture-tested bonus-bet engine + no-push market filter + top-10 ranking

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Drizzle schema, findHedges server action (E2E test green), Neon provisioning checkpoint, [BLOCKING] migrate + seed book config

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Finder UI: form → ranked rows → expand panel, sport filter, same-book/NFL tie badges, empty states
- [x] 01-04-PLAN.md — Odds API client, credit gate, refreshOdds action + odds:refresh CLI, live ODDS-05 book-key smoke test (checkpoint)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-05-PLAN.md — Status bar: odds age (amber at 2h), credit meter/banners, Refresh odds with 15-min confirm dialog + recompute, phase walkthrough

*Research flag: live Odds API verification needed for Caesars/Fanatics free-tier access and the theScore Bet bookmaker key before finalizing the book list (see research/SUMMARY.md Open Conflicts).*

### Phase 01.1: Arbitrage Tab (INSERTED)

**Goal:** A user can open an Arbitrage tab (no promos involved) and see cross-book sure-bet arbitrage among the Colorado books from cached odds, with exact cent-level stakes for both legs, guaranteed profit, and return %
**Requirements**: TBD
**Depends on:** Phase 1
**Success Criteria** (what must be TRUE):

  1. An Arbitrage tab lists two-way moneyline arbs across different Colorado books from the odds the existing refresh already fetches (no extra credits), ranked by return %, each with both books, odds, stakes for a user-chosen total stake, and guaranteed profit correct to the cent (decimal.js, reusing the Phase 1 hedge math)
  2. Spreads and totals are fetched only when the user presses a separate "Search spreads & totals" button with its own credit estimate and confirm (~3x credits), guarded by the existing credit gate and refresh lock; only half-point (no-push) lines matched exactly across books are considered
  3. Odds age is shown prominently on the tab (stale cached odds produce phantom arbs), and an account-limiting risk advisory is visible

**Plans:** 8/8 plans complete
**UI hint**: yes

Plans:
**Wave 1**

- [x] 01.1-01-PLAN.md — Arb domain: arbMath (cent-exact stake split, whole/cents rounding under the total-stake cap), rankArbs (book-pair search, exact ties, return-% sort), half-point spreads/totals extractor
- [x] 01.1-02-PLAN.md — cached_extended_odds table + migration, extended store/queries, [BLOCKING] db:migrate on live Neon
- [x] 01.1-03-PLAN.md — Finder max hedge amount (folded todo): checkbox-gated cap before top-10, under-limit empty state, localStorage persistence helper

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01.1-04-PLAN.md — Spreads & totals fetch: client markets param, 3x credit estimate, runSpreadsTotalsRefresh (shared lock/ledger/gate), refreshSpreadsTotals action, status extensions, smoke --extended
- [x] 01.1-05-PLAN.md — findArbs server action + arb input/DTO/label contracts + fixtures (zero API calls)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01.1-06-PLAN.md — Arb result components: rows, expanded details (worst-case headline), Multiple books popover, sport sub-tabs, empty states

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01.1-07-PLAN.md — Arbitrage tab UI + page shell: top-level tabs, stake/precision controls, Search spreads & totals confirm, spreads/totals age line, risk advisory

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01.1-08-PLAN.md — Phase gate: full suite/build, live markets=h2h,spreads,totals smoke call, owner verification (checkpoint)

### Phase 2: Private Access & My Books

**Goal**: Only the owner and invited friends can access the app, each selects the books they actually have, and the bonus-bet finder's hedge suggestions only ever use those books
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DASH-04, DASH-02, BONUS-02, CALC-06
**Success Criteria** (what must be TRUE):

  1. Only invited users can log in through an invite-only login page; there is no public signup path
  2. User can select which Colorado sportsbooks they have accounts with on a persistent settings screen, and the selection is remembered across sessions
  3. Bonus-bet finder hedge suggestions only surface books the user has selected
  4. User sees a brief account-risk advisory near hedge results explaining that precise stakes and promo-only play can lead to account limiting

**Plans**: 9 plans (6 + 3 gap closure)
**UI hint**: yes

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Join by invite: auth deps, whole-phase schema + [BLOCKING] migrate, iron-session helper, atomic single-use redeemInvite, invite:create + password:reset scripts, /invite/[token] page

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Log in / log out: DB-backed lockout, /login page, proxy.ts gate, requireUser on main page, header account menu
- [x] 02-03-PLAN.md — Credit spends login-only (closes WR-05) and attributed ("Refreshed by"), finder account-risk advisory (CALC-06)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-04-PLAN.md — My books: user_books queries, saveBooks action, pick-your-books onboarding, Settings page, book-gated main page with scoped bonus-book dropdown

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-05-PLAN.md — Finder hedges and arb legs scoped to the user's books, "No games at your books right now" empty state

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 02-06-PLAN.md — Phase gate: full suite/build, validation map, owner walkthrough (checkpoint)

**Gap closure — Wave 1**

- [x] 02-07-PLAN.md — CR-01: atomic reserveLoginAttempt before argon2 verify + concurrency test (lockout holds under parallel requests)
- [x] 02-08-PLAN.md — CR-02/WR-01: shared getUsableUserBooks predicate for /, /onboarding/books, /settings (no redirect loop, no stale settings keys)

**Gap closure — Wave 2** *(blocked on 02-08)*

- [x] 02-09-PLAN.md — Settings navigation: header wordmark links home, "Back to PromoProfit" link, link after save, UI-SPEC amendment (owner checkpoint)

### Phase 3: Promo Scraping & Review

**Goal**: Profit-boost promos are computed correctly with caps applied, and promos (bonus bets and boosts) are discovered automatically from public Colorado book promo pages on a schedule, with any uncertain event/market match held for human confirmation before it's trusted
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: CALC-02, CALC-03, PROMO-03, PROMO-04
**Success Criteria** (what must be TRUE):

  1. System computes profit-boost hedges from a boost % applied to profit or a book-published boosted price: exact stakes, guaranteed profit, and ROI % on cash risked
  2. Profit-boost calculations respect the promo's max-stake and max-winnings caps, choosing the optimal stake when a cap binds
  3. On a schedule (via GitHub Actions), the system scrapes publicly accessible, no-login promo pages for at least one Colorado book and adds discovered promos automatically
  4. A scraped promo whose event or market can't be matched with certainty is held in a review queue and excluded from hedge math until confirmed
  5. User can confirm or correct a queued match from a review screen, after which it becomes an active promo usable in hedge calculations

**Plans:** 15/15 plans complete

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Wave 0 recon: find the real logged-out single-game promo source (Bally Bet / BetRivers), capture fixture, owner's D-09 per-book call, Bluesky/X findings
- [x] 03-02-PLAN.md — Profit-boost engine (published vs derived price, cap-optimal stake, ROI) + whole-dollar bonus-bet precision, known-answer TDD
- [x] 03-03-PLAN.md — Promos tab + promos/scrape_runs schema and migration [BLOCKING], per-book scrape status, empty states

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-04-PLAN.md — Promo scope model (migration 0005 [BLOCKING]) + app picks the best event/market/side inside each promo's scope under caps and min odds
- [x] 03-05-PLAN.md — Scope-based ScrapedPromo + http BookScraper contract, fine-print caps, D-15 exclusions, sport hints, ET dates, dedupe key, status-after-match rule

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-12-PLAN.md — Bally Bet parser (list + detail JSON) against real fixtures
- [x] 03-13-PLAN.md — DraftKings parser (single POST JSON) against the real fixture
- [x] 03-14-PLAN.md — FanDuel parser (list + detail JSON), hidden max wager routed to cap review
- [x] 03-15-PLAN.md — Active promos show exact hedges: getActivePromos, promo rows with scope, "best of N" and opt-in/claim hint

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-06-PLAN.md — Scrape pipeline for all three books (polite http fetch, dedupe/expiry lifecycle, run status), registry, CLI, GitHub Actions workflow, first live scrape
- [x] 03-07-PLAN.md — "Needs review (N)" queue with Confirm (scope guess) and Dismiss (attributed, race-safe)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 03-08-PLAN.md — Deterministic scope matcher (sport + window + named-game teams), auto-accept + re-match wired into scrape, tuned on real samples from three books
- [x] 03-09-PLAN.md — Correct (game or sport-day, optional market pin) and Enter cap details (FanDuel hidden cap) reviewer flows

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 03-10-PLAN.md — Flag-back on auto-matched rows (D-11 safety net)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 03-11-PLAN.md — Go live: push + DATABASE_URL secret, workflow dispatch verified for three books, owner end-to-end walkthrough

**UI hint**: yes

*Research flag: scraping feasibility varies per book (anti-bot posture) and the event/market matching approach has no single reference architecture — spike both before committing to an implementation (see research/SUMMARY.md Research Flags).*

### Phase 4: Opportunities Feed

**Goal**: The main screen shows opportunities auto-computed from current promos and cached odds, ranked by profit, filtered to the user's books, including competing-promo tandem opportunities
**Mode:** mvp
**Depends on**: Phase 2, Phase 3
**Requirements**: DASH-01, DASH-03, DASH-05, CALC-07
**Success Criteria** (what must be TRUE):

  1. User sees an opportunities feed (the main screen) computed automatically from current promos and cached odds, each row showing the promo, best hedge book, both stakes, guaranteed profit, and ROI/conversion %
  2. User can sort the feed by guaranteed profit and by ROI/conversion %
  3. Feed opportunities on both the promo side and hedge side are filtered to the user's selected books
  4. When two books have promos on opposite outcomes of the same game/market, the feed shows the tandem opportunity and its profit next to the profit from hedging each separately, with each leg's promo mechanics and caps applied

**Plans**: 9 plans

Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Opportunities tab (first/default): profit summary, Profit/ROI switch, Best promos at your books, See all
- [x] 04-02-PLAN.md — Pair solver (TDD): boost+boost and boost+bonus stakes/profit, oracle-tested to the cent

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-03-PLAN.md — Pair discovery + exact non-conflicting matching (TDD), beats-separate gate
- [x] 04-04-PLAN.md — Tab restructure: Opportunities | Arbitrage | Promos (Active/Done/Review) | Tools; sort on Promos
- [x] 04-05-PLAN.md — Best arbs at a fixed $100 stake, member books only, See all arbs

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 04-06-PLAN.md — Best pairs section: pair card, details, pair-aware Total profit available

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 04-07-PLAN.md — Mark pair done: server recompute, odds-changed check, one atomic write

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 04-08-PLAN.md — Done list shows the pair once; Undo from either promo

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 04-09-PLAN.md — Phase gate: full suite/typecheck/lint + owner phone check
**UI hint**: yes

### Phase 5: Group-Added Promos

**Goal**: Any group member can hand-add a promo they see in their own app, mark it shared or private, and manage the promos they added — feeding the same opportunities feed scraping can't fully cover
**Mode:** mvp
**Depends on**: Phase 3, Phase 4
**Requirements**: PROMO-01, PROMO-02, PROMO-05
**Success Criteria** (what must be TRUE):

  1. Any group member can add a promo (book, type, boost % or boosted price, market, max stake, max winnings, expiry) by picking a real upcoming event from a dropdown, and it appears in the opportunities feed
  2. User can mark an added promo as shared (visible to everyone with that book) or private (visible only to them)
  3. User can edit, expire, or delete promos they added, and the change is reflected in the feed immediately

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Bonus Bet Finder | 5/5 | Complete   | 2026-09-25 |
| 01.1. Arbitrage Tab (INSERTED) | 8/8 | Complete    | 2026-09-26 |
| 2. Private Access & My Books | 9/9 | Complete    | 2026-09-27 |
| 3. Promo Scraping & Review | 15/15 | Complete    | 2026-09-29 |
| 4. Opportunities Feed | 5/9 | In Progress|  |
| 5. Group-Added Promos | 0/? | Not started | - |
