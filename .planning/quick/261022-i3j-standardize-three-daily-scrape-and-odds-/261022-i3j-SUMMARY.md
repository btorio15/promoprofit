---
quick_id: 261022-i3j
slug: standardize-three-daily-scrape-and-odds-runs
status: complete
date: 2026-10-22
---

# Quick 261022-i3j Summary

Three standard runs a day, each a promo scrape + one odds refresh + profit recording: Vercel Cron at 14:00 and 19:00 UTC (7 AM, 12 PM MST) dispatching the workflow with force_morning_observe, and the GitHub schedule at 00:00 UTC (5 PM MST, may start late). Odds refreshes stay at three a day. npm test 1995 passed, lint clean. Commit 1c66c75.
