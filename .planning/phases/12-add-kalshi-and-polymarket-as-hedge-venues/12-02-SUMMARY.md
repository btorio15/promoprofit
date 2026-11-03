---
phase: 12-add-kalshi-and-polymarket-as-hedge-venues
plan: 02
subsystem: domain/market
tags: [fees, decimal.js, tdd, prediction-markets]
requires: []
provides:
  - VENUE_FEES / FEES_LAST_VERIFIED / isMarketVenueKey (src/config/venues.ts)
  - marketFee, kalshiTakerFee, polymarketUsTakerFee (src/domain/market/fees.ts)
  - MarketLeg, MarketFill, priceCentsFromAmerican, americanFromPriceCents, toMarketLeg, marketCost, toMarketFill (src/domain/market/marketLeg.ts)
affects: [plans 04, 05, 06, 08-16]
key-files:
  created:
    - src/config/venues.ts
    - src/domain/market/fees.ts
    - src/domain/market/fees.oracle.ts
    - src/domain/market/fees.test.ts
    - src/domain/market/marketLeg.ts
    - src/domain/market/marketLeg.test.ts
decisions:
  - Kalshi fee computed at cent precision (rounds up), conservative vs centicent
metrics:
  completed: 2026-11-02
---

# Phase 12 Plan 02: Venue fees and MarketLeg Summary

Exact decimal.js taker-fee math (Kalshi ceil-to-cent, Polymarket US banker's rounding) with pinned coefficients, plus the MarketLeg type and validated American to whole-cent price conversions.

## Commits
- 827bf5a test(12-02): failing tests (RED)
- feat(12-02): venue fee config, fee functions, integer oracle (GREEN, task 1)
- feat(12-02): MarketLeg type and conversions (GREEN, task 2)

## Verification
`vitest run src/domain/market`: 41 tests pass, including the 2 x 300 x 99 oracle sweep, the 1..99 round-trip and the -9900..9900 sweep.

## Deviations from Plan
None in code. Environment notes: worktree base was corrected via `git reset --hard` per the startup check; `npm ci` was run; `npx vitest` failed with "command not found" so vitest was run via `node node_modules/vitest/vitest.mjs`. `tsc --noEmit` reports one pre-existing error (`LayoutProps` in src/app/layout.tsx, a generated Next type), unrelated to this plan.

## Known Stubs
None.

## Self-Check: PASSED
