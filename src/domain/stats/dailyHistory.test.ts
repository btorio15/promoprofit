import { describe, expect, it } from "vitest";
import { UNKNOWN_SPORT, dailyHistoryStats, gameWeekdayStats, type HistoryRow } from "./dailyHistory";

let nextPromoId = 1;

function row(partial: Partial<HistoryRow> & Pick<HistoryRow, "denverDate" | "profit">): HistoryRow {
  return {
    promoId: nextPromoId++,
    sportKey: "basketball_nba",
    bookKey: "draftkings",
    promoType: "profit_boost",
    bonusAmount: null,
    maxStake: null,
    gameAt: null,
    ...partial,
  };
}

describe("dailyHistoryStats", () => {
  it("returns zeros for no history", () => {
    const stats = dailyHistoryStats([]);
    expect(stats.days).toEqual([]);
    expect(stats.dayCount).toBe(0);
    expect(stats.avgPerDay).toBe("0.00");
    expect(stats.grandTotal).toBe("0.00");
  });

  it("fills missing days with zero-profit days and computes the average over the whole span", () => {
    const rows: HistoryRow[] = [
      row({ denverDate: "2026-09-27", profit: "3.00" }),
      row({ denverDate: "2026-09-29", profit: "1.00" }),
    ];

    const stats = dailyHistoryStats(rows);
    expect(stats.dayCount).toBe(3);
    expect(stats.activeDayCount).toBe(2);
    expect(stats.zeroDayCount).toBe(1);
    expect(stats.days.map((d) => [d.date, d.total, d.zero])).toEqual([
      ["2026-09-27", "3.00", false],
      ["2026-09-28", "0.00", true],
      ["2026-09-29", "1.00", false],
    ]);
    expect(stats.avgPerDay).toBe("1.33");
  });

  it("gives a running cumulative total on each day", () => {
    const rows: HistoryRow[] = [
      row({ denverDate: "2026-09-27", profit: "3.00" }),
      row({ denverDate: "2026-09-28", profit: "0.00" }),
      row({ denverDate: "2026-09-29", profit: "1.50" }),
    ];

    const stats = dailyHistoryStats(rows);
    expect(stats.days.map((d) => d.cumulative)).toEqual(["3.00", "3.00", "4.50"]);
  });

  it("averages the Oct 12 gap the way the owner described (164.91 over 17 days is 9.70)", () => {
    const rows: HistoryRow[] = [
      row({ denverDate: "2026-09-27", profit: "164.91" }),
      row({ denverDate: "2026-10-13", profit: "0.00" }),
    ];
    // 17 calendar days Sep 27 - Oct 13 inclusive.
    expect(dailyHistoryStats(rows).dayCount).toBe(17);
    expect(dailyHistoryStats(rows).avgPerDay).toBe("9.70");
  });

  it("splits totals by sport, promo type and book, with small-sample flags under 5 records", () => {
    const rows: HistoryRow[] = [
      row({ denverDate: "2026-09-27", profit: "2.00", sportKey: "icehockey_nhl", promoType: "bonus_bet", bookKey: "fanduel" }),
      row({ denverDate: "2026-09-28", profit: "9.00", sportKey: "americanfootball_ncaaf", bookKey: "draftkings" }),
      row({ denverDate: "2026-09-28", profit: "3.00", sportKey: "americanfootball_ncaaf", bookKey: "draftkings" }),
    ];

    const stats = dailyHistoryStats(rows);
    expect(stats.sports[0]).toMatchObject({ key: "americanfootball_ncaaf", total: "12.00", promos: 2, smallSample: true });
    expect(stats.types.map((t) => [t.key, t.total])).toEqual([
      ["profit_boost", "12.00"],
      ["bonus_bet", "2.00"],
    ]);
    expect(stats.books.map((b) => [b.key, b.promos])).toEqual([
      ["draftkings", 2],
      ["fanduel", 1],
    ]);
  });

  it("keeps promos without a sport under the unknown key", () => {
    const stats = dailyHistoryStats([row({ denverDate: "2026-09-28", profit: "1.25", sportKey: null })]);
    expect(stats.days[0].bySport).toEqual({ [UNKNOWN_SPORT]: "1.25" });
    expect(stats.sports[0]).toMatchObject({ key: UNKNOWN_SPORT, total: "1.25" });
  });

  it("computes bonus conversion and leaves out implausible face values", () => {
    const rows: HistoryRow[] = [
      row({ denverDate: "2026-09-27", profit: "7.20", promoType: "bonus_bet", bonusAmount: "10.00" }),
      row({ denverDate: "2026-09-28", profit: "5.00", promoType: "bonus_bet", bonusAmount: "250000.00" }),
      row({ denverDate: "2026-09-28", profit: "2.00", promoType: "bonus_bet", bonusAmount: null }),
    ];

    const stats = dailyHistoryStats(rows);
    expect(stats.bonusConversion).toEqual({ records: 1, pct: "72.00", excluded: 1 });
  });

  it("computes boost return on max stake", () => {
    const rows: HistoryRow[] = [
      row({ denverDate: "2026-09-27", profit: "5.00", promoType: "profit_boost", maxStake: "50.00" }),
      row({ denverDate: "2026-09-28", profit: "3.00", promoType: "profit_boost", maxStake: "100.00" }),
    ];

    expect(dailyHistoryStats(rows).boostConversion).toEqual({ records: 2, pct: "5.33", excluded: 0 });
  });

  it("with a window, drops rows outside it and counts every day in the window", () => {
    const rows: HistoryRow[] = [
      row({ denverDate: "2026-09-01", profit: "50.00" }),
      row({ denverDate: "2026-10-10", profit: "4.00" }),
      row({ denverDate: "2026-10-12", profit: "2.00" }),
    ];

    const stats = dailyHistoryStats(rows, { start: "2026-10-08", end: "2026-10-14" });
    expect(stats.grandTotal).toBe("6.00");
    expect(stats.dayCount).toBe(7);
    expect(stats.zeroDayCount).toBe(5);
    expect(stats.avgPerDay).toBe("0.86");
  });

  it("lists each promo record as its own segment, largest first, and leaves empty days with none", () => {
    const rows: HistoryRow[] = [
      row({ denverDate: "2026-09-27", profit: "2.00", sportKey: "icehockey_nhl" }),
      row({ denverDate: "2026-09-27", profit: "9.00", sportKey: "americanfootball_ncaaf" }),
      row({ denverDate: "2026-09-27", profit: "4.00", sportKey: "basketball_nba" }),
      row({ denverDate: "2026-09-29", profit: "1.00", sportKey: "icehockey_nhl" }),
    ];

    const stats = dailyHistoryStats(rows);
    const pick = (segments: { sportKey: string; profit: string }[]) =>
      segments.map(({ sportKey, profit }) => ({ sportKey, profit }));
    expect(pick(stats.days[0].segments)).toEqual([
      { sportKey: "americanfootball_ncaaf", profit: "9.00" },
      { sportKey: "basketball_nba", profit: "4.00" },
      { sportKey: "icehockey_nhl", profit: "2.00" },
    ]);
    expect(stats.days[1].segments).toEqual([]);
    expect(pick(stats.days[2].segments)).toEqual([{ sportKey: "icehockey_nhl", profit: "1.00" }]);
  });

  it("reports available only: segments and groups carry no extracted state", () => {
    const a = row({ denverDate: "2026-09-27", profit: "9.00", sportKey: "americanfootball_ncaaf", bookKey: "fanduel" });
    const b = row({ denverDate: "2026-09-27", profit: "4.00", sportKey: "basketball_nba", bookKey: "fanduel" });
    const stats = dailyHistoryStats([a, b]);
    const segments = stats.days[0].segments;
    expect(segments.map((s) => s.profit)).toEqual(["9.00", "4.00"]);
    expect(segments.every((s) => !("done" in s))).toBe(true);
    expect(stats.grandTotal).toBe("13.00");
    expect("extractedTotal" in stats).toBe(false);
    expect(stats.books[0]).toEqual({ key: "fanduel", total: "13.00", promos: 2, avgPerPromo: "6.50", smallSample: true });
  });

  it("keeps cents exact (no float drift)", () => {
    const rows: HistoryRow[] = Array.from({ length: 10 }, () => row({ denverDate: "2026-09-27", profit: "0.10" }));
    expect(dailyHistoryStats(rows).grandTotal).toBe("1.00");
  });
});

