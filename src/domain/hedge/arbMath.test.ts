import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
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

  // CR-01 (01.1 review fix): the old floor/ceil-of-the-full-split solver
  // returned 94.03/105.96 ($199.99 laid). The exact search finds the same
  // $6.87 guaranteed profit on a smaller lay, which the tie-break prefers.
  it("cents: $200, A +120, B -105", () => {
    const result = calculateArb({
      totalStake: new Decimal(200),
      oddsAmericanA: 120,
      oddsAmericanB: -105,
      precision: "cents",
    });

    expect(result).not.toBeNull();
    expect(result!.stakeA.toFixed(2)).toBe("93.90");
    expect(result!.stakeB.toFixed(2)).toBe("105.81");
    expect(result!.totalLaid.toFixed(2)).toBe("199.71");
    expect(result!.payoutA.toFixed(2)).toBe("206.58");
    expect(result!.payoutB.toFixed(2)).toBe("206.58");
    expect(result!.netIfAWins.toFixed(2)).toBe("6.87");
    expect(result!.netIfBWins.toFixed(2)).toBe("6.87");
    expect(result!.guaranteedProfit.toFixed(2)).toBe("6.87");
    expect(result!.returnPct.toFixed(2)).toBe("3.43");
  });

  // CR-01 (01.1 review fix): the old solver returned 379/121 for $5.33.
  // Laying $498 as 378/120 guarantees $6.00 — the old answer under-reported
  // the profit by $0.67.
  it("whole, repeating decimal: $500, A -300, B +320 (rejects the $501 independent-rounding pair)", () => {
    const result = calculateArb({
      totalStake: new Decimal(500),
      oddsAmericanA: -300,
      oddsAmericanB: 320,
      precision: "whole",
    });

    expect(result).not.toBeNull();
    expect(result!.stakeA.toFixed(2)).toBe("378.00");
    expect(result!.stakeB.toFixed(2)).toBe("120.00");
    expect(result!.totalLaid.toFixed(2)).toBe("498.00");
    expect(result!.payoutA.toFixed(2)).toBe("504.00");
    expect(result!.payoutB.toFixed(2)).toBe("504.00");
    expect(result!.guaranteedProfit.toFixed(2)).toBe("6.00");
    expect(result!.returnPct.toFixed(2)).toBe("1.20");
    // The independent-rounding pair 380/121 would lay $501 > $500 and must never be chosen.
    expect(result!.totalLaid.lte(500)).toBe(true);
  });

  // CR-01 (01.1 review fix): previously 379.51/120.48 ($499.99 laid); same
  // $6.02 profit is reachable on a smaller lay.
  it("cents, repeating decimal: $500, A -300, B +320", () => {
    const result = calculateArb({
      totalStake: new Decimal(500),
      oddsAmericanA: -300,
      oddsAmericanB: 320,
      precision: "cents",
    });

    expect(result).not.toBeNull();
    expect(result!.stakeA.toFixed(2)).toBe("379.26");
    expect(result!.stakeB.toFixed(2)).toBe("120.40");
    expect(result!.totalLaid.toFixed(2)).toBe("499.66");
    expect(result!.payoutA.toFixed(2)).toBe("505.68");
    expect(result!.payoutB.toFixed(2)).toBe("505.68");
    expect(result!.netIfAWins.toFixed(2)).toBe("6.02");
    expect(result!.netIfBWins.toFixed(2)).toBe("6.02");
    expect(result!.guaranteedProfit.toFixed(2)).toBe("6.02");
    expect(result!.returnPct.toFixed(2)).toBe("1.20");
  });

  // CR-01 (01.1 review fix): previously 74.09/25.91 ($100.00 laid); same
  // $1.03 profit is reachable on a smaller lay.
  it("cents: $100, A -275, B +290", () => {
    const result = calculateArb({
      totalStake: new Decimal(100),
      oddsAmericanA: -275,
      oddsAmericanB: 290,
      precision: "cents",
    });

    expect(result).not.toBeNull();
    expect(result!.stakeA.toFixed(2)).toBe("73.70");
    expect(result!.stakeB.toFixed(2)).toBe("25.77");
    expect(result!.totalLaid.toFixed(2)).toBe("99.47");
    expect(result!.guaranteedProfit.toFixed(2)).toBe("1.03");
    expect(result!.netIfBWins.toFixed(2)).toBe("1.03");
    expect(result!.returnPct.toFixed(2)).toBe("1.03");
  });
});

describe("total stake is a cap: the best split can lay less (CR-01)", () => {
  // Counterexamples from the 01.1 code review where the old four-candidate
  // solver either hid a real arb (null) or under-reported the profit.
  it.each([
    {
      total: 10,
      a: -150,
      b: 200,
      stakeA: "5.00",
      stakeB: "3.00",
      profit: "0.33",
    },
    {
      total: 7,
      a: -250,
      b: 400,
      stakeA: "3.00",
      stakeB: "1.00",
      profit: "0.20",
    },
    {
      total: 25,
      a: -250,
      b: 300,
      stakeA: "17.00",
      stakeB: "6.00",
      profit: "0.80",
    },
    {
      total: 50,
      a: -300,
      b: 400,
      stakeA: "37.00",
      stakeB: "10.00",
      profit: "2.33",
    },
  ])("whole: $total, A $a, B $b -> $stakeA / $stakeB for $profit", (c) => {
    const result = calculateArb({
      totalStake: new Decimal(c.total),
      oddsAmericanA: c.a,
      oddsAmericanB: c.b,
      precision: "whole",
    });

    expect(result).not.toBeNull();
    expect(result!.stakeA.toFixed(2)).toBe(c.stakeA);
    expect(result!.stakeB.toFixed(2)).toBe(c.stakeB);
    expect(result!.guaranteedProfit.toFixed(2)).toBe(c.profit);
    expect(result!.totalLaid.lte(c.total)).toBe(true);
  });
});

