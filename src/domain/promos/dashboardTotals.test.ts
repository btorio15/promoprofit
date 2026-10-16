import { describe, expect, it } from "vitest";
import { buildDashboardTotals, type DashboardTotalsInput } from "./dashboardTotals";
import type { ProfitSeriesDTO } from "./profitSeries";

type DoneRow = DashboardTotalsInput["doneRows"][number];
type Kind = DoneRow["kind"];

const NOW = new Date("2026-10-14T18:00:00Z"); // Denver day 2026-10-14

const completion = (iso: string, profit: string) => ({ completedAt: new Date(iso), profitExtracted: profit });
const done = (kind: Kind, bookName: string, title: string, profit: string, iso: string): DoneRow => ({
  kind,
  bookName,
  title,
  profitExtracted: profit,
  completedAt: iso,
});
const ready = (
  graphStartDay: string,
  today: string,
  days: { date: string; available: string }[],
): ProfitSeriesDTO => ({
  status: "ready",
  today,
  graphStartDay,
  days: days.map((d) => ({ date: d.date, available: d.available, extracted: "0.00" })),
});

const NOT_READY: ProfitSeriesDTO = { status: "not-ready" };

function totals(over: Partial<DashboardTotalsInput> = {}) {
  return buildDashboardTotals({
    series: NOT_READY,
    completions: [],
    doneRows: [],
    now: NOW,
    ...over,
  });
}

// Owner fixture: 10 done rows totalling exactly 33.09, plus 2 pair-marker completions at 0.00.
const OWNER_DONE: DoneRow[] = [
  done("hedge", "DraftKings", "College Football 50% Profit Boost", "9.05", "2026-10-14T17:00:00.000Z"),
  done("hedge", "FanDuel", "NFL Bonus Bet", "5.20", "2026-10-12T17:00:00.000Z"),
  done("hedge", "BetMGM", "NBA Profit Boost", "4.10", "2026-10-10T17:00:00.000Z"),
  done("pair", "DraftKings + FanDuel", "Pair", "6.00", "2026-10-13T17:00:00.000Z"),
  done("pair", "Caesars + BetMGM", "Pair", "3.30", "2026-10-09T17:00:00.000Z"),
  done("no_hedge", "Fanatics", "Reload", "0.00", "2026-10-08T17:00:00.000Z"),
  done("legacy", "BetRivers", "Old promo", "0.00", "2026-10-07T17:00:00.000Z"),
  done("hedge", "Caesars", "MLB Boost", "2.44", "2026-10-11T17:00:00.000Z"),
  done("hedge", "FanDuel", "NHL Boost", "3.00", "2026-10-06T17:00:00.000Z"),
  done("hedge", "BetMGM", "Zero hedge", "0.00", "2026-10-05T17:00:00.000Z"),
];
const OWNER_COMPLETIONS = [
  ...OWNER_DONE.map((r) => completion(r.completedAt, r.profitExtracted)),
  completion("2026-10-13T17:00:00.000Z", "0.00"),
  completion("2026-10-09T17:00:00.000Z", "0.00"),
];

describe("extracted all-time", () => {
  it("includes completions before graphStartDay and ignores 0.00 markers (D-02, D-18)", () => {
    const t = totals({
      series: ready("2026-10-13", "2026-10-14", [{ date: "2026-10-13", available: "0.00" }]),
      completions: [
        completion("2026-10-01T17:00:00Z", "4.00"),
        completion("2026-10-14T17:00:00Z", "1.50"),
        completion("2026-10-14T17:00:00Z", "0.00"),
      ],
    });
    expect(t.extracted.allTime).toBe("5.50");
  });

  it("owner fixture gives 33.09", () => {
    expect(totals({ completions: OWNER_COMPLETIONS, doneRows: OWNER_DONE }).extracted.allTime).toBe("33.09");
  });
});

describe("windows", () => {
  const c = [
    completion("2026-10-08T18:00:00Z", "1.00"), // Denver Oct 8 = today-6
    completion("2026-10-07T18:00:00Z", "2.00"), // Oct 7
    completion("2026-09-15T18:00:00Z", "4.00"), // today-29
    completion("2026-09-14T18:00:00Z", "8.00"), // today-30
  ];

  it("last7 is today-6..today, last30 is today-29..today (D-03)", () => {
    const t = totals({ completions: c });
    expect(t.extracted.last7).toBe("1.00");
    expect(t.extracted.last30).toBe("7.00");
    expect(t.extracted.allTime).toBe("15.00");
  });

  it("buckets by Denver day, not UTC", () => {
    const t = totals({ completions: [completion("2026-10-08T05:30:00Z", "3.00")] }); // Oct 7 in Denver
    expect(t.extracted.last7).toBe("0.00");
    expect(t.extracted.last30).toBe("3.00");
  });

  it("excludes future-dated completions from windows", () => {
    const t = totals({ completions: [completion("2026-10-15T18:00:00Z", "5.00")] });
    expect(t.extracted.last7).toBe("0.00");
    expect(t.extracted.last30).toBe("0.00");
  });

  it("does not clip at graphStartDay (D-18)", () => {
    const t = totals({
      series: ready("2026-10-13", "2026-10-14", [{ date: "2026-10-13", available: "0.00" }]),
      completions: [completion("2026-10-09T18:00:00Z", "6.00")],
    });
    expect(t.extracted.last7).toBe("6.00");
    expect(t.extracted.last30).toBe("6.00");
  });
});

