/**
 * Test-only helper for fees.test.ts: not matched by the vitest include
 * pattern (src/**\/*.test.ts), never imported by production code.
 *
 * Independent of fees.ts: pure integer-cent arithmetic, no Decimal.
 */

/** Kalshi: ceil(7 * n * p * (100 - p) / 10000) cents. */
export function kalshiFeeCentsOracle(n: number, p: number): number {
  const num = 7 * n * p * (100 - p);
  return Math.floor((num + 9999) / 10000);
}

/** Polymarket US: bankers round of 695 * n * p * (100 - p) / 1_000_000 cents. */
export function polymarketFeeCentsOracle(n: number, p: number): number {
  const num = 695 * n * p * (100 - p);
  const div = 1_000_000;
  const q = Math.floor(num / div);
  const r = num - q * div;
  if (2 * r > div) return q + 1;
  if (2 * r < div) return q;
  return q % 2 === 0 ? q : q + 1;
}

export function feeCentsOracle(
  venueKey: "kalshi" | "polymarket_us",
  n: number,
  p: number,
): number {
  return venueKey === "kalshi" ? kalshiFeeCentsOracle(n, p) : polymarketFeeCentsOracle(n, p);
}
