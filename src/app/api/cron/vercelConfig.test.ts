import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

describe("vercel.json cron config", () => {
  it("repo root resolves correctly", () => {
    expect(existsSync(join(REPO_ROOT, "package.json"))).toBe(true);
  });

  const config = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8"));

  it("declares exactly one cron targeting the scrape route", () => {
    expect(config.crons).toHaveLength(1);
    expect(config.crons[0].path).toBe("/api/cron/scrape");
    expect(existsSync(join(REPO_ROOT, "src/app/api/cron/scrape/route.ts"))).toBe(true);
  });

  it("runs once a day in the 13:00 UTC hour", () => {
    const f = config.crons[0].schedule.trim().split(/\s+/);
    expect(f).toHaveLength(5);
    expect(f[1]).toBe("13");
    expect(Number.isInteger(Number(f[0]))).toBe(true);
    expect(Number(f[0])).toBeGreaterThanOrEqual(0);
    expect(Number(f[0])).toBeLessThanOrEqual(59);
    expect(f.slice(2)).toEqual(["*", "*", "*"]);
  });

  it("has no buildCommand and the build does not migrate", () => {
    expect(config).not.toHaveProperty("buildCommand");
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.build).toBe("next build");
  });
});
