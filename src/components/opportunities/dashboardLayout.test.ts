import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(join(__dirname, "OpportunitiesScreen.tsx"), "utf8");
const totals = readFileSync(join(__dirname, "DashboardTotals.tsx"), "utf8");

describe("Dashboard layout (D-13, D-14, D-07)", () => {
  it("has the Dashboard heading and subtitle", () => {
    expect(screen).toContain(">Dashboard</h1>");
    expect(screen).toContain("Your profit so far, and the best money available right now at your books.");
  });

  it("orders totals, graph, Opportunities heading, sort, feed", () => {
    const a = screen.indexOf("<DashboardTotals");
    const b = screen.indexOf("<ProfitGraph");
    const c = screen.indexOf(">Opportunities</h2>");
    const d = screen.indexOf("<SortSwitch");
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(d);
  });

  it("drops the old summary and totals field", () => {
    expect(screen).not.toContain("ProfitSummary");
    expect(screen).not.toContain("ok.totals");
  });

  it("totals card ignores the graph hide toggle", () => {
    expect(totals).not.toContain("profitGraphHidden");
  });

  it("totals card has an error state instead of disappearing (W3, IN-04)", () => {
    expect(totals).toMatch(/TOTALS_LOAD_ERROR/);
    expect(totals).not.toMatch(/if\s*\(\s*dashboard\s*===\s*null\s*\)\s*return\s+null\s*;/);
  });

  it("totals card passes the series status to the view model (IN-05)", () => {
    expect(totals).toMatch(/buildTotalsView\(\s*dashboard\s*,\s*\{\s*seriesStatus/);
  });

  it("totals and graph share one loadError", () => {
    expect(screen.match(/const\s+loadError\s*=/g)).toHaveLength(1);
    expect(screen).toMatch(/loadError\s*\?\s*\{\s*status:\s*"error"/);
    expect(screen).toMatch(/loadFailed=\{\s*loadError\s*\}/);
  });
});
