import { describe, expect, it } from "vitest";
import type { HistoryRow } from "@/domain/stats/dailyHistory";
import { buildRunningTotal } from "@/domain/stats/runningTotal";

function row(promoId: number, denverDate: string, profit: string, promoType = "profit_boost"): HistoryRow {
  return { promoId, denverDate, profit, promoType, sportKey: null, bookKey: "dk", bonusAmount: null, maxStake: null };
}

describe("buildRunningTotal", () => {
  it("returns an empty result for no history", () => {
    expect(buildRunningTotal([])).toEqual({ points: [], total: "0.00", promoCount: 0, since: null });
  });

  it("counts a promo seen on 3 days once, at its max, on its first day", () => {
    const r = buildRunningTotal([row(1, "2026-10-01", "2.00"), row(1, "2026-10-02", "5.00"), row(1, "2026-10-03", "3.00")]);
    expect(r.points).toEqual([{ date: "2026-10-01", total: "5.00", added: "5.00" }]);
    expect(r.total).toBe("5.00");
    expect(r.promoCount).toBe(1);
    expect(r.since).toBe("2026-10-01");
  });

  it("carries the total over gap days", () => {
    const r = buildRunningTotal([row(1, "2026-10-01", "4.00"), row(2, "2026-10-04", "6.50")]);
    expect(r.points.map((p) => [p.date, p.total, p.added])).toEqual([
      ["2026-10-01", "4.00", "4.00"],
      ["2026-10-02", "4.00", "0.00"],
      ["2026-10-03", "4.00", "0.00"],
      ["2026-10-04", "10.50", "6.50"],
    ]);
  });

  it("only counts promos whose first date is in range", () => {
    const history = [row(1, "2026-09-30", "9.00"), row(1, "2026-10-02", "9.00"), row(2, "2026-10-03", "1.00")];
    const r = buildRunningTotal(history, { start: "2026-10-02", end: "2026-10-05" });
    expect(r.total).toBe("10.00");
    expect(r.promoCount).toBe(2);
    expect(r.since).toBe("2026-10-02");
  });

  it("sums cent-exact", () => {
    const r = buildRunningTotal([row(1, "2026-10-01", "0.10"), row(2, "2026-10-01", "0.20")]);
    expect(r.total).toBe("0.30");
  });

  it("ignores no-sweat estimates", () => {
    expect(buildRunningTotal([row(1, "2026-10-01", "7.00", "no_sweat")]).promoCount).toBe(0);
  });
});
