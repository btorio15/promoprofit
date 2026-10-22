---
phase: 08-no-sweat-bet-math
fixed_at: 2026-10-22T20:35:53Z
review_path: .planning/phases/08-no-sweat-bet-math/08-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-10-22T20:35:53Z
**Source review:** .planning/phases/08-no-sweat-bet-math/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (WR-01..WR-05; Info items out of scope)
- Fixed: 5
- Skipped: 0

Final checks: `npx vitest run` (142 files, 2052 tests passed), `npx tsc --noEmit` (clean), `npm run lint` (clean).

## Fixed Issues

### WR-01: rankNoSweat only guards solveNoSweat; invalid promo fields crash the whole ranking through other calls

**Files modified:** `src/domain/promos/rankNoSweat.ts`, `src/domain/promos/rankNoSweat.test.ts`
**Commit:** ad7d72f
**Applied fix:** Added `validatePromo()`, which runs once before the rate function is called. A `refundCap` that is 0 or less or has more than 2 decimal places, or a `minOddsAmerican` that `americanToDecimal` rejects, now returns a new typed result, `{ kind: "invalid_promo", reason: "bad_refund_cap" | "bad_min_odds", promoId }`, instead of throwing. Tests use the real `makeConversionRateFor` with cached refund-book markets, so the old crash path is exercised. The 5 new cases fail without the fix and pass with it.

### WR-02: The refund is valued with a hedge-book set that is never checked against the ranker's hedge books

**Files modified:** `src/domain/hedge/conversionRate.ts`, `src/domain/hedge/conversionRate.test.ts`, `src/domain/promos/rankNoSweat.ts`, `src/domain/promos/rankNoSweat.test.ts`
**Commit:** a3e1866
**Applied fix:** `ConversionRateFor` now takes `hedgeBookKeys` as a third argument, and `makeConversionRateFor` no longer receives hedge books when it is built (it only takes `events` and `now`). `rankNoSweat` passes `opts.hedgeBookKeys` both to `bestHedgeQuote` and to `conversionRateFor`, so the two sets can't differ. The memo cache key includes the sorted hedge-book set. D-03 still holds: only the member's books are used for hedging, and `topConversionFor` still keeps the refund book's own quotes. Tests check that the rate function receives exactly `opts.hedgeBookKeys`. A non-member book with a much better price does not raise `refundValue`. The cache keeps different hedge sets apart and treats the same set in a different order as one entry.

### WR-03: The memo cache key rounds the amount, so different amounts share one cached result

**Files modified:** `src/domain/hedge/conversionRate.ts`, `src/domain/hedge/conversionRate.test.ts`
**Commit:** 8076217
**Applied fix:** The function returned by `makeConversionRateFor` now throws `RangeError` before the cache lookup when the amount is 0 or less or has more than 2 decimal places, so `toFixed(2)` in the key can never round two different amounts onto one entry. The test calls `25.004` both before and after a cached `25` and checks it throws both times. It also covers 0 and negative amounts.

### WR-04: solveNoSweat doesn't check refundValue against the refund it supposedly values

**Files modified:** `src/domain/hedge/noSweat.ts`, `src/domain/hedge/noSweat.test.ts`
**Commit:** 56f0fa4
**Applied fix:** `solveNoSweat` now throws `RangeError` when `refundValue` is greater than `refundAmount = min(stake, refundCap)`. `refundAmount` is now computed with the local `LocalDecimal.min`. The "refundAmount is capped at refundCap" test (stake 50, cap 25, value 18.75) now also checks hand-calculated `hedgeStake` 42.56, `profitIfWin` 7.44, `profitIfLose` 7.44 and `worstCaseProfit` -11.31. A new test checks that a value above the cap (stake > cap) throws, that a value above the stake (cap > stake) throws, and that exactly the face amount is accepted.

### WR-05: Some ranker tests don't check what their names claim

**Files modified:** `src/domain/promos/rankNoSweat.test.ts`
**Commit:** 388b6ea
**Applied fix:** The "highest estimated profit beats longest qualifying odds" test now builds the real candidate set from the fixture events: the promo-book price, the min-odds filter, and the best member price on the opposite side. It pins that set (including b/home = +150 vs DraftKings +135), asserts `candidatesEvaluated` matches, solves each pair, and asserts the ranker's `estimatedProfit` equals the true maximum and that the event, side, qualifying odds and hedge odds match. The tautological tieRisk test was replaced with an NFL fixture that asserts `tieRisk === true` (and checks `isTieRiskSport`) and an NBA fixture that asserts `false`. A new test makes the promo book (hardrockbet) a member hedge book with the best opposite price and asserts `hedge.bookKey === "hardrockbet"` and `sameBook === true`.

## Notes

- IN-05 (negative best estimate returned as `ok`) was left unchanged as instructed, because it is a deliberate decision (A2).
- Because of WR-01 and WR-02, the Phase 9 caller must handle the new `invalid_promo` result kind and call `makeConversionRateFor({ events, now })`, passing the member's books to each call through `rankNoSweat`'s `hedgeBookKeys`.

---

_Fixed: 2026-10-22T20:35:53Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
