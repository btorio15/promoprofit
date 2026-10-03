import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import type { StakePrecision } from "./arbMath";
import { effectiveBoostedDecimal, floorCents, promoPayoutRaw } from "./profitBoost";
import {
  solveBoostBoostPair,
  solveBoostBoostPairWithTopUp,
  type BoostLegInput,
  type PairResult,
} from "./pairMath";
import {
  bruteForceBoostBoost,
  bruteForceTopUpOnB,
  mulberry32,
  pick,
  randInt,
  type OracleBoostLeg,
} from "./pairMath.oracle";

const D = (v: string | number) => new Decimal(v);

function derived(base: number, pct: number, max: number, minOdds: number | null = -200): BoostLegInput {
  return {
    boostedOddsAmerican: null,
    baseOddsAmerican: base,
    boostPercent: D(pct),
    maxStake: D(max),
    winningsCap: null,
    minOddsAmerican: minOdds,
  };
}

function oracleLeg(input: BoostLegInput): OracleBoostLeg {
  return {
    obEff: effectiveBoostedDecimal(input).decimal,
    baseDecimal: input.baseOddsAmerican !== null ? D(americanToDecimal(input.baseOddsAmerican)) : null,
    cap: null,
    max: input.maxStake,
  };
}

/** Independent recompute of both outcome nets from the returned stakes. */
function assertIndependent(r: PairResult, a: BoostLegInput, b: BoostLegInput) {
  const oa = effectiveBoostedDecimal(a).decimal;
  const ob = effectiveBoostedDecimal(b).decimal;
  const ba = a.baseOddsAmerican !== null ? D(americanToDecimal(a.baseOddsAmerican)) : null;
  const bb = b.baseOddsAmerican !== null ? D(americanToDecimal(b.baseOddsAmerican)) : null;
  const pa = floorCents(promoPayoutRaw(r.legA.stake, oa, ba, null));
  const pb = floorCents(promoPayoutRaw(r.legB.stake, ob, bb, null));
  const sc = r.topUp ? r.topUp.leg.stake : D(0);
  const pc = r.topUp ? floorCents(sc.times(r.topUp.leg.oddsDecimal)) : D(0);
  const total = r.legA.stake.plus(r.legB.stake).plus(sc);
  const netA = pa.plus(r.topUp?.side === "A" ? pc : 0).minus(total);
  const netB = pb.plus(r.topUp?.side === "B" ? pc : 0).minus(total);
  expect(r.totalStaked.equals(total)).toBe(true);
  expect(r.netIfAWins.equals(netA)).toBe(true);
  expect(r.netIfBWins.equals(netB)).toBe(true);
  expect(r.guaranteedProfit.equals(Decimal.min(netA, netB))).toBe(true);
  expect(netA.gte(r.guaranteedProfit)).toBe(true);
  expect(netB.gte(r.guaranteedProfit)).toBe(true);
}

const SINGLES = D("5.18");

