# Roadmap: PromoProfit

## Overview

PromoProfit ships as five vertical slices. Phase 1 builds the bonus-bet finder end to end — project scaffold, verified Colorado book config, quota-safe odds ingestion, and the fixture-tested hedge engine — so a user can enter a bonus bet and get a real, correct-to-the-cent hedge on day one. Phase 2 locks the app down to the owner and invited friends and gives each user a persistent book selection that narrows the finder's suggestions. Phase 3 adds profit-boost math (with caps) and automated promo scraping of public Colorado book pages, with a human review queue guarding any uncertain event match. Phase 4 assembles the project's actual differentiator — the opportunities feed, the main screen — auto-computing ranked, book-filtered opportunities from everything scraped so far, including competing-promo tandem detection. Phase 5 closes the gap scraping can't reach: any group member can hand-add a promo they see in their own app, feeding the same feed. By the end, the owner and a small group of friends can log in, work the bonus-bet finder, and scan a ranked opportunities feed built from both scraped and group-added promos — filtered to the books they actually use, correct to the cent.

**Product reframing note:** The original Phase 1 plan led with a standalone manual hedge calculator. On 2026-09-25 the owner reframed the product around the auto-computed opportunities feed and bonus-bet finder; the calculator was dropped from v1 (see PROJECT.md Out of Scope, `TOOL-01` in REQUIREMENTS.md v2). Those superseded docs live in `.planning/archive/01-core-hedge-calculator-superseded/`. The hedge-engine rules established in that discussion — equal profit on both outcomes, boost stake defaults to the cap-allowed max, binding caps auto-reduce stake with an explanation, boost % applies to profit, American odds only, money to the cent — carry forward into this roadmap's Phase 1 and Phase 3 (see PROJECT.md Key Decisions).

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Bonus Bet Finder** - Scaffold, verified book config, odds ingestion/cache/refresh, fixture-tested bonus-bet hedge engine, finder screen
- [ ] **Phase 2: Private Access & My Books** - Invite-only login, persistent book selection, finder scoped to the user's books
- [ ] **Phase 3: Promo Scraping & Review** - Scheduled scraping of public promo pages, profit-boost math with caps, review queue for uncertain matches
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

- [ ] 01-03-PLAN.md — Finder UI: form → ranked rows → expand panel, sport filter, same-book/NFL tie badges, empty states
- [ ] 01-04-PLAN.md — Odds API client, credit gate, refreshOdds action + odds:refresh CLI, live ODDS-05 book-key smoke test (checkpoint)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 01-05-PLAN.md — Status bar: odds age (amber at 2h), credit meter/banners, Refresh odds with 15-min confirm dialog + recompute, phase walkthrough

*Research flag: live Odds API verification needed for Caesars/Fanatics free-tier access and the theScore Bet bookmaker key before finalizing the book list (see research/SUMMARY.md Open Conflicts).*

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

**Plans**: TBD
**UI hint**: yes

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

**Plans**: TBD
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

**Plans**: TBD
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
| 1. Bonus Bet Finder | 2/5 | In Progress|  |
| 2. Private Access & My Books | 0/? | Not started | - |
| 3. Promo Scraping & Review | 0/? | Not started | - |
| 4. Opportunities Feed | 0/? | Not started | - |
| 5. Group-Added Promos | 0/? | Not started | - |
