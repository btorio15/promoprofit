import { describe, expect, it } from "vitest";
import { FEES_LAST_VERIFIED, VENUE_FEES } from "@/config/venues";
import { kalshiTakerFee, marketFee, polymarketUsTakerFee } from "./fees";
import { feeCentsOracle } from "./fees.oracle";

describe("pinned fee config", () => {
  it("pins coefficients and verification date", () => {
    expect(VENUE_FEES.kalshi.coefficient).toBe("0.07");
    expect(VENUE_FEES.kalshi.multiplier).toBe("1");
    expect(VENUE_FEES.kalshi.rounding).toBe("ceil_cent");
    expect(VENUE_FEES.polymarket_us.coefficient).toBe("0.0695");
    expect(VENUE_FEES.polymarket_us.rounding).toBe("half_even_cent");
    expect(FEES_LAST_VERIFIED).toBe("2026-11-02");
  });
});

describe("kalshiTakerFee", () => {
  it.each([
    [42, 61, "0.7"],
    [1, 50, "0.02"],
    [100, 50, "1.75"],
    [1, 99, "0.01"],
    [0, 50, "0"],
  ])("n=%i p=%i -> %s", (n, p, want) => {
    expect(kalshiTakerFee(n, p).toString()).toBe(want);
  });
});

describe("polymarketUsTakerFee", () => {
  it.each([
    [42, 61, "0.69"],
    [1, 50, "0.02"],
    [100, 50, "1.74"],
  ])("n=%i p=%i -> %s", (n, p, want) => {
    expect(polymarketUsTakerFee(n, p).toString()).toBe(want);
  });

  it("rounds an exact half to even", () => {
    // 695*n*p*(100-p)/1e6 cents. Use a custom coefficient giving exactly 0.5c / 1.5c.
    const cfg = { ...VENUE_FEES.polymarket_us, coefficient: "0.08" };
    // n=1,p=50: 0.08*0.25 = 0.02 exactly -> no tie; build tie: coefficient 0.062 -> 0.0155 -> 0.02 (1.55c no)
    // 0.06 * .25 = 0.015 -> tie between 0.01 and 0.02 -> even = 0.02
    expect(polymarketUsTakerFee(1, 50, { ...cfg, coefficient: "0.06" }).toString()).toBe("0.02");
    // 0.14 * .25 = 0.035 -> tie between 0.03 and 0.04 -> even = 0.04
    expect(polymarketUsTakerFee(1, 50, { ...cfg, coefficient: "0.14" }).toString()).toBe("0.04");
    // 0.1 * .25 = 0.025 -> tie 0.02/0.03 -> even = 0.02
    expect(polymarketUsTakerFee(1, 50, { ...cfg, coefficient: "0.1" }).toString()).toBe("0.02");
  });
});

describe("validation", () => {
  it.each([
    [-1, 50],
    [1.5, 50],
    [1, 0],
    [1, 100],
    [1, 50.5],
  ])("rejects n=%d p=%d", (n, p) => {
    expect(() => kalshiTakerFee(n, p)).toThrow(RangeError);
    expect(() => polymarketUsTakerFee(n, p)).toThrow(RangeError);
  });
});

describe("oracle property", () => {
  for (const venue of ["kalshi", "polymarket_us"] as const) {
    it(`${venue} matches integer oracle for n 1..300, p 1..99`, () => {
      for (let n = 1; n <= 300; n++) {
        for (let p = 1; p <= 99; p++) {
          const got = marketFee(venue, n, p).times(100).toNumber();
          if (got !== feeCentsOracle(venue, n, p)) {
            throw new Error(`${venue} n=${n} p=${p}: ${got} vs ${feeCentsOracle(venue, n, p)}`);
          }
        }
      }
    });
  }
});
