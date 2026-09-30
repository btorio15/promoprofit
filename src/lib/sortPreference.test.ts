import { describe, expect, it } from "vitest";
import { countLabel, parseSortMode, sortCaption } from "./sortPreference";

describe("sortPreference", () => {
  it.each([
    ["roi", "roi"],
    ["profit", "profit"],
    [null, "profit"],
    ["garbage", "profit"],
    ["", "profit"],
  ] as const)("parseSortMode(%s) -> %s", (input, expected) => {
    expect(parseSortMode(input)).toBe(expected);
  });

  it("sortCaption", () => {
    expect(sortCaption("profit")).toBe("Top 5 by guaranteed profit");
    expect(sortCaption("roi")).toBe("Top 5 by ROI");
  });

  it("countLabel", () => {
    expect(countLabel("Promos", 0)).toBe("Promos");
    expect(countLabel("Promos", 3)).toBe("Promos (3)");
  });
});