describe("available", () => {
  it("sums the member series days (D-01)", () => {
    const t = totals({
      series: ready("2026-10-13", "2026-10-14", [
        { date: "2026-10-13", available: "1.25" },
        { date: "2026-10-14", available: "1.31" },
      ]),
    });
    expect(t.available).toEqual({ sinceDay: "2026-10-13", allTime: "2.56", last7: "2.56", last30: "2.56" });
  });

  it("excludes days before the window start", () => {
    const t = totals({
      series: ready("2026-09-01", "2026-10-14", [
        { date: "2026-09-10", available: "1.00" },
        { date: "2026-10-07", available: "2.00" },
        { date: "2026-10-08", available: "4.00" },
      ]),
    });
    expect(t.available).toEqual({ sinceDay: "2026-09-01", allTime: "7.00", last7: "4.00", last30: "6.00" });
  });

  it("is null when not-ready or error", () => {
    expect(totals({ series: { status: "not-ready" } }).available).toBeNull();
    expect(totals({ series: { status: "error" } }).available).toBeNull();
  });

  it("single zero day gives 0.00 everywhere", () => {
    const t = totals({ series: ready("2026-10-14", "2026-10-14", [{ date: "2026-10-14", available: "0.00" }]) });
    expect(t.available).toEqual({ sinceDay: "2026-10-14", allTime: "0.00", last7: "0.00", last30: "0.00" });
  });
});

describe("exact", () => {
  it("extracted 0.10 + 0.20 is 0.30", () => {
    const t = totals({
      completions: [completion("2026-10-14T17:00:00Z", "0.10"), completion("2026-10-14T17:00:00Z", "0.20")],
    });
    expect(t.extracted.allTime).toBe("0.30");
    expect(t.extracted.last7).toBe("0.30");
  });

  it("available 0.10 + 0.20 is 0.30", () => {
    const t = totals({
      series: ready("2026-10-13", "2026-10-14", [
        { date: "2026-10-13", available: "0.10" },
        { date: "2026-10-14", available: "0.20" },
      ]),
    });
    expect(t.available?.allTime).toBe("0.30");
  });
});

describe("counts", () => {
  it("owner fixture: 10 done, average 3.31 (D-10, D-19)", () => {
    const t = totals({ completions: OWNER_COMPLETIONS, doneRows: OWNER_DONE });
    expect(t.counts.promosDone).toBe(10);
    expect(t.counts.averageExtracted).toBe("3.31");
  });

  it("rounds half-up: 10.00 and 0.01 average 5.01", () => {
    const rows = [
      done("hedge", "DraftKings", "A", "10.00", "2026-10-14T17:00:00Z"),
      done("hedge", "FanDuel", "B", "0.01", "2026-10-13T17:00:00Z"),
    ];
    const t = totals({
      completions: rows.map((r) => completion(r.completedAt, r.profitExtracted)),
      doneRows: rows,
    });
    expect(t.counts.averageExtracted).toBe("5.01");
  });

  it("counts $0 no_hedge and legacy rows in count and divisor", () => {
    const rows = [
      done("no_hedge", "DraftKings", "A", "0.00", "2026-10-14T17:00:00Z"),
      done("legacy", "FanDuel", "B", "0.00", "2026-10-13T17:00:00Z"),
      done("hedge", "BetMGM", "C", "3.00", "2026-10-12T17:00:00Z"),
    ];
    const t = totals({
      completions: rows.map((r) => completion(r.completedAt, r.profitExtracted)),
      doneRows: rows,
    });
    expect(t.counts.promosDone).toBe(3);
    expect(t.counts.averageExtracted).toBe("1.00");
  });

  it("zero rows gives 0, null average, 0.00 extracted", () => {
    const t = totals();
    expect(t.counts.promosDone).toBe(0);
    expect(t.counts.averageExtracted).toBeNull();
    expect(t.extracted.allTime).toBe("0.00");
  });
});

describe("best", () => {
  it("single best carries book and full title (D-11)", () => {
    const t = totals({ completions: OWNER_COMPLETIONS, doneRows: OWNER_DONE });
    expect(t.counts.best).toEqual({
      profit: "9.05",
      bookLabel: "DraftKings",
      name: "College Football 50% Profit Boost",
      isPair: false,
    });
  });

  it("pair best is labelled '<A> + <B> pair' with no name", () => {
    const rows = [
      done("hedge", "DraftKings", "Boost", "9.05", "2026-10-14T17:00:00Z"),
      done("pair", "DraftKings + FanDuel", "Pair", "12.40", "2026-10-13T17:00:00Z"),
    ];
    const t = totals({ doneRows: rows });
    expect(t.counts.best).toEqual({
      profit: "12.40",
      bookLabel: "DraftKings + FanDuel pair",
      name: null,
      isPair: true,
    });
  });

  it("tie goes to the later completedAt regardless of input order", () => {
    const early = done("hedge", "FanDuel", "Early", "5.00", "2026-10-10T17:00:00Z");
    const late = done("hedge", "BetMGM", "Late", "5.00", "2026-10-12T17:00:00Z");
    expect(totals({ doneRows: [early, late] }).counts.best?.bookLabel).toBe("BetMGM");
    expect(totals({ doneRows: [late, early] }).counts.best?.bookLabel).toBe("BetMGM");
  });

  it("is null when every row is 0.00", () => {
    const rows = [
      done("no_hedge", "DraftKings", "A", "0.00", "2026-10-14T17:00:00Z"),
      done("legacy", "FanDuel", "B", "0.00", "2026-10-13T17:00:00Z"),
    ];
    expect(totals({ doneRows: rows }).counts.best).toBeNull();
  });
});
