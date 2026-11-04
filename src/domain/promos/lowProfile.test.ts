import { describe, expect, it } from "vitest";
import { DEFAULT_LOW_PROFILE, SetLowProfileInputSchema, toRankLowProfile } from "./lowProfile";

describe("lowProfile", () => {
  it("has the documented defaults", () => {
    expect(DEFAULT_LOW_PROFILE).toEqual({
      oddsCapEnabled: true,
      oddsCapAmerican: 300,
      mainLinesOnly: false,
      naturalStakes: false,
    });
  });
  const base = { oddsCapEnabled: true, oddsCapAmerican: 300, mainLinesOnly: false, naturalStakes: false };
  it.each([100, 300])("accepts cap %d", (oddsCapAmerican) => {
    expect(SetLowProfileInputSchema.safeParse({ ...base, oddsCapAmerican }).success).toBe(true);
  });
  it.each([99, 250.5])("rejects cap %s with the message", (oddsCapAmerican) => {
    const r = SetLowProfileInputSchema.safeParse({ ...base, oddsCapAmerican });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Enter odds of +100 or longer, like 300.");
  });
  it("rejects an extra userId key", () => {
    expect(SetLowProfileInputSchema.safeParse({ ...base, userId: 1 }).success).toBe(false);
  });
  it("maps to rank settings", () => {
    expect(toRankLowProfile({ ...base, oddsCapEnabled: false }).maxQualifyingOddsAmerican).toBeNull();
    expect(toRankLowProfile(base).maxQualifyingOddsAmerican).toBe(300);
  });
});
