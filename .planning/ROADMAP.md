# Roadmap: MarginMind

## Milestones

- ✅ **v1.0 MarginMind v1.0** — Phases 1, 01.1, 2, 3, 4, 5, 05.1 (shipped 2026-10-02) — full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Profit Stats** — Phases 6, 7, 07.1 (shipped 2026-10-22) — full details: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Intro Offers & No-Sweat** — Phases 8–11 (in progress)

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

### 🚧 v1.2 Intro Offers & No-Sweat (In Progress)

**Milestone Goal:** Turn intro (sign-up) offers and no-sweat promos into ranked, ready-to-place opportunities with exact lines.

- [x] **Phase 8: No-Sweat Bet Math** - Exact no-sweat hedge solver and the bonus-bet conversion rate that values its refund (completed 2026-10-22)
- [ ] **Phase 9: No-Sweat Promos in the Feed** - DraftKings, FanDuel and Bally Bet no-sweat promos are recognised and ranked as labelled estimates, kept out of guaranteed totals
- [ ] **Phase 10: Ranked Intro Offers** - Sign-up offers screen ranks intro offers by estimated value with exact qualifying bet, hedge and whole-plan view
- [ ] **Phase 11: More Sportsbooks** - Hard Rock Bet and BetMGM scrapers (plus time-boxed checks of the other Colorado books) feed promos and intro offers automatically

## Phase Details

### Phase 8: No-Sweat Bet Math

**Goal**: The app can compute, to the cent, the best way to play a no-sweat bet and what it is worth as an estimate.
**Depends on**: Phase 1 (bonus-bet finder and hedge engine), Phase 01.1 (cached odds)
**Requirements**: NSB-01, NSB-02, NSB-03, NSB-04
**Success Criteria** (what must be TRUE):

  1. Given a no-sweat promo (stake, refund cap, min odds, refund as bonus bet), the app returns the qualifying stake and odds, hedge book and stake, and the profit if the bet wins and if it loses, all rounded to the cent.
  2. The refund is valued at the bonus-bet finder's current best conversion rate for that book and the member's hedge books, using cached odds only (no Odds API credits spent).
  3. If the refund book has no odds available, the result says "can't price" instead of showing a number.
  4. Among all cached games and lines that meet the promo's minimum odds, the app picks the line with the highest estimated profit.
  5. Test runs confirm the rounded stake answers match a brute-force search over whole-dollar and cent stakes.

**Plans**: 3 plans

Plans:
**Wave 1**

