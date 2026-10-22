---
quick_id: 261022-hzb
slug: restore-vercel-morning-cron
date: 2026-10-22
type: quick
---

# Quick 261022-hzb: Restore the Vercel morning cron

Owner: "restore the vercel cron". GitHub has been starting the 15:37 UTC scheduled run around 19:30 UTC, so overnight/morning promos were missing until ~1:30 PM MT. The Vercel cron (vercel.json, 13:17 UTC) and /api/cron/scrape were removed by the teammate on 2026-10-13/14 (D-17).

## Task
- Restore src/app/api/cron/scrape/route.ts (CRON_SECRET bearer check, GH_DISPATCH_TOKEN dispatch) but dispatch a promo scrape only (forceMorningObserve false -> skip_morning_observe=true), so no Odds API spend is added (D-17).
- Restore the route test (no DB status mock), the proxy /api/cron/ exemption and its test, and the vercel.json cron "17 13 * * *"; update vercelConfig.test.ts and the workflow header comment.
- Owner check: CRON_SECRET and GH_DISPATCH_TOKEN must be set in Vercel (Production).
