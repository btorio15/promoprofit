---
phase: quick-261001-e1j
plan: 01
subsystem: promos-ui
tags: [price-age, boost-price, status-bar, your-cap]
key-files:
  created:
    - src/domain/promos/priceAge.ts
    - src/domain/promos/priceAge.test.ts
    - src/domain/promos/rowPrices.test.ts
    - src/components/promos/PriceAgeNote.tsx
    - src/components/arb/spreadsTotalsSearch.ts
    - src/components/arb/spreadsTotalsSearch.test.ts
    - src/components/arb/useSpreadsTotalsSearch.ts
    - src/components/arb/SpreadsTotalsSearchBanners.tsx
  modified:
    - src/domain/promos/{rankPromoHedges,pairPromos,promoRowDto,pairRowDto,dto,pairPromos.test}.ts
    - src/app/actions/{get-promos,get-opportunities,get-promos.test}.ts
    - src/components/promos/{PromoRow,YourCapField}.tsx
    - src/components/opportunities/{PairCard,OpportunitiesScreen}.tsx
    - src/components/arb/{ArbForm,SearchSpreadsTotalsDialog}.tsx
    - src/components/finder/OddsStatusBar.tsx
decisions:
  - Price age uses cache fetched_at (moneyline vs extended by selection source), older of two for mixed pairs
  - PriceAgeNote reads the clock only after mount (no hydration mismatch), ticks every 30s
  - ArbForm refactored onto the shared hook
metrics:
  completed: 2026-10-01
---

# Quick 261001-e1j: Odds age, base to boosted price, status-bar spreads button Summary

Every profitable boost row and boosted pair leg now shows "base -> boosted", every profitable row shows "Prices as of h:mm AM" (Mountain) with an amber client-ticking warning after 15 minutes, the status bar has a "Refresh spreads, totals & alt lines" button sharing the Arbitrage tab's confirm flow, and Your cap is editable on Opportunities boost rows and pair legs.

## Commits

- 70e3335 Task 1: price-age module, base price + pricesAsOf + pair-leg yourCap on DTOs, wired into getPromos/getOpportunities
- 55ca6a4 Task 2: row UI (base -> boosted, PriceAgeNote, Your cap on Opportunities rows and pair legs)
- 71bc193 Task 3: shared spreads/totals search hook, status-bar button, ArbForm refactor

## Verification

- `npx vitest run`: 105 files, 1524 tests pass (new: priceAge, rowPrices incl. +450 -> +675 unchanged, spreadsTotalsSearch).
- `npx tsc --noEmit`: only the known worktree `LayoutProps` error in src/app/layout.tsx.
- `npm run lint`: clean.
- No changes under src/domain/hedge, drizzle, or schema (D-05, D-06). No new packages.

## Deviations from Plan

**1. [Rule 1 - Bug] get-promos parity test** - `computeMemberPromoState parity with getPromos` compared the whole feed row to the recompute row; the feed row now carries `pricesAsOf` (feed-only; memberPromoState is intentionally untouched and Done snapshots never carry it). The test now ignores `pricesAsOf` for that one comparison. Also added the two new required `baseOdds*American` fields to the `stubCandidate` literal in pairPromos.test.ts. Committed in Task 3 / Task 1.

**2. Advisory 3 applied:** PriceAgeNote holds `now` as null until mount rather than `useState(() => new Date())`. The fresh/stale decision itself lives in the pure `describePriceAge` (covered by a fixed-clock test), per advisory 2.

## Known Stubs

None.

## Self-Check: PASSED