- [x] 08-01-PLAN.md — Exact no-sweat solver (solveNoSweat) with research fixtures and brute-force oracle sweep (NSB-01, NSB-04)
- [x] 08-02-PLAN.md — Refund conversion rate from the finder's top-1 over My Books, cached odds only, null = can't price (NSB-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 08-03-PLAN.md — Candidate search across moneylines/spreads/totals with min-odds filter, sport limit and tie-break (NSB-03)

### Phase 9: No-Sweat Promos in the Feed

**Goal**: Existing-customer no-sweat promos at DraftKings, FanDuel and Bally Bet show up in the Opportunities feed as clearly labelled estimates, without ever inflating guaranteed numbers.
**Depends on**: Phase 8
**Requirements**: FEED-01, FEED-02, FEED-03, FEED-04, FEED-05
**Success Criteria** (what must be TRUE):

  1. After a scrape, a DraftKings, FanDuel or Bally Bet no-sweat promo for existing customers appears as a no-sweat promo instead of being skipped; new-customer no-sweat offers appear under Sign-up offers.
  2. A no-sweat bet is never shown as a bonus bet (the 2026-10-08 case is a regression test); when the parser and the AI reader disagree on no-sweat vs bonus bet, the promo goes to review.
  3. No-sweat opportunities are ranked in the Opportunities feed alongside other promos, each marked "est." with the conversion rate used.
  4. Dashboard totals, the profit graph's grey line and the Statistics tab are unchanged by no-sweat estimates and stay guaranteed-only.
  5. When a member marks a no-sweat promo done, they enter or confirm the profit they actually made, and that figure (not the estimate) is recorded.

**Plans**: 18 plans

Plans:
**Wave 1**

- [ ] 09-01-PLAN.md — no_sweat type, guaranteed-only type guard, getActivePromos excludes no-sweats, Statistics queries exclude them (FEED-02, FEED-04)
- [ ] 09-02-PLAN.md — tracked_no_sweats + user_low_profile_settings tables (migration 0018, BLOCKING apply), snapshot and settings schemas (FEED-05)
- [ ] 09-03-PLAN.md — classifyNoSweat detector, exclusions reorder, tighter new-customer rule (fixture sweep), Sign-up offers headline fix (FEED-01)
- [ ] 09-04-PLAN.md — live recon of DraftKings / FanDuel / Bally promo lists, fixtures + decision note (FEED-01)

**Wave 2**

- [ ] 09-05-PLAN.md — exhaustive promo-type switches across the guaranteed pipeline, pair finder guard (FEED-02, FEED-04)
- [ ] 09-06-PLAN.md — Low-profile limits in the line search, rankNoSweatFeed, no-sweat row DTOs (FEED-03)
- [ ] 09-07-PLAN.md — TDD settle math and shared refund-conversion ranker (FEED-05)
- [ ] 09-08-PLAN.md — AI reader no_sweat kind, prompt bump, reconcile disagreements to review, reader budget (FEED-01, FEED-02)

**Wave 3**

- [ ] 09-09-PLAN.md — re-check of stored promos (pure planner + dry-run script) (FEED-02)
- [ ] 09-10-PLAN.md — DraftKings no-sweat candidates (FEED-01, FEED-02)
- [ ] 09-11-PLAN.md — FanDuel and Bally Bet no-sweat paths (FEED-01)
- [ ] 09-12-PLAN.md — Opportunities composition: ranked estimates, notes, Tracking cards, leak invariants (FEED-03, FEED-04)
- [ ] 09-13-PLAN.md — manual no-sweat add/edit/delete and classify-as-no-sweat (FEED-03, FEED-02)

**Wave 4**

- [ ] 09-14-PLAN.md — Track / settle / refund / undo actions, Low-profile save, Done DTO (FEED-05)

**Wave 5**

- [ ] 09-15-PLAN.md — no-sweat row components, Track button, risk advisory (FEED-03)
- [ ] 09-16-PLAN.md — Tracking strip, tracked card, Done row variant (FEED-05)
- [ ] 09-17-PLAN.md — Settings Low-profile card, No-sweat add form, review disagreement card (FEED-03, FEED-02)

**Wave 6**

- [ ] 09-18-PLAN.md — Opportunities screen wiring, stored-promo re-check with owner OK, phone check (FEED-01..05)
**UI hint**: yes

### Phase 10: Ranked Intro Offers

**Goal**: Members can open Sign-up offers and see which new-book intro offers are worth the most, with the exact bets to place.
**Depends on**: Phase 8, Phase 9
**Requirements**: INTRO-01, INTRO-02, INTRO-03, INTRO-04, INTRO-05, INTRO-06, INTRO-07
**Success Criteria** (what must be TRUE):

  1. The Sign-up offers screen lists intro offers at books the member doesn't have, ranked by estimated value, best first.
  2. Each ranked offer shows the exact qualifying bet (game, line, odds, stake at the offer's book) and the hedge (book, line, stake), from cached odds.
  3. "Bet & get bonus bets" offers are valued correctly for win-only vs win-or-lose, with each installment's expiry and each installment valued at the live conversion rate; "No-sweat first bet" offers are valued with the no-sweat solver.
  4. Each offer has a whole-plan view: place the qualifying bet and hedge, then each bonus bet as it arrives, with a link to the bonus-bet finder to convert it.
  5. Offers whose terms can't be read in full are marked "terms incomplete" and ranked lower; offers at books with no odds show the headline only under a "can't price" note, never invented odds.

**Plans**: TBD
**UI hint**: yes

### Phase 11: More Sportsbooks

**Goal**: Promos and intro offers from more Colorado sportsbooks arrive automatically, without ever bypassing bot protection or wiping out live promos on a bad run.
**Depends on**: Phase 10 (structured intro-offer storage), Phase 3 (promo scraping pipeline)
**Requirements**: BOOKS-01, BOOKS-02, BOOKS-03, BOOKS-04, BOOKS-05, BOOKS-06
**Success Criteria** (what must be TRUE):

  1. After a scheduled run, Hard Rock Bet promos and its intro offer appear through the same parser, AI reader and review pipeline as the existing books.
  2. After a scheduled run, BetMGM's Colorado intro offer appears in Sign-up offers, read by the AI reader.
  3. BetRivers, theScore Bet, Caesars and Fanatics each get a time-boxed check; a scraper ships only where a public, unprotected source works from GitHub Actions, and none uses stealth, proxies or forged sessions.
  4. A block page or empty result never expires live promos (expiry only after two consecutive empty runs), and a zero-result run is logged as a warning.
  5. Each new scraper is proven by one real run on GitHub Actions before it counts as done.

**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–05.1 (7 phases) | v1.0 | 61/61 | Complete | 2026-10-02 |
| 6–07.1 (3 phases) | v1.1 | 17/17 | Complete | 2026-10-22 |
| 8. No-Sweat Bet Math | v1.2 | 3/3 | Complete    | 2026-10-22 |
| 9. No-Sweat Promos in the Feed | v1.2 | 0/18 | Planned | - |
| 10. Ranked Intro Offers | v1.2 | 0/0 | Not started | - |
| 11. More Sportsbooks | v1.2 | 0/0 | Not started | - |

## Backlog

### Phase 999.1: Admin page (BACKLOG)

**Goal:** [Captured for future planning] An owner-only admin page. Candidate scope to confirm with the owner (captured 2026-10-02): create/copy invite links in the app (today: `npm run invite:create` on the laptop), see/manage members (list, disable, password reset — today `scripts/password-reset.ts`), Odds API credit usage history, scrape/cron run status + a manual "scrape now" trigger, and reminders like the GitHub dispatch token expiry (~2026-12-30).
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd:review-backlog when ready)
