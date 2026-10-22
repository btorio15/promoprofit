# Roadmap: MarginMind

## Milestones

- ✅ **v1.0 MarginMind v1.0** — Phases 1, 01.1, 2, 3, 4, 5, 05.1 (shipped 2026-10-02) — full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Profit Stats** — Phases 6–7 (in progress)

## Phases

<details>
<summary>✅ v1.0 MarginMind v1.0 (Phases 1–05.1) — SHIPPED 2026-10-02</summary>

- [x] Phase 1: Bonus Bet Finder (5 plans)
- [x] Phase 01.1: Arbitrage Tab (8 plans)
- [x] Phase 2: Private Access & My Books (9 plans)
- [x] Phase 3: Promo Scraping & Review (15 plans)
- [x] Phase 4: Opportunities Feed (9 plans)
- [x] Phase 5: Group-Added Promos (10 plans)
- [x] Phase 05.1: Deploy & Reliable Morning Scrape (5 plans)

</details>

### 🚧 v1.1 Profit Stats (In Progress)

**Milestone goal:** Each member can see how much profit was on offer at their books over time, next to how much they actually captured.

- [x] **Phase 6: Profit Graph** - Cumulative available-vs-extracted graph with range picker at the top of the Opportunities page (completed 2026-10-13)
- [x] **Phase 7: Dashboard** - Opportunities tab becomes the Dashboard: headline totals and counts above the profit graph, full feed below; profit summary leaves the Promos tab (completed 2026-10-17)

### 📋 Next (milestone to be named)

- [ ] **Phase 8: More Sportsbooks** - Promo and intro-offer scrapers for BetMGM, bet365, Fanatics and other Colorado books (Caesars, BetRivers, Hard Rock Bet, theScore Bet)

## Phase Details

### Phase 6: Profit Graph

**Goal**: A member sees, at the top of the Opportunities page, how much profit was available at their books over time next to how much they personally extracted
**Depends on**: Nothing (builds on v1.0 `promo_profit_observations` and `promo_completions`; adds per-member `member_profit_observations` table, migration 0012 applied manually with owner OK)
**Requirements**: STATS-01, STATS-02, STATS-03, STATS-04, STATS-05, STATS-06
**Success Criteria** (what must be TRUE):

  1. Member opens the Opportunities page and sees a cumulative graph at the top with a grey line (profit available at their books, each promo counted once at its best observed guaranteed profit on the Denver day first seen) and a green line (profit they personally extracted via Mark done, by Denver day of completion)
  2. Member can switch the graph between Last 7 days, Last 30 days, and All time, and the lines redraw for that range
  3. Hovering or tapping a day shows that date with both running totals, exact to the cent
  4. On a phone the graph fits the screen and is usable by touch; a member with no history sees a short "nothing yet" message instead of an empty chart

**Plans**: 7 plans

Plans:
**Wave 1**

- [x] 06-01-PLAN.md — Pure series math: daily gains, Denver days, ranges, $0 starts (TDD)
- [x] 06-02-PLAN.md — Shared feed helper (one pair rule) + per-member observation rows with exact pair shares
- [x] 06-03-PLAN.md — member_profit_observations table, migration 0012 (generated, not applied), tolerant record/read

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-04-PLAN.md — getOpportunities records the member feed and returns the member-only series
- [x] 06-05-PLAN.md — ProfitGraph component (owner OK before installing recharts)
- [x] 06-06-PLAN.md — Morning job records every member's feed

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 06-07-PLAN.md — Mount on Opportunities, owner applies migration 0012, phone check

**UI hint**: yes

### Phase 7: Dashboard

**Goal**: The Opportunities tab becomes the Dashboard: a member sees headline totals and simple counts above the profit graph, with the full ranked feed below, and the Promos tab no longer carries the profit summary
**Depends on**: Phase 6
**Requirements**: STATS-07, STATS-08, STATS-09, STATS-10
**Success Criteria** (what must be TRUE):

  1. The main navigation reads Dashboard · Stats · Arbitrage · Promos · Tools (the teammate's hour/sport/weekday tab is renamed Stats); Dashboard is the home tab and shows the Phase 6 graph and range picker above the full ranked feed (no separate Stats page)
  2. Dashboard shows headline totals above the graph: total profit extracted, total profit available, last 7 days, and last 30 days, exact to the cent
  3. Dashboard shows promos completed, average profit per completed promo, and best single promo
  4. Promos tab no longer shows the profit summary; those numbers appear only on the Dashboard
  5. On a phone, the totals stay compact enough that the first opportunity is still visible without much scrolling

**Plans**: 6 plans

Plans:
**Wave 1**

- [x] 07-01-PLAN.md — Pure totals and counts math: extracted incl. pre-start, member-series available, promos done/avg/best (TDD)
- [x] 07-02-PLAN.md — Tab rename: Opportunities label to Dashboard, teammate tab to Stats (id stats), tab-order guard

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 07-03-PLAN.md — getOpportunities returns the dashboard totals; drop the group-wide available read
- [x] 07-04-PLAN.md — Totals card copy view model + graph "since <day>" suffix

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 07-05-PLAN.md — Totals card component on the Dashboard, Opportunities heading, ProfitSummary removed with guards

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 07-06-PLAN.md — Full gate, validation map, owner phone-width check

**UI hint**: yes

### Phase 8: More Sportsbooks

**Goal:** Promos and intro offers from more Colorado sportsbooks show up in the feed automatically, alongside DraftKings, FanDuel and Bally Bet (today's scrapers). Target books: BetMGM, bet365, Fanatics, plus Caesars, BetRivers, Hard Rock Bet and theScore Bet as feasible. Each book gets a promo scraper in the scheduled job and its intro offers in Sign-up offers; members can select it in My Books.
**Notes:** Check per book whether its promo pages can be scraped (bot protection, app-only or logged-in promos). bet365 is not in The Odds API, so bet365 promos can be hedged at other books but bet365 cannot be a hedge book. Group-added promos stay the fallback for books that can't be scraped.
**Requirements**: TBD
**Depends on:** Phase 3 (promo scraping pipeline)
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 8 to break down)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–05.1 (7 phases) | v1.0 | 61/61 | Complete | 2026-10-02 |
| 6. Profit Graph | v1.1 | 7/7 | Complete    | 2026-10-13 |
| 7. Dashboard | v1.1 | 7/7 | Complete    | 2026-10-17 |
| 8. More Sportsbooks | next | 0/0 | Not started | - |

## Backlog

### Phase 999.1: Admin page (BACKLOG)

**Goal:** [Captured for future planning] An owner-only admin page. Candidate scope to confirm with the owner (captured 2026-10-02): create/copy invite links in the app (today: `npm run invite:create` on the laptop), see/manage members (list, disable, password reset — today `scripts/password-reset.ts`), Odds API credit usage history, scrape/cron run status + a manual "scrape now" trigger, and reminders like the GitHub dispatch token expiry (~2026-12-30).
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd:review-backlog when ready)
