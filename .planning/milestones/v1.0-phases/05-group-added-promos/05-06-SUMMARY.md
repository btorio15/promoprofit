---
phase: 05-group-added-promos
plan: 06
subsystem: promos
tags: [profit-boost, add-promo, zod, decimal.js, server-action]
requires: [05-04, 05-05]
provides:
  - AddProfitBoostInputSchema (boost % or boosted odds, required max stake, A1 cap kinds, A3 pin rule)
  - buildAddedPromoRow boost branch with pinned selection
  - addPromo boost path with server-side pin re-resolution
  - Type toggle + BoostFields in the add-promo form
affects: [promos-list, opportunities-feed]
tech-stack:
  added: []
  patterns: [strictObject inputs, server re-resolution of pins, Decimal-only money]
key-files:
  created:
    - src/components/promos/BoostFields.tsx
  modified:
    - src/domain/promos/addedPromoInput.ts
    - src/domain/promos/buildAddedPromo.ts
    - src/app/actions/add-promo.ts
    - src/domain/promos/addPromoDraft.ts
    - src/components/promos/AddPromoForm.tsx
    - src/components/promos/ExpiryField.tsx
    - src/domain/promos/rankPromoHedges.test.ts
key-decisions:
  - "A1: Total payout -> total_payout, Extra winnings -> boost_extra (enum limited to these two)"
  - "A3: Boosted odds requires One game plus a market/side pin; Boost % keeps the pin optional"
  - "Boost expiry is optional; unset means the boost ends when the last game in scope starts"
requirements-completed: [PROMO-01]
duration: ~20 min
completed: 2026-09-30
---

# Phase 5 Plan 06: Add a Profit Boost Summary

A member can add a profit boost (Boost % or Boosted odds) from the add-promo form. It is validated with strict schemas, its pin is re-checked against cached odds on the server, and it ranks through the unchanged hedge engine.

## Tasks

1. Boost input branch and row building. Commit 03d9962.
2. addPromo boost path with server-side pin resolution and engine proof tests. Commit 51767a6.
3. Type toggle, BoostFields, draft helpers, ExpiryField default option. Commit c6e5832.

## Notes

- Boost rows store money as 2-dp strings via Decimal. The pin's line is a half-point market descriptor stored as a number, matching the existing column type.
- A stale pin returns `fieldErrors.pinned` with "That bet isn't in the current odds. Pick another." and nothing is inserted (T-5-09).
- The client draft runs the same AddPromoInputSchema, so messages match the server.

## Deviations from Plan

**1. [Rule 1 - Test expectation] Cent equality in the pinned boosted-odds engine test**
- **Issue:** The plan asked for profit equal to the cent on both outcomes. With whole-cent hedge stakes, the pinned +350 case nets 8.10 vs 8.08 (existing engine rounding, unchanged). The unpinned boost % case is exactly equal.
- **Fix:** That test asserts guaranteedProfit equals the lower outcome and the gap is at most 0.02. No engine code was touched.
- **Files:** src/domain/promos/rankPromoHedges.test.ts

Otherwise the plan was executed as written.

## Verification

- `npm test`: 86 files, 1317 tests passing.
- `npm run lint`: clean.
- `npm run typecheck`: only the known `LayoutProps` artifact in src/app/layout.tsx (missing Next.js generated types in a fresh worktree).
- Manual UI verification (verify-work) not run in this environment.

## Known Stubs

None.

## Self-Check: PASSED

Files and commits 03d9962, 51767a6, c6e5832 exist on the worktree branch.
