# PromoProfit

## What This Is

PromoProfit is a web dashboard that scans popular Colorado sportsbooks for promotions (bonus bets and profit/odds boosts) and calculates the guaranteed profit available by hedging each promo against competing books. It's built for the owner and a small private group of friends who convert sportsbook promos into locked-in profit, and it filters hedge opportunities to the books each user actually has accounts with.

## Core Value

Given a promo, instantly show the max-profit hedge across the user's books — with exact stakes and the guaranteed profit — correctly, every time.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Hedge calculator for **bonus bets / free bets** (stake not returned): find the opposing line across books that maximizes guaranteed profit / conversion %, and output exact stakes for both sides
- [ ] Hedge calculator for **profit boosts / odds boosts**: apply boost to the promo book's odds, find best opposing line, output stakes and guaranteed profit
- [ ] Fetch current odds for competing Colorado books via an odds API (The Odds API or similar), on demand
- [ ] **Hybrid promo discovery**: scrape promo pages/feeds where feasible; manual entry form for any promo (book, type, amount/boost %, market, max stake)
- [ ] Opportunities view: list current promos with their best hedge and guaranteed profit, ranked by profit
- [ ] **Competing promos**: detect promos at different books on opposite outcomes of the same game (e.g. two 50% profit boosts) and calculate the guaranteed profit from playing them in tandem
- [ ] **Book selection filter**: each user selects which sportsbooks they use; hedge opportunities (both promo side and hedge side) are filtered to those books
- [ ] Web dashboard usable by owner + a few friends (lightweight private access)

### Out of Scope

- Full per-user accounts tracking bonus-bet balances and bet history — deferred to a later milestone; v1 is a shared view plus book-selection preference
- Second-chance / "risk-free" bets and deposit-match / sign-up bonuses — not prioritized; bonus bets and boosts first
- Hedging on exchanges / prediction markets (Prophet X, Novig, Sporttrade, Kalshi) — sportsbooks only for v1
- Multi-state support — Colorado only; book list is state-specific
- Alerts (Discord/Telegram/SMS) — web dashboard only for v1
- Scraping odds directly from books — use an odds API; scraping is limited to promo discovery
- Automatic bet placement — legal/ToS risk, and out of scope for a calculator
- Public / paid SaaS — private tool for a small group

## Context

- **Domain**: Promo conversion ("matched betting" in UK terms) in the US regulated market. Bonus bets typically convert at ~70–80% of face value when hedged at a longshot-ish opposing line; profit boosts are hedged at the best opposing price across other books.
- **Market**: Colorado — books likely include DraftKings, FanDuel, BetMGM, Caesars, ESPN Bet, Fanatics, BetRivers, Hard Rock, bet365, and others (research to confirm current CO list and API coverage).
- **Users**: Owner + a few friends; each has accounts at a different subset of books.
- **Promo sources**: Book promo pages are behind apps/logins and change frequently; scraping will be brittle, so manual entry is a first-class path.
- **Tech**: No stack preference — research to recommend.

## Constraints

- **Budget**: Free tier of the odds API only (~500 requests/month on The Odds API) — odds must be fetched on demand / cached aggressively, not polled continuously
- **Geography**: Colorado sportsbooks only
- **Hedge venues**: Regulated sportsbooks only
- **Access**: Private, small group — no public signup
- **Correctness**: Stake/profit math must be exact and account for promo mechanics (stake-not-returned for bonus bets, boost caps/max stake)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use an odds API for hedge odds, scrape only promos | Odds scraping is brittle and gets blocked; API is reliable | — Pending |
| Free-tier odds budget → on-demand fetch + caching | Keep cost at $0 for a personal tool | — Pending |
| Hybrid promo discovery (scrape + manual entry) | Promo pages are inconsistent; manual entry guarantees coverage | — Pending |
| v1 promo types: bonus bets + profit boosts | Most common, highest-value recurring promos | — Pending |
| Book selection as a lightweight preference, full per-user tracking later | Delivers filtering value without building account management | — Pending |
| Competing promos hedged in tandem (both legs promo-adjusted) | Two promos on opposite sides beat hedging each against plain odds | — Pending |
| Colorado only, sportsbooks only | Owner's state; keeps scope tight | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-25 after initialization*
