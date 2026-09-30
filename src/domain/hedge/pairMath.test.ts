import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import type { StakePrecision } from "./arbMath";
import { floorCents, effectiveBoostedDecimal, type WinningsCap } from "./profitBoost";
import {
  solveBoostBonusPair,
  solveBoostBonusPairUnfiltered,
  solveBoostBoostPair,
  solveBoostBoostPairUnfiltered,
  type BonusLegInput,
  type BoostLegInput,
  type PairResult,
} from "./pairMath";
import {
  bruteForceBoostBonus,
  bruteForceBoostBoost,
  mulberry32,
  pick,
  randInt,
  type OracleBoostLeg,
} from "./pairMath.oracle";

const D = (v: string | number) => new Decimal(v);

function leg(
  boosted: number,
  max: number | string,
  opts: Partial<BoostLegInput> = {},
): BoostLegInput {
  return {
    boostedOddsAmerican: boosted,
    baseOddsAmerican: null,
    boostPercent: null,
    maxStake: D(max),
    winningsCap: null,
    minOddsAmerican: null,
    ...opts,
  };
}

function cap(kind: WinningsCap["kind"], amount: number | string): WinningsCap {
  return { kind, amount: D(amount) };
}

/**
 * Invariants every returned result must satisfy (04-RESEARCH Pitfall 1: profit
 * is asserted exactly, stakes only through invariants unless a vector is
 * unambiguous).
 */
function assertInvariants(
  result: PairResult,
  legs: { a: BoostLegInput; b: BoostLegInput | null },
  precision: StakePrecision,
  bonus?: BonusLegInput,
) {
  const unit = precision === "whole" ? D(1) : D("0.01");
  expect(result.netIfAWins.gte(result.guaranteedProfit)).toBe(true);
  expect(result.netIfBWins.gte(result.guaranteedProfit)).toBe(true);
  expect(
    result.guaranteedProfit.equals(Decimal.min(result.netIfAWins, result.netIfBWins)),
  ).toBe(true);

  const dp = precision === "whole" ? 0 : 2;
  expect(result.legA.stake.gte(unit)).toBe(true);
  expect(result.legA.stake.lte(legs.a.maxStake.toDecimalPlaces(dp, Decimal.ROUND_DOWN))).toBe(true);
  // payouts are whole cents
  expect(result.legA.payout.equals(result.legA.payout.toDecimalPlaces(2))).toBe(true);
  expect(result.legB.payout.equals(result.legB.payout.toDecimalPlaces(2))).toBe(true);

  if (bonus) {
    expect(result.legB.stake.equals(bonus.bonusAmount)).toBe(true);
    expect(result.totalStaked.equals(result.legA.stake)).toBe(true);
    expect(result.legB.priceSource).toBe("quote");
  } else if (legs.b) {
    expect(result.legB.stake.gte(unit)).toBe(true);
    expect(result.legB.stake.lte(legs.b.maxStake.toDecimalPlaces(dp, Decimal.ROUND_DOWN))).toBe(true);
    expect(result.totalStaked.equals(result.legA.stake.plus(result.legB.stake))).toBe(true);
  }
}

function boostBoost(a: BoostLegInput, b: BoostLegInput, precision: StakePrecision) {
  const result = solveBoostBoostPair(a, b, precision);
  if (result) assertInvariants(result, { a, b }, precision);
  return result;
}

function boostBonus(boost: BoostLegInput, bonus: BonusLegInput, precision: StakePrecision) {
  const result = solveBoostBonusPair(boost, bonus, precision);
  if (result) assertInvariants(result, { a: boost, b: null }, precision, bonus);
  return result;
}

