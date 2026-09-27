import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculateProfitBoostHedge,
  decimalToAmericanDisplay,
  effectiveBoostedDecimal,
  type ProfitBoostInput,
} from "./profitBoost";

interface ExpectedResult {
  boostedDecimalOdds: string;
  priceSource: "published" | "derived";
  promoStake: string;
  hedgeStake: string;
  totalStaked: string;
  promoPayout: string;
  hedgePayout: string;
  netIfPromoWins: string;
  netIfHedgeWins: string;
  guaranteedProfit: string;
  roiPct: string;
  capBound: "max_stake" | "max_winnings";
}

interface Fixture {
  name: string;
  input: ProfitBoostInput;
  expected: ExpectedResult | null;
}

// B1: published price, cents.
const b1Input: ProfitBoostInput = {
  boostedOddsAmerican: 300,
  baseOddsAmerican: null,
  boostPercent: null,
  hedgeOddsAmerican: -275,
  maxStake: new Decimal(50),
  winningsCap: null,
  minOddsAmerican: null,
  precision: "cents",
};

const b1Expected: ExpectedResult = {
  boostedDecimalOdds: "4.00",
  priceSource: "published",
  promoStake: "50.00",
  hedgeStake: "146.66",
  totalStaked: "196.66",
  promoPayout: "200.00",
  hedgePayout: "199.99",
  netIfPromoWins: "3.34",
  netIfHedgeWins: "3.33",
  guaranteedProfit: "3.33",
  roiPct: "1.69",
  capBound: "max_stake",
};

const fixtures: Fixture[] = [
  {
    name: "B1 published price, cents",
    input: b1Input,
    expected: b1Expected,
  },
  {
    name: "B1w same inputs, precision whole",
    input: { ...b1Input, precision: "whole" },
    expected: {
      boostedDecimalOdds: "4.00",
      priceSource: "published",
      promoStake: "50.00",
      hedgeStake: "146.00",
      totalStaked: "196.00",
      promoPayout: "200.00",
      hedgePayout: "199.09",
      netIfPromoWins: "4.00",
      netIfHedgeWins: "3.09",
      guaranteedProfit: "3.09",
      roiPct: "1.57",
      capBound: "max_stake",
    },
  },
  {
    name: "B2 derived (D-03 fallback)",
    input: {
      boostedOddsAmerican: null,
      baseOddsAmerican: 200,
      boostPercent: new Decimal(50),
      hedgeOddsAmerican: -275,
      maxStake: new Decimal(50),
      winningsCap: null,
      minOddsAmerican: null,
      precision: "cents",
    },
    expected: { ...b1Expected, priceSource: "derived" },
  },
  {
    name: "B2p published wins over boost % (D-03)",
    input: {
      boostedOddsAmerican: 280,
      baseOddsAmerican: 200,
      boostPercent: new Decimal(50),
      hedgeOddsAmerican: -275,
      maxStake: new Decimal(50),
      winningsCap: null,
      minOddsAmerican: null,
      precision: "cents",
    },
    expected: {
      boostedDecimalOdds: "3.80",
      priceSource: "published",
      promoStake: "50.00",
      hedgeStake: "139.32",
      totalStaked: "189.32",
      promoPayout: "190.00",
      hedgePayout: "189.98",
      netIfPromoWins: "0.68",
      netIfHedgeWins: "0.66",
      guaranteedProfit: "0.66",
      roiPct: "0.34",
      capBound: "max_stake",
    },
  },
  {
    name: "B3 net_winnings cap binds",
    input: {
      boostedOddsAmerican: 300,
      baseOddsAmerican: null,
      boostPercent: null,
      hedgeOddsAmerican: -275,
      maxStake: new Decimal(100),
      winningsCap: { kind: "net_winnings", amount: new Decimal(150) },
      minOddsAmerican: null,
      precision: "cents",
    },
    expected: { ...b1Expected, capBound: "max_winnings" },
  },
  {
    name: "B4 total_payout cap binds",
    input: {
      boostedOddsAmerican: 300,
      baseOddsAmerican: null,
      boostPercent: null,
      hedgeOddsAmerican: -275,
      maxStake: new Decimal(50),
      winningsCap: { kind: "total_payout", amount: new Decimal(180) },
      minOddsAmerican: null,
      precision: "cents",
    },
    expected: {
      boostedDecimalOdds: "4.00",
      priceSource: "published",
      promoStake: "45.00",
      hedgeStake: "132.00",
      totalStaked: "177.00",
      promoPayout: "180.00",
      hedgePayout: "180.00",
      netIfPromoWins: "3.00",
      netIfHedgeWins: "3.00",
      guaranteedProfit: "3.00",
      roiPct: "1.69",
      capBound: "max_winnings",
    },
  },
  {
    name: "B5 unprofitable -> null",
    input: {
      boostedOddsAmerican: 150,
      baseOddsAmerican: null,
      boostPercent: null,
      hedgeOddsAmerican: -200,
      maxStake: new Decimal(50),
      winningsCap: null,
      minOddsAmerican: null,
      precision: "cents",
    },
    expected: null,
  },
  {
    name: "B6 boost_extra cap binds",
    input: {
      boostedOddsAmerican: null,
      baseOddsAmerican: 200,
      boostPercent: new Decimal(50),
      hedgeOddsAmerican: -275,
      maxStake: new Decimal(50),
      winningsCap: { kind: "boost_extra", amount: new Decimal(25) },
      minOddsAmerican: null,
      precision: "cents",
    },
    expected: {
      boostedDecimalOdds: "4.00",
      priceSource: "derived",
      promoStake: "25.00",
      hedgeStake: "73.32",
      totalStaked: "98.32",
      promoPayout: "100.00",
      hedgePayout: "99.98",
      netIfPromoWins: "1.68",
      netIfHedgeWins: "1.66",
      guaranteedProfit: "1.66",
      roiPct: "1.68",
      capBound: "max_winnings",
    },
  },
  {
    name: "B7 minOddsAmerican +400 -> ineligible -> null",
    input: { ...b1Input, minOddsAmerican: 400 },
    expected: null,
  },
  {
    name: "B7 minOddsAmerican -200 -> eligible -> same as B1",
    input: { ...b1Input, minOddsAmerican: -200 },
    expected: b1Expected,
  },
  {
    name: "Non-binding net_winnings cap (1000) -> identical to B1, capBound max_stake",
    input: {
      ...b1Input,
      winningsCap: { kind: "net_winnings", amount: new Decimal(1000) },
    },
    expected: b1Expected,
  },
];

