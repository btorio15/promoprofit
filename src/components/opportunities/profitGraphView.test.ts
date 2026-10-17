import { describe, expect, it } from "vitest";
import type { ProfitSeriesDTO } from "@/domain/promos/profitSeries";
import {
  buildGraphView,
  formatGain,
  formatTickDate,
  formatTooltipDate,
  tooltipGainLine,
} from "./profitGraphView";

const day = (date: string, available: string, extracted: string) => ({ date, available, extracted });

function ready(days: ReturnType<typeof day>[], today: string, graphStartDay: string): ProfitSeriesDTO {
  return { status: "ready", today, graphStartDay, days };
}

describe("buildGraphView", () => {
  it("not-ready copy", () => {
    const v = buildGraphView({ status: "not-ready" }, "30d");
    expect(v.state).toBe("not-ready");
    expect(v.heading).toBe("Graph not ready yet");
    expect(v.body).toBe(
      "The graph is being set up and will appear once setup finishes. Your totals elsewhere are not affected.",
    );
  });

  it("error copy", () => {
    const v = buildGraphView({ status: "error" }, "all");
    expect(v.state).toBe("error");
    expect(v.heading).toBe("Couldn't load the graph");
    expect(v.body).toBe("Your opportunities below are fine. Refresh the page to try again.");
  });

  it("empty with history days", () => {
    const v = buildGraphView(
      ready([day("2026-10-01", "0.00", "0.00"), day("2026-10-02", "0.00", "0.00")], "2026-10-02", "2026-10-01"),
      "30d",
    );
    expect(v.state).toBe("empty");
    expect(v.heading).toBe("Nothing yet");
    expect(v.body).toBe("Once you have profit to take or you mark a promo done, your lines will show up here.");
    expect(v.headline).toEqual({ extracted: "0.00", available: "0.00" });
  });

  it("empty on first day", () => {
    const v = buildGraphView(ready([day("2026-10-02", "0.00", "0.00")], "2026-10-02", "2026-10-02"), "30d");
    expect(v.state).toBe("empty");
    expect(v.body).toBe("The graph starts today. Come back tomorrow to see your first line.");
  });

  it("chart with anchor, totals and aria label", () => {
    const v = buildGraphView(
      ready(
        [day("2026-10-01", "100.10", "0.00"), day("2026-10-02", "110.00", "123.45")],
        "2026-10-02",
        "2026-10-01",
      ),
      "30d",
    );
    expect(v.state).toBe("chart");
    expect(v.points).toHaveLength(3);
    expect(v.points[0].anchor).toBe(true);
    expect(v.points[0].date).toBe("2026-09-30");
    expect(v.headline).toEqual({ extracted: "123.45", available: "210.10" });
    expect(v.points[2].availableY).toBe(210.1);
    expect(v.ariaLabel).toBe("Extracted $123.45 of $210.10 available since Oct 1, Last 30 days");
  });

  it("range switch restarts totals at zero", () => {
    const days = [];
    for (let i = 1; i <= 10; i++) days.push(day(`2026-10-${String(i).padStart(2, "0")}`, "10.00", "1.00"));
    const s = ready(days, "2026-10-10", "2026-10-01");
    const all = buildGraphView(s, "all");
    const week = buildGraphView(s, "7d");
    expect(all.headline).toEqual({ extracted: "10.00", available: "100.00" });
    expect(week.headline).toEqual({ extracted: "7.00", available: "70.00" });
    expect(week.points[0].availableTotal).toBe("0.00");
    expect(week.points).toHaveLength(8);
    expect(week.ariaLabel).toContain("Last 7 days");
  });
});

describe("sinceLabel", () => {
  const days = [day("2026-10-13", "5.00", "1.00"), day("2026-10-14", "6.00", "2.00")];
  const empty = [day("2026-10-13", "0.00", "0.00")];
  it("all range chart and empty", () => {
    expect(buildGraphView(ready(days, "2026-10-14", "2026-10-13"), "all").sinceLabel).toBe("since Oct 13");
    expect(buildGraphView(ready(empty, "2026-10-14", "2026-10-13"), "all").sinceLabel).toBe("since Oct 13");
  });
  it("7d/30d clamped to the start day say so, in the aria label too", () => {
    const week = buildGraphView(ready(days, "2026-10-14", "2026-10-13"), "7d");
    expect(week.sinceLabel).toBe("since Oct 13");
    expect(week.ariaLabel).toBe("Extracted $3.00 of $11.00 available since Oct 13, Last 7 days");
    expect(buildGraphView(ready(days, "2026-10-14", "2026-10-13"), "30d").sinceLabel).toBe("since Oct 13");
  });
  it("unclamped 7d, not-ready and error are null", () => {
    expect(buildGraphView(ready(days, "2026-10-25", "2026-10-13"), "7d").sinceLabel).toBeNull();
    expect(buildGraphView({ status: "not-ready" }, "all").sinceLabel).toBeNull();
    expect(buildGraphView({ status: "error" }, "all").sinceLabel).toBeNull();
  });
});

describe("formatters", () => {
  it("formats dates in UTC", () => {
    expect(formatTickDate("2026-10-03")).toBe("Oct 3");
    expect(formatTooltipDate("2026-10-03")).toBe("Sat, Oct 3");
  });
  it("formats gains", () => {
    expect(formatGain("12.40")).toBe("+$12.40");
    expect(formatGain("0.00")).toBe("+$0.00");
    expect(tooltipGainLine({ availableGain: "12.40", extractedGain: "8.00" })).toBe(
      "That day: +$12.40 available, +$8.00 extracted",
    );
  });
});
