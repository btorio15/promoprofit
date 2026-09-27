import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import { calculateBonusBetHedge } from "./bonusBet";

interface Fixture {
  name: string;
  bonusAmount: number;
  bonusOddsAmerican: number;
  hedgeOddsAmerican: number;
  hedgeStake: string;
  bonusPayout: string;
  hedgePayout: string;
  netIfBonusWins: string;
  netIfHedgeWins: string;
  guaranteedProfit: string;
  conversionPct: string;
}

const fixtures: Fixture[] = [
  {
    name: "reference fixture",
    bonusAmount: 100,
    bonusOddsAmerican: 300,
    hedgeOddsAmerican: -275,
    hedgeStake: "220.00",
    bonusPayout: "300.00",
    hedgePayout: "300.00",
    netIfBonusWins: "80.00",
    netIfHedgeWins: "80.00",
    guaranteedProfit: "80.00",
    conversionPct: "80.00",
  },
  {
    name: "rounding edge case: $50 @ +290 hedged @ -310",
    bonusAmount: 50,
    bonusOddsAmerican: 290,
    hedgeOddsAmerican: -310,
    hedgeStake: "109.63",
    bonusPayout: "145.00",
    hedgePayout: "144.99",
    netIfBonusWins: "35.37",
    netIfHedgeWins: "35.36",
    guaranteedProfit: "35.36",
    conversionPct: "70.72",
  },
  {
    name: "$50 @ +380 hedged @ -420",
    bonusAmount: 50,
    bonusOddsAmerican: 380,
    hedgeOddsAmerican: -420,
    hedgeStake: "153.46",
    bonusPayout: "190.00",
    hedgePayout: "189.99",
    netIfBonusWins: "36.54",
    netIfHedgeWins: "36.53",
    guaranteedProfit: "36.53",
    conversionPct: "73.06",
  },
  {
    name: "$25 @ +250 hedged @ -250",
    bonusAmount: 25,
    bonusOddsAmerican: 250,
    hedgeOddsAmerican: -250,
    hedgeStake: "44.64",
    bonusPayout: "62.50",
    hedgePayout: "62.49",
    netIfBonusWins: "17.86",
    netIfHedgeWins: "17.85",
    guaranteedProfit: "17.85",
    conversionPct: "71.40",
  },
  {
    name: "negative bonus odds: $100 @ -150 hedged @ +130",
    bonusAmount: 100,
    bonusOddsAmerican: -150,
    hedgeOddsAmerican: 130,
    hedgeStake: "28.98",
    bonusPayout: "66.66",
    hedgePayout: "66.65",
    netIfBonusWins: "37.68",
    netIfHedgeWins: "37.67",
    guaranteedProfit: "37.67",
    conversionPct: "37.67",
  },
];

describe.each(fixtures)("$name", (fixture) => {
  it(fixture.name, () => {
    const result = calculateBonusBetHedge({
      bonusAmount: new Decimal(fixture.bonusAmount),
      bonusOddsAmerican: fixture.bonusOddsAmerican,
      hedgeOddsAmerican: fixture.hedgeOddsAmerican,
    });

    expect(result.hedgeStake.toFixed(2)).toBe(fixture.hedgeStake);
    expect(result.bonusPayout.toFixed(2)).toBe(fixture.bonusPayout);
    expect(result.hedgePayout.toFixed(2)).toBe(fixture.hedgePayout);
    expect(result.netIfBonusWins.toFixed(2)).toBe(fixture.netIfBonusWins);
    expect(result.netIfHedgeWins.toFixed(2)).toBe(fixture.netIfHedgeWins);
    expect(result.guaranteedProfit.toFixed(2)).toBe(fixture.guaranteedProfit);
    expect(result.conversionPct.toFixed(2)).toBe(fixture.conversionPct);

    // Invariant: guaranteedProfit is always the lower of the two outcomes,
    // and rounding never lets the two outcomes drift more than a cent apart.
    const expectedGuaranteed = Decimal.min(result.netIfBonusWins, result.netIfHedgeWins);
    expect(result.guaranteedProfit.toFixed(2)).toBe(expectedGuaranteed.toFixed(2));
    expect(result.netIfBonusWins.minus(result.netIfHedgeWins).abs().lte(0.01)).toBe(true);
  });
});

