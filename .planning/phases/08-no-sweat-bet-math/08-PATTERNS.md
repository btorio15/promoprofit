# Phase 8: No-Sweat Bet Math - Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 7 (all new; no existing files modified)
**Analogs found:** 7 / 7

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/domain/hedge/noSweat.ts` | utility (pure solver) | transform | `src/domain/hedge/bonusBet.ts` | exact |
| `src/domain/hedge/noSweat.test.ts` | test | transform | `src/domain/hedge/bonusBet.test.ts` | exact |
| `src/domain/hedge/noSweat.oracle.ts` | test helper | batch (brute force) | `src/domain/hedge/pairMath.oracle.ts` | exact |
| `src/domain/hedge/conversionRate.ts` | utility (pure) | transform | `src/app/actions/find-hedges.ts` `rankForSportKeys` (lines 64-77) | role-match |
| `src/domain/hedge/conversionRate.test.ts` | test | transform | `src/domain/hedge/rankBonusBetHedges.test.ts` | exact |
| `src/domain/promos/rankNoSweat.ts` | service (pure ranker) | transform / search | `src/domain/promos/rankPromoHedges.ts` | exact |
| `src/domain/promos/rankNoSweat.test.ts` | test | transform | `src/domain/promos/rankPromoHedges.test.ts` (1515 lines; read only header and helpers) | role-match |


## Pattern Assignments

### `src/domain/hedge/noSweat.ts` (utility, transform)

**Analog:** `src/domain/hedge/bonusBet.ts` (135 lines). Sibling helper: `floorCents` in `src/domain/hedge/profitBoost.ts` line 84 (exported, but `clean` is not).

**Imports** (bonusBet.ts 1-3):
```typescript
import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import type { StakePrecision } from "./arbMath";
```

**Local Decimal + noise snap** (bonusBet.ts 42-60). Copy `clean` locally (not exported anywhere); never touch global config:
```typescript
const LocalDecimal = Decimal.clone({ precision: 40 });
function clean(value: Decimal): Decimal {
  return value.toDecimalPlaces(20, Decimal.ROUND_HALF_UP);
}
```
profitBoost.ts line 84-86 floorCents (copy shape, or import `floorCents` from `./profitBoost`; the oracle already imports it from there):
```typescript
export function floorCents(value: Decimal): Decimal {
  return clean(value).toDecimalPlaces(2, Decimal.ROUND_DOWN);
}
```

**Input validation** (bonusBet.ts 68-77): RangeError on `<= 0` and `> 2 dp`; mirror for stake, refundCap, refundValue (V >= 0):
```typescript
if (bonusAmount.lte(0)) {
  throw new RangeError(`bonusAmount must be greater than 0, got ${bonusAmount.toString()}`);
}
if (bonusAmount.decimalPlaces() > 2) {
  throw new RangeError(`bonusAmount must have at most 2 decimal places, got ${bonusAmount.toString()}`);
}
```

**Odds conversion + floored payout** (bonusBet.ts 79-90):
```typescript
const bonusDecimalOdds = new LocalDecimal(americanToDecimal(input.bonusOddsAmerican));
const bonusPayout = clean(bonusAmount.times(bonusDecimalOdds.minus(1))).toDecimalPlaces(2, Decimal.ROUND_DOWN);
const hedgeStakeExact = clean(bonusAmount.times(bonusDecimalOdds.minus(1)).dividedBy(hedgeDecimalOdds));
```

**Precision + candidate dedupe + pick best** (bonusBet.ts 92-125). Core to copy; NSB adds the +-2 unit window and a `> 0` filter, and replaces the score with `min(winNet, loseNet(V))`:
```typescript
const dp = input.precision === "whole" ? 0 : 2;
const roundedCandidates = [
  hedgeStakeExact.toDecimalPlaces(dp, Decimal.ROUND_DOWN),
  hedgeStakeExact.toDecimalPlaces(dp, Decimal.ROUND_UP),
];
const candidateStakes = roundedCandidates.filter(
  (stake, index) => roundedCandidates.findIndex((other) => other.equals(stake)) === index,
);
// ...
const isBetter =
  best === null ||
  guaranteedProfit.gt(best.guaranteedProfit) ||
  (guaranteedProfit.equals(best.guaranteedProfit) && hedgeStake.lt(best.hedgeStake));
