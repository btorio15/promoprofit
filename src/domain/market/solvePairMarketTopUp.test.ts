import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { BoostLegInput } from "../hedge/pairMath";
import { mulberry32, pick, randInt } from "../hedge/pairMath.oracle";
import type { MarketLeg } from "./marketLeg";
import { solveBoostBoostPairWithMarketTopUp } from "./solvePairMarketTopUp";
import {
  gridBruteForceMarketTopUp,
  oracleMarketTopUp,
  type OracleMarket,
} from "./solvePairMarketTopUp.oracle";

const D = (v: Decimal.Value) => new Decimal(v);

function published(american: number, max: number): BoostLegInput {
  return {
    boostedOddsAmerican: american,
    baseOddsAmerican: null,
    boostPercent: null,
    maxStake: D(max),
    winningsCap: null,
    minOddsAmerican: null,
  };
}

function market(venueKey: MarketLeg["venueKey"], priceCents: number): MarketLeg {
  return { venueKey, side: "yes", priceCents, availableContracts: null };
}

describe("hand-worked cases", () => {
  // A +200 (3.0) max $10 -> PA = 30. B +200 max $5 -> PB = 15. Kalshi 50c on the short side.
  // Top-up on B, N0 = 30 - 15 = 15. T = 10 + 5 + outlay(15).
  // outlay(15) = 15 * 0.50 + ceil(7*15*50*50/10000 = 26.25 -> 27c) = 7.50 + 0.27 = 7.77, T = 22.77.
  // A wins: 30 - 22.77 = 7.23. B wins: 15 + 15 - 22.77 = 7.23. Profit 7.23.
  // N=14: outlay 7.25, T 22.25 -> B wins 6.75 (worse). N=16: outlay 8.28, T 23.28 -> A wins 6.72 (worse).
  it("top-up on B", () => {
    const r = solveBoostBoostPairWithMarketTopUp({
      legA: published(200, 10),
      legB: published(200, 5),
      marketOnA: null,
      marketOnB: market("kalshi", 50),
      precision: "whole",
    });
    expect(r).not.toBeNull();
    expect(r!.topUpSide).toBe("B");
    expect(r!.market.contracts).toBe(15);
    expect(r!.market.outlay.equals("7.77")).toBe(true);
    expect(r!.totalStaked.equals("22.77")).toBe(true);
    expect(r!.netIfAWins.equals("7.23")).toBe(true);
    expect(r!.netIfBWins.equals("7.23")).toBe(true);
    expect(r!.guaranteedProfit.equals("7.23")).toBe(true);
    expect(r!.legA.stake.equals(10)).toBe(true);
    expect(r!.legB.stake.equals(5)).toBe(true);
    expect(r!.legA.capBound).toBe("max_stake");
    expect(r!.roiPct.equals("31.75")).toBe(true); // 7.23 / 22.77 = 31.75..%
  });

  // Mirror: A max $5, B max $10, market on A. Top-up on A, same numbers.
  it("top-up on A", () => {
    const r = solveBoostBoostPairWithMarketTopUp({
      legA: published(200, 5),
      legB: published(200, 10),
      marketOnA: market("kalshi", 50),
      marketOnB: null,
      precision: "whole",
    });
    expect(r).not.toBeNull();
    expect(r!.topUpSide).toBe("A");
    expect(r!.market.contracts).toBe(15);
    expect(r!.guaranteedProfit.equals("7.23")).toBe(true);
    expect(r!.netIfAWins.equals("7.23")).toBe(true);
  });

  it("returns null with no market legs", () => {
    expect(
      solveBoostBoostPairWithMarketTopUp({
        legA: published(200, 10),
        legB: published(200, 5),
        marketOnA: null,
        marketOnB: null,
        precision: "whole",
      }),
    ).toBeNull();
  });

  it("returns null when a leg fails its minimum odds", () => {
    const a = { ...published(200, 10), minOddsAmerican: 300 };
    expect(
      solveBoostBoostPairWithMarketTopUp({
        legA: a,
        legB: published(200, 5),
        marketOnA: null,
        marketOnB: market("kalshi", 50),
        precision: "whole",
      }),
    ).toBeNull();
  });
});

