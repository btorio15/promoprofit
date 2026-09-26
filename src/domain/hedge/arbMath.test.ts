import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateArb } from "./arbMath";

describe("true arb", () => {
  it("+120 / -105 at $200 returns a result", () => {
    const result = calculateArb({
      totalStake: new Decimal(200),
      oddsAmericanA: 120,
      oddsAmericanB: -105,
      precision: "whole",
    });

    expect(result).not.toBeNull();
  });

  it("+100 / -110 at $200 returns null (implied sum above 1)", () => {
    const result = calculateArb({
      totalStake: new Decimal(200),
      oddsAmericanA: 100,
      oddsAmericanB: -110,
      precision: "whole",
    });

    expect(result).toBeNull();
  });

  it("+100 / +100 returns null (implied sum exactly 1, D-05 no zero-return arbs)", () => {
    const result = calculateArb({
      totalStake: new Decimal(200),
      oddsAmericanA: 100,
      oddsAmericanB: 100,
      precision: "whole",
    });

    expect(result).toBeNull();
  });
});

describe("rounding", () => {
  it("whole: $200, A +120, B -105", () => {
    const result = calculateArb({
      totalStake: new Decimal(200),
      oddsAmericanA: 120,
      oddsAmericanB: -105,
      precision: "whole",
    });

    expect(result).not.toBeNull();
    expect(result!.stakeA.toFixed(2)).toBe("94.00");
    expect(result!.stakeB.toFixed(2)).toBe("106.00");
    expect(result!.totalLaid.toFixed(2)).toBe("200.00");
    expect(result!.payoutA.toFixed(2)).toBe("206.80");
    expect(result!.payoutB.toFixed(2)).toBe("206.95");
    expect(result!.netIfAWins.toFixed(2)).toBe("6.80");
    expect(result!.netIfBWins.toFixed(2)).toBe("6.95");
    expect(result!.guaranteedProfit.toFixed(2)).toBe("6.80");
    expect(result!.returnPct.toFixed(2)).toBe("3.40");
  });

  it("cents: $200, A +120, B -105", () => {
    const result = calculateArb({
      totalStake: new Decimal(200),
      oddsAmericanA: 120,
      oddsAmericanB: -105,
      precision: "cents",
    });

    expect(result).not.toBeNull();
    expect(result!.stakeA.toFixed(2)).toBe("94.03");
    expect(result!.stakeB.toFixed(2)).toBe("105.96");
    expect(result!.totalLaid.toFixed(2)).toBe("199.99");
    expect(result!.payoutA.toFixed(2)).toBe("206.86");
    expect(result!.payoutB.toFixed(2)).toBe("206.87");
    expect(result!.netIfAWins.toFixed(2)).toBe("6.87");
    expect(result!.netIfBWins.toFixed(2)).toBe("6.88");
    expect(result!.guaranteedProfit.toFixed(2)).toBe("6.87");
    expect(result!.returnPct.toFixed(2)).toBe("3.43");
  });

  it("whole, repeating decimal: $500, A -300, B +320 (rejects the $501 independent-rounding pair)", () => {
    const result = calculateArb({
      totalStake: new Decimal(500),
      oddsAmericanA: -300,
      oddsAmericanB: 320,
      precision: "whole",
    });

    expect(result).not.toBeNull();
    expect(result!.stakeA.toFixed(2)).toBe("379.00");
    expect(result!.stakeB.toFixed(2)).toBe("121.00");
    expect(result!.totalLaid.toFixed(2)).toBe("500.00");
    expect(result!.payoutA.toFixed(2)).toBe("505.33");
    expect(result!.payoutB.toFixed(2)).toBe("508.20");
    expect(result!.guaranteedProfit.toFixed(2)).toBe("5.33");
    expect(result!.returnPct.toFixed(2)).toBe("1.06");
    // The independent-rounding pair 380/121 would lay $501 > $500 and must never be chosen.
    expect(result!.totalLaid.lte(500)).toBe(true);
  });

  it("cents, repeating decimal: $500, A -300, B +320", () => {
    const result = calculateArb({
      totalStake: new Decimal(500),
      oddsAmericanA: -300,
      oddsAmericanB: 320,
      precision: "cents",
    });

    expect(result).not.toBeNull();
    expect(result!.stakeA.toFixed(2)).toBe("379.51");
    expect(result!.stakeB.toFixed(2)).toBe("120.48");
    expect(result!.totalLaid.toFixed(2)).toBe("499.99");
    expect(result!.payoutA.toFixed(2)).toBe("506.01");
    expect(result!.payoutB.toFixed(2)).toBe("506.01");
    expect(result!.netIfAWins.toFixed(2)).toBe("6.02");
    expect(result!.netIfBWins.toFixed(2)).toBe("6.02");
    expect(result!.guaranteedProfit.toFixed(2)).toBe("6.02");
    expect(result!.returnPct.toFixed(2)).toBe("1.20");
  });

  it("cents: $100, A -275, B +290", () => {
    const result = calculateArb({
      totalStake: new Decimal(100),
      oddsAmericanA: -275,
      oddsAmericanB: 290,
      precision: "cents",
    });

    expect(result).not.toBeNull();
    expect(result!.stakeA.toFixed(2)).toBe("74.09");
    expect(result!.stakeB.toFixed(2)).toBe("25.91");
    expect(result!.totalLaid.toFixed(2)).toBe("100.00");
    expect(result!.guaranteedProfit.toFixed(2)).toBe("1.03");
    expect(result!.netIfBWins.toFixed(2)).toBe("1.04");
    expect(result!.returnPct.toFixed(2)).toBe("1.03");
  });
});

describe("rounding erases the arb entirely", () => {
  it("$1 whole, A +100, B +105 returns null (every whole-dollar candidate has a $0 leg, lays more than $1, or nets <= $0)", () => {
    const result = calculateArb({
      totalStake: new Decimal(1),
      oddsAmericanA: 100,
      oddsAmericanB: 105,
      precision: "whole",
    });

    expect(result).toBeNull();
  });
});

describe("calculateArb validation", () => {
  it("throws RangeError when totalStake is zero or negative", () => {
    expect(() =>
      calculateArb({
        totalStake: new Decimal(0),
        oddsAmericanA: 120,
        oddsAmericanB: -105,
        precision: "whole",
      }),
    ).toThrow(RangeError);

    expect(() =>
      calculateArb({
        totalStake: new Decimal(-5),
        oddsAmericanA: 120,
        oddsAmericanB: -105,
        precision: "whole",
      }),
    ).toThrow(RangeError);
  });

  it("throws RangeError when totalStake has more than 2 decimal places", () => {
    expect(() =>
      calculateArb({
        totalStake: new Decimal("100.123"),
        oddsAmericanA: 120,
        oddsAmericanB: -105,
        precision: "whole",
      }),
    ).toThrow(RangeError);
  });
});
