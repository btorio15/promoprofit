---
phase: 08-no-sweat-bet-math
reviewed: 2026-10-22T20:30:39Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/domain/hedge/noSweat.ts
  - src/domain/hedge/noSweat.oracle.ts
  - src/domain/hedge/noSweat.test.ts
  - src/domain/hedge/conversionRate.ts
  - src/domain/hedge/conversionRate.test.ts
  - src/domain/promos/rankNoSweat.ts
  - src/domain/promos/rankNoSweat.test.ts
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-10-22T20:30:39Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the no-sweat solver (`noSweat.ts`), the refund-valuation helper (`conversionRate.ts`), the candidate ranker (`rankNoSweat.ts`), and their tests and oracle. I also checked the code they call: `floorCents`/`clean` in `profitBoost.ts`, `americanToDecimal`, `calculateBonusBetHedge`, `rankBonusBetHedges`, `bestHedgeQuote`, `enumerateScopeSelections` and `eventInScope`.

The solver's core math holds up. All money math uses decimal.js, and every payout goes through `floorCents` (which applies `clean` first). The objective `min(win(H), lose(H))` has one peak: win falls as H rises and the floored lose rises, so a window of ±2 units around the exact equal-outcome stake always contains the best stake. I checked this with a temporary seeded sweep: 400 cases with cent-level stakes from $1 to $50, odds out to ±3000, and both precisions. It matched the brute-force oracle every time. The temporary file was deleted, so the working tree is unchanged.

No blockers. The problems are in the ranker and valuation wiring:
- Error handling is uneven: some invalid promo fields crash the whole ranking, while others are quietly skipped one candidate at a time.
- Nothing ties the hedge books used to value the refund to the hedge books used for the hedge.
- The memo cache key rounds the amount.
- The solver does not check that `refundValue` matches the refund it claims to value.
- A few tests don't actually check what their names say.

## Warnings

### WR-01: rankNoSweat only guards solveNoSweat; invalid promo fields crash the whole ranking through other calls

**File:** `src/domain/promos/rankNoSweat.ts:134-137, 164, 172-189`
**Issue:** The `try/catch (RangeError)` covers only `solveNoSweat`, but the same bad inputs fail earlier, outside that block:
- `refundCap <= 0` or with more than 2 decimal places goes to `opts.conversionRateFor(promo.bookKey, refundAmount)`, then `topConversionFor`, then `rankBonusBetHedges`, then `calculateBonusBetHedge`. That throws `RangeError("bonusAmount must be greater than 0 ...")` (bonusBet.ts:61-66), and nothing in `rankNoSweat` catches it. The ranking crashes whenever the refund book has any cached market.
- An invalid `promo.minOddsAmerican` (for example -50 from a manual entry) throws inside `meetsMinOdds` (line 87-88, `americanToDecimal`), also outside the try.

As a result, the per-candidate `catch` is dead code for its main purpose: any stake/refundCap problem has already crashed the run before the loop starts. One malformed promo row brings down the whole no-sweat feed instead of producing a typed result.
**Fix:** Check promo-level fields once, up front, and return a typed result before calling the rate function:
```ts
if (promo.refundCap.lte(0) || promo.refundCap.decimalPlaces() > 2) {
  return { kind: "invalid_promo", reason: "bad_refund_cap" };
}
if (promo.minOddsAmerican !== null) {
  try { americanToDecimal(promo.minOddsAmerican); }
  catch { return { kind: "invalid_promo", reason: "bad_min_odds" }; }
}
```
(Or wrap the `conversionRateFor` call with the same `RangeError` handling.) Then the per-candidate catch only has to handle per-candidate failures.

### WR-02: The refund is valued with a hedge-book set that is never checked against the ranker's hedge books

