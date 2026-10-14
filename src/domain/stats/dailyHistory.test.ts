import { describe, expect, it } from "vitest";
import { UNKNOWN_SPORT, dailyHistoryStats, type HistoryRow } from "./dailyHistory";

describe("dailyHistoryStats", () => {
  it("returns zeros for no history", () => {
    expect(dailyHistoryStats([])).toEqual({
      days: [],
      sports: [],
      grandTotal: "0.00",
      dayCount: 0,
      promoCount: 0,
      avgPerPromo: "0.00",
      avgPerDay: "0.00",
    });
  });

  it("totals each day, sorts days oldest first, and splits each day by sport", () => {
    const rows: HistoryRow[] = [
      { denverDate: "2026-10-02", sportKey: "americanfootball_nfl", profit: "5.00" },
      { denverDate: "2026-09-27", sportKey: "icehockey_nhl", profit: "3.10" },
      { denverDate: "2026-09-27", sportKey: "americanfootball_nfl", profit: "1.90" },
    ];

    const stats = dailyHistoryStats(rows);
    expect(stats.days).toEqual([
      { date: "2026-09-27", total: "5.00", bySport: { icehockey_nhl: "3.10", americanfootball_nfl: "1.90" } },
      { date: "2026-10-02", total: "5.00", bySport: { americanfootball_nfl: "5.00" } },
    ]);
    expect(stats.dayCount).toBe(2);
    expect(stats.promoCount).toBe(3);
    expect(stats.grandTotal).toBe("10.00");
  });

  it("gives profit per promo and per day for each sport and for the total", () => {
    const rows: HistoryRow[] = [
      { denverDate: "2026-09-27", sportKey: "icehockey_nhl", profit: "2.00" },
      { denverDate: "2026-09-28", sportKey: "americanfootball_ncaaf", profit: "9.00" },
      { denverDate: "2026-09-28", sportKey: "americanfootball_ncaaf", profit: "3.00" },
    ];

    const stats = dailyHistoryStats(rows);
    expect(stats.sports).toEqual([
      { sportKey: "americanfootball_ncaaf", total: "12.00", promos: 2, avgPerPromo: "6.00", avgPerDay: "6.00" },
      { sportKey: "icehockey_nhl", total: "2.00", promos: 1, avgPerPromo: "2.00", avgPerDay: "1.00" },
    ]);
    expect(stats.avgPerPromo).toBe("4.67");
    expect(stats.avgPerDay).toBe("7.00");
  });

  it("keeps promos without a sport under the unknown key", () => {
    const rows: HistoryRow[] = [{ denverDate: "2026-09-28", sportKey: null, profit: "1.25" }];

    const stats = dailyHistoryStats(rows);
    expect(stats.days[0].bySport).toEqual({ [UNKNOWN_SPORT]: "1.25" });
    expect(stats.sports[0]).toMatchObject({ sportKey: null, total: "1.25", promos: 1 });
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
