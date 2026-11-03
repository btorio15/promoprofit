/**
 * Test-only helper for solvePairMarketTopUp.test.ts: not matched by the vitest
 * include pattern (src/**\/*.test.ts), never imported by production code.
 *
 * Independent integer-cent brute force over the contract count N. Market
 * cost/fee use pure integer arithmetic (fees.oracle.ts); promo payouts reuse
 * the exported promoPayoutRaw + floorCents once per candidate stake, exactly
 * as pairMath.oracle.ts does. Only PROFIT is compared by the tests.
 */
import Decimal from "decimal.js";
import { americanToDecimal } from "../hedge/americanOdds";
import {
  clean,
  effectiveBoostedDecimal,
  floorCents,
  kinkStake,
  promoPayoutRaw,
  type WinningsCap,
} from "../hedge/profitBoost";
import type { BoostLegInput } from "../hedge/pairMath";
import { feeCentsOracle } from "./fees.oracle";

export interface OracleMarket {
  venueKey: "kalshi" | "polymarket_us";
  priceCents: number;
}

export type OraclePrecision = "whole" | "cents";

interface Row {
  stake: number; // cents
  payout: number; // cents
}

function legRows(input: BoostLegInput, precision: OraclePrecision, all: boolean): Row[] {
  const obEff = effectiveBoostedDecimal(input).decimal;
  const base =
    input.baseOddsAmerican !== null ? new Decimal(americanToDecimal(input.baseOddsAmerican)) : null;
  const cap: WinningsCap | null = input.winningsCap
    ? { kind: input.winningsCap.kind, amount: new Decimal(input.winningsCap.amount) }
    : null;
  const unitC = precision === "whole" ? 100 : 1;
  const maxC = Math.floor(input.maxStake.times(100).toNumber() / unitC) * unitC;
  if (maxC < unitC) return [];
  const payoutOf = (c: number) =>
    floorCents(promoPayoutRaw(new Decimal(c).dividedBy(100), obEff, base, cap)).times(100).toNumber();

  const stakes = new Set<number>();
  if (all) {
    for (let c = unitC; c <= maxC; c += unitC) stakes.add(c);
  } else {
    stakes.add(maxC);
    if (cap) {
      const kinkC = clean(kinkStake(obEff, base, cap)).times(100);
      if (kinkC.lt(maxC)) {
        const lo = kinkC.dividedBy(unitC).floor().times(unitC).toNumber();
        const hi = kinkC.dividedBy(unitC).ceil().times(unitC).toNumber();
        for (const k of [lo, hi]) stakes.add(Math.min(maxC, Math.max(unitC, k)));
      }
    }
  }
  return [...stakes].map((stake) => ({ stake, payout: payoutOf(stake) }));
}

function outlayCents(m: OracleMarket, n: number): number {
  return n * m.priceCents + feeCentsOracle(m.venueKey, n, m.priceCents);
}

/** Profit (cents) with n contracts on the given side. */
function profitCents(
  stakeA: number,
  stakeB: number,
  pa: number,
  pb: number,
  side: "A" | "B",
  m: OracleMarket,
  n: number,
): number {
  const total = stakeA + stakeB + outlayCents(m, n);
  const a = pa + (side === "A" ? 100 * n : 0) - total;
  const b = pb + (side === "B" ? 100 * n : 0) - total;
  return Math.min(a, b);
}

/**
 * Candidate-stake oracle: same promo stake candidates as the solver (max stake,
 * cap kink floor/ceil), N scanned 1..ceil(N0)+10 per side. Returns the best
 * strictly positive profit in cents, or null.
 */
export function oracleMarketTopUp(
  a: BoostLegInput,
  b: BoostLegInput,
  onA: OracleMarket | null,
  onB: OracleMarket | null,
  precision: OraclePrecision,
): number | null {
  const rowsA = legRows(a, precision, false);
  const rowsB = legRows(b, precision, false);
  let best: number | null = null;
  for (const ra of rowsA) {
    for (const rb of rowsB) {
      const sides: Array<["A" | "B", OracleMarket | null, number]> = [
        ["B", onB, ra.payout - rb.payout],
        ["A", onA, rb.payout - ra.payout],
      ];
      for (const [side, market, gapC] of sides) {
        if (market === null || gapC < 100) continue; // N0 < 1: wrong side
        const hiN = Math.ceil(gapC / 100) + 10;
        for (let n = 1; n <= hiN; n += 1) {
          const p = profitCents(ra.stake, rb.stake, ra.payout, rb.payout, side, market, n);
          if (p > 0 && (best === null || p > best)) best = p;
        }
      }
    }
  }
  return best;
}

/** Full grid over every whole-dollar (sA, sB) and N in 1..nMax on either side; best profit in cents (may be <= 0). */
export function gridBruteForceMarketTopUp(
  a: BoostLegInput,
  b: BoostLegInput,
  onA: OracleMarket | null,
  onB: OracleMarket | null,
  nMax: number,
): number | null {
  const rowsA = legRows(a, "whole", true);
  const rowsB = legRows(b, "whole", true);
  if (rowsA.length === 0 || rowsB.length === 0) return null;
  let best = -Infinity;
  const markets: Array<["A" | "B", OracleMarket | null]> = [
    ["A", onA],
    ["B", onB],
  ];
  for (const [side, market] of markets) {
    if (market === null) continue;
    const outlays: number[] = [0];
    for (let n = 1; n <= nMax; n += 1) outlays.push(outlayCents(market, n));
    for (const ra of rowsA) {
      for (const rb of rowsB) {
        for (let n = 1; n <= nMax; n += 1) {
          const total = ra.stake + rb.stake + outlays[n];
          const na = ra.payout + (side === "A" ? 100 * n : 0) - total;
          const nb = rb.payout + (side === "B" ? 100 * n : 0) - total;
          const p = Math.min(na, nb);
          if (p > best) best = p;
        }
      }
    }
  }
  return best === -Infinity ? null : best;
}