describe.each(fixtures)("$name", (fixture) => {
  it(fixture.name, () => {
    const result = calculateProfitBoostHedge(fixture.input);

    if (fixture.expected === null) {
      expect(result).toBeNull();
      return;
    }

    expect(result).not.toBeNull();
    const r = result!;

    expect(r.boostedDecimalOdds.toFixed(2)).toBe(fixture.expected.boostedDecimalOdds);
    expect(r.priceSource).toBe(fixture.expected.priceSource);
    expect(r.promoStake.toFixed(2)).toBe(fixture.expected.promoStake);
    expect(r.hedgeStake.toFixed(2)).toBe(fixture.expected.hedgeStake);
    expect(r.totalStaked.toFixed(2)).toBe(fixture.expected.totalStaked);
    expect(r.promoPayout.toFixed(2)).toBe(fixture.expected.promoPayout);
    expect(r.hedgePayout.toFixed(2)).toBe(fixture.expected.hedgePayout);
    expect(r.netIfPromoWins.toFixed(2)).toBe(fixture.expected.netIfPromoWins);
    expect(r.netIfHedgeWins.toFixed(2)).toBe(fixture.expected.netIfHedgeWins);
    expect(r.guaranteedProfit.toFixed(2)).toBe(fixture.expected.guaranteedProfit);
    expect(r.roiPct.toFixed(2)).toBe(fixture.expected.roiPct);
    expect(r.capBound).toBe(fixture.expected.capBound);

    // Invariant: guaranteedProfit is always the lower of the two outcomes.
    const expectedGuaranteed = Decimal.min(r.netIfPromoWins, r.netIfHedgeWins);
    expect(r.guaranteedProfit.toFixed(2)).toBe(expectedGuaranteed.toFixed(2));
  });
});

