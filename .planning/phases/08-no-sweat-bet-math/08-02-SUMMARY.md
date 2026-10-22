---
phase: 08-no-sweat-bet-math
plan: 02
subsystem: hedge-math
tags: [no-sweat, conversion-rate, bonus-bet]
requires: [rankBonusBetHedges, extractTwoWayMoneylines]
provides: [topConversionFor, makeConversionRateFor, ConversionRate, ConversionRateFor]
affects: [phase-09 no-sweat consumers]
key-files:
  created:
    - src/domain/hedge/conversionRate.ts
    - src/domain/hedge/conversionRate.test.ts
decisions:
  - Refund book quotes always kept in the allowed set even if not in My Books
  - null (can't price) for no odds or no profitable conversion; no fallback rate
metrics:
  tasks: 1
  completed: 2026-10-22
---

# Phase 8 Plan 02: Conversion Rate Summary

Pure, memoized `ConversionRateFor` that values a no-sweat refund at the bonus-bet finder's top-1 conversion for the refund book, using only the member's hedge books and cached odds (0 credits).

## Commits
- 4c775f8: test(08-02) failing test (RED)
- b97407b: feat(08-02) implementation (GREEN)

## Verification
- 6 vitest cases pass (80.00 reference, finder parity, outside-My-Books, no-odds null, empty-hedge null, amount 25, memoization)
- tsc and eslint clean on new files; import grep gate returns 0; no fallback rate constants.
- Full `npm test` was not run beyond the new file.

## Deviations from Plan
None - plan executed exactly as written.

## Known Stubs
None.

## Self-Check: PASSED
