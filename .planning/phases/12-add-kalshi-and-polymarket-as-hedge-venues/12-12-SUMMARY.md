---
phase: 12-add-kalshi-and-polymarket-as-hedge-venues
plan: 12
subsystem: domain/promos + components/promos
tags: [prediction-markets, snapshot, zod, ui]
requires: [12-06, 12-11]
provides:
  - PromoRowDTO.hedgeMarket
  - SnapshotRowSchema.hedgeMarket (MarketLegDTOSchema nullable optional)
  - market leg rendering in PromoRow, PromoDetails, DonePromoRow
key-files:
  modified:
    - src/domain/promos/dto.ts
    - src/domain/promos/promoRowDto.ts
    - src/domain/promos/doneSnapshot.ts
    - src/components/promos/PromoRow.tsx
    - src/components/promos/PromoDetails.tsx
    - src/components/promos/DonePromoRow.tsx
  created:
    - src/domain/promos/promoRowDto.test.ts
metrics:
  completed: 2026-11-02
---

# Phase 12 Plan 12: Promo market hedge in DTO, Done snapshot and rows Summary

Market-hedged promos now carry a validated MarketLegDTO through the row DTO and the frozen jsonb Done snapshot (no migration, version stays 1), and the three promo row components render the contract instruction, Settlement differs badge and price-may-move note.

## Commits
- feat(12-12): carry market hedge through promo row DTO and Done snapshot
- feat(12-12): render market leg in PromoRow, PromoDetails and DonePromoRow

## Details
- hedge.bookName falls back to the config display name for market keys; hedgeStake = leg outlay, hedgePayout = contracts ("N.00").
- Pre-phase snapshots parse unchanged (field optional); priceCents 0 is rejected.
- mark-promo-used needed no production change: profitExtracted already equals row.guaranteedProfit; test asserts it for a market row. dashboardTotals/profitSeries read stored profitExtracted; flow-through tests added, no production change.
- Market rows hide the American odds beside the selection label (the leg line shows the approximation); tie tooltip uses tieRiskTooltipText.

## Verification
Full vitest: 152 files, 2208 tests pass. tsc: only pre-existing LayoutProps error. eslint clean on touched dirs. No change to src/db/schema.ts or drizzle/.

## Deviations from Plan
- Plan's `npm run typecheck`/vitest commands were run via node paths. Worktree base corrected with `git reset --hard` at startup per the branch check.
- No UI component tests added (none exist for these components).

## Known Stubs
None.

## Self-Check: PASSED