describe("known-answer vectors: boost + boost", () => {
  it("V1a cents: +150 max $50 vs +100 max $100 -> $12.50 (A 50.00, B 62.50, ROI 11.11)", () => {
    const r = boostBoost(leg(150, 50), leg(100, 100), "cents");
    expect(r).not.toBeNull();
    expect(r!.guaranteedProfit.toFixed(2)).toBe("12.50");
    expect(r!.legA.stake.toFixed(2)).toBe("50.00");
    expect(r!.legB.stake.toFixed(2)).toBe("62.50");
    expect(r!.totalStaked.toFixed(2)).toBe("112.50");
    expect(r!.roiPct.toFixed(2)).toBe("11.11");
    expect(r!.legA.capBound).toBe("max_stake");
  });

  it("V1b whole: same legs -> $12.00", () => {
    const r = boostBoost(leg(150, 50), leg(100, 100), "whole");
    expect(r!.guaranteedProfit.toFixed(2)).toBe("12.00");
  });

  it("V2 net_winnings cap: -> $6.00", () => {
    const r = boostBoost(
      leg(150, 100, { winningsCap: cap("net_winnings", 40) }),
      leg(100, 100),
      "whole",
    );
    expect(r!.guaranteedProfit.toFixed(2)).toBe("6.00");
  });

  it("V3 total_payout cap: -> $7.00 (profit only; stake set is one of several)", () => {
    const r = boostBoost(
      leg(150, 100, { winningsCap: cap("total_payout", 60) }),
      leg(110, 100),
      "whole",
    );
    expect(r!.guaranteedProfit.toFixed(2)).toBe("7.00");
  });

  it("V4 second leg max stake does not bind: A 12, B 18 -> $6.00", () => {
    const r = boostBoost(leg(200, 100), leg(100, 20), "whole");
    expect(r!.guaranteedProfit.toFixed(2)).toBe("6.00");
    expect(r!.legA.stake.toFixed(2)).toBe("12.00");
    expect(r!.legB.stake.toFixed(2)).toBe("18.00");
  });

  it("V5 boost_extra cap on a published price with a base price: -> $21.00", () => {
    const r = boostBoost(
      leg(150, 100, { baseOddsAmerican: 125, winningsCap: cap("boost_extra", 10) }),
      leg(110, 100),
      "whole",
    );
    expect(r!.guaranteedProfit.toFixed(2)).toBe("21.00");
  });

  it("V6 no arb at boosted prices (+100 vs -110): null, never displayed", () => {
    expect(boostBoost(leg(100, 50), leg(-110, 50), "whole")).toBeNull();
    expect(boostBoost(leg(100, 50), leg(-110, 50), "cents")).toBeNull();
  });

  it("min-odds gate: a leg whose boosted decimal is below its minimum odds returns null", () => {
    // +150 boosted (2.50) < min +200 (3.00)
    expect(
      solveBoostBoostPair(leg(150, 50, { minOddsAmerican: 200 }), leg(100, 100), "cents"),
    ).toBeNull();
    expect(
      solveBoostBoostPairUnfiltered(leg(150, 50, { minOddsAmerican: 200 }), leg(100, 100), "cents"),
    ).toBeNull();
    // Gate on the other leg too.
    expect(
      solveBoostBoostPair(leg(150, 50), leg(100, 100, { minOddsAmerican: 150 }), "cents"),
    ).toBeNull();
    // Exactly at the minimum passes.
    expect(
      solveBoostBoostPair(leg(150, 50, { minOddsAmerican: 150 }), leg(100, 100), "cents"),
    ).not.toBeNull();
    expect(
      solveBoostBonusPair(leg(150, 100, { minOddsAmerican: 200 }), { bonusAmount: D(50), oddsAmerican: 200 }, "whole"),
    ).toBeNull();
  });

  it("published boosted price wins over boostPercent; derived price used only without one", () => {
    const published = solveBoostBoostPair(
      leg(150, 50, { baseOddsAmerican: 100, boostPercent: D(10) }),
      leg(100, 100),
      "cents",
    );
    expect(published!.legA.priceSource).toBe("published");
    expect(published!.guaranteedProfit.toFixed(2)).toBe("12.50");

    // base +100 boosted 50% -> 1 + 1 * 1.5 = 2.50 = +150
    const derived = solveBoostBoostPair(
      leg(150, 50, { boostedOddsAmerican: null, baseOddsAmerican: 100, boostPercent: D(50) }),
      leg(100, 100),
      "cents",
    );
    expect(derived!.legA.priceSource).toBe("derived");
    expect(derived!.guaranteedProfit.toFixed(2)).toBe("12.50");
  });

  it("validation: RangeError on non-positive max stake, non-positive cap, boost_extra without base", () => {
    expect(() => solveBoostBoostPair(leg(150, 0), leg(100, 100), "whole")).toThrow(RangeError);
    expect(() => solveBoostBoostPair(leg(150, 50), leg(100, -5), "whole")).toThrow(RangeError);
    expect(() =>
      solveBoostBoostPair(leg(150, 50, { winningsCap: cap("net_winnings", 0) }), leg(100, 100), "whole"),
    ).toThrow(RangeError);
    expect(() =>
      solveBoostBoostPair(leg(150, 50, { winningsCap: cap("total_payout", -1) }), leg(100, 100), "whole"),
    ).toThrow(RangeError);
    expect(() =>
      solveBoostBoostPair(leg(150, 50, { winningsCap: cap("boost_extra", 10) }), leg(100, 100), "whole"),
    ).toThrow(RangeError);
    expect(() =>
      solveBoostBonusPair(leg(150, 0), { bonusAmount: D(50), oddsAmerican: 200 }, "whole"),
    ).toThrow(RangeError);
  });
});

