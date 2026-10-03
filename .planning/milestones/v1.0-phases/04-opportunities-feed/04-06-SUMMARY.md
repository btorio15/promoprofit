---
phase: 04-opportunities-feed
plan: 06
subsystem: opportunities-feed
tags: [pairs, decimal.js, opportunities, ui]
requires: ["04-03", "04-05"]
provides:
  - "toPairRowDTO / PairRowDTO display mapping"
  - "sumPortfolioProfit (pair counted once)"
  - "pairs source in getOpportunities"
  - "PairCard / PairDetails (with actions slot for Plan 07)"
affects: [opportunities-screen]
tech-stack:
  added: []
  patterns: ["overlay-trigger Collapsible card", "Decimal-only money mapping"]
key-files:
  created:
    - src/domain/promos/pairRowDto.ts
    - src/domain/promos/pairRowDto.test.ts
    - src/components/opportunities/PairCard.tsx
    - src/components/opportunities/PairDetails.tsx
  modified:
    - src/domain/promos/promoRowDto.ts
    - src/domain/promos/profitTotals.ts
    - src/domain/promos/profitTotals.test.ts
    - src/domain/opportunities/types.ts
    - src/app/actions/get-opportunities.ts
    - src/app/actions/get-opportunities.test.ts
    - src/components/opportunities/OpportunitiesScreen.tsx
decisions:
  - "Paired promos remain in Best promos (D-20); Total profit available counts a pair once (D-12); today/week/month untouched (D-22)"
metrics:
  tasks: 3
  completed: 2026-09-29
---

# Phase 4 Plan 06: Best pairs Summary

Best pairs section: each pair is one combined card with both bets, paired profit and ROI, and the "vs. $X + $Y hedging each separately / +$Z more together" line, with Total profit available counting each pair once.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. Pair DTO + sumPortfolioProfit | 1d3158b | capNoteFor exported; gain computed with Decimal (60.00 - 20.00 - 15.00 = 25.00) |
| 2. Pairs source in getOpportunities | 4788ee4 | selectPairs(findPairCandidates(...)) at member books; total via sumPortfolioProfit |
| 3. PairCard / PairDetails / screen case | 48dcdf7 | actions slot in PairDetails for Plan 07 Mark pair done |

## Verification

- Full `vitest run`: 76 files, 1182 tests pass.
- `tsc --noEmit`: clean (after `next typegen` for the known LayoutProps issue).
- `npm run lint`: clean.
- Grep gates: no dangerouslySetInnerHTML; "hedging each separately" and "more together" appear once each.

## Deviations from Plan

None to plan behavior. Test note: the get-opportunities pair fixture uses -110/-110 at both books, because with the earlier sample odds each promo's single hedge already beat the pair (D-08 correctly dropped it).

`onChanged` and `precision` are accepted by PairCard for the Plan 07 Mark pair done wiring but are unused until then.

## Known Stubs

None. The `actions` slot in PairDetails is intentionally empty until Plan 07.

## Threat Flags

None. T-04-17 (no HTML injection), T-04-18 (memberBookKeys = session user's books, tested), T-04-19 (Decimal-only totals, tested) are mitigated.

## Self-Check: PASSED