describe("americanToDecimal", () => {
  it("converts positive American odds to decimal", () => {
    expect(americanToDecimal(300).toFixed(2)).toBe("4.00");
  });

  it("converts negative American odds to decimal (Decimal, not float)", () => {
    expect(americanToDecimal(-275).toFixed(6)).toBe("1.363636");
  });

  it("round-trips through the decimal conversion", () => {
    // americanToDecimal(-110) - 1 = 100/110; multiplying back by 110 recovers 100.
    const decimal = americanToDecimal(-110);
    const impliedNumerator = decimal.minus(1).times(110).toDecimalPlaces(6);
    expect(impliedNumerator.toNumber()).toBe(100);
  });

  it("throws RangeError for a non-integer input", () => {
    expect(() => americanToDecimal(1.5)).toThrow(RangeError);
  });

  it("throws RangeError for odds inside (-100, 100)", () => {
    expect(() => americanToDecimal(50)).toThrow(RangeError);
    expect(() => americanToDecimal(-99)).toThrow(RangeError);
  });
});

describe("calculateBonusBetHedge precision (D-05)", () => {
  it("precision \"whole\" rounds the hedge stake to the nearest dollar unit", () => {
    const result = calculateBonusBetHedge({
      bonusAmount: new Decimal(25),
      bonusOddsAmerican: 250,
      hedgeOddsAmerican: -300,
      precision: "whole",
    });

    expect(result.hedgeStake.toFixed(2)).toBe("47.00");
    expect(result.bonusPayout.toFixed(2)).toBe("62.50");
    expect(result.hedgePayout.toFixed(2)).toBe("62.66");
    expect(result.netIfBonusWins.toFixed(2)).toBe("15.50");
    expect(result.netIfHedgeWins.toFixed(2)).toBe("15.66");
    expect(result.guaranteedProfit.toFixed(2)).toBe("15.50");
    expect(result.conversionPct.toFixed(2)).toBe("62.00");
  });

  it("precision \"cents\" (explicit) matches the existing cent-precision behavior", () => {
    const result = calculateBonusBetHedge({
      bonusAmount: new Decimal(25),
      bonusOddsAmerican: 250,
      hedgeOddsAmerican: -300,
      precision: "cents",
    });

    expect(result.hedgeStake.toFixed(2)).toBe("46.87");
    expect(result.hedgePayout.toFixed(2)).toBe("62.49");
    expect(result.guaranteedProfit.toFixed(2)).toBe("15.62");
    expect(result.conversionPct.toFixed(2)).toBe("62.48");
  });

  it("precision omitted defaults to identical cent-precision behavior (finder unchanged)", () => {
    const result = calculateBonusBetHedge({
      bonusAmount: new Decimal(25),
      bonusOddsAmerican: 250,
      hedgeOddsAmerican: -300,
    });

    expect(result.hedgeStake.toFixed(2)).toBe("46.87");
    expect(result.hedgePayout.toFixed(2)).toBe("62.49");
    expect(result.guaranteedProfit.toFixed(2)).toBe("15.62");
    expect(result.conversionPct.toFixed(2)).toBe("62.48");
  });
});

describe("calculateBonusBetHedge validation", () => {
  it("throws RangeError when bonusAmount is zero or negative", () => {
    expect(() =>
      calculateBonusBetHedge({
        bonusAmount: new Decimal(0),
        bonusOddsAmerican: 300,
        hedgeOddsAmerican: -275,
      }),
    ).toThrow(RangeError);

    expect(() =>
      calculateBonusBetHedge({
        bonusAmount: new Decimal(-5),
        bonusOddsAmerican: 300,
        hedgeOddsAmerican: -275,
      }),
    ).toThrow(RangeError);
  });

  it("throws RangeError when bonusAmount has more than 2 decimal places", () => {
    expect(() =>
      calculateBonusBetHedge({
        bonusAmount: new Decimal("100.123"),
        bonusOddsAmerican: 300,
        hedgeOddsAmerican: -275,
      }),
    ).toThrow(RangeError);
  });
});
