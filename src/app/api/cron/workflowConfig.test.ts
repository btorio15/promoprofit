import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const WORKFLOW = join(REPO_ROOT, ".github", "workflows", "scrape-promos.yml");

describe("scrape-promos workflow config (phase 05.1, D-07)", () => {
  it("repo root resolves", () => {
    expect(existsSync(join(REPO_ROOT, "package.json"))).toBe(true);
  });

  const text = readFileSync(WORKFLOW, "utf8");
  const lines = text.split("\n").filter((l) => !l.trim().startsWith("#"));
  const code = lines.join("\n");

  it("has the 15:37 backup plus the 18:37 and 22:37 promo-only passes (debug dk-mlb-choice-boost-missed)", () => {
    const crons = lines.filter((l) => /^\s*-\s*cron:/.test(l));
    expect(crons).toHaveLength(3);
    expect(crons[0]).toContain("37 15 * * *");
    expect(crons[1]).toContain("37 18 * * *");
    expect(crons[2]).toContain("37 22 * * *");
    expect(code).not.toContain("7 14,18,23");
  });

  it("runs the already-ran check and the odds observe only on the 15:37 backup, never the afternoon passes", () => {
    const checkGate = lines.find((l) => l.includes("github.event_name == 'schedule' &&"));
    const observeGate = lines.find((l) => l.includes("steps.today.outputs.observe_done != 'true'"));
    expect(checkGate).toContain("github.event.schedule == '37 15 * * *'");
    expect(observeGate).toContain("github.event.schedule == '37 15 * * *'");
  });

  it("declares skip_morning_observe and the observe step honours it (WR-01 duplicate cron guard)", () => {
    expect(text).toContain("skip_morning_observe:");
    expect(text).toContain("github.event.inputs.skip_morning_observe != 'true'");
  });

  it("keeps workflow_dispatch + force_morning_observe, no timezone key", () => {
    expect(text).toContain("workflow_dispatch:");
    expect(text).toContain("force_morning_observe:");
    expect(lines.some((l) => l.includes("timezone:"))).toBe(false);
  });

  it("gates scrape and observe on the already-ran check, schedule only", () => {
    expect(code).toContain("id: today");
    expect(code).toContain("npm run scrape:already-ran-today");
    const scrapeGate = lines.find((l) => l.includes("steps.today.outputs.scrape_done != 'true'"));
    const observeGate = lines.find((l) => l.includes("steps.today.outputs.observe_done != 'true'"));
    expect(scrapeGate).toBeDefined();
    expect(observeGate).toBeDefined();
    expect(scrapeGate).toContain("github.event_name != 'schedule'");
    expect(observeGate).toContain("github.event_name != 'schedule'");
  });
});
