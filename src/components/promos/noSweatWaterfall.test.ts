import { describe, expect, it } from "vitest";
import { buildNoSweatWaterfalls, estimateLegendLabel, formatStepAmount, netLabel } from "./noSweatWaterfall";

const dto = {
  qualifying: { selectionLabel: "Nuggets", stake: "100.00", winnings: "150.00" },
  hedge: { stake: "112.00", payout: "179.88" },
  refundValue: "70.00",
  profitIfWin: "38.00",
  profitIfLose: "37.88",
} as Parameters<typeof buildNoSweatWaterfalls>[0];

describe("buildNoSweatWaterfalls", () => {
  const r = buildNoSweatWaterfalls(dto);

  it("builds win steps", () => {
    expect(r.win.title).toBe("Nuggets win");
    expect(r.win.steps.map((s) => [s.label, s.amount, s.kind])).toEqual([
      ["Your bet", "150.00", "in"],
      ["Hedge", "-112.00", "out"],
    ]);
    expect(r.win.net.amount).toBe("38.00");
    expect(r.win.net.estimate).toBe(false);
  });

  it("builds lose steps", () => {
    expect(r.lose.title).toBe("Nuggets lose");
    expect(r.lose.steps.map((s) => [s.label, s.amount, s.kind])).toEqual([
      ["Hedge", "67.88", "in"],
      ["Your bet", "-100.00", "out"],
      ["Refund", "70.00", "estimate"],
    ]);
    expect(r.lose.net.amount).toBe("37.88");
    expect(r.lose.net.estimate).toBe(true);
  });

  it("shares one scale", () => {
    expect(r.zeroPct).toBeCloseTo(17.637, 2);
    expect(r.win.steps[0].leftPct).toBeCloseTo(17.637, 2);
    expect(r.win.steps[0].widthPct).toBeCloseTo(82.363, 2);
    expect(r.lose.steps[1].leftPct).toBeCloseTo(0, 2);
    expect(r.lose.steps[1].widthPct).toBeCloseTo(54.91, 2);
    expect(r.win.steps[0].connectorPct).toBeCloseTo(r.zeroPct, 5);
    expect(r.win.steps[1].connectorPct).toBeCloseTo(r.win.steps[0].leftPct + r.win.steps[0].widthPct, 5);
    // net connector = running total end (38)
    expect(r.win.net.connectorPct).toBeCloseTo(((38 + 32.12) / 182.12) * 100, 3);
    expect(r.win.net.leftPct).toBeCloseTo(r.zeroPct, 5);
    expect(r.win.net.widthPct).toBeCloseTo((38 / 182.12) * 100, 3);
  });

  it("handles all-positive and all-zero", () => {
    const pos = buildNoSweatWaterfalls({
      ...dto,
      hedge: { stake: "10.00", payout: "20.00" },
      profitIfWin: "140.00",
      profitIfLose: "80.00",
      refundValue: "70.00",
      qualifying: { ...dto.qualifying, stake: "0.00" },
    } as typeof dto);
    expect(pos.zeroPct).toBe(0);
    const zero = buildNoSweatWaterfalls({
      qualifying: { selectionLabel: "X", stake: "0.00", winnings: "0.00" },
      hedge: { stake: "0.00", payout: "0.00" },
      refundValue: "0.00",
      profitIfWin: "0.00",
      profitIfLose: "0.00",
    } as typeof dto);
    for (const v of [zero.zeroPct, zero.win.net.widthPct, zero.lose.steps[0].leftPct, zero.lose.steps[0].widthPct]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("labels", () => {
  it("formatStepAmount", () => {
    expect(formatStepAmount("150.00", "in")).toBe("+$150.00");
    expect(formatStepAmount("-112.00", "out")).toBe("−$112.00");
    expect(formatStepAmount("70.00", "estimate")).toBe("≈+$70.00");
  });
  it("netLabel", () => {
    expect(netLabel("38.00", false)).toBe("+$38.00");
    expect(netLabel("37.88", true)).toBe("≈+$37.88");
    expect(netLabel("-3.10", true)).toBe("≈−$3.10");
  });
  it("estimateLegendLabel", () => {
    expect(estimateLegendLabel("70.00")).toBe("estimate (bonus bet at 70%)");
    expect(estimateLegendLabel("78.50")).toBe("estimate (bonus bet at 78.50%)");
  });
});