describe("dailyHistoryStats counts each promo once (quick-261021-gy4)", () => {
  it("a promo seen on three days counts once at its best, on its best day", () => {
    const rows: HistoryRow[] = [
      { promoId: 900, denverDate: "2026-10-01", profit: "4.00", sportKey: "basketball_nba", bookKey: "draftkings", promoType: "profit_boost", bonusAmount: null, maxStake: "25.00" },
      { promoId: 900, denverDate: "2026-10-02", profit: "5.00", sportKey: "basketball_nba", bookKey: "draftkings", promoType: "profit_boost", bonusAmount: null, maxStake: "25.00" },
      { promoId: 900, denverDate: "2026-10-03", profit: "3.00", sportKey: "basketball_nba", bookKey: "draftkings", promoType: "profit_boost", bonusAmount: null, maxStake: "25.00" },
      { promoId: 901, denverDate: "2026-10-03", profit: "2.00", sportKey: "basketball_nba", bookKey: "fanduel", promoType: "profit_boost", bonusAmount: null, maxStake: "50.00" },
    ];
    const stats = dailyHistoryStats(rows);
    expect(stats.grandTotal).toBe("7.00");
    expect(stats.promoCount).toBe(2);
    expect(stats.avgPerPromo).toBe("3.50");
    expect(stats.dayCount).toBe(3);
    expect(stats.zeroDayCount).toBe(0);
    expect(stats.days.map((d) => [d.date, d.total, d.zero])).toEqual([
      ["2026-10-01", "0.00", false],
      ["2026-10-02", "5.00", false],
      ["2026-10-03", "2.00", false],
    ]);
    expect(stats.books.find((b) => b.key === "draftkings")).toMatchObject({ total: "5.00", promos: 1 });
    // 7.00 / 75.00 stake, each promo once
    expect(stats.boostConversion).toMatchObject({ records: 2, pct: "9.33" });
  });

  it("ties keep the earliest day", () => {
    const base = { sportKey: null, bookKey: "draftkings", promoType: "bonus_bet", bonusAmount: null, maxStake: null };
    const stats = dailyHistoryStats([
      { ...base, promoId: 910, denverDate: "2026-10-05", profit: "1.00" },
      { ...base, promoId: 910, denverDate: "2026-10-04", profit: "1.00" },
    ]);
    expect(stats.days.find((d) => d.total === "1.00")?.date).toBe("2026-10-04");
  });
});

