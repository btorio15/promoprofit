# Phase 8: No-Sweat Bet Math - Research

**Researched:** 2026-10-22
**Domain:** Pure exact-decimal hedge math + candidate search over cached odds (TypeScript, decimal.js, Vitest)
**Confidence:** HIGH (all findings come from reading the repo; no new libraries)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Refund bonus bet valued at the bonus-bet finder's single best (top-1) conversion rate right now for the refund's book. Keep behind one injected function (e.g. `conversionRateFor(bookKey)`).
- **D-02:** Every result also returns the worst case: profit if the refund is worth $0 (v = 0).
- **D-03:** Rate computed using only the member's own books (My Books) as hedge books. Cached odds only; 0 Odds API credits.
- **D-04:** If the refund book has no cached odds, result is "can't price". No fixed fallback rate (NSB-02).
- **D-05:** Search the same markets and line-matching rules other promos use (moneylines plus spreads/totals), for both qualifying bet and hedge.
- **D-06:** Known sport/league limit -> search only eligible games; otherwise search everything.
- **D-07:** Promo minimum odds are a hard filter on the qualifying bet.
- **D-08:** Pick the highest estimated profit line (NSB-03), deterministic tie-break consistent with `rankPromoHedges.ts`.
- **D-09:** Qualifying stake is exactly the refund cap.
- **D-10:** Hedge stake follows the member's `StakePrecision` (whole/cents), choosing the best rounded stake exactly, as bonusBet.ts/profitBoost.ts do.
- **D-11:** Rounded-stake results checked in tests against a brute-force search over whole-dollar and cent stakes (test-only oracle like `pairMath.oracle.ts`) (NSB-04).

### Claude's Discretion
- How to hedge: default equal-outcome hedge at the estimated rate (`H = (S*Oa - v*R)/Oh`, profit `= S*(Oa-1) - H`, R = min(S, cap)), worst case shown alongside. Planner may refine rounding/candidate search.
- Module layout and naming (e.g. `src/domain/hedge/noSweat.ts`), return-type shape, representation of "can't price".
- Pushes/voids pay no refund (void returns stake: no refund, no loss).

### Deferred Ideas (OUT OF SCOPE)
- Middle-of-top-N / cushioned rate (swap in later via injected function).
- User-chosen qualifying stake below the cap.
- `no_sweat` promo type in DB/feed, ingestion, UI, "est." labels, Mark done (Phase 9); intro offers (Phase 10).
- The pairMath.ts "cent short" todo.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NSB-01 | Exact hedge: qualifying stake/odds, hedge book/stake, profit each outcome, to the cent | Section "Exact math" + worked fixtures |
| NSB-02 | Refund valued at finder's best conversion rate for refund book + member's hedge books, cached odds, "can't price" if none | Section "Conversion rate" (reuse `rankBonusBetHedges` limit 1) |
| NSB-03 | Search all cached games/lines meeting min odds, pick highest estimated profit | Section "Candidate search" (reuse `enumerateScopeSelections`, `bestHedgeQuote`) |
| NSB-04 | Rounded stakes checked vs brute force | Section "Oracle" + Validation Architecture |
</phase_requirements>

## Summary

No new packages. Phase 8 is two new pure modules under `src/domain/hedge/` (plus a test-only oracle) that glue together existing, exported pieces: `americanToDecimal`, the bonus-bet finder's `rankBonusBetHedges` (for the rate), and `enumerateScopeSelections` + `bestHedgeQuote` (for candidate lines). All existing solvers use a local `Decimal.clone({ precision: 40 })`, a `clean()` snap to 20 dp, and floor-to-cent payouts; the NSB solver must do the same. [VERIFIED: codebase read of bonusBet.ts, americanOdds.ts, rankPromoHedges.ts]

Two traps matter most. (1) The finder's `extractTwoWayMoneylines` drops every quote from books not in `allowedBookKeys`; the finder passes the member's hedge books, so if the refund book is not in that set the bonus side has zero quotes and the rate would falsely read "can't price". Always pass `hedgeBookKeys ∪ {refundBook}` for the rate computation. (2) `rankPromoHedges.ts` has a `promoType === "profit_boost" ? boost : bonus` ternary; do not extend it or add a third branch there in this phase (Phase 9 owns the exhaustive switches). New code is standalone.

