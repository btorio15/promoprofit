import { describe, expect, it } from "vitest";
import { fixtureSeedRefusal } from "./fixtureSeedGuard";

describe("fixtureSeedRefusal (WR-04)", () => {
  it("refuses without the explicit ALLOW_FIXTURE_SEED=1 opt-in", () => {
    expect(fixtureSeedRefusal({ allowFlag: undefined, liveRefreshHasRun: false })).toMatch(/ALLOW_FIXTURE_SEED=1/);
    expect(fixtureSeedRefusal({ allowFlag: "true", liveRefreshHasRun: false })).toMatch(/ALLOW_FIXTURE_SEED=1/);
  });

  it("refuses when live Odds API data already exists, even with the opt-in", () => {
    expect(fixtureSeedRefusal({ allowFlag: "1", liveRefreshHasRun: true })).toMatch(/live Odds API data/);
  });

  it("allows the seed with the opt-in on a database with no live data", () => {
    expect(fixtureSeedRefusal({ allowFlag: "1", liveRefreshHasRun: false })).toBeNull();
  });
});