describe("dailyHistoryStats ignores no_sweat estimates (FEED-04)", () => {
  it("a no_sweat row changes no totals, counts or conversion stats", () => {
    const guaranteed = [
      row({ denverDate: "2026-10-01", profit: "4.00", promoType: "bonus_bet", bonusAmount: "25.00" }),
      row({ denverDate: "2026-10-02", profit: "2.00", promoType: "profit_boost", maxStake: "25.00" }),
    ];
    const noSweat = row({ denverDate: "2026-10-03", profit: "9.00", promoType: "no_sweat", bonusAmount: "50.00", maxStake: "50.00" });
    const without = dailyHistoryStats(guaranteed);
    const withEstimate = dailyHistoryStats([...guaranteed, noSweat]);
    expect(withEstimate.grandTotal).toBe(without.grandTotal);
    expect(withEstimate.promoCount).toBe(2);
    expect(withEstimate.bonusConversion).toEqual(without.bonusConversion);
    expect(withEstimate.boostConversion).toEqual(without.boostConversion);
    expect(withEstimate.types.find((t) => t.key === "no_sweat")).toBeUndefined();
  });
});

describe("gameWeekdayStats", () => {
  it("counts each daily record on the Denver weekday its game starts, and counts records with no game time as unscheduled", () => {
    const fridayGame = new Date("2026-10-16T18:00:00Z"); // Fri noon MDT
    const rows: HistoryRow[] = [
      { ...row({ denverDate: "2026-09-27", profit: "3.00", sportKey: "americanfootball_ncaaf" }), gameAt: new Date("2026-10-13T18:00:00Z") },
      { ...row({ denverDate: "2026-09-28", profit: "2.00", sportKey: "americanfootball_ncaaf" }), gameAt: new Date("2026-10-13T18:00:00Z") },
      { ...row({ denverDate: "2026-09-29", profit: "4.00", sportKey: "americanfootball_ncaaf" }), gameAt: fridayGame },
      { ...row({ denverDate: "2026-09-30", profit: "1.00", sportKey: "basketball_nba" }), gameAt: null },
    ];

    const stats = gameWeekdayStats(rows);
    expect(stats.unscheduledPromos).toBe(1);
    expect(stats.rows).toHaveLength(1);
    expect(stats.rows[0]).toMatchObject({ sportKey: "americanfootball_ncaaf", total: "9.00", bestDay: "Tue" });
    expect(stats.rows[0].byDay.Tue).toBe("5.00");
    expect(stats.rows[0].byDay.Fri).toBe("4.00");
  });
});
