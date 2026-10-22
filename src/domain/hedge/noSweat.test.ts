import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { solveNoSweat } from "./noSweat";
import type { StakePrecision } from "./arbMath";

interface Fixture {
  name: string;
  stake: string;
  refundValue: string;
  qualifyingOddsAmerican: number;
  hedgeOddsAmerican: number;
  precision: StakePrecision;
  hedgeStake: string;
  profitIfWin: string;
  profitIfLose: string;
  estimatedProfit: string;
  worstCaseProfit: string;
}

const fixtures: Fixture[] = [
  {
    name: "A",
    stake: "25.00",
    refundValue: "18.75",
    qualifyingOddsAmerican: 100,
    hedgeOddsAmerican: -110,
    precision: "cents",
    hedgeStake: "16.37",
    profitIfWin: "8.63",
    profitIfLose: "8.63",
    estimatedProfit: "8.63",
    worstCaseProfit: "-10.12",
  },
  {
    name: "A-w",
    stake: "25.00",
    refundValue: "18.75",
    qualifyingOddsAmerican: 100,
    hedgeOddsAmerican: -110,
    precision: "whole",
    hedgeStake: "16.00",
    profitIfWin: "9.00",
    profitIfLose: "8.29",
    estimatedProfit: "8.29",
    worstCaseProfit: "-10.46",
  },
  {
    name: "B",
    stake: "50.00",
    refundValue: "35.00",
    qualifyingOddsAmerican: 150,
    hedgeOddsAmerican: -170,
    precision: "cents",
    hedgeStake: "56.67",
    profitIfWin: "18.33",
    profitIfLose: "18.33",
    estimatedProfit: "18.33",
    worstCaseProfit: "-16.67",
  },
  {
    name: "B-w",
    stake: "50.00",
    refundValue: "35.00",
    qualifyingOddsAmerican: 150,
    hedgeOddsAmerican: -170,
    precision: "whole",
    hedgeStake: "57.00",
    profitIfWin: "18.00",
    profitIfLose: "18.52",
    estimatedProfit: "18.00",
    worstCaseProfit: "-16.48",
  },
  {
    name: "C",
    stake: "25.00",
    refundValue: "17.37",
    qualifyingOddsAmerican: 120,
    hedgeOddsAmerican: -135,
    precision: "cents",
    hedgeStake: "21.62",
    profitIfWin: "8.38",
    profitIfLose: "8.38",
    estimatedProfit: "8.38",
    worstCaseProfit: "-8.99",
  },
  {
    name: "HR",
    stake: "5.00",
    refundValue: "3.50",
    qualifyingOddsAmerican: -500,
    hedgeOddsAmerican: 380,
    precision: "cents",
    hedgeStake: "0.52",
    profitIfWin: "0.48",
    profitIfLose: "0.47",
    estimatedProfit: "0.47",
    worstCaseProfit: "-3.03",
  },
  {
    name: "HR-w",
    stake: "5.00",
    refundValue: "3.50",
    qualifyingOddsAmerican: -500,
    hedgeOddsAmerican: 380,
    precision: "whole",
    hedgeStake: "1.00",
    profitIfWin: "0.00",
    profitIfLose: "2.30",
    estimatedProfit: "0.00",
    worstCaseProfit: "-1.20",
  },
];

describe("solveNoSweat", () => {
  for (const f of fixtures) {
    it(`fixture ${f.name}`, () => {
      const stake = new Decimal(f.stake);
      const r = solveNoSweat({
        stake,
        refundCap: stake,
        refundValue: new Decimal(f.refundValue),
        qualifyingOddsAmerican: f.qualifyingOddsAmerican,
        hedgeOddsAmerican: f.hedgeOddsAmerican,
        precision: f.precision,
      });
      expect(r.estimated).toBe(true);
      expect(r.hedgeStake.toFixed(2)).toBe(f.hedgeStake);
      expect(r.profitIfWin.toFixed(2)).toBe(f.profitIfWin);
      expect(r.profitIfLose.toFixed(2)).toBe(f.profitIfLose);
      expect(r.estimatedProfit.toFixed(2)).toBe(f.estimatedProfit);
      expect(r.worstCaseProfit.toFixed(2)).toBe(f.worstCaseProfit);
      expect(r.estimatedProfit.toFixed(2)).toBe(
        Decimal.min(r.profitIfWin, r.profitIfLose).toFixed(2),
      );
      expect(r.refundAmount.toFixed(2)).toBe(stake.toFixed(2));
      expect(r.hedgeStake.gt(0)).toBe(true);
    });
  }

  it("defaults to cents precision", () => {
    const r = solveNoSweat({
      stake: new Decimal("25"),
      refundCap: new Decimal("25"),
      refundValue: new Decimal("18.75"),
      qualifyingOddsAmerican: 100,
      hedgeOddsAmerican: -110,
    });
    expect(r.hedgeStake.toFixed(2)).toBe("16.37");
  });

  it("refundValue 0 makes estimated equal worst case", () => {
    const r = solveNoSweat({
      stake: new Decimal("25"),
      refundCap: new Decimal("25"),
      refundValue: new Decimal("0"),
      qualifyingOddsAmerican: 100,
      hedgeOddsAmerican: -110,
    });
    expect(r.estimatedProfit.equals(r.worstCaseProfit)).toBe(true);
  });

  it("refundAmount is capped at refundCap", () => {
    const r = solveNoSweat({
      stake: new Decimal("50"),
      refundCap: new Decimal("25"),
      refundValue: new Decimal("18.75"),
      qualifyingOddsAmerican: 100,
      hedgeOddsAmerican: -110,
    });
    expect(r.refundAmount.toFixed(2)).toBe("25.00");
  });

  describe("validation", () => {
    const base = {
      stake: new Decimal("25"),
      refundCap: new Decimal("25"),
      refundValue: new Decimal("18.75"),
      qualifyingOddsAmerican: 100,
      hedgeOddsAmerican: -110,
    };
    const cases: [string, Partial<typeof base>][] = [
      ["stake <= 0", { stake: new Decimal(0) }],
      ["stake > 2dp", { stake: new Decimal("25.001") }],
      ["refundCap <= 0", { refundCap: new Decimal(0) }],
      ["refundCap > 2dp", { refundCap: new Decimal("25.001") }],
      ["refundValue < 0", { refundValue: new Decimal("-1") }],
      ["refundValue > 2dp", { refundValue: new Decimal("1.001") }],
      ["invalid qualifying odds", { qualifyingOddsAmerican: 50 }],
      ["invalid hedge odds", { hedgeOddsAmerican: -50 }],
    ];
    for (const [name, override] of cases) {
      it(`throws RangeError for ${name}`, () => {
        expect(() => solveNoSweat({ ...base, ...override })).toThrow(RangeError);
      });
    }
  });
});
