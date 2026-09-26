import { describe, expect, it } from "vitest";
import { ArbInputSchema, DEFAULT_TOTAL_STAKE } from "./arbInput";
import { marketBadgeLabel, selectionLabel } from "./labels";

describe("ArbInputSchema", () => {
  it("parses a valid total stake with the default precision", () => {
    const result = ArbInputSchema.safeParse({ totalStake: "200" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.precision).toBe("whole");
  });

  it("accepts an explicit precision", () => {
    const result = ArbInputSchema.safeParse({ totalStake: "200", precision: "cents" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.precision).toBe("cents");
  });

  it.each(["0", "-1", "abc", "1.234", "1000001"])(
    "rejects an invalid total stake %s",
    (bad) => {
      const result = ArbInputSchema.safeParse({ totalStake: bad });
      expect(result.success).toBe(false);
      if (result.success) return;
      const { fieldErrors } = result.error.flatten();
      expect(fieldErrors.totalStake).toContain("Enter a total stake greater than $0.");
    },
  );

  it("rejects an unknown precision value", () => {
    const result = ArbInputSchema.safeParse({ totalStake: "200", precision: "exact" });
    expect(result.success).toBe(false);
  });

  it("exports a $200.00 default", () => {
    expect(DEFAULT_TOTAL_STAKE).toBe("200.00");
  });
});

describe("marketBadgeLabel", () => {
  it("labels moneyline markets", () => {
    expect(marketBadgeLabel("moneyline", null)).toBe("Moneyline");
  });

  it("labels spread markets with an unsigned line", () => {
    expect(marketBadgeLabel("spread", -3.5)).toBe("Spread ±3.5");
    expect(marketBadgeLabel("spread", 1.5)).toBe("Spread ±1.5");
  });

  it("labels total markets", () => {
    expect(marketBadgeLabel("total", 44.5)).toBe("Total O/U 44.5");
  });
});

describe("selectionLabel", () => {
  it("returns the selection alone for moneylines", () => {
    expect(selectionLabel("moneyline", "Utah Jazz", null)).toBe("Utah Jazz");
  });

  it("appends a + prefix for positive spread points", () => {
    expect(selectionLabel("spread", "Utah Jazz", 3.5)).toBe("Utah Jazz +3.5");
  });

  it("uses the U+2212 minus sign for negative spread points", () => {
    expect(selectionLabel("spread", "Denver Nuggets", -3.5)).toBe("Denver Nuggets −3.5");
  });

  it("appends the point unsigned for totals", () => {
    expect(selectionLabel("total", "Over", 44.5)).toBe("Over 44.5");
  });
});