describe("owner case: DK 50% cap 20 (+154) vs FD 30% cap 10 (-172), top-up at -172", () => {
  const a = derived(154, 50, 20);
  const b = derived(-172, 30, 10);
  const topUp = { onA: null, onB: { oddsAmerican: -172 } };
  const oc = D(americanToDecimal(-172));

  it("whole: matches oracle, beats singles, top-up on B", () => {
    const r = solveBoostBoostPairWithTopUp(a, b, topUp, "whole");
    expect(r).not.toBeNull();
    assertIndependent(r!, a, b);
    const oracle = bruteForceTopUpOnB(oracleLeg(a), oracleLeg(b), oc, 80);
    expect(r!.guaranteedProfit.equals(oracle!.profit)).toBe(true);
    expect(r!.guaranteedProfit.gt(SINGLES)).toBe(true);
    expect(r!.topUp?.side).toBe("B");
    expect(r!.topUp!.leg.stake.gt(0)).toBe(true);
    expect(r!.topUp!.leg.priceSource).toBe("quote");
  });

  it("cents: independent recompute, local +/-2c scan, never worse than whole or oracle", () => {
    const r = solveBoostBoostPairWithTopUp(a, b, topUp, "cents");
    const w = solveBoostBoostPairWithTopUp(a, b, topUp, "whole");
    expect(r).not.toBeNull();
    assertIndependent(r!, a, b);
    expect(r!.guaranteedProfit.gt(SINGLES)).toBe(true);
    expect(r!.topUp?.side).toBe("B");
    expect(r!.guaranteedProfit.gte(w!.guaranteedProfit)).toBe(true);
    const oracle = bruteForceTopUpOnB(oracleLeg(a), oracleLeg(b), oc, 80);
    expect(r!.guaranteedProfit.gte(oracle!.profit)).toBe(true);

    const oa = effectiveBoostedDecimal(a).decimal;
    const ob = effectiveBoostedDecimal(b).decimal;
    const ba = D(americanToDecimal(154));
    const bb = D(americanToDecimal(-172));
    let bestLocal = D(-1e9);
    for (let da = -2; da <= 2; da += 1) {
      for (let db = -2; db <= 2; db += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const sa = r!.legA.stake.plus(D(da).dividedBy(100));
          const sb = r!.legB.stake.plus(D(db).dividedBy(100));
          const sc = r!.topUp!.leg.stake.plus(D(dc).dividedBy(100));
          if (sa.lte(0) || sa.gt(20) || sb.lte(0) || sb.gt(10) || sc.lt(0)) continue;
          const total = sa.plus(sb).plus(sc);
          const pa = floorCents(promoPayoutRaw(sa, oa, ba, null));
          const pb = floorCents(promoPayoutRaw(sb, ob, bb, null)).plus(floorCents(sc.times(oc)));
          const profit = Decimal.min(pa.minus(total), pb.minus(total));
          if (profit.gt(bestLocal)) bestLocal = profit;
        }
      }
    }
    expect(r!.guaranteedProfit.gte(bestLocal)).toBe(true);
  });

  it("symmetric: swapping roles puts the top-up on side A with the same profit", () => {
    const swapped = solveBoostBoostPairWithTopUp(b, a, { onA: { oddsAmerican: -172 }, onB: null }, "cents");
    const orig = solveBoostBoostPairWithTopUp(a, b, topUp, "cents");
    expect(swapped!.topUp?.side).toBe("A");
    expect(swapped!.guaranteedProfit.equals(orig!.guaranteedProfit)).toBe(true);
    assertIndependent(swapped!, b, a);
  });
});

function randomLeg(rng: () => number, maxHi: number): BoostLegInput {
  return derived(
    pick(rng, [-180, -150, -130, -110, 100, 110, 130, 154, 180, 220]),
    pick(rng, [25, 30, 50, 100]),
    randInt(rng, 3, maxHi),
    null,
  );
}

