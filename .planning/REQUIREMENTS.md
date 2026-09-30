# Requirements: PromoProfit

**Defined:** 2026-09-25
**Core Value:** Show every profitable opportunity from current promos, ranked by guaranteed profit, with the exact stakes and hedge book — correct to the cent, so a user can just pick and place bets.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Hedge Engine

- [x] **CALC-01**: System computes bonus-bet (stake-not-returned) hedges: exact stakes for both legs, guaranteed profit, and conversion % of the bonus amount
- [x] **CALC-02**: System computes profit-boost hedges from either a boost % applied to profit or a book-published boosted price: exact stakes, guaranteed profit, and ROI % on cash risked
- [x] **CALC-03**: Profit-boost calculations respect the promo's max-stake and max-winnings caps, choosing the optimal stake when a cap binds
- [x] **CALC-04**: Guaranteed profit is identical (to the cent) whichever side wins, verified against known-answer fixtures (e.g. $100 bonus at +300, hedge −275 → $220 hedge, $80 profit, 80%)
- [x] **CALC-05**: Hedges only use markets with no push/void outcome (e.g. 2-way moneylines, half-point lines)
- [x] **CALC-06**: User sees a brief account-risk advisory explaining that precise stakes and promo-only play can lead to account limiting
- [x] **CALC-07**: System computes tandem hedges where both legs are promos on opposite outcomes of the same market (boost + boost, boost + bonus bet), each leg's promo mechanics and caps applied

### Odds Data

- [x] **ODDS-01**: System fetches odds for Colorado books from The Odds API and caches them; nothing polls automatically
- [x] **ODDS-02**: User can see remaining monthly API credits, and refreshes are blocked or warned when credits run low
- [x] **ODDS-03**: User sees how old the odds behind each opportunity are
- [x] **ODDS-04**: Any user can press a refresh button to re-fetch odds and recompute opportunities; between refreshes the app shows the last computed results with their timestamp
- [x] **ODDS-05**: The Colorado book list (with Odds API keys, including theScore Bet as ESPN Bet's successor) is stored as configuration, verified against a live API call

### Bonus-Bet Finder

- [x] **BONUS-01**: User enters a book and bonus-bet amount and sees a ranked list of the best conversion markets across upcoming games, each with the hedge book, both stakes, guaranteed profit, and conversion %
- [x] **BONUS-02**: Bonus-bet finder hedge suggestions only use books the user has selected

### Promo Capture

- [ ] **PROMO-01**: Any group member can add a promo they see in their app (book, type, boost % or boosted price, market, max stake, max winnings, expiry) by picking a real upcoming event, and it feeds the opportunities feed
- [ ] **PROMO-02**: User can mark an added promo as shared (visible to everyone with that book) or private (visible only to them)
- [x] **PROMO-03**: System scrapes publicly accessible (no-login) promo pages for Colorado books on a schedule and adds discovered promos automatically
- [x] **PROMO-04**: Scraped promos whose event/market can't be matched with certainty go to a review queue where a user confirms or corrects the match before it's used
- [ ] **PROMO-05**: User can edit, expire, or delete promos they added

### Opportunities Feed & Access

- [x] **DASH-01**: User sees an opportunities feed (the main screen) computed automatically from current promos and cached odds, each showing the promo, best hedge book, both stakes, guaranteed profit, and ROI/conversion, sortable by guaranteed profit and ROI
- [x] **DASH-02**: User can select which Colorado sportsbooks they have accounts with, and the selection persists
- [x] **DASH-03**: Feed opportunities (promo side and hedge side) are filtered to the user's selected books
- [x] **DASH-04**: Only invited users (owner + friends) can log in; there is no public signup
- [x] **DASH-05**: Feed identifies competing promos (promos at different books on opposite outcomes of the same game/market) and lists the tandem opportunity with its profit next to hedging each promo separately

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Tools

- **TOOL-01**: Standalone manual hedge calculator page (two-leg form, URL-shareable) — design archived in `.planning/archive/01-core-hedge-calculator-superseded/`

### Hedge Engine

- **CALC-08**: Push/void-aware hedging on spreads/totals with explicit disclosure
- **CALC-09**: Stake rounding to whole dollars with displayed profit impact

### Odds Data

- **ODDS-06**: Manual hedge-odds entry for books without API coverage (bet365, Circa, SBK, BetMonarch)
- **ODDS-07**: Per-book indicator of API-sourced vs manual-odds coverage in the book picker
- **ODDS-08**: Smart scheduled refresh — automatically refresh odds only for games with active promos, a few times a day

### Dashboard

- **DASH-06**: Mobile-optimized layout for use while placing bets

### Tracking

- **TRACK-01**: Saved per-user bonus-bet balances shown in the feed, and bet history
- **TRACK-02**: Profit tracking over time

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Second-chance / "risk-free" and deposit-match promos | Deferred; bonus bets + boosts first |
| Exchange / prediction-market hedges (Novig, Sporttrade, Kalshi, Prophet X) | Sportsbooks only; some venues unstable in CO |
| Multi-state support | Colorado only |
| Alerts (Discord/Telegram/SMS) | Web app only for v1 |
| Scraping odds from sportsbooks | Odds API instead; brittle and blocked |
| Authenticated scraping / storing sportsbook credentials | Security liability and ToS risk to users' real accounts |
| Automatic bet placement | Users place bets themselves; legal/ToS risk |
| Public / paid SaaS | Private tool for a small group |
| Paid odds API tier | Free tier for v1; revisit with ODDS-08 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CALC-01 | Phase 1 | Complete |
| CALC-02 | Phase 3 | Complete |
| CALC-03 | Phase 3 | Complete |
| CALC-04 | Phase 1 | Complete |
| CALC-05 | Phase 1 | Complete |
| CALC-06 | Phase 2 | Complete |
| CALC-07 | Phase 4 | Complete |
| ODDS-01 | Phase 1 | Complete |
| ODDS-02 | Phase 1 | Complete |
| ODDS-03 | Phase 1 | Complete |
| ODDS-04 | Phase 1 | Complete |
| ODDS-05 | Phase 1 | Complete |
| BONUS-01 | Phase 1 | Complete |
| BONUS-02 | Phase 2 | Complete |
| PROMO-01 | Phase 5 | Pending |
| PROMO-02 | Phase 5 | Pending |
| PROMO-03 | Phase 3 | Complete (scheduled trigger pending — manual dispatch only; see STATE blockers) |
| PROMO-04 | Phase 3 | Complete |
| PROMO-05 | Phase 5 | Pending |
| DASH-01 | Phase 4 | Complete |
| DASH-02 | Phase 2 | Complete |
| DASH-03 | Phase 4 | Complete |
| DASH-04 | Phase 2 | Complete |
| DASH-05 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-25*
*Last updated: 2026-09-25 after reframing around the opportunities feed*
