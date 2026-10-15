import { describe, expect, it } from "vitest";
import { parseStatsRange, rangeStartDate, shiftMonths } from "./statsRange";

describe("parseStatsRange", () => {
  it("accepts the four ranges and falls back to all time", () => {
    expect(parseStatsRange("7d")).toBe("7d");
    expect(parseStatsRange("1m")).toBe("1m");
    expect(parseStatsRange("1y")).toBe("1y");
    expect(parseStatsRange("all")).toBe("all");
    expect(parseStatsRange("forever")).toBe("all");
    expect(parseStatsRange(undefined)).toBe("all");
  });
});

describe("shiftMonths", () => {
  it("shifts by whole months", () => {
    expect(shiftMonths("2026-10-14", -1)).toBe("2026-09-14");
    expect(shiftMonths("2026-10-14", -12)).toBe("2025-10-14");
  });

  it("clamps to the last day of a shorter month", () => {
    expect(shiftMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonths("2028-03-31", -1)).toBe("2028-02-29");
  });
});

describe("rangeStartDate", () => {
  const today = "2026-10-14";

  it("7 days includes today and the six days before it", () => {
    expect(rangeStartDate("7d", today)).toBe("2026-10-08");
  });

  it("1 month and 1 year start on the same day of the earlier month or year", () => {
    expect(rangeStartDate("1m", today)).toBe("2026-09-14");
    expect(rangeStartDate("1y", today)).toBe("2025-10-14");
  });

  it("all time has no start", () => {
    expect(rangeStartDate("all", today)).toBeNull();
  });
});
