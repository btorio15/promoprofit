import { describe, expect, it } from "vitest";
import { dailyHistoryStats, type HistoryRow } from "./dailyHistory";

describe("dailyHistoryStats", () => {
  it("returns zeros for no history", () => {
    expect(dailyHistoryStats([])).toEqual({
      days: [],
      sports: [],
      grandTotal: "0.00",
      dayCount: 0,
      promoCount: 0,
    });
  });

  it("totals each day and sorts days oldest first", () => {
    const rows: HistoryRow[] = [
      { denverDate: "2026-10-02", sportKey: "americanfootball_nfl", profit: "5.00" },
      { denverDate: "2026-09-27", sportKey: "icehockey_nhl", profit: "3.10" },
      { denverDate: "2026-09-27", sportKey: "americanfootball_nfl", profit: "1.90" },
    ];

    const stats = dailyHistoryStats(rows);
    expect(stats.days).toEqual([
      { date: "2026-09-27", total: "5.00" },
      { date: "2026-10-02", total: "5.00" },
    ]);
    expect(stats.dayCount).toBe(2);
    expect(stats.promoCount).toBe(3);
    expect(stats.grandTotal).toBe("10.00");
  });

  it("totals sports, biggest first, and keeps promos without a sport", () => {
    const rows: HistoryRow[] = [
      { denverDate: "2026-09-27", sportKey: "icehockey_nhl", profit: "2.00" },
      { denverDate: "2026-09-28", sportKey: "americanfootball_ncaaf", profit: "9.50" },
      { denverDate: "2026-09-28", sportKey: null, profit: "1.25" },
    ];

    const stats = dailyHistoryStats(rows);
    expect(stats.sports).toEqual([
      { sportKey: "americanfootball_ncaaf", total: "9.50", promos: 1 },
      { sportKey: "icehockey_nhl", total: "2.00", promos: 1 },
      { sportKey: null, total: "1.25", promos: 1 },
    ]);
  });

  it("keeps cents exact (no float drift)", () => {
    const rows: HistoryRow[] = Array.from({ length: 10 }, () => ({
      denverDate: "2026-09-27",
      sportKey: "baseball_mlb",
      profit: "0.10",
    }));
    expect(dailyHistoryStats(rows).grandTotal).toBe("1.00");
  });
});
