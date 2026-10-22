import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

describe("vercel.json cron config", () => {
  it("repo root resolves correctly", () => {
    expect(existsSync(join(REPO_ROOT, "package.json"))).toBe(true);
  });

  const config = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8"));

  it("declares one daily Vercel cron at 13:17 UTC for an on-time morning promo scrape (quick-261022-hzb)", () => {
    // GitHub starts its scheduled runs hours late, so the morning promo scrape
    // comes from Vercel Cron (Hobby: one daily job). The route dispatches a
    // promo scrape only, so the three GitHub odds refreshes stay the only
    // Odds API spending.
    expect(config.crons).toEqual([{ path: "/api/cron/scrape", schedule: "17 13 * * *" }]);
    expect(existsSync(join(REPO_ROOT, "src/app/api/cron/scrape/route.ts"))).toBe(true);
  });

  it("has no buildCommand and the build does not migrate", () => {
    expect(config).not.toHaveProperty("buildCommand");
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.build).toBe("next build");
  });
});