```

**Conventions to keep:** header docblock states self-contained, no shared generic hedge function (bonusBet.ts lines 5-15); exported `Input`/`Result` interfaces above the function; `precision?: StakePrecision` default "cents". NSB-specific: result uses `estimatedProfit` / `worstCaseProfit` / `estimated: true`, never `guaranteedProfit`. Do not route through `calculateBonusBetHedge`.

---

### `src/domain/hedge/noSweat.oracle.ts` (test helper, batch)

**Analog:** `src/domain/hedge/pairMath.oracle.ts` (139 lines).

**Header convention** (lines 1-14): docblock "Test-only ... not matched by the vitest include pattern, never imported by production code". Reuse, do not copy, the PRNG: `import { mulberry32, randInt, pick } from "./pairMath.oracle";`.

**Grid loop in integer cents with shared floor function** (lines 53-70):
```typescript
import { floorCents, promoPayoutRaw, type WinningsCap } from "./profitBoost";
function unitCentsOf(unit: Decimal): number { return unit.times(100).toNumber(); }
// for (let s = unitCents; s <= maxCents; s += unitCents) {
//   const stake = new Decimal(s).dividedBy(100);
//   payouts.push(floorCents(...).times(100).toNumber());
// }
```
Scoring pattern (lines 83-90): integer-cent math, `Math.min(...) - total`, track best, return `new Decimal(best).dividedBy(100)`. Compare PROFIT only, never stake (stake ties are legitimate). Oracle shares only `floorCents`, not the solver's candidate picker.

---

### `src/domain/hedge/noSweat.test.ts` (test, transform)

**Analog:** `src/domain/hedge/bonusBet.test.ts` (212 lines).

**Table-driven shape** (lines 1-30):
```typescript
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import { calculateBonusBetHedge } from "./bonusBet";

