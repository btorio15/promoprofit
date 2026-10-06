---
status: awaiting_human_verify
trigger: "debug why the scraper missed it (DraftKings 50% boost on user's choice of 2 MLB games)"
created: 2026-10-06
updated: 2026-10-06
---

# Debug: DraftKings "choice of 2 MLB games" 50% boost missed by scraper

## Symptoms

<!-- DATA_START -->
- **Expected:** A DraftKings 50% profit boost the owner sees live in the DraftKings app today (2026-10-06) -- usable on the user's choice of 2 MLB games -- is scraped into the `promos` table and shows on the feed (or at least lands in the review queue).
- **Actual:** No row exists in `promos` for it under any status (checked read-only: no DraftKings row with boost_percent = 50 newer than the expired Oct 1-4 ones; no live DraftKings row mentioning MLB). It was never dismissed, never marked done.
- **Errors:** None reported; owner only noticed it was missing from the app.
- **Timeline:** Seen 2026-10-06. Previous DraftKings 50% boosts WERE scraped fine: "PHI Phillies @ ATL Braves 50% Profit Boost" (id 24, last seen 2026-10-01), "College Football 50% Profit Boost" (ids 20, 36), "Alabama @ Mississippi State 50% Profit Boost" (id 37), "NFL Week 4 Sunday 50% Profit Boost" (id 29, last seen 2026-10-04). All of those are single-sport or single-game; this one is a "your choice of N games" multi-token promo.
- **Reproduction:** Run the DraftKings promo scrape (scripts/scrape-promos.ts) and check whether the promo appears in the DraftKings promotions API response (source https://api.draftkings.com/en/api/promotions/v3/promotions/query) and whether any filter/parser/reader/store step drops it.
<!-- DATA_END -->

## Context

- Pipeline: scripts/scrape-promos.ts -> scrapers -> src/ingestion/promos/* (parse, promo reader check, store.ts upsert keyed on dedupe_key). scrape_runs table holds per-book run history (column names: check schema, `started_at` does not exist).
- Hypotheses to test: (1) promo not returned by the API query the scraper sends (filters/params/pagination/state/opt-in-only); (2) scraper-side filter drops it (sport/type/title keyword, "pack"/"choice" wording, multi-token); (3) parser/reader classifies it as skip (e.g. "skipped: sgp"-style rule, no single event); (4) store step skips it (dedupe collision with an older expired row, e.g. same dedupe_key as id 24).
- Constraints: host disk is low (~2 GB free) -- do NOT run `npm ci`, create worktrees, or install browsers. Read-only against the production Neon DB unless a fix is approved. Do not apply migrations. Bypass Vercel/GitHub Actions; local reads only.

## Current Focus

- hypothesis: The promo was not in the DraftKings API response at the only scrape that ran today (13:42 UTC = 9:42 AM ET); it was posted later and no scrape has run since (scrape cadence = once per day).
- status: root cause found (diagnose-only); not independently proven that DK served it later (live API returns 403 Akamai from this host).
- next_action: return ROOT CAUSE FOUND with proposed fix (more scrape passes per day).

## Eliminated

- hypothesis: parser/exclusion/store dropped it today
  evidence: Today's DK run (scrape_runs id 71, GH run 37472800555) found 14 entries; skippedByReason = unrecognized 1 (CFB pack, row 45), new_customer 5, not_a_promo 7; kept 1 (row 43). promo_readings written/hit today include NO 50% MLB reading; the 3 new readings today are: prop (10/6/26, no sport/percent), new_customer $150, CFB 25% pack. No cached reading with boost 50 + baseball + date 10/6.
- hypothesis: dedupe collision with id 24
  evidence: no new/updated DK row with 50% exists at all; nothing was upserted.

## Evidence

- Live API POST from this host returns 403 Access Denied (Akamai), so the response could not be inspected locally. GitHub runner IPs are allowed.
- Workflow: Vercel cron dispatches once daily at ~13:41 UTC; backup schedule 15:37 UTC is skipped if every book already scraped OK that Denver day (already-ran-today). Recent 'schedule' runs (22:09, 18:45...) are those skip runs.
- scrape_runs for DK: one ok run per day at 13:42 UTC (ids 62,65,68,71). Time is now ~20:14 UTC; no later scrape.
- Same-day intraday promos have happened before: 10-01 runs at 01:58/15:26 found 18, the 19:44 manual run found 22 (+4 new DK entries); DK row 17 (MLB choice milestones) first seen 9-30 16:36 on a manual run, not in the morning scrape.
- Parser path would not have lost it silently anyway: a "choice #1 / choice #2" text has no "Profit Boost: N%" -> parser skips 'unrecognized' -> review-worthy -> classify queue (same as row 17).

## Resolution

root_cause: Timing/cadence. DK posted the promo after the single daily scrape (13:42 UTC / 9:42 AM ET); nothing re-scraped later in the day.
confirmation: Owner-approved manual dispatch at 20:35 UTC (GH run 37527614394, skip_morning_observe=true, zero Odds API credits) found DK entries 15 (vs 14 at 13:42). New promo draftkings 1135137 -- 50% profit boost, MLB, max stake $25, min odds -200, teams LA Dodgers/ATL Braves/MIL Brewers/SD Padres -- parser "unrecognized", reader high-confidence rescue -> routed to the review queue (rescue_needs_review). Timing theory confirmed; no parser/filter/store defect.
fix: Owner chose "add afternoon passes". .github/workflows/scrape-promos.yml gains two promo-only schedules (37 18 * * *, 37 22 * * * UTC). Only the 15:37 backup runs the already-ran-today check; the afternoon passes always scrape and never run the odds observe step (observe gated to the 15:37 schedule), so they spend zero Odds API credits.
verification: YAML parses; step conditions traced by hand for schedule 15:37 / 18:37 / 22:37, workflow_dispatch, and Vercel dispatch. Live verification pending: takes effect only after main is pushed (GitHub schedules run from the default branch on origin); check that an 18:37 UTC run appears and scrapes.
files_changed: [.github/workflows/scrape-promos.yml]