**Primary recommendation:** Create `noSweat.ts` (single-candidate exact solver: floor/ceil plus a small neighbor window, profit computed from the rounded stake and floored payouts), `noSweatRank.ts` (candidate enumeration and pick-best, injected `conversionRateFor`), `conversionRate.ts` (top-1 finder rate from cached moneylines), and `noSweat.oracle.ts` (test-only brute force).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| NSB solve (stakes, profits) | Domain (pure TS) | — | Exact math, zero I/O, like bonusBet.ts |
| Candidate enumeration/pick-best | Domain (pure TS) | — | Mirrors rankPromoHedges.ts; caller supplies events |
| Conversion rate for refund book | Domain (pure TS) | API/server action (later) loads events | Pure over `OddsEvent[]`; load via `getCachedEvents()` (0 credits) |
| Loading cached events, member books/precision | Database layer (`src/db/queries.ts`, `feedContext.ts`) | — | Already exists; Phase 8 adds no DB work |

## Standard Stack

### Core
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| decimal.js | already installed (project dep) | Exact cent math | Project rule: no float money math [CITED: CLAUDE.md] |
| vitest | already installed (`npm test` = `vitest run`, include `src/**/*.test.ts`) | Table-driven tests | Existing framework [VERIFIED: vitest.config.ts, package.json] |

No installs, so no Package Legitimacy Audit is needed (none of the packages are new).

## Architecture Patterns

### Data flow
```
getCachedEvents() (moneyline, 0 credits)   getCachedExtendedEvents()
        |                                          |
        +------------------+-----------------------+
                           v
   conversionRateFor(refundBook) --- rankBonusBetHedges(limit 1, allowed = myBooks U {refundBook})
                           |            -> top-1 guaranteedProfit for R = cap  (or null => "can't price")
                           v
   enumerateScopeSelections(events, scope, {now, eligibleMarketTypes: all 3, altSpreadBookKey: promo.bookKey})
        -> ResolvedSelection[]  (sorted deterministically)
                           |  for each: qualifying quote = promoSideQuotes @ promo.bookKey
                           |            filter: decimal(odds) >= decimal(minOdds)   (hard, D-07)
                           |            hedge = bestHedgeQuote(oppositeSideQuotes, myBooks)
                           v
                 solveNoSweat(S=cap, Oa, Oh, V, precision)  -> stakes + win/lose/worst
                           v
          pick best by tie-break chain  ->  NoSweatResult | { kind: "cant_price" } | null
```

### Recommended files
```
src/domain/hedge/noSweat.ts          # solveNoSweat (single candidate, exact)
src/domain/hedge/noSweat.test.ts     # fixtures + oracle comparison
src/domain/hedge/noSweat.oracle.ts   # test-only brute force (NOT matched by test include; never imported by app code)
src/domain/hedge/conversionRate.ts   # topConversionFor(...) -> { profit, rate, pct } | null
src/domain/promos/rankNoSweat.ts     # enumerate + pick best (or src/domain/hedge/; planner's call)
```

### Exact math (D-09, D-10, D-01, D-02)
Let S = cap (qualifying stake, D-09), R = min(S, cap) = S, Oa = qualifying decimal odds, Oh = hedge decimal odds, V = refund value in dollars (estimate).