describe("seeded random batches", () => {
  it("degenerate: without a top-up quote the result equals solveBoostBoostPair", () => {
    const rng = mulberry32(20261003);
    for (let i = 0; i < 150; i += 1) {
      const a = randomLeg(rng, 40);
      const b = randomLeg(rng, 40);
      for (const precision of ["whole", "cents"] as StakePrecision[]) {
        const plain = solveBoostBoostPair(a, b, precision);
        const r = solveBoostBoostPairWithTopUp(a, b, { onA: null, onB: null }, precision);
        expect(r).toEqual(plain);
        if (r) expect("topUp" in r).toBe(false);
      }
    }
  });

  it("never worse than the 2-bet pair; rounding keeps both outcomes >= profit", () => {
    const rng = mulberry32(777);
    for (let i = 0; i < 120; i += 1) {
      const a = randomLeg(rng, 30);
      const b = randomLeg(rng, 30);
      const quote = { oddsAmerican: pick(rng, [-200, -170, -130, -110, 100, 120, 160]) };
      for (const precision of ["whole", "cents"] as StakePrecision[]) {
        const unit = precision === "whole" ? D(1) : D("0.01");
        const plain = solveBoostBoostPair(a, b, precision);
        const r = solveBoostBoostPairWithTopUp(a, b, { onA: quote, onB: quote }, precision);
        if (plain) {
          expect(r).not.toBeNull();
          expect(r!.guaranteedProfit.gte(plain.guaranteedProfit)).toBe(true);
        }
        if (!r) continue;
        assertIndependent(r, a, b);
        expect(r.guaranteedProfit.gt(0)).toBe(true);
        for (const s of [r.legA.stake, r.legB.stake, r.topUp?.leg.stake ?? D(0)]) {
          expect(s.dividedBy(unit).equals(s.dividedBy(unit).toDecimalPlaces(0))).toBe(true);
        }
        expect(r.legA.stake.lte(a.maxStake)).toBe(true);
        expect(r.legB.stake.lte(b.maxStake)).toBe(true);
      }
    }
  });

  it("oracle agreement (whole), including top-up odds better than the boosted odds", () => {
    const rng = mulberry32(4242);
    let better = 0;
    let usedTopUp = 0;
    for (let i = 0; i < 80; i += 1) {
      const a = randomLeg(rng, 25);
      const b = randomLeg(rng, 25);
      const quoteAm = pick(rng, [-200, -170, -130, -110, 100, 120, 160, 200]);
      const oc = D(americanToDecimal(quoteAm));
      if (oc.gt(effectiveBoostedDecimal(b).decimal)) better += 1;
      const r = solveBoostBoostPairWithTopUp(a, b, { onA: null, onB: { oddsAmerican: quoteAm } }, "whole");
      const oracle = bruteForceTopUpOnB(oracleLeg(a), oracleLeg(b), oc, 80);
      const twoBet = bruteForceBoostBoost(oracleLeg(a), oracleLeg(b), D(1));
      const expected = Decimal.max(oracle!.profit, twoBet!.profit);
      if (expected.lte(0)) {
        expect(r).toBeNull();
        continue;
      }
      expect(r).not.toBeNull();
      if (r!.topUp) usedTopUp += 1;
      if (oracle!.profit.gt(twoBet!.profit)) {
        // A top-up strictly helps: the solver must hit the oracle optimum exactly.
        expect(r!.guaranteedProfit.equals(oracle!.profit)).toBe(true);
      } else {
        // Otherwise the result is the existing 2-bet solver's (never above the oracle).
        const plain = solveBoostBoostPair(a, b, "whole");
        expect(r!.guaranteedProfit.equals(plain!.guaranteedProfit)).toBe(true);
        expect(r!.guaranteedProfit.lte(expected)).toBe(true);
      }
    }
    expect(better).toBeGreaterThan(0);
    expect(usedTopUp).toBeGreaterThan(0);
  });

  it("cents never worse than whole or the whole-dollar oracle", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 60; i += 1) {
      const a = randomLeg(rng, 25);
      const b = randomLeg(rng, 25);
      const quote = { oddsAmerican: pick(rng, [-200, -170, -130, 100, 140]) };
      const whole = solveBoostBoostPairWithTopUp(a, b, { onA: null, onB: quote }, "whole");
      const cents = solveBoostBoostPairWithTopUp(a, b, { onA: null, onB: quote }, "cents");
      const oracle = bruteForceTopUpOnB(oracleLeg(a), oracleLeg(b), D(americanToDecimal(quote.oddsAmerican)), 80);
      if (whole) {
        expect(cents).not.toBeNull();
        expect(cents!.guaranteedProfit.gte(whole.guaranteedProfit)).toBe(true);
      }
      if (cents && oracle!.profit.gt(0)) {
        expect(cents.guaranteedProfit.gte(oracle!.profit)).toBe(true);
      }
    }
  });
});

describe("null cases", () => {
  it("returns null when a leg fails its min odds", () => {
    const a = derived(154, 50, 20, 500);
    const b = derived(-172, 30, 10);
    expect(solveBoostBoostPairWithTopUp(a, b, { onA: null, onB: { oddsAmerican: -172 } }, "whole")).toBeNull();
  });

  it("returns null when nothing is profitable", () => {
    const a = derived(-150, 25, 20);
    const b = derived(-150, 25, 20);
    expect(
      solveBoostBoostPairWithTopUp(a, b, { onA: { oddsAmerican: -150 }, onB: { oddsAmerican: -150 } }, "whole"),
    ).toBeNull();
  });
});