function randomLeg(rng: () => number, maxHi: number): BoostLegInput {
  const base = randInt(rng, 100, 300);
  const capKind = pick(rng, ["none", "none", "net_winnings", "total_payout"] as const);
  const max = randInt(rng, 1, maxHi);
  return {
    boostedOddsAmerican: null,
    baseOddsAmerican: base,
    boostPercent: D(randInt(rng, 10, 100)),
    maxStake: D(max),
    winningsCap:
      capKind === "none" ? null : { kind: capKind, amount: D(randInt(rng, 2, 3 * max + 5)) },
    minOddsAmerican: null,
  };
}

function randomMarket(rng: () => number): MarketLeg | null {
  if (rng() < 0.1) return null;
  return market(pick(rng, ["kalshi", "polymarket_us"] as const), randInt(rng, 20, 80));
}

const toOracle = (m: MarketLeg | null): OracleMarket | null =>
  m === null ? null : { venueKey: m.venueKey, priceCents: m.priceCents };

describe("oracle equality (seed 1205)", () => {
  for (const precision of ["whole", "cents"] as const) {
    it(`1,500 seeded cases match the integer-cent oracle (${precision})`, () => {
      const rng = mulberry32(1205);
      let positives = 0;
      for (let i = 0; i < 1500; i += 1) {
        const a = randomLeg(rng, 40);
        const b = randomLeg(rng, 40);
        const onA = randomMarket(rng);
        const onB = randomMarket(rng);
        const r = solveBoostBoostPairWithMarketTopUp({
          legA: a,
          legB: b,
          marketOnA: onA,
          marketOnB: onB,
          precision,
        });
        const oracle = oracleMarketTopUp(a, b, toOracle(onA), toOracle(onB), precision);
        if (oracle === null) {
          expect(r, `case ${i}`).toBeNull();
        } else {
          positives += 1;
          expect(r, `case ${i}`).not.toBeNull();
          expect(r!.guaranteedProfit.times(100).toNumber(), `case ${i}`).toBe(oracle);
          // independent recompute of the outcomes
          const m = r!.market;
          const total = r!.legA.stake.plus(r!.legB.stake).plus(m.outlay);
          expect(r!.totalStaked.equals(total)).toBe(true);
          const winA = r!.legA.payout.plus(r!.topUpSide === "A" ? m.contracts : 0).minus(total);
          const winB = r!.legB.payout.plus(r!.topUpSide === "B" ? m.contracts : 0).minus(total);
          expect(r!.netIfAWins.equals(winA)).toBe(true);
          expect(r!.netIfBWins.equals(winB)).toBe(true);
          expect(r!.guaranteedProfit.equals(Decimal.min(winA, winB))).toBe(true);
        }
      }
      expect(positives).toBeGreaterThan(100);
    }, 120_000);
  }
});

describe("bounded-loss property (seed 1206)", () => {
  it("full (sA, sB, N) grid never beats the solver by more than $1.00", () => {
    const rng = mulberry32(1206);
    for (let i = 0; i < 300; i += 1) {
      const a = randomLeg(rng, 12);
      const b = randomLeg(rng, 12);
      const onA = randomMarket(rng);
      const onB = randomMarket(rng);
      const r = solveBoostBoostPairWithMarketTopUp({
        legA: a,
        legB: b,
        marketOnA: onA,
        marketOnB: onB,
        precision: "whole",
      });
      const grid = gridBruteForceMarketTopUp(a, b, toOracle(onA), toOracle(onB), 120);
      const solver = r === null ? 0 : r.guaranteedProfit.times(100).toNumber();
      const gridBest = grid === null ? 0 : Math.max(grid, 0);
      expect(gridBest - solver, `case ${i}`).toBeLessThanOrEqual(100);
    }
  });
});