interface Fixture { name: string; /* inputs */ /* expected strings like "220.00" */ }
const fixtures: Fixture[] = [ { name: "reference fixture", ... } ];
```
Compare with `.toFixed(2)` to string. Fixtures: A, A-w, B, B-w, C, HR, HR-w from RESEARCH.md table. Oracle sweep: seeded `mulberry32`, 300+ cases, both precisions, assert `estimatedProfit` equals oracle best.

---

### `src/domain/hedge/conversionRate.ts` (utility, transform)

**Analog:** `src/app/actions/find-hedges.ts` lines 64-77 (`rankForSportKeys`), plus `rankBonusBetHedges.ts` lines 29-44 (RankOptions) and 111-157.

**Imports** (find-hedges.ts 13-15):
```typescript
import { extractTwoWayMoneylines, type TwoWayMoneylineMarket } from "@/domain/hedge/marketFilter";
import { rankBonusBetHedges, type BonusBetOpportunity, type RankOptions } from "@/domain/hedge/rankBonusBetHedges";
import { SPORT_KEYS } from "@/config/sports";
```

**Core pattern** (find-hedges.ts 70-76):
```typescript
const markets = extractTwoWayMoneylines(events, {
  now,
  windowDays: WINDOW_DAYS,            // 7
  allowedBookKeys: rankOpts.hedgeBookKeys,
  sportKeys,
});
return rankBonusBetHedges(markets, rankOpts);   // rankOpts: { bonusBookKey, bonusAmount, hedgeBookKeys, limit }
```
Deviation (critical): pass `allowedBookKeys = hedgeBookKeys UNION {refundBookKey}`; keep `hedgeBookKeys` as the member's books only. Use `limit: 1`; `top.result.guaranteedProfit`, `top.result.conversionPct`. Empty result => null (can't price). Do NOT import anything from the odds-fetch layer (find-hedges.ts header rule; 0 credits). Pure: takes `OddsEvent[]` as an argument.

---

### `src/domain/hedge/conversionRate.test.ts` (test, transform)

**Analog:** `src/domain/hedge/rankBonusBetHedges.test.ts` lines 1-40.

```typescript
import { SPORT_KEYS } from "@/config/sports";
import { usableOddsBooks } from "@/config/books";
import { buildFixtureEvents } from "@/test/fixtures/oddsEvents";
const now = new Date("2026-10-01T12:00:00.000Z");
const allowedBookKeys = new Set(usableOddsBooks().map((b) => b.key));
// buildFixtureEvents(now) -> extractTwoWayMoneylines(...)
// reference: draftkings / $100 -> first.result.guaranteedProfit.toFixed(2) === "80.00" (Jazz +300 vs Nuggets -275 at fanduel)
```
Use the `buildFixtureEvents` fixture (`src/test/fixtures/oddsEvents.ts`) rather than inventing a builder; assert `profit` equals 80.00 for draftkings/$100 and `rate.times(amount)` equals profit. Add: refund book not in hedge set still priced; book absent => null.

---

### `src/domain/promos/rankNoSweat.ts` (service, search/transform)

**Analog:** `src/domain/promos/rankPromoHedges.ts` (436 lines).

**Imports** (lines 1-15; trim to what is needed):
```typescript
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { americanToDecimal } from "@/domain/hedge/americanOdds";
import type { StakePrecision } from "@/domain/hedge/arbMath";
import { enumerateScopeSelections, type ResolvedSelection, type SelectionQuote } from "./selection";
import { type PromoScope } from "./scope";
import type { PromoMarketType, PromoSide } from "./types";
import { bestHedgeQuote } from "./rankPromoHedges";   // exported, line 77
```

**Tie-break constants** (lines 70-71; unexported, duplicate them):
```typescript
const MARKET_ORDER: Record<PromoMarketType, number> = { moneyline: 0, spread: 1, total: 2 };
const SIDE_ORDER: Record<PromoSide, number> = { home: 0, away: 1, over: 2, under: 3 };
```

**Enumeration** (lines 298-306; call directly, with all 3 market types and `altSpreadBookKey: promo.bookKey`):
```typescript
enumerateScopeSelections(
  { moneyline: opts.moneylineEvents, extended: opts.extendedEvents },
  scope,
  { now: opts.now, eligibleMarketTypes: ["moneyline", "spread", "total"], altSpreadBookKey: promo.bookKey },
);
```

**Best hedge quote** (lines 77-92): `bestHedgeQuote(selection.oppositeSideQuotes, hedgeBookKeys)`; highest decimal odds, tie alphabetical bookKey.

**Min odds** (lines 133-141 is the model; write own helper that SKIPS when the book has no quote):
```typescript
americanToDecimal(quote.oddsAmerican).gte(americanToDecimal(minOddsAmerican))
```

**Tie-break chain** (`isBetterCandidate`, lines 266-288): profit desc, secondary (use worstCaseProfit desc), `commenceTime` asc, `eventId` asc, MARKET_ORDER, `line ?? 0` asc, SIDE_ORDER.
```typescript
const timeDiff = a.selection.commenceTime.getTime() - b.selection.commenceTime.getTime();
if (timeDiff !== 0) return timeDiff < 0;
if (a.selection.eventId !== b.selection.eventId) return a.selection.eventId < b.selection.eventId;
const marketDiff = MARKET_ORDER[a.selection.marketType] - MARKET_ORDER[b.selection.marketType];
if (marketDiff !== 0) return marketDiff < 0;
const aLine = a.selection.line ?? 0; const bLine = b.selection.line ?? 0;
if (aLine !== bLine) return aLine < bLine;
return SIDE_ORDER[a.selection.side] - SIDE_ORDER[b.selection.side] < 0;
```

**Error handling** (lines 181-187): skip candidate on RangeError with warn, rethrow otherwise:
```typescript
} catch (err) {
  if (err instanceof RangeError) {
    console.warn(`rankPromoHedges: promo ${promo.id} candidate raised RangeError: ${err.message}`);
    return null;
  }
  throw err;
}
```

**Loop + counter** (lines 311-322): `candidatesEvaluated++` per evaluated candidate; `isBetterCandidate(evaluated, best)`.

**Deviations:** inject `conversionRateFor(bookKey, amount)`; do not add a `profit_boost ? : ` branch anywhere; do not drop non-positive estimates; result is a discriminated union (`ok` | `cant_price` | `no_qualifying_line`); carry `selection.tieRisk` through; carry `sameBook`.

---

### `src/domain/promos/rankNoSweat.test.ts` (test)

**Analog:** `src/domain/promos/rankPromoHedges.test.ts` lines 1-40. Reuse the local event-builder style:
```typescript
const NOW = new Date("2026-09-27T00:00:00Z");
function plusHours(hours: number): string { return new Date(NOW.getTime() + hours * 3600000).toISOString(); }
function moneylineEvent(opts: { id; homeTeam; awayTeam; commenceTime?; sportKey?; quotes: { bookKey; homePrice; awayPrice }[] }): OddsEvent { /* h2h market per bookmaker */ }
```
Spread/total event helpers also live in that file (grep before writing new ones). Cases: min-odds boundary (-500 accepted, -600 rejected), 3-line fixture where highest profit != highest odds, tie-break levels, sport-limited scope, cant_price, refund book outside My Books.

## Shared Patterns

### Exact decimal math
**Source:** `src/domain/hedge/bonusBet.ts` lines 42-60 and `profitBoost.ts` 84-86. **Apply to:** `noSweat.ts`, `conversionRate.ts` (reads only), oracle. Local `Decimal.clone({ precision: 40 })`, local `clean()` to 20 dp, floor payouts to cents, no `number` math (except the oracle's integer-cent loop, as in pairMath.oracle.ts).

### Validation by RangeError
**Source:** bonusBet.ts 68-77. **Apply to:** `noSweat.ts`. Callers catch RangeError per candidate (rankPromoHedges.ts 181-187).

### Zero Odds API credits
**Source:** find-hedges.ts header rule. **Apply to:** `conversionRate.ts`, `rankNoSweat.ts`. Take `OddsEvent[]` as arguments; never import odds-fetch code. Events come from `getCachedEvents()` / extended cache at the future caller.

### Deterministic tie-break
**Source:** rankPromoHedges.ts 266-288 and rankBonusBetHedges.ts sort (profit desc, commence asc, eventId asc). **Apply to:** `rankNoSweat.ts`.

### Vitest conventions
`import { describe, expect, it } from "vitest"`, table-driven fixtures with string expectations compared via `.toFixed(2)`, `@` alias to `src`, include pattern `src/**/*.test.ts` (so `*.oracle.ts` is not collected).

## No Analog Found

None. The only novel elements are the NSB formula itself (RESEARCH.md "Exact math" and the skeleton in "Code Examples") and the discriminated-union result shape (no existing solver returns a union; `PromoOpportunity.result` at rankPromoHedges.ts line 51 is the closest `kind`-tagged precedent).

## Metadata

**Analog search scope:** `src/domain/hedge/`, `src/domain/promos/`, `src/app/actions/find-hedges.ts`, `src/test/fixtures/`
**Files read:** bonusBet.ts, pairMath.oracle.ts (head), rankBonusBetHedges.ts (parts), rankPromoHedges.ts (parts), selection.ts (parts), scope.ts (head), find-hedges.ts (parts), bonusBet.test.ts (head), rankBonusBetHedges.test.ts (head), rankPromoHedges.test.ts (head)
**Pattern extraction date:** 2026-10-22
