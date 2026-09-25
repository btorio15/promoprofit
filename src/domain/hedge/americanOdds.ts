import Decimal from "decimal.js";

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

  const a = new Decimal(american);
  return a.gte(0) ? a.dividedBy(100).plus(1) : new Decimal(100).dividedBy(a.abs()).plus(1);
}
