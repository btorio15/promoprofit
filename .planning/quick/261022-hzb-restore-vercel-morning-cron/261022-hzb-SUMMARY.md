---
quick_id: 261022-hzb
slug: restore-vercel-morning-cron
status: complete
date: 2026-10-22
---

# Quick 261022-hzb Summary

Vercel Cron is back at 13:17 UTC (7:17 AM MDT) calling /api/cron/scrape, which dispatches the Scrape promos workflow as a promo-only run (skip_morning_observe=true). The three GitHub scheduled runs still do the odds refresh; no extra Odds API spend. Proxy exemption and tests restored. npm test 1995 passed, lint clean. Commit 8c32467. Depends on CRON_SECRET and GH_DISPATCH_TOKEN being set in Vercel.
