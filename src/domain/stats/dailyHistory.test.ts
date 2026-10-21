import { describe, expect, it } from "vitest";
import { UNKNOWN_SPORT, dailyHistoryStats, type CompletionRow, type HistoryRow } from "./dailyHistory";

let nextPromoId = 1;

function row(partial: Partial<HistoryRow> & Pick<HistoryRow, "denverDate" | "profit">): HistoryRow {
  return {
    promoId: nextPromoId++,
    sportKey: "basketball_nba",
    bookKey: "draftkings",
    promoType: "profit_boost",
    bonusAmount: null,
    maxStake: null,
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

  it("marks a segment done only when its promo has a completion, and keeps extracted apart from available", () => {
    const doneRow = row({ denverDate: "2026-09-27", profit: "9.00", sportKey: "americanfootball_ncaaf", bookKey: "fanduel" });
    const openRow = row({ denverDate: "2026-09-27", profit: "4.00", sportKey: "basketball_nba", bookKey: "fanduel" });
    const completions: CompletionRow[] = [
      {
        promoId: doneRow.promoId,
        denverDate: "2026-09-27",
        sportKey: "americanfootball_ncaaf",
        promoType: "profit_boost",
        bookKey: "fanduel",
        profitExtracted: "7.50",
      },
    ];

    const stats = dailyHistoryStats([doneRow, openRow], undefined, completions);
    const segments = stats.days[0].segments;
    expect(segments.find((s) => s.promoId === doneRow.promoId)?.done).toBe(true);
    expect(segments.find((s) => s.promoId === openRow.promoId)?.done).toBe(false);
    expect(stats.grandTotal).toBe("13.00");
    expect(stats.extractedTotal).toBe("7.50");
    expect(stats.books[0]).toMatchObject({ key: "fanduel", total: "13.00", extracted: "7.50" });
  });

  it("counts extracted profit only in the window, by the day it was marked done", () => {
    const rows = [row({ denverDate: "2026-10-13", profit: "3.00" })];
    const completions: CompletionRow[] = [
      { promoId: 1, denverDate: "2026-09-01", sportKey: null, promoType: "bonus_bet", bookKey: "draftkings", profitExtracted: "100.00" },
      { promoId: 1, denverDate: "2026-10-13", sportKey: null, promoType: "bonus_bet", bookKey: "draftkings", profitExtracted: "2.00" },
    ];

    const stats = dailyHistoryStats(rows, { start: "2026-10-08", end: "2026-10-14" }, completions);
    expect(stats.extractedTotal).toBe("2.00");
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
