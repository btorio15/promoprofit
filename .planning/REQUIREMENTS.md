# Requirements: PromoProfit

**Defined:** 2026-09-25
**Core Value:** Given a promo, instantly show the max-profit hedge across the user's books — with exact stakes and the guaranteed profit — correctly, every time.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Hedge Calculation

- [ ] **CALC-01**: User can calculate a bonus-bet (stake-not-returned) hedge and see exact stakes for both legs, guaranteed profit, and conversion % of the bonus amount
- [ ] **CALC-02**: User can calculate a profit-boost hedge entered either as a boost % applied to profit or as a book-published boosted price, and see exact stakes, guaranteed profit, and ROI % on cash risked
- [ ] **CALC-03**: Profit-boost calculations respect the promo's max-stake and max-winnings caps, choosing the optimal stake when a cap binds
- [ ] **CALC-04**: Guaranteed profit is identical (to the cent) whichever side wins, verified against known-answer fixtures (e.g. $100 bonus at +300, hedge −275 → $220 hedge, $80 profit, 80%)
- [ ] **CALC-05**: Hedge search only uses markets with no push/void outcome (e.g. 2-way moneylines), so "guaranteed" profit is truly guaranteed
- [ ] **CALC-06**: User sees a brief account-risk advisory explaining that precise stakes and promo-only play can lead to account limiting

### Odds Data

- [ ] **ODDS-01**: System fetches hedge-side odds for Colorado books from The Odds API on demand (no continuous polling) and caches them
- [ ] **ODDS-02**: User can see remaining monthly API credits, and refreshes are blocked or warned when credits run low
- [ ] **ODDS-03**: User sees how old the odds behind each hedge are and is prompted to re-fetch before placing bets
- [ ] **ODDS-04**: For a bonus bet, the system searches across multiple games/markets in a sport to find the highest-conversion hedge, not only a single user-picked market
- [ ] **ODDS-05**: The Colorado book list (with Odds API keys, including theScore Bet as ESPN Bet's successor) is stored as configuration, verified against a live API call

### Promo Capture

- [ ] **PROMO-01**: User can manually enter a promo (book, type, bonus amount or boost %, market, max stake, max winnings, expiry) by picking a real upcoming event from a dropdown
- [ ] **PROMO-02**: User can mark a promo as shared (visible to everyone with that book) or private (visible only to them)
- [ ] **PROMO-03**: System scrapes publicly accessible (no-login) promo pages for at least some Colorado books on a schedule and adds discovered promos to the feed
- [ ] **PROMO-04**: Scraped promos whose event/market can't be matched with certainty go to a review queue where a user confirms or corrects the match before it's used in hedge math
- [ ] **PROMO-05**: User can edit, expire, or delete promos they entered

### Dashboard & Access

- [ ] **DASH-01**: User sees an opportunities view listing current promos with their best hedge, stakes, and guaranteed profit, ranked by profit
- [ ] **DASH-02**: User can select which Colorado sportsbooks they have accounts with, and the selection persists
- [ ] **DASH-03**: Opportunities (promo side and hedge side) are filtered to the user's selected books
- [ ] **DASH-04**: Only invited users (owner + friends) can log in; there is no public signup

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Hedge Calculation

- **CALC-07**: Push/void-aware hedging on spreads/totals with explicit disclosure
- **CALC-08**: Stake rounding to whole dollars with displayed profit impact

### Odds Data

- **ODDS-06**: Manual hedge-odds entry for books without API coverage (bet365, Circa, SBK, BetMonarch)
- **ODDS-07**: Per-book indicator of API-sourced vs manual-odds coverage in the book picker

### Dashboard

- **DASH-05**: Mobile-optimized layout for use while placing bets

### Tracking

- **TRACK-01**: Per-user bonus-bet balances and bet history
- **TRACK-02**: Profit tracking over time

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Second-chance / "risk-free" and deposit-match promos | Deferred; bonus bets + boosts first |
| Exchange / prediction-market hedges (Novig, Sporttrade, Kalshi, Prophet X) | Sportsbooks only; some venues unstable in CO |
| Multi-state support | Colorado only |
| Alerts (Discord/Telegram/SMS) | Web dashboard only for v1 |
| Scraping odds from sportsbooks | Odds API instead; brittle and blocked |
| Authenticated scraping / storing sportsbook credentials | Security liability and ToS risk to users' real accounts |
| Automatic bet placement | Legal/ToS risk |
| Public / paid SaaS | Private tool for a small group |
| Paid odds API tier | Budget is free tier only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CALC-01 | Phase 1 | Pending |
| CALC-02 | Phase 1 | Pending |
| CALC-03 | Phase 1 | Pending |
| CALC-04 | Phase 1 | Pending |
| CALC-05 | Phase 1 | Pending |
| CALC-06 | Phase 1 | Pending |
| ODDS-01 | Phase 2 | Pending |
| ODDS-02 | Phase 2 | Pending |
| ODDS-03 | Phase 2 | Pending |
| ODDS-04 | Phase 2 | Pending |
| ODDS-05 | Phase 2 | Pending |
| PROMO-01 | Phase 3 | Pending |
| PROMO-02 | Phase 3 | Pending |
| PROMO-03 | Phase 5 | Pending |
| PROMO-04 | Phase 5 | Pending |
| PROMO-05 | Phase 3 | Pending |
| DASH-01 | Phase 4 | Pending |
| DASH-02 | Phase 4 | Pending |
| DASH-03 | Phase 4 | Pending |
| DASH-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-25*
*Last updated: 2026-09-25 after roadmap creation*
