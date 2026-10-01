# PromoProfit

## What This Is

PromoProfit is a private web app that already knows the current promotions at Colorado sportsbooks (scraped automatically and shared with the group, plus personal promos each member adds for anything the scrapers miss) and shows a ranked feed of the guaranteed-profit opportunities they create, including pairs of competing promos on opposite sides of the same game. Users sort the feed by profit, filter it to the books they have, and place the bets themselves. A bonus-bet finder lets a user enter "I have a $X bonus bet at book Y" and see the best market to convert it on and the best book to hedge at. It's built for the owner and a small group of friends.

## Core Value

Show every profitable opportunity from current promos, ranked by guaranteed profit, with the exact stakes and hedge book — correct to the cent, so a user can just pick and place bets.

## Requirements

### Validated

- ✓ **Bonus-bet finder**: user enters book + bonus amount → top-10 ranked conversion markets (overall and per sport, via tabs) with hedge book, both stakes, guaranteed profit, and conversion % — Validated in Phase 1: Bonus Bet Finder
- ✓ **Odds**: cached odds from The Odds API free tier (7 free-tier Colorado books, live-verified), user-triggered refresh with credit meter, low-credit block, 15-min confirm, and concurrency lock — Validated in Phase 1: Bonus Bet Finder
- ✓ **Arbitrage tab**: cross-book sure bets (no promos) among the 7 API-covered Colorado books — moneyline arbs from cached odds at no extra credit, opt-in "Search spreads & totals" (~3x credits, confirm every time, half-point lines matched exactly), exact whole-dollar/cent stakes under the total-stake cap, guaranteed profit and return %, prominent odds age, account-risk advisory — Validated in Phase 01.1: Arbitrage Tab
- ✓ **Finder hedge cap**: optional "Limit hedge amount" on the bonus-bet finder; a game whose best hedge exceeds the cap is dropped (no fallback to a worse orientation) — Validated in Phase 01.1: Arbitrage Tab
- ✓ **Invite-only access**: owner-generated single-use invite links, email/password login with DB-backed lockout, `proxy.ts` redirect plus per-action session checks, no public signup — Validated in Phase 2: Private Access & My Books
- ✓ **Book selection (finder + arbitrage)**: each user picks their books at onboarding and in Settings; bonus-bet finder and Arbitrage tab suggestions only use those books; account-risk advisory on both tabs — Validated in Phase 2: Private Access & My Books

- ✓ **Promo scraping**: scheduled scraping of public Colorado promo pages (GitHub Actions), Claude Haiku promo reader with verbatim guard, uncertain matches to a "Needs a look" review queue — Validated in Phase 3: Promo Scraping & Review
- ✓ **Hedge engine**: exact bonus-bet, profit-boost (caps, max stake, min odds) and tandem math, fixture-tested to the cent — Validated in Phases 1, 3 and 4
- ✓ **Opportunities feed** (main screen): auto-computed from current promos and cached odds, sortable by guaranteed profit, filtered to the user's books — Validated in Phase 4: Opportunities Feed
- ✓ **Competing promos**: promos at different books on opposite outcomes of the same game are paired and hedged in tandem — Validated in Phase 4: Opportunities Feed
- ✓ **Book selection (feed)**: the feed and Promos tab only use the member's selected books — Validated in Phase 4: Opportunities Feed
- ✓ **Group-added promos**: any member can hand-add a bonus bet or profit boost; it is private to that member (visible only to them) and feeds their own Promos, Opportunities and Done — Validated in Phase 5: Group-Added Promos (owner UAT 2/2, security 21/21 closed)

### Active

(none — all v1.0 requirements validated; next milestone not yet defined)

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
| Use an odds API for hedge odds, scrape only promos | Odds scraping is brittle and gets blocked; API is reliable | ✓ Good (Phase 1: The Odds API live-verified; Caesars/Fanatics are paid-tier only) |
| Feed is the main product; calculator dropped from v1 | Users want to view and sort ready-made opportunities, not do math | ✓ Good (Phase 4) |
| Free tier + user-triggered refresh button; smart scheduled refresh later | Keeps cost at $0 while making the feed refreshable on demand | ✓ Good (Phase 1: ~3 credits per refresh using bookmakers= instead of regions=) |
| Scraping primary, group-added promos as fallback | Scraping may be blocked for some books; friends can fill gaps | ✓ Good (Phases 3 & 5; added promos ended up private per member, scraped promos shared) |
| Bonus-bet finder is enter book + amount, nothing saved | Bonus bets are per-account and can't be scraped | ✓ Good (Phase 1) |
| v1 promo types: bonus bets + profit boosts | Most common, highest-value recurring promos | ✓ Good (Phases 3–5) |
| Competing promos hedged in tandem (both legs promo-adjusted) | Two promos on opposite sides beat hedging each against plain odds | ✓ Good (Phase 4) |
| Hedge engine rules: equal profit on both outcomes; boost stake defaults to the max allowed by caps; binding max-winnings cap auto-reduces the stake with an explanation; boost % applies to profit | Carried from the superseded Phase 1 discussion | — Pending |
| Display rules: American odds only; money to the cent; conversion % for bonus bets, ROI % for cash legs; account-risk advisory as a small footnote | Carried from the superseded Phase 1 discussion | — Pending |
| Colorado only, sportsbooks only | Owner's state; keeps scope tight | — Pending |
| Sport filter is client-side tabs over results (top 10 overall + top 10 per sport) | Owner didn't want to re-submit the search to change sport | ✓ Good (Phase 1) |
| NFL moneylines shown with a "Tie risk" badge rather than excluded | A tie voids both legs: $0 profit, no cash lost | ✓ Good (Phase 1, owner sign-off) |
| Arbitrage tab: strict implied-sum < 1 only (no near-arbs); total stake is a hard cap on rounded legs | Sure bets only; never lay more than the user entered | ✓ Good (Phase 01.1; owner saw zero arbs at verification — correct, closest market was break-even) |
| Refreshes are all-or-nothing (fetch every sport, then one db.batch write) | A partial failure must never hide sports or shrink the finder | ✓ Good (Phase 01.1 review fix WR-01) |
| Finder hedge cap drops a game whose best orientation exceeds the cap | A bonus bet on the favorite is a poor conversion; owner prefers hiding the game | ✓ Good (Phase 01.1 UAT, owner decision) |
| Member-added promos are private to the member who added them; scraped promos are shared | Personal promos (targeted offers) shouldn't clutter or leak into friends' feeds | ✓ Good (Phase 5, UAT + security audit) |
| Alternate spreads fetched only on the confirmed "Search spreads & totals" press: single-game promos + each league-wide promo's top-1 main-line game, max 5 games/press | Longer odds raise boost/bonus value, but the free-tier credit budget can't afford every game | ✓ Good (quick 260930-gyl/hor; live press verified 2026-09-30) |

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
*Last updated: 2026-10-01 after Phase 5 (Group-Added Promos) completion — last v1.0 phase*
