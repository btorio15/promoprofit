import Decimal from "decimal.js";
import { floorCents, promoPayoutRaw, type WinningsCap } from "./profitBoost";

/**
 * Test-only helpers for pairMath.test.ts (not matched by the vitest include
 * pattern, never imported by production code): a seeded PRNG and brute-force
 * oracles that scan every stake on a fixed grid.
 *
 * Payouts go through the same exported promoPayoutRaw + floorCents the
 * production solver uses, computed once per grid stake. The double loop then
 * runs on integer cents (exact; every value is a whole number of cents) so a
 * 150 x 150 full-cent scan stays fast. Only PROFIT is compared by the tests
 * (04-RESEARCH Pitfall 1), never the stake pair.
 */

/** mulberry32: small, fast, deterministic. Deterministic; no ambient randomness. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [lo, hi] (inclusive) from a mulberry32 stream. */
export function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Uniform pick from a non-empty list. */
export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[randInt(rng, 0, items.length - 1)];
}

export interface OracleBoostLeg {
  /** Effective boosted decimal odds. */
  obEff: Decimal;
  /** Base decimal odds (only needed for boost_extra caps), else null. */
  baseDecimal: Decimal | null;
  cap: WinningsCap | null;
  max: Decimal;
}

function unitCentsOf(unit: Decimal): number {
  return unit.times(100).toNumber();
}

function gridPayoutsCents(leg: OracleBoostLeg, unit: Decimal): { stakes: number[]; payouts: number[] } {
  const unitCents = unitCentsOf(unit);
  const maxCents = leg.max.times(100).toDecimalPlaces(0, Decimal.ROUND_DOWN).toNumber();
  const stakes: number[] = [];
  const payouts: number[] = [];
  for (let s = unitCents; s <= maxCents; s += unitCents) {
    const stake = new Decimal(s).dividedBy(100);
    stakes.push(s);
    payouts.push(
      floorCents(promoPayoutRaw(stake, leg.obEff, leg.baseDecimal, leg.cap)).times(100).toNumber(),
    );
  }
  return { stakes, payouts };
}

/** Best guaranteed profit over every (sA, sB) on the grid, or null if the grid is empty. */
export function bruteForceBoostBoost(
  a: OracleBoostLeg,
  b: OracleBoostLeg,
  unit: Decimal,
): { profit: Decimal } | null {
  const ga = gridPayoutsCents(a, unit);
  const gb = gridPayoutsCents(b, unit);
  if (ga.stakes.length === 0 || gb.stakes.length === 0) return null;

  let best = -Infinity;
  for (let i = 0; i < ga.stakes.length; i += 1) {
    const sa = ga.stakes[i];
    const pa = ga.payouts[i];
    for (let j = 0; j < gb.stakes.length; j += 1) {
      const total = sa + gb.stakes[j];
      const p = Math.min(pa, gb.payouts[j]) - total;
      if (p > best) best = p;
    }
  }
  return { profit: new Decimal(best).dividedBy(100) };
}

/** Boost stake scan for boost + bonus bet; bonusWinPayout is the (already floored) bonus win W. */
export function bruteForceBoostBonus(
  boost: OracleBoostLeg,
  bonusWinPayout: Decimal,
  unit: Decimal,
): { profit: Decimal } | null {
  const g = gridPayoutsCents(boost, unit);
  if (g.stakes.length === 0) return null;
  const w = bonusWinPayout.times(100).toNumber();

  let best = -Infinity;
  for (let i = 0; i < g.stakes.length; i += 1) {
    const p = Math.min(g.payouts[i] - g.stakes[i], w - g.stakes[i]);
    if (p > best) best = p;
  }
  return { profit: new Decimal(best).dividedBy(100) };
}
