import Decimal from "decimal.js";

/**
 * Test-only helper for noSweat.test.ts: not matched by the vitest include
 * pattern (src/**\/*.test.ts), never imported by production code.
 *
 * Independent of the solver: exact integer cents and rational odds, no
 * Decimal arithmetic and no candidate picker. Decimal appears only at the
 * boundary of bruteForceNoSweat's return value.
 */
export { mulberry32, randInt, pick } from "./pairMath.oracle";

export interface NoSweatOracleInput {
  stakeCents: number;
  refundValueCents: number;
  qualifyingOddsAmerican: number;
  hedgeOddsAmerican: number;
  precision: "whole" | "cents";
}

function oddsFraction(american: number): { num: number; den: number } {
  return american > 0
    ? { num: american + 100, den: 100 }
    : { num: Math.abs(american) + 100, den: Math.abs(american) };
}

function floorMulCents(cents: number, f: { num: number; den: number }): number {
  const n = cents * f.num;
  return (n - (n % f.den)) / f.den;
}

export function noSweatOutcomesAtCents(
  input: NoSweatOracleInput,
  hedgeCents: number,
): {
  winCents: number;
  loseCents: number;
  worstCents: number;
  estimatedCents: number;
} {
  const oa = oddsFraction(input.qualifyingOddsAmerican);
  const oh = oddsFraction(input.hedgeOddsAmerican);
  const winCents =
    floorMulCents(input.stakeCents, { num: oa.num - oa.den, den: oa.den }) -
    hedgeCents;
  const loseCents =
    floorMulCents(hedgeCents, oh) -
    hedgeCents -
    input.stakeCents +
    input.refundValueCents;
  return {
    winCents,
    loseCents,
    worstCents: Math.min(winCents, loseCents - input.refundValueCents),
    estimatedCents: Math.min(winCents, loseCents),
  };
}

export function bruteForceNoSweat(input: NoSweatOracleInput): {
  bestEstimated: Decimal;
  bestHedgeCents: number;
} {
  const unit = input.precision === "whole" ? 100 : 1;
  const oa = oddsFraction(input.qualifyingOddsAmerican);
  const max = floorMulCents(input.stakeCents, oa) + 10000;
  let best = Number.NEGATIVE_INFINITY;
  let bestHedge = unit;
  for (let h = unit; h <= max; h += unit) {
    const e = noSweatOutcomesAtCents(input, h).estimatedCents;
    if (e > best) {
      best = e;
      bestHedge = h;
    }
  }
  return {
    bestEstimated: new Decimal(best).dividedBy(100),
    bestHedgeCents: bestHedge,
  };
}
