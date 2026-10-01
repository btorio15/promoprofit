---
created: 2026-10-01T20:20:00Z
title: Replace "Spreads & alt lines" with a promo-scoped "Refresh promos" button
area: ui
files:
  - src/components/finder/OddsStatusBar.tsx
  - src/components/arb/useSpreadsTotalsSearch.ts
  - src/app/actions/refresh-spreads-totals.ts
  - src/ingestion/odds/refreshExtended.ts
  - src/domain/promos/altSpreads.ts
  - src/domain/promos/leagueWideAltTargets.ts
---

## Problem

The status-bar "Spreads & alt lines" button (quick 261001-e1j) runs the same full spreads/totals search as the Arbitrage tab: every sport's spreads + totals (~12 credits) plus alt lines for up to 5 promo games (~15 credits total). The owner mostly needs fresh prices for the games their active promos are on, not every game.

## Solution

Owner request (2026-10-01): replace that status-bar button with "Refresh promos", which refreshes spreads and totals ONLY for events that have active promos (single-game promo events + each league-wide promo's best game, plus alt spreads as today), via the per-event odds endpoint, to spend far fewer credits. Arbitrage tab's own "Search spreads & totals" stays as the full search (confirm). Open questions to discuss: confirm dialog or not, cap on events per press, moneyline included?, which promos count (visible to the pressing member, active/not done), how the extended cache merges per-event results without wiping other games. Plan via /gsd-quick --discuss (or a phase) after the MarginMind rename.
