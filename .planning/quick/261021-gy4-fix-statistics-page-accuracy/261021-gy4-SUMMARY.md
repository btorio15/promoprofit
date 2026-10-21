---
quick_id: 261021-gy4
slug: fix-statistics-page-accuracy
status: complete
date: 2026-10-21
---

# Quick 261021-gy4: Fix Statistics page accuracy — Summary

## Changes
1. History totals count each promo once, at its best profit, on the day it showed it (`bestRowPerPromo` in `dailyHistory.ts`). Applies to totals, by sport/type/book, averages, promo count and conversions.
2. "Scrape runs", "First run", "Latest run" come from `scrape_runs` (`loadScrapeRunTimes`). Time-of-day averages include runs since the first snapshot that found nothing profitable as $0; snapshots are matched to the run that started up to 30 min before.
3. Any-sport promos are now recorded in `profit_snapshots` under sport key `any` ("Any sport"), going forward. No migration.
4. "Available now" and per-book active skip promos past `expires_at` (counted as expired).
5. Labels: group-wide scope note, "each promo counted once", "all members" on extracted, "N promos", window promos sit on their first day.

## Live numbers (read-only, all time)
- Available $213.74 (60 records) -> $139.93 (36 promos); avg per promo $3.89; avg per day $6.36 over 22 days; boost return 19.64% over 33 boosts.
- Runs 71 (Sep 27 - Oct 21 00:49 UTC; was "Latest run Oct 18").
- Available now 2 -> 0 (both NBA boosts expired).
- Time of day: 20 runs counted (was 11), $0 runs included.

## Verification
npm test 1971 passed; lint clean; tsc clean apart from the stale generated .next file.

## Commits
- fix(261021-gy4): count each promo once in Statistics history totals
- fix(261021-gy4): Available now and per-book active skip expired promos
- fix(261021-gy4): Statistics runs come from scrape_runs; $0 runs count in time-of-day
- fix(261021-gy4): record any-sport promos in profit snapshots
- fix(261021-gy4): label Statistics as group-wide and each promo counted once
