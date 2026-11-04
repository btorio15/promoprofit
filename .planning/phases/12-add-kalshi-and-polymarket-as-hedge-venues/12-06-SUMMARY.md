---
phase: 12-add-kalshi-and-polymarket-as-hedge-venues
plan: 06
subsystem: domain/market + components/market
tags: [zod, ui, settlement, prediction-markets]
requires: [12-02]
provides:
  - settlementNoteFor (src/domain/market/settlement.ts)
  - MarketLegDTOSchema, MarketLegDTO, toMarketLegDTO, marketLegText, tieRiskTooltipText (src/domain/market/legDto.ts)
  - MarketLegLine, MarketLegBadges (src/components/market/MarketLeg.tsx)
affects: [plans 09, 10, 12, 14, 16]
key-files:
  created:
    - src/domain/market/settlement.ts
    - src/domain/market/settlement.test.ts
    - src/domain/market/legDto.ts
    - src/domain/market/legDto.test.ts
    - src/components/market/MarketLeg.tsx
metrics:
  completed: 2026-11-02
---

# Phase 12 Plan 06: Market leg presentation contract Summary

Zod-validated MarketLegDTO with the D-12 leg string, per sport x venue settlement notes (tie sentence only for NFL), thin/price-may-move liquidity kinds, and shared MarketLegLine/MarketLegBadges components following the UI-SPEC.

## Commits
- 280fa40 feat(12-06): settlement notes and MarketLegDTO with formatter
- feat(12-06): shared MarketLegLine and MarketLegBadges components

## Verification
`vitest run` of settlement and legDto tests: 31 pass. `tsc --noEmit`: only the pre-existing `LayoutProps` error. eslint on src/components/market and src/domain/market: clean.

## Deviations from Plan
None in code. Environment: worktree base was corrected with `git reset --hard` per startup check; `npm ci` run; tools invoked via `node node_modules/...`.

## Known Stubs
None. Existing ResultRow Tie risk tooltip is not yet wired to tieRiskTooltipText (consumed by later plans).

## Self-Check: PASSED
