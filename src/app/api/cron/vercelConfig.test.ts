import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

describe("vercel.json cron config", () => {
  it("repo root resolves correctly", () => {
    expect(existsSync(join(REPO_ROOT, "package.json"))).toBe(true);
  });

  const config = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8"));

  it("declares no Vercel cron: the GitHub Actions schedule runs the three daily scrape + odds passes", () => {
    // The scrape-promos workflow's three schedules each refresh odds, so a
    // Vercel cron would add a fourth odds spend per day. The cron route stays
    // in place and can still be called manually.
    expect(config.crons ?? []).toHaveLength(0);
    expect(existsSync(join(REPO_ROOT, "src/app/api/cron/scrape/route.ts"))).toBe(true);
  });

  it("has no buildCommand and the build does not migrate", () => {
    expect(config).not.toHaveProperty("buildCommand");
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.build).toBe("next build");
  });
});
