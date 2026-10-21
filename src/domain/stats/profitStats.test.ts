import { describe, expect, it } from "vitest";
import { denverHour, denverWeekday, sportWeekdayStats, timeOfDayStats, type SnapshotRow } from "./profitStats";

// 2026-10-13 is a Tuesday. Denver is UTC-6 in October (MDT).
const at = (iso: string) => new Date(iso);

function row(partial: Partial<SnapshotRow> & Pick<SnapshotRow, "promoId" | "capturedAt">): SnapshotRow {
  return {
    denverHour: 0,
    sportKey: "basketball_nba",
    gameAt: null,
    guaranteedProfit: "10.00",
    ...partial,
  };
}

describe("denverHour", () => {
  it("converts UTC instants to the Denver hour", () => {
    expect(denverHour(at("2026-10-13T15:37:00Z"))).toBe(9);
    expect(denverHour(at("2026-10-13T18:37:00Z"))).toBe(12);
    expect(denverHour(at("2026-10-13T22:37:00Z"))).toBe(16);
  });

  it("returns 0 at Denver midnight, not 24", () => {
    expect(denverHour(at("2026-10-13T06:05:00Z"))).toBe(0);
  });
});

describe("denverWeekday", () => {
  it("uses the Denver calendar day, not UTC", () => {
    // 2026-10-13 02:00 UTC is still Monday evening in Denver.
    expect(denverWeekday(at("2026-10-13T02:00:00Z"))).toBe("Mon");
    expect(denverWeekday(at("2026-10-13T18:00:00Z"))).toBe("Tue");
  });
});

describe("timeOfDayStats with scrape runs (quick-261021-gy4)", () => {
  it("counts runs with no snapshot as $0 and ignores runs before the first snapshot", () => {
    const before = at("2026-10-12T15:37:00Z");
    const run1 = at("2026-10-13T15:37:00Z");
    const run2 = at("2026-10-14T15:40:00Z");
    const run3 = at("2026-10-14T22:37:00Z");
    const rows: SnapshotRow[] = [
      row({ promoId: 1, capturedAt: at("2026-10-13T15:38:10Z"), denverHour: 9, guaranteedProfit: "12.00" }),
      row({ promoId: 2, capturedAt: at("2026-10-13T15:38:10Z"), denverHour: 9, guaranteedProfit: "8.00" }),
    ];
    expect(timeOfDayStats(rows, [before, run1, run2, run3])).toEqual([
      { hour: 9, runs: 2, avgProfit: "10.00" },
      { hour: 16, runs: 1, avgProfit: "0.00" },
    ]);
  });
});

describe("timeOfDayStats", () => {
  it("averages each run's total profit per capture hour", () => {
    const morningRun = at("2026-10-13T15:37:00Z");
    const afternoonRun = at("2026-10-13T22:37:00Z");
    const rows: SnapshotRow[] = [
      row({ promoId: 1, capturedAt: morningRun, denverHour: 9, guaranteedProfit: "12.50" }),
      row({ promoId: 2, capturedAt: morningRun, denverHour: 9, guaranteedProfit: "7.50" }),
      row({ promoId: 1, capturedAt: afternoonRun, denverHour: 16, guaranteedProfit: "5.00" }),
    ];

    expect(timeOfDayStats(rows)).toEqual([
      { hour: 9, runs: 1, avgProfit: "20.00" },
      { hour: 16, runs: 1, avgProfit: "5.00" },
    ]);
  });

  it("averages across several runs captured in the same hour", () => {
    const dayOne = at("2026-10-12T15:37:00Z");
    const dayTwo = at("2026-10-13T15:37:00Z");
    const rows: SnapshotRow[] = [
      row({ promoId: 1, capturedAt: dayOne, denverHour: 9, guaranteedProfit: "10.00" }),
      row({ promoId: 1, capturedAt: dayTwo, denverHour: 9, guaranteedProfit: "20.00" }),
    ];

    expect(timeOfDayStats(rows)).toEqual([{ hour: 9, runs: 2, avgProfit: "15.00" }]);
  });

  it("returns nothing for no snapshots", () => {
    expect(timeOfDayStats([])).toEqual([]);
  });
});

describe("sportWeekdayStats", () => {
  it("counts a promo once at its best observed profit", () => {
    const game = at("2026-10-14T01:00:00Z"); // Tue 7pm MDT
    const rows: SnapshotRow[] = [
      row({ promoId: 1, capturedAt: at("2026-10-13T15:37:00Z"), gameAt: game, guaranteedProfit: "8.00" }),
      row({ promoId: 1, capturedAt: at("2026-10-13T22:37:00Z"), gameAt: game, guaranteedProfit: "12.00" }),
    ];

    const stats = sportWeekdayStats(rows);
    expect(stats.rows).toHaveLength(1);
    expect(stats.rows[0].total).toBe("12.00");
    expect(stats.rows[0].byDay.Tue).toBe("12.00");
    expect(stats.rows[0].bestDay).toBe("Tue");
  });

  it("separates sports and picks each sport's best weekday", () => {
    const tuesday = at("2026-10-14T01:00:00Z");
    const saturday = at("2026-10-18T01:00:00Z");
    const rows: SnapshotRow[] = [
      row({ promoId: 1, capturedAt: at("2026-10-13T15:37:00Z"), sportKey: "baseball_mlb", gameAt: tuesday, guaranteedProfit: "5.00" }),
      row({ promoId: 2, capturedAt: at("2026-10-13T15:37:00Z"), sportKey: "baseball_mlb", gameAt: saturday, guaranteedProfit: "9.00" }),
      row({ promoId: 3, capturedAt: at("2026-10-13T15:37:00Z"), sportKey: "americanfootball_nfl", gameAt: tuesday, guaranteedProfit: "3.00" }),
    ];

    const stats = sportWeekdayStats(rows);
    const mlb = stats.rows.find((r) => r.sportKey === "baseball_mlb");
    const nfl = stats.rows.find((r) => r.sportKey === "americanfootball_nfl");
    expect(mlb).toMatchObject({ total: "14.00", bestDay: "Sat" });
    expect(nfl).toMatchObject({ total: "3.00", bestDay: "Tue" });
  });

  it("counts promos without a game time as unscheduled", () => {
    const rows: SnapshotRow[] = [
      row({ promoId: 1, capturedAt: at("2026-10-13T15:37:00Z"), gameAt: null, guaranteedProfit: "4.00" }),
    ];

    const stats = sportWeekdayStats(rows);
    expect(stats.rows).toEqual([]);
    expect(stats.unscheduledPromos).toBe(1);
  });
});