**File:** `src/domain/promos/rankNoSweat.ts:34-41, 137` and `src/domain/hedge/conversionRate.ts:71-84`
**Issue:** `makeConversionRateFor` fixes `hedgeBookKeys` when it is created. `rankNoSweat` uses a separate `opts.hedgeBookKeys` to choose the hedge leg, and nothing connects the two. If a caller builds the rate function with a wider set (for example, every usable book instead of the member's books), the refund is valued at a conversion the member can't actually get. That makes `refundValue`, and so `estimatedProfit` and the equal-outcome hedge stake, too high, which conflicts with D-03 ("Only the member's books are used as hedge books"). The only caller is Phase 9 code that doesn't exist yet, so this is easy to get wrong.
**Fix:** Pick one source of truth. Either build the rate function inside `rankNoSweat` from `opts`:
```ts
// NoSweatRankOptions: replace conversionRateFor with rateEvents: OddsEvent[]
const conversionRateFor = makeConversionRateFor({ events: opts.rateEvents, now: opts.now, hedgeBookKeys: opts.hedgeBookKeys });
```
or make `ConversionRateFor` accept `hedgeBookKeys` as an argument, and include it in the cache key.

### WR-03: The memo cache key rounds the amount, so different amounts share one cached result

**File:** `src/domain/hedge/conversionRate.ts:78`
**Issue:** `` const key = `${bookKey}|${amount.toFixed(2)}` `` rounds the amount to 2 places. `new Decimal("25.004")` and `new Decimal("25")` get the same key. Whichever is requested second gets the first one's `ConversionRate`: its `amount` field doesn't match what was asked for, and `profit` and `rate` were computed for a different amount. The same input uncached would throw a `RangeError` (more than 2 decimal places) instead. So the result depends on call order: the same input can throw on one call and return a wrong value on another.
**Fix:** Key on the exact value, or reject amounts with more than 2 decimal places before using the cache:
```ts
if (amount.decimalPlaces() > 2) throw new RangeError(`amount must have at most 2 dp, got ${amount}`);
const key = `${bookKey}|${amount.toFixed(2)}`;
```

### WR-04: solveNoSweat doesn't check refundValue against the refund it supposedly values; refundCap only affects a display field

**File:** `src/domain/hedge/noSweat.ts:21, 63-71, 79, 82`
**Issue:** The docs say `refundValue` must be "computed by the caller at min(stake, refundCap)", but the solver never checks this. `refundCap` is validated, then used only for the returned `refundAmount`. It never enters the lose-side math, which uses `V` directly (line 79). Passing `stake=50, refundCap=25, refundValue=37.50` (valued at the full stake, not the cap) raises no error, and the result overstates the lose-side profit and the hedge stake. The test "refundAmount is capped at refundCap" (noSweat.test.ts:170) does exactly this (stake 50, cap 25, value 18.75) and checks only the display field, so the gap is never tested. A bonus bet's cash value can never exceed its face amount, so `V > refundAmount` is always a caller bug.
**Fix:**
```ts
const refundAmount = LocalDecimal.min(S, cap);
if (V.gt(refundAmount)) {
  throw new RangeError(`refundValue ${V} cannot exceed refundAmount ${refundAmount}`);
}
```
Also add a test where `stake > refundCap` and check `profitIfLose`, not just `refundAmount`.

### WR-05: Some ranker tests don't check what their names claim

**File:** `src/domain/promos/rankNoSweat.test.ts:322-333, 565-566`
**Issue:**
- "highest estimated profit beats longest qualifying odds" compares the result against hard-coded `[q, h]` pairs that are not the candidates the ranker actually evaluates. For event `b`, the best hedge on the away side is DraftKings +135, not +130, so `[150, 130]` is a weaker pair than the real candidate `[150, 135]`. `[-180, 135]` pairs the away price with a home-side price (the real hedge is DraftKings -140). `[-120, 105]` mixes sides the same way. The test never checks the true best pair (`[150, 135]`), so a ranker that picked a slightly worse real candidate could still pass.
- "carries tieRisk and sameBook through" checks `typeof tieRisk === "boolean"` and `tieRisk === selection.tieRisk`. That compares the field with its own source, and the fixture is NFL, where tieRisk may well be false. No test ever shows `tieRisk: true` reaching the opportunity, and no test covers `sameBook: true`.

**Fix:** Build the expected value from the actual candidate set: for each selection, take the promo-book price and the best member hedge price, call `solveNoSweat`, take the maximum, and assert `best.equals(expectedMax)`. Add a fixture in a tie-risk sport (per `isTieRiskSport`) and assert `tieRisk === true`. Add one where the promo book is in `HEDGE_BOOKS` with the best opposite price and assert `sameBook === true`.

## Info

### IN-01: Tie-break orderings copied from selection.ts

**File:** `src/domain/promos/rankNoSweat.ts:59-69, 112-127`
**Issue:** `MARKET_ORDER`, `SIDE_ORDER` and the tie-break chain after the time check repeat `compareResolvedSelections` in `selection.ts:254-266`. `enumerateScopeSelections` already returns selections in that order, and the ranker replaces `best` only when a candidate is strictly better, so the copied chain is also redundant. The two copies can drift apart without anyone noticing.
**Fix:** Export `compareResolvedSelections` from `selection.ts` and use `return compareResolvedSelections(a.selection, b.selection) < 0;` after the profit and worst-case comparisons.

### IN-02: CONVERSION_WINDOW_DAYS is linked to find-hedges only by a comment

**File:** `src/domain/hedge/conversionRate.ts:19-20`
**Issue:** "Must stay equal to WINDOW_DAYS in src/app/actions/find-hedges.ts", but `find-hedges.ts:18` declares its own `const WINDOW_DAYS = 7`. If one changes and the other doesn't, the no-sweat refund value stops matching the finder's top-1 (D-01).
**Fix:** In `find-hedges.ts`, import `CONVERSION_WINDOW_DAYS` (or a shared `FINDER_WINDOW_DAYS`) instead of redeclaring it.

### IN-03: Redundant refundAmount computation in the ranker

**File:** `src/domain/promos/rankNoSweat.ts:134-135`
**Issue:** `stake` is set to `promo.refundCap`, so `Decimal.min(stake, promo.refundCap)` is always `refundCap`. The line suggests some capping happens when it doesn't.
**Fix:** Use `const refundAmount = promo.refundCap;` with the D-09 comment, or drop the variable.

### IN-04: console.warn inside a pure domain module

**File:** `src/domain/promos/rankNoSweat.ts:183-185`
**Issue:** The module says it does "zero I/O", but it logs once per failing candidate, which could be hundreds of identical lines for one bad promo. Other parts of the domain report problems through typed results.
**Fix:** Count skipped candidates in the result (for example, `candidatesSkipped`) and let the caller decide whether to log.

### IN-05: Negative-profit best results are returned as `kind: "ok"`

**File:** `src/domain/promos/rankNoSweat.ts:196-211` (test at `rankNoSweat.test.ts:478-496`)
**Issue:** The bonus finder hides opportunities with zero or negative profit (D-17, `rankBonusBetHedges.ts:92`), but `rankNoSweat` returns a negative estimate with the same `ok` kind as a profitable one. The test shows this is deliberate, but the result type gives the Phase 9 caller nothing that forces it to filter or label the row. The project's core value is showing profitable opportunities.
**Fix:** Add a `profitable: boolean` field (or a separate `kind: "unprofitable"`), so the feed has to handle the case explicitly.

### IN-06: Oracle sweep coverage is narrow; non-null cast hides an invariant

**File:** `src/domain/hedge/noSweat.test.ts:238-276`, `src/domain/hedge/noSweat.ts:110`
**Issue:** The committed sweep covers only whole-dollar stakes from {5, 10, 25, 50, 100}, `refundCap === stake`, and odds within ±600. The temporary wider sweep described in the Summary passed, but the committed test doesn't guard those cases against regression. Separately, `(best as {...}).H` depends on `candidates` never being empty. That holds today because `unit` is always added, but the cast hides it.
**Fix:** Widen the committed sweep to random cent stakes (for example, `randInt(rng, 100, 5000)` cents) and odds up to about ±3000, with fewer cases to keep the run time down. Replace the cast with `if (!best) throw new Error("unreachable: no hedge candidates");`.

---

_Reviewed: 2026-10-22T20:30:39Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
