import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

describe("vercel.json cron config", () => {
  it("repo root resolves correctly", () => {
    expect(existsSync(join(REPO_ROOT, "package.json"))).toBe(true);
  });

  const config = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8"));

  it("declares the two on-time Vercel runs: 14:00 and 19:00 UTC (7 AM and 12 PM MST) (quick-261022-i3j)", () => {
    // Hobby allows two daily cron jobs. The 5 PM run is the GitHub schedule.
    expect(config.crons).toEqual([
      { path: "/api/cron/scrape?slot=morning", schedule: "0 14 * * *" },
      { path: "/api/cron/scrape?slot=midday", schedule: "0 19 * * *" },
    ]);
    expect(existsSync(join(REPO_ROOT, "src/app/api/cron/scrape/route.ts"))).toBe(true);
  });

  it("has no buildCommand and the build does not migrate", () => {
    expect(config).not.toHaveProperty("buildCommand");
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.build).toBe("next build");
  });
});
