import { describe, expect, it } from "vitest";
import { formatAmerican, formatKickoff, formatPct, formatUsd } from "./format";

describe("formatUsd", () => {
  it.each([
    ["220.00", "$220.00"],
    ["1234.5", "$1,234.50"],
    ["0.00", "$0.00"],
    ["108.75", "$108.75"],
    ["1000000.00", "$1,000,000.00"],
  ])("formatUsd(%s) = %s", (input, expected) => {
    expect(formatUsd(input)).toBe(expected);
  });
});

describe("formatAmerican", () => {
  it("formats positive odds with a plus sign", () => {
    expect(formatAmerican(300)).toBe("+300");
  });

  it("formats negative odds with a U+2212 minus sign", () => {
    expect(formatAmerican(-275)).toBe("−275");
  });
});

describe("formatPct", () => {
  it("appends a percent sign to a 2-dp string", () => {
    expect(formatPct("80.00")).toBe("80.00%");
  });
});

describe("formatKickoff", () => {
  it("formats an ISO timestamp in America/Denver time", () => {
    expect(formatKickoff("2026-09-27T17:00:00Z")).toBe("Sun 11:00 AM");
  });
});
