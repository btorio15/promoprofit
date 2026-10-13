import { describe, expect, it } from "vitest";
import {
  GRAPH_RANGE_LABELS,
  buildDailyGains,
  buildProfitSeriesData,
  cumulate,
  hasAnyGain,
  parseGraphRange,
  rangeStartDate,
  rangeTotals,
  withZeroAnchor,
  type DailyGain,
} from "./profitSeries";

const row = (promoId: number, denverDate: string, profit: string) => ({ promoId, denverDate, profit });

describe("buildDailyGains available (D-08)", () => {
  it("counts each promo once at its best on its first day", () => {
    const days = buildDailyGains({
      memberRows: [row(7, "2026-10-04", "3.10"), row(7, "2026-10-05", "4.25"), row(9, "2026-10-05", "1.00")],
      completions: [],
      graphStartDay: "2026-10-04",
      today: "2026-10-06",
    });
    expect(days.map((d) => [d.date, d.available])).toEqual([
      ["2026-10-04", "4.25"],
      ["2026-10-05", "1.00"],
      ["2026-10-06", "0.00"],
    ]);
  });

  it("graphStartDay == today gives exactly one day", () => {
    const days = buildDailyGains({ memberRows: [], completions: [], graphStartDay: "2026-10-06", today: "2026-10-06" });
    expect(days).toEqual([{ date: "2026-10-06", available: "0.00", extracted: "0.00" }]);
  });
});

describe("buildDailyGains extracted (D-10, D-04)", () => {
  const base = { memberRows: [], graphStartDay: "2026-10-04", today: "2026-10-06" };
  it("buckets by Denver day (MDT)", () => {
    const days = buildDailyGains({
      ...base,
      completions: [{ completedAt: new Date("2026-10-05T05:30:00Z"), profitExtracted: "5.00" }],
    });
    expect(days[0]).toEqual({ date: "2026-10-04", available: "0.00", extracted: "5.00" });
  });

  it("buckets by Denver day across DST end (MST)", () => {
    const days = buildDailyGains({
      memberRows: [],
      completions: [{ completedAt: new Date("2026-11-02T06:30:00Z"), profitExtracted: "2.00" }],
      graphStartDay: "2026-11-01",
      today: "2026-11-02",
    });
    expect(days[0].extracted).toBe("2.00");
  });

  it("tolerates legacy 0.00 and drops pre-start completions", () => {
    const days = buildDailyGains({
      ...base,
      completions: [
        { completedAt: new Date("2026-10-05T18:00:00Z"), profitExtracted: "0.00" },
        { completedAt: new Date("2026-10-01T18:00:00Z"), profitExtracted: "9.00" },
      ],
    });
    expect(days.map((d) => d.extracted)).toEqual(["0.00", "0.00", "0.00"]);
  });

  it("pair primary + member marker sum to the pair profit once", () => {
    const days = buildDailyGains({
      ...base,
      completions: [
        { completedAt: new Date("2026-10-05T18:00:00Z"), profitExtracted: "5.12" },
        { completedAt: new Date("2026-10-05T18:00:00Z"), profitExtracted: "0.00" },
      ],
    });
    expect(days[1].extracted).toBe("5.12");
  });

  it("sums 0.10 ten times to exactly 1.00", () => {
    const completions = Array.from({ length: 10 }, () => ({
      completedAt: new Date("2026-10-05T18:00:00Z"),
      profitExtracted: "0.10",
    }));
    expect(buildDailyGains({ ...base, completions })[1].extracted).toBe("1.00");
  });
});

describe("buildProfitSeriesData", () => {
  it("wraps days with today and start", () => {
    const d = buildProfitSeriesData({ memberRows: [], completions: [], graphStartDay: "2026-10-05", today: "2026-10-06" });
    expect(d.today).toBe("2026-10-06");
    expect(d.graphStartDay).toBe("2026-10-05");
    expect(d.days).toHaveLength(2);
  });
});

describe("rangeStartDate", () => {
  it.each([
    ["7d", "2026-10-24"],
    ["30d", "2026-10-04"],
    ["all", "2026-10-04"],
  ] as const)("%s", (range, expected) => {
    expect(rangeStartDate(range, "2026-10-30", "2026-10-04")).toBe(expected);
  });
});

describe("cumulate / withZeroAnchor / hasAnyGain / rangeTotals", () => {
  const days: DailyGain[] = [
    { date: "2026-10-03", available: "9.00", extracted: "9.00" },
    { date: "2026-10-04", available: "1.10", extracted: "0.00" },
    { date: "2026-10-05", available: "0.00", extracted: "0.00" },
    { date: "2026-10-06", available: "2.25", extracted: "1.00" },
  ];

  it("starts at $0 for the range and drops earlier days", () => {
    const pts = cumulate(days, "2026-10-04");
    expect(pts.map((p) => p.availableTotal)).toEqual(["1.10", "1.10", "3.35"]);
    expect(pts.map((p) => p.extractedTotal)).toEqual(["0.00", "0.00", "1.00"]);
    expect(pts[2].availableGain).toBe("2.25");
    expect(pts.every((p) => !p.anchor)).toBe(true);
  });

  it("prepends a zero anchor the day before start", () => {
    const pts = withZeroAnchor(cumulate(days, "2026-10-04"), "2026-10-04");
    expect(pts[0]).toEqual({
      date: "2026-10-03",
      availableTotal: "0.00",
      extractedTotal: "0.00",
      availableGain: "0.00",
      extractedGain: "0.00",
      anchor: true,
    });
    expect(pts).toHaveLength(4);
    expect(pts[1].anchor).toBe(false);
  });

  it("hasAnyGain", () => {
    const zero: DailyGain[] = [{ date: "2026-10-04", available: "0.00", extracted: "0.00" }];
    expect(hasAnyGain(withZeroAnchor(cumulate(zero, "2026-10-04"), "2026-10-04"))).toBe(false);
    expect(hasAnyGain(cumulate(days, "2026-10-04"))).toBe(true);
  });

  it("rangeTotals", () => {
    expect(rangeTotals(cumulate(days, "2026-10-04"))).toEqual({ availableTotal: "3.35", extractedTotal: "1.00" });
    expect(rangeTotals([])).toEqual({ availableTotal: "0.00", extractedTotal: "0.00" });
  });
});

describe("parseGraphRange", () => {
  it.each([
    ["7d", "7d"],
    ["30d", "30d"],
    ["all", "all"],
    [null, "30d"],
    ["", "30d"],
    ["90d", "30d"],
    ["ALL", "30d"],
  ])("%s -> %s", (input, expected) => {
    expect(parseGraphRange(input)).toBe(expected);
  });

  it("has labels", () => {
    expect(GRAPH_RANGE_LABELS.all).toBe("All time");
  });
});