/**
 * Independent brute-force reference: every (stakeA, stakeB) on the precision
 * grid with stakeA + stakeB <= total, same cent-floored payouts, same
 * tie-break (more profit, then less laid, then smaller stakeA).
 */
// Same 40-digit headroom as the solver so repeating-decimal odds (-300 ->
// 1.333...) do not lose a cent to 20-digit truncation.
const RefDecimal = Decimal.clone({ precision: 40 });

function bruteForce(total: number, oddsA: number, oddsB: number, precision: "whole" | "cents") {
  const centsPerUnit = precision === "whole" ? 100 : 1;
  const totalCents = Math.round(total * 100);
  const Da = new RefDecimal(americanToDecimal(oddsA));
  const Db = new RefDecimal(americanToDecimal(oddsB));
  let best: {
    stakeA: Decimal;
    stakeB: Decimal;
    laid: Decimal;
    profit: Decimal;
  } | null = null;

  for (let aCents = centsPerUnit; aCents < totalCents; aCents += centsPerUnit) {
    const stakeA = new RefDecimal(aCents).dividedBy(100);
    const payoutA = stakeA
      .times(Da)
      .toDecimalPlaces(20, Decimal.ROUND_HALF_UP)
      .toDecimalPlaces(2, Decimal.ROUND_DOWN);
    for (let bCents = centsPerUnit; aCents + bCents <= totalCents; bCents += centsPerUnit) {
      const stakeB = new RefDecimal(bCents).dividedBy(100);
      const payoutB = stakeB
        .times(Db)
        .toDecimalPlaces(20, Decimal.ROUND_HALF_UP)
        .toDecimalPlaces(2, Decimal.ROUND_DOWN);
      const laid = stakeA.plus(stakeB);
      const profit = Decimal.min(payoutA, payoutB).minus(laid);
      if (
        best === null ||
        profit.gt(best.profit) ||
        (profit.equals(best.profit) && laid.lt(best.laid)) ||
        (profit.equals(best.profit) && laid.equals(best.laid) && stakeA.lt(best.stakeA))
      ) {
        best = { stakeA, stakeB, laid, profit };
      }
    }
  }

  return best !== null && best.profit.gt(0) ? best : null;
}

describe("exhaustive-search cross-check (CR-01)", () => {
  const oddsPairs: Array<[number, number]> = [
    [-150, 200],
    [-250, 400],
    [-250, 300],
    [-300, 400],
    [-300, 320],
    [-275, 290],
    [120, -105],
    [110, -102],
    [-110, 115],
    [150, -130],
    [400, -300],
    [1000, -700],
    [-1000, 1200],
    [105, 100],
    [-500, 700],
    [250, -200],
  ];

  it(
    "whole dollars: matches brute force for every odds pair at totals $1-$60",
    { timeout: 30_000 },
    () => {
      for (const [a, b] of oddsPairs) {
        for (let total = 1; total <= 60; total++) {
          const expected = bruteForce(total, a, b, "whole");
          const result = calculateArb({
            totalStake: new Decimal(total),
            oddsAmericanA: a,
            oddsAmericanB: b,
            precision: "whole",
          });
          const label = `${a}/${b} @ $${total}`;
          if (expected === null) {
            expect(result, label).toBeNull();
          } else {
            expect(result, label).not.toBeNull();
            expect(result!.stakeA.toFixed(2), label).toBe(expected.stakeA.toFixed(2));
            expect(result!.stakeB.toFixed(2), label).toBe(expected.stakeB.toFixed(2));
            expect(result!.guaranteedProfit.toFixed(2), label).toBe(expected.profit.toFixed(2));
          }
        }
      }
    },
  );

  it("cents: matches brute force for every odds pair at small totals", () => {
    for (const [a, b] of oddsPairs) {
      for (const total of [0.5, 1.37, 2.49, 3.33]) {
        const expected = bruteForce(total, a, b, "cents");
        const result = calculateArb({
          totalStake: new Decimal(total),
          oddsAmericanA: a,
          oddsAmericanB: b,
          precision: "cents",
        });
        const label = `${a}/${b} @ $${total} cents`;
        if (expected === null) {
          expect(result, label).toBeNull();
        } else {
          expect(result, label).not.toBeNull();
          expect(result!.stakeA.toFixed(2), label).toBe(expected.stakeA.toFixed(2));
          expect(result!.stakeB.toFixed(2), label).toBe(expected.stakeB.toFixed(2));
          expect(result!.guaranteedProfit.toFixed(2), label).toBe(expected.profit.toFixed(2));
        }
      }
    }
  }, 30_000);
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