describe("known-answer vectors: boost + bonus bet (stake not returned)", () => {
  const bonus50At200: BonusLegInput = { bonusAmount: D(50), oddsAmerican: 200 }; // W = 100.00

  it("V7 uncapped: bonus $50 at +200 with +150 boost -> $60.00, boost stake 40, ROI 150.00", () => {
    const r = boostBonus(leg(150, 100), bonus50At200, "whole");
    expect(r!.guaranteedProfit.toFixed(2)).toBe("60.00");
    expect(r!.legA.stake.toFixed(2)).toBe("40.00");
    expect(r!.legB.stake.toFixed(2)).toBe("50.00");
    expect(r!.legB.payout.toFixed(2)).toBe("100.00");
    expect(r!.totalStaked.toFixed(2)).toBe("40.00"); // bonus leg costs $0 cash
    expect(r!.roiPct.toFixed(2)).toBe("150.00");
  });

  it("V8 boost max stake binds ($25): -> $37.50, boost stake 25", () => {
    const r = boostBonus(leg(150, 25), bonus50At200, "cents");
    expect(r!.guaranteedProfit.toFixed(2)).toBe("37.50");
    expect(r!.legA.stake.toFixed(2)).toBe("25.00");
    expect(r!.legA.capBound).toBe("max_stake");
  });

  it("V9 net_winnings $30: -> $30.00 with the smallest stake on the plateau (20)", () => {
    const r = boostBonus(leg(150, 100, { winningsCap: cap("net_winnings", 30) }), bonus50At200, "whole");
    expect(r!.guaranteedProfit.toFixed(2)).toBe("30.00");
    expect(r!.legA.stake.toFixed(2)).toBe("20.00");
    expect(r!.legA.capBound).toBe("max_winnings");
  });

  it("V10 cents: bonus $25 at -110 (W 22.72) with -120 boost -> $10.32, boost stake 12.39", () => {
    const r = boostBonus(leg(-120, 100), { bonusAmount: D(25), oddsAmerican: -110 }, "cents");
    expect(r!.legB.payout.toFixed(2)).toBe("22.72");
    expect(r!.guaranteedProfit.toFixed(2)).toBe("10.32");
    expect(r!.legA.stake.toFixed(2)).toBe("12.39");
    expect(r!.legA.payout.toFixed(2)).toBe("22.71");
  });

  it("bonusAmount <= 0 is a RangeError", () => {
    expect(() => solveBoostBonusPair(leg(150, 100), { bonusAmount: D(0), oddsAmerican: 200 }, "whole")).toThrow(RangeError);
    expect(() => solveBoostBonusPair(leg(150, 100), { bonusAmount: D(-5), oddsAmerican: 200 }, "whole")).toThrow(RangeError);
  });

  it("unfiltered variant still returns a non-positive best (informational), filtered returns null", () => {
    // Whole-dollar stakes are all >= $1 but the bonus only wins W = $0.10, so
    // every candidate loses money on the bonus-wins outcome.
    const boost = leg(-500, 100);
    const bonus: BonusLegInput = { bonusAmount: D(1), oddsAmerican: -1000 }; // W = 0.10
    const unfiltered = solveBoostBonusPairUnfiltered(boost, bonus, "whole");
    expect(unfiltered).not.toBeNull();
    expect(unfiltered!.guaranteedProfit.lte(0)).toBe(true);
    expect(solveBoostBonusPair(boost, bonus, "whole")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Seeded oracle property tests
// ---------------------------------------------------------------------------

interface GenOpts {
  maxLo: number; // cents when cents=true, dollars otherwise
  maxHi: number;
  capLo: number;
  capHi: number;
  cents: boolean;
}

function money(n: number, cents: boolean): Decimal {
  return cents ? D(n).dividedBy(100) : D(n);
}

function genBoostLeg(rng: () => number, o: GenOpts): BoostLegInput {
  const maxStake = money(randInt(rng, o.maxLo, o.maxHi), o.cents);
  const capKind = pick(rng, ["none", "net_winnings", "total_payout", "boost_extra"] as const);

  // ~20% derived price (boost % on a base price), else a published price.
  const derived = rng() < 0.2;
  let boostedOddsAmerican: number | null;
  let baseOddsAmerican: number | null = null;
  let boostPercent: Decimal | null = null;

  if (derived) {
    boostedOddsAmerican = null;
    baseOddsAmerican = randInt(rng, 100, 300);
    boostPercent = D(randInt(rng, 10, 100));
  } else {
    // Mostly plus-money so boost+boost arbs actually occur; some minus-money.
    boostedOddsAmerican = rng() < 0.8 ? randInt(rng, 100, 450) : -randInt(rng, 105, 160);
    if (capKind === "boost_extra") {
      if (boostedOddsAmerican > 100) baseOddsAmerican = Math.max(100, boostedOddsAmerican - randInt(rng, 20, 80));
      else if (boostedOddsAmerican === 100) baseOddsAmerican = -110;
      else baseOddsAmerican = boostedOddsAmerican - randInt(rng, 10, 50);
    }
  }

  let winningsCap: WinningsCap | null = null;
  if (capKind !== "none") {
    winningsCap = { kind: capKind, amount: money(randInt(rng, o.capLo, o.capHi), o.cents) };
  }

  return {
    boostedOddsAmerican,
    baseOddsAmerican,
    boostPercent,
    maxStake,
    winningsCap,
    minOddsAmerican: null,
  };
}

function toOracleLeg(input: BoostLegInput): OracleBoostLeg {
  const eff = effectiveBoostedDecimal(input);
  return {
    obEff: eff.decimal,
    baseDecimal: input.baseOddsAmerican !== null ? americanToDecimal(input.baseOddsAmerican) : null,
    cap: input.winningsCap,
    max: input.maxStake,
  };
}

function bonusWinPayout(bonus: BonusLegInput): Decimal {
  return floorCents(bonus.bonusAmount.times(americanToDecimal(bonus.oddsAmerican).minus(1)));
}

function genBonus(rng: () => number, cents: boolean): BonusLegInput {
  const amount = cents ? money(randInt(rng, 500, 10000), true) : D(randInt(rng, 5, 100));
  const odds = rng() < 0.5 ? randInt(rng, 100, 400) : -randInt(rng, 105, 300);
  return { bonusAmount: amount, oddsAmerican: odds };
}

const WHOLE_OPTS: GenOpts = { maxLo: 5, maxHi: 60, capLo: 5, capHi: 80, cents: false };

describe("oracle property test: whole dollars (seeded)", () => {
  it("boost + boost: solver profit equals the $1-grid brute force on 500 cases", () => {
    const rng = mulberry32(20260929);
    let positive = 0;
    for (let i = 0; i < 500; i += 1) {
      const a = genBoostLeg(rng, WHOLE_OPTS);
      const b = genBoostLeg(rng, WHOLE_OPTS);
      const oracle = bruteForceBoostBoost(toOracleLeg(a), toOracleLeg(b), D(1));
      const solved = boostBoost(a, b, "whole");
      if (oracle && oracle.profit.gt(0)) {
        positive += 1;
        expect(solved, `case ${i}`).not.toBeNull();
        expect(solved!.guaranteedProfit.equals(oracle.profit), `case ${i}: ${solved!.guaranteedProfit} vs ${oracle.profit}`).toBe(true);
      } else {
        expect(solved, `case ${i}`).toBeNull();
      }
    }
    expect(positive).toBeGreaterThan(150);
  });

  it("boost + bonus: solver profit equals the $1-grid brute force on 200 cases", () => {
    const rng = mulberry32(777);
    let positive = 0;
    for (let i = 0; i < 200; i += 1) {
      const boost = genBoostLeg(rng, WHOLE_OPTS);
      const bonus = genBonus(rng, false);
      const oracle = bruteForceBoostBonus(toOracleLeg(boost), bonusWinPayout(bonus), D(1));
      const solved = boostBonus(boost, bonus, "whole");
      if (oracle && oracle.profit.gt(0)) {
        positive += 1;
        expect(solved, `case ${i}`).not.toBeNull();
        expect(solved!.guaranteedProfit.equals(oracle.profit), `case ${i}: ${solved!.guaranteedProfit} vs ${oracle.profit}`).toBe(true);
      } else {
        expect(solved, `case ${i}`).toBeNull();
      }
    }
    expect(positive).toBeGreaterThan(80);
  });
});

describe("oracle property test: cents", () => {
  it("boost + boost, exact: solver profit equals the full $0.01-grid brute force (max stakes <= $1.50, 40 cases)", () => {
    const rng = mulberry32(424242);
    const opts: GenOpts = { maxLo: 20, maxHi: 150, capLo: 5, capHi: 150, cents: true };
    let positive = 0;
    for (let i = 0; i < 40; i += 1) {
      const a = genBoostLeg(rng, opts);
      const b = genBoostLeg(rng, opts);
      const oracle = bruteForceBoostBoost(toOracleLeg(a), toOracleLeg(b), D("0.01"));
      const solved = boostBoost(a, b, "cents");
      if (oracle && oracle.profit.gt(0)) {
        positive += 1;
        expect(solved, `case ${i}`).not.toBeNull();
        expect(solved!.guaranteedProfit.equals(oracle.profit), `case ${i}: ${solved!.guaranteedProfit} vs ${oracle.profit}`).toBe(true);
      } else {
        expect(solved, `case ${i}`).toBeNull();
      }
    }
    expect(positive).toBeGreaterThan(10);
  });

  it("boost + bonus, exact: solver profit equals the full $0.01-grid brute force (boost max <= $5.00, 100 cases)", () => {
    const rng = mulberry32(99);
    const opts: GenOpts = { maxLo: 50, maxHi: 500, capLo: 20, capHi: 500, cents: true };
    let positive = 0;
    for (let i = 0; i < 100; i += 1) {
      const boost = genBoostLeg(rng, opts);
      const bonus = genBonus(rng, true);
      const oracle = bruteForceBoostBonus(toOracleLeg(boost), bonusWinPayout(bonus), D("0.01"));
      const solved = boostBonus(boost, bonus, "cents");
      if (oracle && oracle.profit.gt(0)) {
        positive += 1;
        expect(solved, `case ${i}`).not.toBeNull();
        expect(solved!.guaranteedProfit.equals(oracle.profit), `case ${i}: ${solved!.guaranteedProfit} vs ${oracle.profit}`).toBe(true);
      } else {
        expect(solved, `case ${i}`).toBeNull();
      }
    }
    expect(positive).toBeGreaterThan(40);
  });

  it("boost + boost, coarse bound: solver profit >= the $0.25-grid oracle (max stakes <= $20, 60 cases)", () => {
    const rng = mulberry32(31337);
    const opts: GenOpts = { maxLo: 5, maxHi: 20, capLo: 5, capHi: 60, cents: false };
    let positive = 0;
    for (let i = 0; i < 60; i += 1) {
      const a = genBoostLeg(rng, opts);
      const b = genBoostLeg(rng, opts);
      const oracle = bruteForceBoostBoost(toOracleLeg(a), toOracleLeg(b), D("0.25"));
      const solved = boostBoost(a, b, "cents");
      if (oracle && oracle.profit.gt(0)) {
        positive += 1;
        expect(solved, `case ${i}`).not.toBeNull();
        expect(solved!.guaranteedProfit.gte(oracle.profit), `case ${i}: ${solved!.guaranteedProfit} vs ${oracle.profit}`).toBe(true);
      }
    }
    expect(positive).toBeGreaterThan(15);
  });
});