- Qualifying bet WINS: net `P_w(H) = floor_cents(S*(Oa-1)) - H` (bonusBet.ts floors payout to cents; do the same).
- Qualifying bet LOSES (hedge wins, refund paid): net `P_l(H, V) = floor_cents(H*Oh) - H - S + V`.
- Equal-outcome exact hedge: `H* = (S*Oa - V)/Oh` (matches CONTEXT). `clean()` it (snap 20 dp) before rounding.
- Estimated profit = `min(P_w, P_l(V))` (the "guaranteed-style" figure; equals both at the crossing). Worst case (D-02) = `min(P_w, P_l(0))`, which is `P_l(0)` in practice.
- **V definition (important):** use the finder's cent-exact `guaranteedProfit` for amount R (V = that dollar value), not `conversionPct` (which `bonusBet.ts` truncates to 2 dp, so `pct/100*R` can drift by cents). Expose `rate = guaranteedProfit / R` (Decimal, unrounded) for the injected `conversionRateFor` contract and `pct` for display ("78%"). V = rate*R then equals the finder profit to the cent after `clean()`.
- Rounding rule: candidate stakes = floor and ceil of `H*` at precision (`whole` -> dp 0, `cents` -> dp 2) as in bonusBet.ts, PLUS a ±2 grid-unit neighbor window (cheap insurance because payouts are floored per candidate). Exclude any candidate `<= 0` (a whole-dollar floor of 0 means "no bet"; see fixture HR). Choose max of `min(P_w, P_l(V))`; ties -> smaller hedge stake (same as bonusBet.ts). Profit is ALWAYS recomputed from the rounded stake, never from `H*`.
- Why a window is safe/enough: for Oh >= 1, `P_l` (in cent units) is non-decreasing in H and `P_w` strictly decreasing, so `min` is unimodal and the optimum sits at the crossing. In all hand/brute-force checks below, floor/ceil alone already matched brute force; the window is for floor-induced crossing shifts, and the oracle (NSB-04) is what proves it. [VERIFIED: scratch brute force, 7 cases; derivation is mine, hence the oracle gate]
- Result fields (suggested): `qualifyingStake`, `qualifyingOddsAmerican`, `hedgeStake`, `hedgePayout`, `refundValue` (V), `profitIfWin`, `profitIfLose` (at V), `estimatedProfit`, `worstCaseProfit`, `ratePct`, plus `hedgeBookKey`, selection details. Downstream display "est. +$14.20 at 78% · worst case −$3.10" needs exactly: estimatedProfit, ratePct, worstCaseProfit.
- Represent "can't price" as a discriminated union (`{ kind: "cant_price", reason: "no_refund_book_odds" }`), never `null`/0, so Phase 9 cannot render a number by accident. Distinguish from "no qualifying line" (`{ kind: "no_qualifying_line" }`).

### Cap vs stake, pushes/voids
- Cap vs stake: stake is fixed to the cap (D-09), so R = S. Still compute `R = Decimal.min(S, cap)` in the signature (solver takes `stake` and `refundCap` separately) so a later user-chosen smaller stake (deferred) is a one-line change; the finder rate must then be computed for R, not the cap.
- Push/void: a push returns the stake; no refund, no loss. The model above only has win/lose. Avoid pushes structurally: `enumerateScopeSelections` only emits half-point spreads/totals (`isHalfPoint` filters whole numbers), moneylines are used 2-way (`h2h.outcomes.length === 2`). Residual risk: moneyline draw/tie sports (`tieRisk` flag on the selection). Carry `tieRisk` through to the result for downstream warning; do not model it in the math. Document that a void/push on the qualifying leg gives $0 refund, and the hedge then decides the outcome (this is covered by the worst case only partially; flag in docs, no extra branch).

### Conversion rate (NSB-02, D-01, D-03, D-04)
The finder's pipeline (find-hedges.ts): `extractTwoWayMoneylines(events, { now, windowDays: 7, allowedBookKeys: hedgeBookKeys, sportKeys: new Set(SPORT_KEYS) })` -> `rankBonusBetHedges(markets, { bonusBookKey, bonusAmount: R, hedgeBookKeys, limit })`. It uses moneylines only (cached_odds via `getCachedEvents()`), cents precision (no `precision` passed), a 7-day window, and returns per-game best orientation sorted by guaranteedProfit desc. Top-1 = `result[0].result.guaranteedProfit`.

