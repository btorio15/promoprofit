import { describe, expect, it } from "vitest";
import type { DashboardTotalsDTO } from "@/domain/promos/dashboardTotals";
import { TOTALS_LOAD_ERROR, buildTotalsView } from "./dashboardTotalsView";

function dto(over: Partial<DashboardTotalsDTO> = {}): DashboardTotalsDTO {
  return {
    extracted: { allTime: "33.09", last7: "10.79", last30: "33.09" },
    available: { sinceDay: "2026-10-13", allTime: "2.56", last7: "2.56", last30: "2.56" },
    counts: {
      promosDone: 10,
      averageExtracted: "3.31",
      best: { profit: "9.05", bookLabel: "DraftKings", name: "College Football 50% Profit Boost", isPair: false },
    },
    ...over,
  };
}

describe("buildTotalsView", () => {
  it("owner cells", () => {
    expect(buildTotalsView(dto()).cells).toEqual([
      { label: "Extracted all-time", value: "$33.09", tone: "extracted", caption: null },
      { label: "Available since Oct 13", value: "$2.56", tone: "available", caption: null },
      { label: "Last 7 days", value: "$10.79", tone: "extracted", caption: "of $2.56 available" },
      { label: "Last 30 days", value: "$33.09", tone: "extracted", caption: "of $2.56 available" },
    ]);
  });

  it("owner counts text", () => {
    const v = buildTotalsView(dto());
    expect(v.countsText).toBe(
      "10 promos done · avg $3.31 each · best $9.05 · DraftKings · College Football 50% Profit Boost",
    );
    expect(v.counts).toEqual({
      empty: false,
      lead: "10 promos done",
      average: "$3.31",
      best: {
        profit: "$9.05",
        label: "DraftKings",
        fullName: "DraftKings · College Football 50% Profit Boost",
      },
    });
  });

  it("start day is derived", () => {
    const v = buildTotalsView(
      dto({ available: { sinceDay: "2026-09-27", allTime: "1.00", last7: "1.00", last30: "1.00" } }),
    );
    expect(v.cells[1].label).toBe("Available since Sep 27");
  });

  it("singular", () => {
    const v = buildTotalsView(dto({ counts: { ...dto().counts, promosDone: 1 } }));
    expect(v.countsText.startsWith("1 promo done · avg")).toBe(true);
  });

  it("pair best", () => {
    const v = buildTotalsView(
      dto({
        counts: {
          promosDone: 2,
          averageExtracted: "6.00",
          best: { profit: "12.40", bookLabel: "DraftKings + FanDuel pair", name: null, isPair: true },
        },
      }),
    );
    expect(v.countsText.endsWith("best $12.40 · DraftKings + FanDuel pair")).toBe(true);
    if (!v.counts.empty) expect(v.counts.best?.fullName).toBe("DraftKings + FanDuel pair");
  });

  it("no best", () => {
    const v = buildTotalsView(dto({ counts: { promosDone: 3, averageExtracted: "0.00", best: null } }));
    expect(v.countsText).toBe("3 promos done · avg $0.00 each");
  });

  it("empty", () => {
    const v = buildTotalsView(
      dto({
        extracted: { allTime: "0.00", last7: "0.00", last30: "0.00" },
        counts: { promosDone: 0, averageExtracted: null, best: null },
      }),
    );
    expect(v.counts).toEqual({ empty: true, text: "No promos done yet" });
    expect(v.countsText).toBe("No promos done yet");
    expect(v.cells[0].value).toBe("$0.00");
  });

  it("available null", () => {
    const v = buildTotalsView(dto({ available: null }));
    expect(v.cells[1]).toEqual({ label: "Available", value: "Not ready yet", tone: "muted", caption: null });
    expect(v.cells[2].caption).toBeNull();
    expect(v.cells[3].caption).toBeNull();
    expect(v.cells[0].value).toBe("$33.09");
    expect(v.cells[2].value).toBe("$10.79");
  });

  it("zero available", () => {
    const v = buildTotalsView(
      dto({ available: { sinceDay: "2026-10-13", allTime: "0.00", last7: "0.00", last30: "0.00" } }),
    );
    expect(v.cells[1].value).toBe("$0.00");
    expect(v.cells[2].caption).toBe("of $0.00 available");
  });
});

describe("buildTotalsView series status", () => {
  it("labels a series error as Couldn't load", () => {
    const v = buildTotalsView(dto({ available: null }), { seriesStatus: "error" });
    expect(v.cells[1]).toEqual({ label: "Available", value: "Couldn't load", tone: "muted", caption: null });
    expect(v.cells[2].caption).toBeNull();
    expect(v.cells[3].caption).toBeNull();
  });

  it("keeps Not ready yet for not-ready and no option", () => {
    expect(buildTotalsView(dto({ available: null }), { seriesStatus: "not-ready" }).cells[1].value).toBe("Not ready yet");
    expect(buildTotalsView(dto({ available: null })).cells[1].value).toBe("Not ready yet");
  });

  it("ready series is unchanged", () => {
    const v = buildTotalsView(dto(), { seriesStatus: "ready" });
    expect(v.cells[1].label).toBe("Available since Oct 13");
    expect(v.cells[2].caption).toBe("of $2.56 available");
  });

  it("exposes load-error copy", () => {
    expect(TOTALS_LOAD_ERROR).toEqual({ heading: "Couldn't load your totals", body: "Refresh the page to try again." });
  });
});
