# Roadmap: PromoProfit

## Overview

PromoProfit ships as five vertical slices, each independently usable. Phase 1 delivers a working hedge calculator with manual odds entry — the correctness-critical core, fixture-tested and dependency-free. Phase 2 upgrades that calculator with real, quota-safe Colorado odds fetched on demand. Phase 3 connects promos to the calculator via a dropdown-first manual entry form, so any promo the owner or a friend sees can be captured and hedged immediately. Phase 4 turns the single-user flow into the private multi-user dashboard — invite-only login, per-user book filtering, and a ranked opportunities view — which is the project's actual differentiator. Phase 5 closes the loop with best-effort scraping of public promo pages, feeding the same human-confirmation queue that protects match correctness. By the end, the owner and a small group of friends can log in, see ranked hedge opportunities filtered to their books, and trust every guaranteed-profit figure to the cent.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core Hedge Calculator** - Fixture-tested bonus-bet and profit-boost hedge math, usable via manual odds entry
- [ ] **Phase 2: Odds Ingestion & Quota-Safe Caching** - Real Colorado odds replace manual entry, fetched on demand within the free-tier budget
- [ ] **Phase 3: Manual Promo Entry & Event Matching** - Any promo can be captured against a real event and hedged immediately
- [ ] **Phase 4: Opportunities Dashboard, Book Filter & Private Access** - Invite-only multi-user dashboard with per-user book filtering
- [ ] **Phase 5: Promo Scraping & Review Queue** - Public promo pages scraped on a schedule, unmatched results held for human confirmation

## Phase Details

### Phase 1: Core Hedge Calculator
**Goal**: User can compute exact, verified-correct hedge stakes and guaranteed profit for a bonus bet or profit boost by manually entering odds for both legs
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: CALC-01, CALC-02, CALC-03, CALC-04, CALC-05, CALC-06
**Success Criteria** (what must be TRUE):
  1. User can enter a bonus-bet promo (bonus amount, promo odds, hedge odds) and see exact stakes for both legs, guaranteed profit, and conversion % of the bonus amount
  2. User can enter a profit-boost promo (boost % or boosted price, max stake/max winnings) and see exact stakes, guaranteed profit, and ROI % on cash risked
  3. When a boost's max-stake or max-winnings cap binds, the calculator clamps to the optimal stake within the cap
  4. Guaranteed profit is identical to the cent regardless of which leg wins, verified against documented fixtures (e.g. $100 bonus at +300 hedged at -275 → $220 hedge, $80 profit, 80%)
  5. The calculator restricts hedge search to 2-way, no-push markets and shows an account-risk advisory alongside every result
**Plans**: TBD
**UI hint**: yes

### Phase 2: Odds Ingestion & Quota-Safe Caching
**Goal**: The calculator's hedge side is populated with real, current Colorado sportsbook odds fetched on demand within the free-tier budget, and bonus-bet hedges search across markets automatically
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: ODDS-01, ODDS-02, ODDS-03, ODDS-04, ODDS-05
**Success Criteria** (what must be TRUE):
  1. User can trigger an odds refresh for a promo and see real Colorado-book odds populate the hedge side of the calculator, replacing manual entry
  2. User sees remaining monthly API credits, and the app blocks or warns before a refresh that would exhaust the budget
  3. User sees how old the displayed odds are and is prompted to refresh before relying on them for a bet
  4. For a bonus bet, the system automatically searches multiple games/markets in a sport and surfaces the highest-conversion hedge, not just a single user-picked market
  5. The Colorado book list (API keys, including theScore Bet) is stored as configuration and verified against a live Odds API call
**Plans**: TBD

### Phase 3: Manual Promo Entry & Event Matching
**Goal**: Users can capture any promo they see by hand, tied to a real upcoming event, and it flows straight into the hedge calculator with correct odds
**Mode:** mvp
**Depends on**: Phase 1, Phase 2
**Requirements**: PROMO-01, PROMO-02, PROMO-05
**Success Criteria** (what must be TRUE):
  1. User can enter a promo by picking book, type, amount/boost %, market, caps, and expiry, selecting the real event from a dropdown rather than free text
  2. A manually entered promo immediately produces a hedge calculation using live odds fetched for the matched event/market
  3. User can mark a promo as shared (visible to everyone with that book) or private (visible only to them)
  4. User can edit, expire, or delete promos they entered
**Plans**: TBD
**UI hint**: yes

### Phase 4: Opportunities Dashboard, Book Filter & Private Access
**Goal**: The owner and invited friends can log into a shared dashboard and see a ranked list of live hedge opportunities filtered to the books they actually use
**Mode:** mvp
**Depends on**: Phase 2, Phase 3
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04
**Success Criteria** (what must be TRUE):
  1. Only invited users can log in; there is no public signup path
  2. User sees an opportunities view listing current promos with best hedge, exact stakes, and guaranteed profit, ranked by profit
  3. User can select which Colorado sportsbooks they have accounts with, and the selection persists across sessions
  4. Opportunities shown to the user, on both the promo side and hedge side, are filtered to their selected books
**Plans**: TBD
**UI hint**: yes

### Phase 5: Promo Scraping & Review Queue
**Goal**: Promos are discovered automatically from public book promo pages, supplementing manual entry, without ever trusting an uncertain match
**Mode:** mvp
**Depends on**: Phase 3, Phase 4
**Requirements**: PROMO-03, PROMO-04
**Success Criteria** (what must be TRUE):
  1. On a schedule, the system scrapes publicly accessible (no-login) promo pages for at least some Colorado books and adds discovered promos to the feed
  2. A scraped promo whose event/market can't be matched with certainty is held in a review queue instead of being used in hedge math
  3. User can confirm or correct a queued match, after which it becomes an active promo usable in hedge calculations and appears in the opportunities list
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Hedge Calculator | 0/? | Not started | - |
| 2. Odds Ingestion & Quota-Safe Caching | 0/? | Not started | - |
| 3. Manual Promo Entry & Event Matching | 0/? | Not started | - |
| 4. Opportunities Dashboard, Book Filter & Private Access | 0/? | Not started | - |
| 5. Promo Scraping & Review Queue | 0/? | Not started | - |
