---
created: 2026-09-30T19:21:55.865Z
title: Stats overhaul
area: ui
files:
  - src/components/promos/ProfitSummary.tsx
  - src/domain/promos/profitTotals.ts
  - src/db/promoTracking.ts
  - src/app/actions/get-promos.ts
  - src/app/actions/get-opportunities.ts
  - src/db/schema.ts:307-330
  - src/domain/promos/doneSnapshot.ts
---

## Problem

Owner wants a stats overhaul (captured 2026-09-30, no details given yet). Today's stats are the Promos-tab profit summary built up by quick tasks 260927-n12 (daily/weekly/monthly profit tracking), 260929-igk (Mark done saves a frozen snapshot, per-account "Total profit extracted"), 260930-fge + fast (Done promos excluded from today; "Available today" removed) and the headline rename to "Total profit available". These were added piecemeal, so the stats likely need a coherent redesign.

## Solution

TBD — scope with the owner first (e.g. via /gsd-discuss-phase or /gsd-quick --discuss): which numbers matter (extracted vs available, by book / promo type / week), where they live (Promos tab vs own tab), and history/charts.

Owner wants a **profit graph** (2026-09-30). Data already exists — no schema change needed: `promo_completions.completed_at` (timestamptz, NOT NULL, every row incl. legacy), `profit_extracted` (numeric 10,2), and the snapshot's `commenceTime` (game start) for rows since 260929-igk. Graph cumulative extracted profit per member by Denver day (completed_at or game day). Note: undo deletes the completion row, so undone promos leave no history.
