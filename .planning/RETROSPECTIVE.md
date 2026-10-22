# Retrospective

## Milestone: v1.1 — Profit Stats

**Shipped:** 2026-10-22
**Phases:** 3 (6, 7, 07.1) | **Plans:** 17 | **Quick tasks alongside:** 8

### What Was Built
- Per-member cumulative profit graph (grey available at the member's own books, green extracted via Mark done) with 7d / 30d / All ranges and a to-the-cent tooltip.
- Opportunities tab became the Dashboard: totals card, counts line, graph, then the feed; the Promos-tab profit summary was removed.
- The teammate's Statistics tab was kept and made site-wide and accurate (each promo counted once, scrape-run counts including $0 runs, no member-specific data).
- Phase 07.1 hardened profit recording and the Dashboard's failure states, and removed dead totals code.

### What Worked
- Checking the live site with Playwright at 360px found real phone-fit failures (tab bar overflow, totals too tall) that unit tests could not see.
- Read-only database checks before changing Statistics put numbers on the problems ($213.74 shown vs $139.93 real) and verified the fixes afterwards.
- The milestone audit followed by an inserted cleanup phase (07.1) turned integration warnings into a short, verified plan instead of open-ended debt.
- Wave execution in worktrees with a post-merge test/type/lint gate kept main green throughout.

### What Was Inefficient
- The teammate's parallel Statistics tab overlapped Phase 7 and forced a re-scope (plan 07-02 reduced to a guard test); fetching before planning caught it, but late.
- Statistics accuracy issues (double counting, run counts from snapshots) existed since the tab shipped and were only found when the owner asked why scrapes "stopped".
- The first 07.1 plan-check found a deletion that would have broken the type check; dead-code removals need a caller grep that includes type-only users.

### Patterns Established
- Site-wide figures exclude members' private promos and always rank at whole precision; member figures come only from member_profit_observations.
- Recorders that run as side effects never throw and log their own failures; callers reuse already-loaded odds.
- Pure view models plus source-inspection tests stand in for DOM tests (Vitest runs in node).

### Key Lessons
- When a number "looks wrong", query the live data read-only first and compare against the formula before touching code.
- Label time bases on every total ("all-time", "since Oct 13") so totals and graphs never appear to contradict each other.
- Fetch the teammate's commits before planning and before every push.

### Cost Observations
- Model mix: orchestration on Opus; planners Opus; executors, checkers and reviewers mostly Sonnet.
- Notable: small, well-scoped fixes ran faster inline as quick tasks than through the full phase pipeline.

## Cross-Milestone Trends

| Milestone | Phases | Plans | Shipped | Notes |
|-----------|--------|-------|---------|-------|
| v1.0 MarginMind | 7 | 61 | 2026-10-02 | Core finder, arbitrage, scraping, feed, member promos, deploy |
| v1.1 Profit Stats | 3 | 17 | 2026-10-22 | Profit graph, Dashboard, site-wide Statistics, recording hardening |
