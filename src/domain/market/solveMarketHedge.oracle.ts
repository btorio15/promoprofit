import Decimal from "decimal.js";
import { feeCentsOracle } from "./fees.oracle";

/**
 * Test-only helper for solveMarketHedge.test.ts: not matched by the vitest
 * include pattern (src/**\/*.test.ts), never imported by production code.
 *
 * Independent of the solver: exact integer cents and rational odds, no
 * Decimal arithmetic and no candidate picker. Decimal appears only at the
 * boundary of the returned profit.
 */
export { mulberry32, randInt, pick } from "../hedge/pairMath.oracle";

export type OracleVenue = "kalshi" | "polymarket_us";

interface Frac {
  num: number;
  den: number;
}

/** Decimal odds as the fraction num/den. */
export function oddsFraction(american: number): Frac {
  return american > 0
    ? { num: american + 100, den: 100 }
    : { num: Math.abs(american) + 100, den: Math.abs(american) };
}

function floorDiv(a: number, b: number): number {
  return (a - (a % b)) / b;
}

function ceilDiv(a: number, b: number): number {
  return floorDiv(a + b - 1, b);
}

function outlayCents(venue: OracleVenue, n: number, p: number): number {
  return n * p + feeCentsOracle(venue, n, p);
}

/** Best min-profit (cents) over N for a fixed book gross G and cash stake S. */
function bestOverContracts(
  venue: OracleVenue,
  price: number,
  grossCents: number,
  cashCents: number,
): number {
  let best = Number.NEGATIVE_INFINITY;
  const nMax = ceilDiv(grossCents, 100) + 5;
  for (let n = 1; n <= nMax; n++) {
    const out = outlayCents(venue, n, price);
    const profit = Math.min(grossCents, 100 * n) - cashCents - out;
    if (profit > best) best = profit;
  }
  return best;
}

export interface MarketBonusOracleInput {
  bonusCents: number;
  bonusOddsAmerican: number;
  venueKey: OracleVenue;
  priceCents: number;
}

export function bruteForceMarketBonus(i: MarketBonusOracleInput): { profit: Decimal } {
  const f = oddsFraction(i.bonusOddsAmerican);
  const gross = floorDiv(i.bonusCents * (f.num - f.den), f.den);
  const best = bestOverContracts(i.venueKey, i.priceCents, gross, 0);
  return { profit: new Decimal(best).dividedBy(100) };
}

export interface MarketBoostOracleInput {
  /** Published boosted American price, or null to derive from boostPercent. */
  boostedOddsAmerican: number | null;
  baseOddsAmerican: number;
  /** Whole-number boost percent used when no published price. */
  boostPercent: number;
  maxStakeDollars: number;
  cap: { kind: "net_winnings" | "total_payout" | "boost_extra"; amountDollars: number } | null;
  precision: "whole" | "cents";
  venueKey: OracleVenue;
  priceCents: number;
}

export function bruteForceMarketBoost(i: MarketBoostOracleInput): { profit: Decimal } {
  const base = oddsFraction(i.baseOddsAmerican);
  let eff: Frac;
  if (i.boostedOddsAmerican !== null) {
    eff = oddsFraction(i.boostedOddsAmerican);
  } else {
    // 1 + (d0 - 1)(1 + b/100) with d0 = n0/d0den
    eff = {
      num: (base.num - base.den) * (100 + i.boostPercent) + 100 * base.den,
      den: 100 * base.den,
    };
  }

  const unit = i.precision === "whole" ? 100 : 1;
  const maxc = i.maxStakeDollars * 100;
  const capc = i.cap ? i.cap.amountDollars * 100 : 0;

  const stakes = new Set<number>([maxc]);
  if (i.cap) {
    let a: number;
    let b: number;
    if (i.cap.kind === "net_winnings") {
      a = capc * eff.den;
      b = eff.num - eff.den;
    } else if (i.cap.kind === "total_payout") {
      a = capc * eff.den;
      b = eff.num;
    } else {
      a = capc * eff.den * base.den;
      b = eff.num * base.den - base.num * eff.den;
    }
    if (a < maxc * b) {
      const lo = floorDiv(a, b * unit) * unit;
      const hi = ceilDiv(a, b * unit) * unit;
      for (const s of [lo, hi]) stakes.add(Math.min(Math.max(s, unit), maxc));
    }
  }

  let best = Number.NEGATIVE_INFINITY;
  for (const sc of stakes) {
    if (sc <= 0) continue;
    let gross: number;
    if (!i.cap) {
      gross = floorDiv(sc * eff.num, eff.den);
    } else if (i.cap.kind === "net_winnings") {
      gross = sc + Math.min(floorDiv(sc * (eff.num - eff.den), eff.den), capc);
    } else if (i.cap.kind === "total_payout") {
      gross = Math.min(floorDiv(sc * eff.num, eff.den), capc);
    } else {
      // S*base + min(S*(eff - base), cap)
      const extraNum = sc * (eff.num * base.den - base.num * eff.den);
      const extraDen = eff.den * base.den;
      if (extraNum <= capc * extraDen) {
        gross = floorDiv(sc * eff.num, eff.den);
      } else {
        gross = floorDiv(sc * base.num, base.den) + capc;
      }
    }
    const p = bestOverContracts(i.venueKey, i.priceCents, gross, sc);
    if (p > best) best = p;
  }
  return { profit: new Decimal(best).dividedBy(100) };
}

export interface MarketArbOracleInput {
  totalCents: number;
  /** 100 for whole-dollar book stakes, 1 for cents. */
  unitCents: number;
  bookOddsAmerican: number;
  venueKey: OracleVenue;
  priceCents: number;
}

/** Every book stake unit x every contract count within the cap. */
export function bruteForceMarketArb(i: MarketArbOracleInput): { profit: Decimal } {
  const f = oddsFraction(i.bookOddsAmerican);
  const outlays: number[] = [0];
  for (let n = 1; n * i.priceCents <= i.totalCents; n++) {
    outlays.push(outlayCents(i.venueKey, n, i.priceCents));
  }
  let best = Number.NEGATIVE_INFINITY;
  for (let b = i.unitCents; b < i.totalCents; b += i.unitCents) {
    const payout = floorDiv(b * f.num, f.den);
    for (let n = 1; n < outlays.length; n++) {
      if (b + outlays[n] > i.totalCents) break;
      const profit = Math.min(payout, 100 * n) - b - outlays[n];
      if (profit > best) best = profit;
    }
  }
  return { profit: new Decimal(best).dividedBy(100) };
}
