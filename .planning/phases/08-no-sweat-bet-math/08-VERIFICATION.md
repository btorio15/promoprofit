---
phase: 08-no-sweat-bet-math
verified: 2026-10-22T21:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 8: No-Sweat Bet Math Verification Report

**Phase Goal:** The app can compute, to the cent, the best way to play a no-sweat bet and what it is worth as an estimate.
**Status:** passed (initial verification, run against post-review-fix code)

## Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|---|---|---|
| 1 | Returns qualifying stake/odds, hedge book and stake, profit if win / lose, to the cent | VERIFIED | `src/domain/hedge/noSweat.ts` `solveNoSweat` (decimal.js, local precision-40 clone, floor-cent payouts, floor/ceil +-2 unit candidate search, `whole`/`cents` precision per D-10). `rankNoSweat.ts` assembles qualifying + hedge quotes (book via `SelectionQuote`) and solution. Stake = refund cap (D-09). Returns `profitIfWin`, `profitIfLose`, `estimatedProfit`, `worstCaseProfit` (D-02). |
| 2 | Refund valued at finder's current best (top-1) conversion for the book and member's hedge books, cached odds only | VERIFIED | `conversionRate.ts` `topConversionFor` calls `rankBonusBetHedges(... limit: 1)` over `extractTwoWayMoneylines` of injected cached events; hedge set = member books plus the refund book's own quotes (D-03). Post-fix, `hedgeBookKeys` is passed per call and shared with the hedge leg. No import of ingestion/odds client (grep clean) so 0 credits. Window constant matches the finder (7 days). |
| 3 | No refund-book odds gives "can't price", not a number | VERIFIED | `makeConversionRateFor` returns null when no top result; `rankNoSweat` returns `{kind:"cant_price", reason:"no_refund_book_odds"}` before any solving. No fixed fallback rate (D-04). |
| 4 | Among all cached games/lines meeting min odds, picks highest estimated profit | VERIFIED | `rankNoSweat` enumerates moneyline/spread/total selections over `enumerateScopeSelections` (D-05), scope from `noSweatScope` (D-06), hard min-odds filter via `meetsMinOdds` (D-07), picks max `estimatedProfit` with deterministic tie-break (worst case, time, event id, market, line, side) (D-08). WR-05 test pins the true max against a hand-built candidate set. |
| 5 | Rounded-stake answers match a brute-force oracle | VERIFIED | `noSweat.oracle.ts` (test-only; only imported by `noSweat.test.ts`) is checked via fixtures plus a seeded 300-case sweep (whole and cents precision) asserting estimatedProfit, worst case, win and lose at cents. |

**Score:** 5/5

## Behavioral Checks

| Check | Result |
|---|---|
| `npx vitest run` on noSweat, conversionRate, rankNoSweat tests | 3 files, 57 tests passed |
| `npx tsc --noEmit` | clean |
| Review-fix report: full suite 2052 passed, lint clean | consistent with spot-run |
| Debt markers (TBD/FIXME/XXX/TODO) in phase files | none |

## Requirements Coverage

| ID | Source Plan | Status | Evidence |
|---|---|---|---|
| NSB-01 | 08-01, 08-03 | SATISFIED | `solveNoSweat`, `rankNoSweat` output shape |
| NSB-02 | 08-02, 08-03 | SATISFIED | `conversionRate.ts`, `cant_price` result |
| NSB-03 | 08-03 | SATISFIED | `rankNoSweat` candidate search and `isBetterNoSweat` |
| NSB-04 | 08-01 | SATISFIED | `noSweat.oracle.ts` and the oracle tests |

All four IDs appear in PLAN frontmatter and in REQUIREMENTS.md mapped to Phase 8. No orphaned requirements. (The REQUIREMENTS.md checkboxes/traceability table still show "Pending"; this is bookkeeping for the orchestrator to tick, not a code gap.)

## CONTEXT Decisions

D-01..D-10 honored as listed above. Review-fix signature changes (per-call `hedgeBookKeys`, `invalid_promo` result, `refundValue <= min(stake, cap)` guard, sub-cent amount rejection) are consistent with the goal and D-03. Phase 9 callers must handle `invalid_promo` and call `makeConversionRateFor({events, now})`.

## Anti-Patterns

None blocking. `rankNoSweat` is a standalone module (no new binary promo-type ternary in `rankPromoHedges.ts`), per the research warning. The `console.warn` on a candidate RangeError is an intentional skip. A negative best estimate is returned as `ok` by design (IN-05/A2).

## Human Verification Required

None. This phase is pure domain math with no UI.

## Gaps Summary

No gaps. The phase goal is achieved in the current code.

---
_Verified: 2026-10-22_
_Verifier: Claude (gsd-verifier)_
