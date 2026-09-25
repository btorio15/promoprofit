import { describe, expect, it } from "vitest";
import { describeOddsAge, STALE_AFTER_MINUTES } from "./oddsAge";

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
