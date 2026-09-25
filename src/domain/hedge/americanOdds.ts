import Decimal from "decimal.js";

// American odds convert exactly only for "nice" values (e.g. +300 -> 4).
// Values like -300 (-> 1 + 1/3) or -275 (-> 1 + 4/11) are base-10 repeating
// decimals with no exact finite representation. A local high-precision
// clone keeps that unavoidable truncation far enough out (~38-40 digits)
// that it never leaks into a 2-decimal-place cent computation downstream
// (see bonusBet.ts's `clean` step, which relies on this headroom).
const OddsDecimal = Decimal.clone({ precision: 40 });

/**
 * Converts American odds to decimal odds as a Decimal (never a native
 * float). Positive odds: a/100 + 1. Negative odds: 100/|a| + 1.
 */
export function americanToDecimal(american: number): Decimal {
  if (!Number.isInteger(american)) {
    throw new RangeError(`American odds must be an integer, got ${american}`);
  }
  if (american > -100 && american < 100) {
    throw new RangeError(
      `American odds must be >= 100 or <= -100, got ${american}`,
    );
  }

  const a = new OddsDecimal(american);
  return a.gte(0)
    ? a.dividedBy(100).plus(1)
    : new OddsDecimal(100).dividedBy(a.abs()).plus(1);
}
