# Milestones

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