Plan:
```ts
// conversionRate.ts (pure)
export function topConversionFor(args: {
  events: OddsEvent[]; now: Date; refundBookKey: string; amount: Decimal; hedgeBookKeys: ReadonlySet<string>;
}): { profit: Decimal; rate: Decimal; pct: Decimal } | null {
  const allowed = new Set([...args.hedgeBookKeys, args.refundBookKey]); // PITFALL: refund book must be allowed
  const markets = extractTwoWayMoneylines(args.events, { now: args.now, windowDays: 7, allowedBookKeys: allowed, sportKeys: new Set(SPORT_KEYS) });
  const top = rankBonusBetHedges(markets, { bonusBookKey: args.refundBookKey, bonusAmount: args.amount, hedgeBookKeys: args.hedgeBookKeys, limit: 1 })[0];
  return top ? { profit: top.result.guaranteedProfit, rate: top.result.guaranteedProfit.div(args.amount), pct: top.result.conversionPct } : null;
}
```
Details the planner must respect:
- `rankBonusBetHedges` drops candidates with `guaranteedProfit <= 0` and returns `[]` when the refund book has no quotes; both map to "can't price" (D-04). Spec says "no odds available" = can't price; a book with odds but zero profitable conversion is a judgment call: treat as can't price too (a rate of 0 would silently show a number). Flag this in the plan as confirmed behavior; alternatively return rate 0, which the owner may not want. [ASSUMED: owner not asked; recommend can't price]
- Hedge books in `rankOpts.hedgeBookKeys` must be the member's books (`getHedgeBookKeys(userBookSet)`, which is user books intersected with `usableOddsBooks()`), but `extractTwoWayMoneylines.allowedBookKeys` must include the refund book. In find-hedges the same set is used for both; the refund book is in it only if the member has it. For existing-customer NSB (Phase 9 feed) it is; for intro offers (Phase 10) it is not -> the union fixes it.
- The rate depends on amount R (floor/ceil rounding and book odds); memoize by `(bookKey, amount)`, not bookKey alone. The injected function signature should be `conversionRateFor(bookKey, amount)`; D-01's `conversionRateFor(bookKey)` is the same with amount closed over by the caller. Planner: pick `(bookKey, amount) => RateInfo | null`.
- Fresh cache concern (owner's "days later" optimism) is accepted by D-01; no extra logic.
- 0 credits: the helper takes events as an argument; callers use `getCachedEvents()` which only reads Postgres. Never import from the odds-fetch layer (find-hedges.ts header rule).

### Candidate search (NSB-03, D-05..D-08)
Reuse exactly:
- `enumerateScopeSelections({ moneyline, extended }, scope, { now, eligibleMarketTypes: ["moneyline","spread","total"], altSpreadBookKey: promo.bookKey })` from `selection.ts`: yields every 2-way selection (half-point lines only) in scope with `promoSideQuotes`/`oppositeSideQuotes` for all books, sorted deterministically, future events only. `candidatesFor()` in rankPromoHedges.ts is the same call (exported) but takes a `RankablePromo`; building a fake `RankablePromo` is ugly, so call `enumerateScopeSelections` directly.
- Sport/league limit (D-06): `PromoScope` is `any | sport_window | games | event`. Unknown limit -> `{ kind: "any" }`; known league -> `{ kind: "sport_window", sportKey, windowStart: now, windowEnd: far future }` (check `eventInScope` in scope.ts before relying on window semantics). Accept a `scope: PromoScope` parameter so Phase 9 maps the DB field.
- Qualifying quote: `selection.promoSideQuotes.find(q => q.bookKey === promo.bookKey)`; if none, skip candidate.
- Min odds (D-07): `americanToDecimal(quote.oddsAmerican).gte(americanToDecimal(minOdds))` (the same comparison as `passesBaseMinOdds`; "-500 or longer" means price >= -500 i.e. decimal >= 1.20). Null min odds = no filter. Do NOT reuse `passesBaseMinOdds` (it takes a RankablePromo and passes when the book has no quote); write a 3-line helper that skips when there is no quote.
- Hedge quote: `bestHedgeQuote(selection.oppositeSideQuotes, hedgeBookKeys)` (exported from rankPromoHedges.ts; highest decimal odds, tie alphabetical bookKey). Highest hedge odds minimizes H, so it maximizes profit; the oracle test should also compare against "try every hedge quote" to confirm. `sameBook` = hedge.bookKey === promo.bookKey (keep; downstream may want to warn).
- Run `solveNoSweat` per candidate; skip (do not throw) a candidate that raises `RangeError`, with `console.warn`, like `evaluateBoostCandidate`.
- Pick best by (copy the pattern of `isBetterCandidate`): estimatedProfit desc, worstCaseProfit desc (replaces roi/conversion secondary), commenceTime asc, eventId asc, MARKET_ORDER (moneyline<spread<total), line asc (null=0), SIDE_ORDER (home<away<over<under). `MARKET_ORDER`/`SIDE_ORDER` are not exported from rankPromoHedges.ts; either export them from `selection.ts` (selection.ts has its own copies, also unexported) or duplicate. Duplicating is lowest-risk (no edits to existing modules).
- Unlike `rankPromoHedges`, do NOT drop candidates with non-positive estimated profit (an NSB can have a small or negative estimate; report best honestly, even negative). Planner/owner may want a floor later; default: return best, even if <= 0, since "highest estimated profit" is the spec. [ASSUMED]
- Return shape also includes `candidatesEvaluated` (parity with `PromoOpportunity`).

### Anti-Patterns to Avoid
- Computing profit from `H*` or from the unrounded rate (profit must come from rounded stakes and floored payouts).
- Using `conversionPct` (2 dp truncated) to derive V.
- Native `number` math anywhere in the solver; stakes enter as `Decimal`/strings (see `bonusBet.ts` argument validation: >0, <= 2 dp).
- Mutating global Decimal config; use local `Decimal.clone({ precision: 40 })` and a local `clean()`.
- Adding a third branch to the `profit_boost ? ... : ...` ternaries.
- Routing the new solver through `calculateBonusBetHedge` for the qualifying bet (stake IS returned on a winning NSB qualifying bet; it is a cash bet, payout `S*(Oa-1)` profit). Only the refund is bonus-bet-like, and it is valued through the finder rate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| American -> decimal | custom conversion | `americanToDecimal` | 40-digit precision, validation |
| Best hedge quote | own max-finder | `bestHedgeQuote` (rankPromoHedges.ts) | tie-break parity |
| Line enumeration, alt spreads, half-point rule | own market walker | `enumerateScopeSelections` | handles h2h/spreads/totals/alt spreads |
| Finder conversion rate | re-derive conversion math | `extractTwoWayMoneylines` + `rankBonusBetHedges` (limit 1) | CONTEXT: "reuse, don't re-derive" |
| Float noise snapping | ad-hoc rounding | local `clean()` (copy from bonusBet.ts; it is not exported) | prevents 217.50000000000000000054 issues |

## Worked Fixtures (hand/script-verified; use as test fixtures)

Verified with a decimal.js script (precision 40, floored payouts) and a brute-force grid search up to payout+50 over the stake grid. V is the refund value in dollars (inject as a fixed rate in unit tests). Score = `min(P_w, P_l(V))`.

| # | Case | Precision | H* | floor / ceil | Brute-force best H | Profit if win | Profit if lose (at V) | Estimated | Worst case (V=0) |
|---|------|-----------|----|--------------|--------------------|---------------|-----------------------|-----------|------------------|
| A | S=R=$25, Oa=+100, Oh=-110, V=$18.75 (75%) | cents | 16.369048 | 16.36 / 16.37 | **16.37** | 8.63 | 8.63 | **8.63** | **−10.12** |
| A-w | same | whole | 16.369048 | 16 / 17 | **16** | 9.00 | 8.29 | **8.29** | **−10.46** |
| B | S=$50, Oa=+150, Oh=-170, V=$35.00 (70%) | cents | 56.666667 | 56.66 / 56.67 | **56.67** | 18.33 | 18.33 | **18.33** | **−16.67** |
| B-w | same | whole | 56.666667 | 56 / 57 | **57** | 18.00 | 18.52 | **18.00** | **−16.48** |
| C | S=$25, Oa=+120, Oh=-135, V=$17.37 | cents | 21.617234 | 21.61 / 21.62 | **21.62** | 8.38 | 8.38 | **8.38** | **−8.99** |
| HR | Hard Rock: S=$5, min odds -500, Oa=-500, Oh=+380, V=$3.50 (70%) | cents | 0.520833 | 0.52 / 0.53 | **0.52** | 0.48 | 0.47 | **0.47** | **−3.03** |
| HR-w | same | whole | 0.520833 | 0 / 1 | **1** (floor 0 invalid) | 0.00 | 2.30 | **0.00** | **−1.20** |

Notes for tests:
- A-w and B-w show the whole-dollar branches where win != lose and the min is the estimate; B-w picks the CEIL, A-w picks the FLOOR (both directions covered).
- HR-w tests the "floor is 0" guard: a whole-dollar floor of 0 must be rejected, not returned as a $0 hedge.
- Hand check A: H*=(25*2−18.75)/1.909090…=31.25/1.909090…=16.3690… ; at 16.37 payout floor(31.2518)=31.25; lose = 31.25−16.37−25+18.75 = 8.63; win = 25−16.37 = 8.63. Good.
- Independent edge fixtures to add: min-odds filter rejecting a -600 line when min is -500 while accepting -500 exactly (boundary); a candidate-search fixture with 3 lines where the highest estimated profit is NOT the highest-odds line (shows hedge odds matter); a tie fixture exercising each tie-break level; cant_price fixture (refund book absent from every event); sport-limited fixture (best line is in an excluded sport); refund book not in My Books but present in events (verifies the allowed-set union).
- Rate fixture: build 2-3 `OddsEvent`s where the refund book has known moneyline odds and verify `topConversionFor(...).profit` equals `calculateBonusBetHedge`'s `guaranteedProfit` for the best game (e.g. reference `$100 @ +300 vs -275 -> 80.00`, from bonusBet.test.ts) and that `rate*R == profit`.

## Oracle (NSB-04)
`noSweat.oracle.ts`, test-only (file name not matched by `*.test.ts` include; same convention as `pairMath.oracle.ts`, which also demonstrates compare PROFIT not stake, because stake ties are legitimate):
- Scan every hedge stake on the grid from one unit (`$1` or `$0.01`) up to `S*Oa/Oh + generous margin` (e.g. up to floor(S*Oa) + 50 for cents mode is ~7k points per case; fine). Use integer cents for the loop as pairMath.oracle does, computing payout via the same flooring rule through the production-exported helper or an identical inline `floor`.
- Assert `solveNoSweat(...).estimatedProfit.equals(oracle.best)` for the fixtures above plus a seeded random sweep (reuse `mulberry32`, `randInt`, `pick` from `pairMath.oracle.ts`; import them rather than copying). Suggested: 300+ random cases over S in {5,10,25,50,100,250}, Oa/Oh in a realistic American range (-600..+600 excluding |x|<100), V = rate in {0..95%}*S with cent-exact V, both precisions.
- Also assert the worst-case figure is recomputed at the same chosen H (not separately optimized), and `estimatedProfit == min(profitIfWin, profitIfLose)`.
- Bound the oracle's independence: it must not call the solver's candidate-picking code, only share the payout-flooring function (otherwise it proves nothing).

## Common Pitfalls

### 1. Refund book dropped from the finder's allowed-books filter
**What goes wrong:** rate = "can't price" for a book whose odds exist. **Why:** `extractTwoWayMoneylines` discards quotes from books not in `allowedBookKeys`. **Avoid:** pass `hedgeBookKeys ∪ {refundBook}`; fixture "refund book not in My Books". **Signal:** cant_price when events clearly have the book.

### 2. Rate computed at the wrong amount
**What goes wrong:** rate for $100 reused for a $25 refund (rounding and cap behavior differ). **Avoid:** compute at R; memoize on (book, amount).

### 3. Estimate leaking as "guaranteed"
Result type must carry a certainty marker (`estimated: true`) and never reuse `guaranteedProfit` as a field name; Phase 9 aggregates depend on it. [CITED: .planning/research/SUMMARY.md]

### 4. Rounded-stake drift
Computing profit from `H*` instead of the rounded stake produces answers up to ~1 cent off the oracle. Always recompute from the chosen stake.

### 5. Whole-dollar stake of 0 / tiny stakes
Small S (Hard Rock $5) can make a whole-dollar floor 0. Guard `H > 0`; the ceil candidate (and window) takes over (fixture HR-w).

### 6. Negative/zero estimated profit
Don't silently discard; return it (spec: highest estimated profit). Downstream decides display.

### 7. Window/stale odds
The finder rate uses the 7-day window; candidate search uses `enumerateScopeSelections` (all future events in scope). Both read cached events only; do not add API calls. Odds age display is Phase 9.

### 8. `console.warn` on RangeError paths and Decimal inputs
`calculateBonusBetHedge` throws if amount > 2 dp or <= 0; mirror validation in `solveNoSweat` (stake, cap, V >= 0 with <= 2 dp).

## Code Examples

Skeleton following bonusBet.ts conventions:
```ts
// Source: pattern from src/domain/hedge/bonusBet.ts
const LocalDecimal = Decimal.clone({ precision: 40 });
const clean = (v: Decimal) => v.toDecimalPlaces(20, Decimal.ROUND_HALF_UP);
const floorCents = (v: Decimal) => clean(v).toDecimalPlaces(2, Decimal.ROUND_DOWN);

export function solveNoSweat(i: NoSweatInput): NoSweatSolution {
  const S = new LocalDecimal(i.stake); const cap = new LocalDecimal(i.refundCap);
  const R = Decimal.min(S, cap); const V = new LocalDecimal(i.refundValue); // refundValue = finder profit for R
  const Oa = new LocalDecimal(americanToDecimal(i.qualifyingOddsAmerican));
  const Oh = new LocalDecimal(americanToDecimal(i.hedgeOddsAmerican));
  const winNet = (H: Decimal) => floorCents(S.times(Oa.minus(1))).minus(H);
  const loseNet = (H: Decimal, v: Decimal) => floorCents(H.times(Oh)).minus(H).minus(S).plus(v);
  const exact = clean(S.times(Oa).minus(V).dividedBy(Oh));
  const dp = i.precision === "whole" ? 0 : 2; const unit = new LocalDecimal(dp === 0 ? 1 : "0.01");
  // candidates: floor/ceil of exact at dp, plus +-2 units; keep > 0; dedupe
  // score = Decimal.min(winNet(H), loseNet(H, V)); max score, tie -> smaller H
  // return profits recomputed at chosen H; worstCase = Decimal.min(winNet(H), loseNet(H, new LocalDecimal(0)))
}
```
(`R = min(S, cap)` is the refund amount used for V; assert the caller computed V at R.)

## State of the Art
Nothing to migrate. The only "newer approach" decision is the owner's: top-1 rate (D-01) over median; kept swappable.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A refund book with odds but no profitable conversion (all `guaranteedProfit <= 0`) should read "can't price" | Conversion rate | Owner may prefer a $0 rate with a number shown; easy change in one function |
| A2 | Non-positive best estimated profit is returned, not hidden | Candidate search | UI might want it hidden; decide in Phase 9 |
| A3 | Adding ±2-unit neighbor window to floor/ceil candidates is sufficient; oracle will confirm | Exact math | If the oracle finds a gap, widen window or binary-search the crossing |
| A4 | Sport/league limit is expressed via `PromoScope` (`sport_window` with wide window) | Candidate search | Phase 9 may add a different field; interface takes a scope so mapping is theirs |

## Open Questions
1. **Statistic confirmation:** SUMMARY.md asked to confirm the conversion statistic at the start of this phase; CONTEXT D-01 locks top-1. Resolved.
2. **Does the member's `precision` apply to the rate computation?** Recommend no (finder is cents-only; rate = what the finder shows). The hedge stake of the NSB itself uses member precision (D-10).
3. **Where to put the rank module** (`domain/hedge` vs `domain/promos`): `rankNoSweat` imports from `promos/selection` and `promos/rankPromoHedges`; `domain/promos/` is the natural home to avoid a hedge->promos import cycle. Recommendation: solver + rate + oracle in `domain/hedge/`, ranker in `domain/promos/`.

## Environment Availability
Step 2.6: SKIPPED (pure TypeScript domain code; no external services, Odds API credits not touched).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing), node environment |
| Config file | `vitest.config.ts` (include `src/**/*.test.ts`, alias `@` -> `src`) |
| Quick run command | `npx vitest run src/domain/hedge/noSweat.test.ts src/domain/promos/rankNoSweat.test.ts src/domain/hedge/conversionRate.test.ts` |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NSB-01 | Fixtures A, A-w, B, B-w, C, HR, HR-w: stakes, win/lose/worst to the cent; input validation; profit from rounded stake | unit (table-driven) | `npx vitest run src/domain/hedge/noSweat.test.ts` | Wave 0 |
| NSB-02 | Rate = finder top-1 profit at R; refund book outside My Books still priced; no odds -> `cant_price`; zero credits (module imports nothing from odds-fetch; pure fn) | unit | `npx vitest run src/domain/hedge/conversionRate.test.ts` | Wave 0 |
| NSB-03 | Min-odds boundary; highest estimated profit wins across moneyline/spread/total; sport limit; tie-break chain; hedge book is member's only; no qualifying line | unit | `npx vitest run src/domain/promos/rankNoSweat.test.ts` | Wave 0 |
| NSB-04 | Solver estimatedProfit == oracle best over whole-dollar and cent grids (fixtures + seeded random sweep) | oracle/property | `npx vitest run src/domain/hedge/noSweat.test.ts -t oracle` | Wave 0 |

### Sampling Rate
- Per task commit: quick run command above
- Per wave merge: `npm test`
- Phase gate: full suite green, plus `npx tsc --noEmit` and lint, before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/domain/hedge/noSweat.test.ts` (NSB-01, NSB-04)
- [ ] `src/domain/hedge/noSweat.oracle.ts` (test helper; imports `mulberry32`/`randInt`/`pick` from `pairMath.oracle.ts`)
- [ ] `src/domain/hedge/conversionRate.test.ts` (NSB-02)
- [ ] `src/domain/promos/rankNoSweat.test.ts` (NSB-03)
- [ ] An `OddsEvent` builder: copy the style used in `rankBonusBetHedges.test.ts`/`rankPromoHedges.test.ts` rather than inventing (check those tests for existing helpers before writing new ones)
- Framework install: none

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2/V3/V4 | no (no auth/session/access surface; pure domain code, no endpoints) | — |
| V5 Input Validation | yes (solver inputs) | Explicit `RangeError` guards (positive, <= 2 dp, valid American odds via `americanToDecimal`); Zod only at the future action boundary (Phase 9) |
| V6 Cryptography | no | — |

Threat patterns: bad/extreme odds producing absurd stakes (guard via validation); estimate presented as guaranteed (mitigate with discriminated result type). No injection or secret-handling surface.

## Sources

### Primary (HIGH confidence, codebase read this session)
- `src/domain/hedge/bonusBet.ts`, `americanOdds.ts`, `rankBonusBetHedges.ts`, `marketFilter.ts`, `pairMath.oracle.ts`, `profitBoost.ts` (floorCents)
- `src/domain/promos/rankPromoHedges.ts`, `selection.ts`, `scope.ts`, `types.ts`
- `src/app/actions/find-hedges.ts`, `src/db/queries.ts` (`getCachedEvents`, `getHedgeBookKeys`, `getBonusBooks`)
- `.planning/phases/08-no-sweat-bet-math/08-CONTEXT.md`, `.planning/research/SUMMARY.md`, `.planning/REQUIREMENTS.md`, `CLAUDE.md`, `vitest.config.ts`

### Secondary / Tertiary
- None; no web research needed (internal math and code reuse).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new packages
- Architecture: HIGH, reuses exported, read-verified functions
- Math: HIGH for fixtures (script-verified against brute force), MEDIUM for the "window sufficient" claim (gated by the oracle)
- Pitfalls: HIGH

**Project constraints honored (CLAUDE.md):** decimal.js for all money math, no floats; Vitest table-driven tests for hedge math; zero Odds API credits (cache only); Colorado/regulated books only (inherited from `usableOddsBooks`); work through GSD workflow.

**Research date:** 2026-10-22
**Valid until:** 2026-11-21 (stable internal code; re-check if teammate changes finder or selection.ts)
