import { describe, expect, it } from "vitest";
import {
  americanFromPriceCents,
  marketCost,
  priceCentsFromAmerican,
  toMarketFill,
  toMarketLeg,
} from "./marketLeg";

describe("priceCentsFromAmerican", () => {
  it.each([
    [-156, 61],
    [100, 50],
    [-100, 50],
    [9900, 1],
    [-9900, 99],
  ])("%i -> %i", (a, c) => {
    expect(priceCentsFromAmerican(a)).toBe(c);
  });
  it.each([20000, 99, -99, 150.5, 0, Number.NaN])("%s -> null", (a) => {
    expect(priceCentsFromAmerican(a)).toBeNull();
  });
  it("round-trips every cent", () => {
    for (let c = 1; c <= 99; c++) {
      expect(priceCentsFromAmerican(americanFromPriceCents(c))).toBe(c);
    }
  });
  it("recovered cents are within 0.5c of implied", () => {
    for (let a = -9900; a <= 9900; a++) {
      if (Math.abs(a) < 100) continue;
      const c = priceCentsFromAmerican(a);
      if (c === null) continue;
      const implied = a < 0 ? -a / (-a + 100) : 100 / (a + 100);
      expect(Math.abs(implied * 100 - c)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });
});

describe("americanFromPriceCents", () => {
  it.each([
    [61, -156],
    [50, -100],
    [39, 156],
    [1, 9900],
    [99, -9900],
  ])("%i -> %i", (c, a) => {
    expect(americanFromPriceCents(c)).toBe(a);
  });
});

describe("toMarketLeg", () => {
  it("builds a leg", () => {
    expect(toMarketLeg({ bookKey: "kalshi", oddsAmerican: -156 })).toEqual({
      venueKey: "kalshi",
      side: "yes",
      priceCents: 61,
      availableContracts: null,
    });
  });
  it("handles askSize and side", () => {
    expect(
      toMarketLeg({ bookKey: "kalshi", oddsAmerican: -156, askSize: 12, contractSide: "no" }),
    ).toMatchObject({ availableContracts: 12, side: "no" });
  });
  it("rejects sportsbooks and out-of-range prices", () => {
    expect(toMarketLeg({ bookKey: "draftkings", oddsAmerican: -156 })).toBeNull();
    expect(toMarketLeg({ bookKey: "kalshi", oddsAmerican: 20000 })).toBeNull();
  });
  it("ignores bad askSize", () => {
    expect(toMarketLeg({ bookKey: "kalshi", oddsAmerican: -156, askSize: -3 })?.availableContracts).toBeNull();
    expect(toMarketLeg({ bookKey: "kalshi", oddsAmerican: -156, askSize: 2.5 })?.availableContracts).toBeNull();
  });
});

describe("marketCost / toMarketFill", () => {
  const leg = { venueKey: "kalshi" as const, side: "yes" as const, priceCents: 61, availableContracts: 12 };
  it("computes cost, fee and outlay", () => {
    const r = marketCost(leg, 42);
    expect(r.cost.toString()).toBe("25.62");
    expect(r.fee.toString()).toBe("0.7");
    expect(r.outlay.toString()).toBe("26.32");
  });
  it("builds a fill", () => {
    const f = toMarketFill(leg, 42);
    expect(f).toMatchObject({ venueKey: "kalshi", side: "yes", priceCents: 61, contracts: 42, availableContracts: 12 });
    expect(f.cost.toString()).toBe("25.62");
    expect(f.fee.toString()).toBe("0.7");
    expect(f.outlay.toString()).toBe("26.32");
  });
});
