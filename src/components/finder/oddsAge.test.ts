import { describe, expect, it } from "vitest";
import { describeExtendedOddsAge, describeOddsAge, STALE_AFTER_MINUTES, withAttribution } from "./oddsAge";

const NOW = new Date("2026-10-01T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

describe("describeOddsAge", () => {
  it("returns the not-fetched-yet label when fetchedAt is null", () => {
    expect(describeOddsAge(null, NOW)).toEqual({
      minutes: null,
      stale: false,
      label: "Odds not fetched yet",
    });
  });

  it("labels a fresh fetch as 'Odds updated N min ago' and not stale", () => {
    const result = describeOddsAge(minutesAgo(42), NOW);
    expect(result.label).toBe("Odds updated 42 min ago");
    expect(result.minutes).toBe(42);
    expect(result.stale).toBe(false);
  });

  it("floors a sub-minute age to 0 min ago", () => {
    const result = describeOddsAge(minutesAgo(0.5), NOW);
    expect(result.label).toBe("Odds updated 0 min ago");
    expect(result.minutes).toBe(0);
  });

  it("is not stale at exactly STALE_AFTER_MINUTES (120 min)", () => {
    expect(STALE_AFTER_MINUTES).toBe(120);
    const result = describeOddsAge(minutesAgo(120), NOW);
    expect(result.stale).toBe(false);
  });

  it("is stale one minute past STALE_AFTER_MINUTES (121 min)", () => {
    const result = describeOddsAge(minutesAgo(121), NOW);
    expect(result.stale).toBe(true);
    expect(result.label).toBe("Odds updated 121 min ago");
  });
});

describe("describeExtendedOddsAge", () => {
  it("returns the not-fetched-yet label when fetchedAt is null", () => {
    expect(describeExtendedOddsAge(null, NOW)).toEqual({
      minutes: null,
      stale: false,
      label: "Spreads & totals not fetched yet — press Search spreads & totals to include them",
    });
  });

  it("labels a fresh fetch as 'Spreads & totals updated N min ago' and not stale", () => {
    const result = describeExtendedOddsAge(minutesAgo(42), NOW);
    expect(result).toEqual({
      minutes: 42,
      stale: false,
      label: "Spreads & totals updated 42 min ago",
    });
  });

  it("is not stale at exactly STALE_AFTER_MINUTES (120 min)", () => {
    const result = describeExtendedOddsAge(minutesAgo(120), NOW);
    expect(result.stale).toBe(false);
  });

  it("is stale one minute past STALE_AFTER_MINUTES (121 min)", () => {
    const result = describeExtendedOddsAge(minutesAgo(121), NOW);
    expect(result.stale).toBe(true);
    expect(result.label).toBe("Spreads & totals updated 121 min ago");
  });
});

describe("withAttribution", () => {
  it("appends ' · Refreshed by {name}' when a display name is given", () => {
    expect(withAttribution("Odds updated 5 min ago", "Refreshed by", "Mike")).toBe(
      "Odds updated 5 min ago · Refreshed by Mike",
    );
  });

  it("appends ' · Searched by {name}' when a display name is given", () => {
    expect(withAttribution("Spreads & totals updated 5 min ago", "Searched by", "Sue")).toBe(
      "Spreads & totals updated 5 min ago · Searched by Sue",
    );
  });

  it("returns the label unchanged (no placeholder) when the display name is null", () => {
    const label = "Odds updated 5 min ago";
    expect(withAttribution(label, "Searched by", null)).toBe(label);
  });
});
