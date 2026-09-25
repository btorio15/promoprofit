# PromoProfit

## What This Is

PromoProfit is a private web app that already knows the current promotions at Colorado sportsbooks (scraped automatically, with group members adding any the scrapers miss) and shows a ranked feed of the guaranteed-profit opportunities they create, including pairs of competing promos on opposite sides of the same game. Users sort the feed by profit, filter it to the books they have, and place the bets themselves. A bonus-bet finder lets a user enter "I have a $X bonus bet at book Y" and see the best market to convert it on and the best book to hedge at. It's built for the owner and a small group of friends.

## Core Value

Show every profitable opportunity from current promos, ranked by guaranteed profit, with the exact stakes and hedge book — correct to the cent, so a user can just pick and place bets.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **Opportunities feed** (main screen): opportunities computed automatically from current promos and cached odds, sortable by guaranteed profit, filtered to the user's books
- [ ] **Promo scraping**: scrape public Colorado sportsbook promo pages on a schedule; uncertain event matches go to a review queue
- [ ] **Group-added promos**: anyone in the group can add a promo they see in their app, feeding the same opportunities feed (fallback for books that can't be scraped)
- [ ] **Bonus-bet finder**: user enters book + bonus amount → ranked best conversion markets with hedge book, stakes, and profit
- [ ] **Competing promos**: detect promos at different books on opposite outcomes of the same game (e.g. two 50% profit boosts) and compute the tandem hedge profit
- [ ] **Hedge engine**: exact bonus-bet, profit-boost (with caps), and tandem math, fixture-tested to the cent
- [ ] **Odds**: cached odds from The Odds API free tier, refreshed by a user-triggered refresh button guarded by a credit meter
- [ ] **Book selection**: each user selects their sportsbooks; feed and hedge suggestions are filtered to them
- [ ] Invite-only access for owner + friends

### Out of Scope

- Standalone manual hedge calculator page — dropped from v1; the engine powers the feed and finder instead (v2 candidate)
- Scheduled/automatic odds refresh — v1 uses a user-triggered refresh button; smart scheduled refresh of games with active promos is v2
- Saving per-user bonus-bet balances and bet history — bonus-bet finder is enter-and-look, nothing saved
- Second-chance / "risk-free" bets and deposit-match / sign-up bonuses — bonus bets and boosts first
- Hedging on exchanges / prediction markets (Prophet X, Novig, Sporttrade, Kalshi) — sportsbooks only
- Multi-state support — Colorado only
- Alerts (Discord/Telegram/SMS) — web app only for v1
- Scraping odds directly from books — odds come from the odds API; scraping is for promos only
- Authenticated scraping / storing sportsbook credentials — security and ToS risk
- Automatic bet placement — users place bets themselves at their books
- Public / paid SaaS — private tool for a small group

## Context

- **Domain**: Promo conversion ("matched betting") in the US regulated market. Bonus bets typically convert at ~70–80% of face value; profit boosts are hedged at the best opposing price across other books.
- **Market**: Colorado — DraftKings, FanDuel, BetMGM, Caesars, Fanatics, BetRivers, Hard Rock, Bally, theScore Bet (ESPN Bet's successor), plus bet365, Circa, SBK, BetMonarch without odds-API coverage (see `.planning/research/SUMMARY.md`).
- **Users**: Owner + a few friends; each has accounts at a different subset of books.
- **Promo sources**: Scraping is the primary source but research rates feasibility low-to-medium (anti-bot, login walls); group-added promos cover the gaps.
- **Tech** (from research): Next.js on Vercel, Drizzle + Neon Postgres, decimal.js for money math, iron-session auth, GitHub Actions for scheduled scraping.
- **History**: The initial roadmap led with a manual calculator page; on 2026-09-25 the owner reframed the product around the auto-computed feed. The superseded Phase 1 docs are in `.planning/archive/01-core-hedge-calculator-superseded/`.

## Constraints

- **Budget**: The Odds API free tier (~500 credits/month) — odds refresh only when a user presses refresh, with cached results and a credit meter
- **Geography**: Colorado sportsbooks only
- **Hedge venues**: Regulated sportsbooks only
- **Access**: Private, small group — no public signup
- **Correctness**: Stake/profit math must be exact and account for promo mechanics (stake-not-returned for bonus bets, boost caps/max stake)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use an odds API for hedge odds, scrape only promos | Odds scraping is brittle and gets blocked; API is reliable | — Pending |
| Feed is the main product; calculator dropped from v1 | Users want to view and sort ready-made opportunities, not do math | — Pending |
| Free tier + user-triggered refresh button; smart scheduled refresh later | Keeps cost at $0 while making the feed refreshable on demand | — Pending |
| Scraping primary, group-added promos as fallback | Scraping may be blocked for some books; friends can fill gaps | — Pending |
| Bonus-bet finder is enter book + amount, nothing saved | Bonus bets are per-account and can't be scraped | — Pending |
| v1 promo types: bonus bets + profit boosts | Most common, highest-value recurring promos | — Pending |
| Competing promos hedged in tandem (both legs promo-adjusted) | Two promos on opposite sides beat hedging each against plain odds | — Pending |
| Hedge engine rules: equal profit on both outcomes; boost stake defaults to the max allowed by caps; binding max-winnings cap auto-reduces the stake with an explanation; boost % applies to profit | Carried from the superseded Phase 1 discussion | — Pending |
| Display rules: American odds only; money to the cent; conversion % for bonus bets, ROI % for cash legs; account-risk advisory as a small footnote | Carried from the superseded Phase 1 discussion | — Pending |
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
*Last updated: 2026-09-25 after reframing around the opportunities feed*