describe("effectiveBoostedDecimal", () => {
  it("uses the published price and ignores boostPercent when both are present (D-03)", () => {
    const { decimal, source } = effectiveBoostedDecimal({
      boostedOddsAmerican: 280,
      baseOddsAmerican: 200,
      boostPercent: new Decimal(999),
    });
    expect(decimal.toFixed(2)).toBe("3.80");
    expect(source).toBe("published");
  });

  it("derives from base odds and boost% when no published price exists", () => {
    const { decimal, source } = effectiveBoostedDecimal({
      boostedOddsAmerican: null,
      baseOddsAmerican: 200,
      boostPercent: new Decimal(50),
    });
    expect(decimal.toFixed(2)).toBe("4.00");
    expect(source).toBe("derived");
  });
});

describe("calculateProfitBoostHedge validation", () => {
  it("throws RangeError when maxStake is zero or negative", () => {
    expect(() =>
      calculateProfitBoostHedge({ ...b1Input, maxStake: new Decimal(0) }),
    ).toThrow(RangeError);
    expect(() =>
      calculateProfitBoostHedge({ ...b1Input, maxStake: new Decimal(-10) }),
    ).toThrow(RangeError);
  });

  it("throws RangeError when maxStake has more than 2 decimal places", () => {
    expect(() =>
      calculateProfitBoostHedge({ ...b1Input, maxStake: new Decimal("50.005") }),
    ).toThrow(RangeError);
  });

  it("throws RangeError when boostedOddsAmerican is null and baseOddsAmerican is also null", () => {
    expect(() =>
      calculateProfitBoostHedge({
        ...b1Input,
        boostedOddsAmerican: null,
        baseOddsAmerican: null,
        boostPercent: new Decimal(50),
      }),
    ).toThrow(RangeError);
  });

  it("throws RangeError when boostedOddsAmerican is null and boostPercent is also null", () => {
    expect(() =>
      calculateProfitBoostHedge({
        ...b1Input,
        boostedOddsAmerican: null,
        baseOddsAmerican: 200,
        boostPercent: null,
      }),
    ).toThrow(RangeError);
  });

  it("throws RangeError when boostPercent is zero or negative (derived path)", () => {
    expect(() =>
      calculateProfitBoostHedge({
        ...b1Input,
        boostedOddsAmerican: null,
        baseOddsAmerican: 200,
        boostPercent: new Decimal(0),
      }),
    ).toThrow(RangeError);
    expect(() =>
      calculateProfitBoostHedge({
        ...b1Input,
        boostedOddsAmerican: null,
        baseOddsAmerican: 200,
        boostPercent: new Decimal(-5),
      }),
    ).toThrow(RangeError);
  });

  it("throws RangeError when winningsCap.kind is boost_extra but baseOddsAmerican is null", () => {
    expect(() =>
      calculateProfitBoostHedge({
        ...b1Input,
        winningsCap: { kind: "boost_extra", amount: new Decimal(25) },
      }),
    ).toThrow(RangeError);
  });

  it("throws RangeError when winningsCap.amount is zero or negative", () => {
    expect(() =>
      calculateProfitBoostHedge({
        ...b1Input,
        winningsCap: { kind: "net_winnings", amount: new Decimal(0) },
      }),
    ).toThrow(RangeError);
    expect(() =>
      calculateProfitBoostHedge({
        ...b1Input,
        winningsCap: { kind: "net_winnings", amount: new Decimal(-10) },
      }),
    ).toThrow(RangeError);
  });
});

describe("decimalToAmericanDisplay", () => {
  it("4 -> +300", () => {
    expect(decimalToAmericanDisplay(new Decimal(4))).toBe(300);
  });

  it("3.8 -> +280", () => {
    expect(decimalToAmericanDisplay(new Decimal("3.8"))).toBe(280);
  });

  it("1.5 -> -200", () => {
    expect(decimalToAmericanDisplay(new Decimal("1.5"))).toBe(-200);
  });

  it("2 -> +100", () => {
    expect(decimalToAmericanDisplay(new Decimal(2))).toBe(100);
  });

  it("15/11 (1.363636...) -> -275", () => {
    expect(decimalToAmericanDisplay(new Decimal(15).dividedBy(11))).toBe(-275);
  });

  it("3.123 -> +212 (positive side floors toward the worse price)", () => {
    expect(decimalToAmericanDisplay(new Decimal("3.123"))).toBe(212);
  });

  it("1.47 -> -213 (negative side: -ceil(100/0.47))", () => {
    expect(decimalToAmericanDisplay(new Decimal("1.47"))).toBe(-213);
  });
});
