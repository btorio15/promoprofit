# Roadmap: MarginMind

## Milestones

- ✅ **v1.0 MarginMind v1.0** — Phases 1, 01.1, 2, 3, 4, 5, 05.1 (shipped 2026-10-02) — full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Profit Stats** — Phases 6, 7, 07.1 (shipped 2026-10-22) — full details: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- 📋 **Next milestone** (to be named) — Phase 8

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

<details>
<summary>✅ v1.1 Profit Stats (Phases 6–07.1) — SHIPPED 2026-10-22</summary>

- [x] Phase 6: Profit Graph (7 plans) — completed 2026-10-13
- [x] Phase 7: Dashboard (7 plans) — completed 2026-10-17
- [x] Phase 07.1: Profit Stats Cleanup (3 plans, inserted) — completed 2026-10-22

</details>

### 📋 Next (milestone to be named)

- [ ] **Phase 8: More Sportsbooks** - Promo and intro-offer scrapers for BetMGM, bet365, Fanatics and other Colorado books (Caesars, BetRivers, Hard Rock Bet, theScore Bet)

## Phase Details

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
| 6–07.1 (3 phases) | v1.1 | 17/17 | Complete | 2026-10-22 |
| 8. More Sportsbooks | next | 0/0 | Not started | - |

## Backlog

### Phase 999.1: Admin page (BACKLOG)

**Goal:** [Captured for future planning] An owner-only admin page. Candidate scope to confirm with the owner (captured 2026-10-02): create/copy invite links in the app (today: `npm run invite:create` on the laptop), see/manage members (list, disable, password reset — today `scripts/password-reset.ts`), Odds API credit usage history, scrape/cron run status + a manual "scrape now" trigger, and reminders like the GitHub dispatch token expiry (~2026-12-30).
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd:review-backlog when ready)
