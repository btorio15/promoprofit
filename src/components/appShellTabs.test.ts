import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "AppShell.tsx"), "utf8");

// Captures each TabsTrigger's value attribute and the first word of its visible text.
const triggerRe = /<TabsTrigger\b([^>]*)>\s*([A-Za-z]+)/g;

function triggers(): Array<{ value: string; label: string }> {
  return [...source.matchAll(triggerRe)].map((m) => ({
    value: /value="([^"]+)"/.exec(m[1])?.[1] ?? "",
    label: m[2],
  }));
}

describe("AppShell tab bar", () => {
  it("orders tab ids opportunities, stats, arbitrage, promos, tools", () => {
    expect(triggers().map((t) => t.value)).toEqual([
      "opportunities",
      "stats",
      "arbitrage",
      "promos",
      "tools",
    ]);
  });

  it("labels tabs Dashboard, Statistics, Arbitrage, Promos, Tools", () => {
    expect(triggers().map((t) => t.label)).toEqual([
      "Dashboard",
      "Statistics",
      "Arbitrage",
      "Promos",
      "Tools",
    ]);
  });

  it("has no duplicate ids or labels", () => {
    const t = triggers();
    expect(new Set(t.map((x) => x.value)).size).toBe(t.length);
    expect(new Set(t.map((x) => x.label)).size).toBe(t.length);
  });

  it("does not use the legacy dashboard id", () => {
    expect(source).not.toContain('value="dashboard"');
    const union = /type ActiveTab =([^;]+);/.exec(source)?.[1] ?? "";
    expect(union).toContain('"stats"');
    expect(union).not.toContain('"dashboard"');
  });

  it("defaults to the opportunities (Dashboard) home tab", () => {
    expect(source).toContain('useState<ActiveTab>("opportunities")');
  });

  it("renders StatsScreen from the stats folder", () => {
    expect(source).toContain('from "@/components/stats/StatsScreen"');
    expect(source).toContain('<StatsScreen active={activeTab === "stats"} />');
    expect(existsSync(join(__dirname, "dashboard", "DashboardScreen.tsx"))).toBe(false);
  });
});
