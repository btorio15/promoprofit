# Milestones

## v1.1 Profit Stats (Shipped: 2026-10-22)

**Phases completed:** 3 phases (6, 7, 07.1), 17 plans, plus 8 quick tasks (261014-u6k … 261022-hn4)
**Timeline:** 2026-10-03 → 2026-10-22 · src/scripts/.github: 165 files changed, +9,085 / −1,429 · 1981 tests
**Requirements:** STATS-01..STATS-10 (10/10) · audit rev 2: tech_debt, no blockers

**Key accomplishments:**

- Cumulative profit graph on the home page: grey = profit available at the member's own books (per-member daily record from Oct 13), green = profit extracted via Mark done; 7 days / 30 days / All time, tap-to-the-cent tooltip, phone-ready
- Opportunities tab became the Dashboard: totals card (extracted all-time, available since Oct 13, last 7 / 30 days), counts (promos done, average, best promo), graph, then the feed; profit summary removed from the Promos tab; phone fit checked with Playwright at 360px
- Statistics tab made site-wide and accurate: each promo counted once at its best, runs counted from scrape_runs ($0 runs included), any-sport promos recorded, expired promos excluded, no extracted or member-specific data, private promos filtered out
- Profit recording hardened (Phase 07.1): the scheduled job always records members even if Statistics recording fails or the Odds API key is missing; Dashboard and Promos loads never fail on side recording; totals card error states; dead Promos totals and helpers removed
- Promo pipeline fixes along the way: $25 default max bet, no-sweat promos skipped, boosts without a max stake go live, multi-game promos (parser, picker, scrapers)

**Known deferred items at close:** 6 (see STATE.md Deferred Items) — 2 debug sessions awaiting check, pair-solver rounding and no-sweat to-dos, quick-task summary naming, audit tech-debt leftovers.

---

## v1.0 MarginMind v1.0 (Shipped: 2026-10-02)

**Phases completed:** 7 phases (1, 01.1, 2, 3, 4, 5, 05.1), 61 plans, plus 21 quick tasks
**Timeline:** 2026-09-25 → 2026-10-02 · 636 commits · ~58k lines of TypeScript in src/ · 1639 tests
**Live:** https://betmargin.vercel.app (Vercel Hobby; repo btorio15/promoprofit)

**Key accomplishments:**

- Bonus-bet finder and Arbitrage tab with exact (decimal.js) hedge math, cached Odds API odds, credit meter and refresh gates
- Invite-only private access with per-member book selection scoping every feed
- Automatic promo scraping (DraftKings, FanDuel, Bally) with a Claude Haiku promo reader and a "Needs a look" review queue; daily morning scrape triggered by Vercel Cron → GitHub Actions
- Opportunities feed ranked by guaranteed profit, including competing-promo pairs hedged in tandem, with alternate-spread lines for promo games
- Member-added private promos, per-member "Your cap", Done history with Total profit extracted, and price-age warnings on every row
- Deployed to production with security verification (Phase 5 security audit 21/21 closed)

**Known deferred items at close:** 6 (see STATE.md Deferred Items) — Arbitrage badge UAT, backup-skip live observation, Phase 3 review-queue walkthrough, quick-task status tags, stats overhaul todo, admin page backlog.

---
