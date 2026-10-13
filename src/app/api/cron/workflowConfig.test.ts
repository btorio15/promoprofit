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

  it("runs the odds observe on every scheduled run, always forced (three odds snapshots a day)", () => {
    const observeRun = lines.find((l) => l.includes("npm run odds:morning-observe"));
    expect(observeRun).toBeDefined();
    expect(observeRun).toContain("github.event_name == 'schedule'");
    expect(observeRun).toContain("'--force'");
    expect(code).not.toContain("steps.today");
  });

  it("declares skip_morning_observe and the observe step honours it (WR-01 duplicate cron guard)", () => {
    expect(text).toContain("skip_morning_observe:");
    expect(text).toContain("github.event.inputs.skip_morning_observe != 'true'");
  });

  it("passes both ODDS_API_KEY and ODDS_API_KEYS secrets to the morning observe step", () => {
    expect(code).toContain("ODDS_API_KEY: ${{ secrets.ODDS_API_KEY }}");
    expect(code).toContain("ODDS_API_KEYS: ${{ secrets.ODDS_API_KEYS }}");
  });

  it("keeps workflow_dispatch + force_morning_observe, no timezone key", () => {
    expect(text).toContain("workflow_dispatch:");
    expect(text).toContain("force_morning_observe:");
    expect(lines.some((l) => l.includes("timezone:"))).toBe(false);
  });

  it("runs the promo scrape on every run, with no already-ran skip", () => {
    expect(code).toContain("npm run scrape:promos");
    expect(code).not.toContain("scrape:already-ran-today");
  });
});
