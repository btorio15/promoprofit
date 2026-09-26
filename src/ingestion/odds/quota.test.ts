import { describe, expect, it } from "vitest";
import {
  CONFIRM_WINDOW_MINUTES,
  creditLevel,
  effectiveRemaining,
  estimateRefreshCredits,
  evaluateRefreshGate,
  nextMonthlyReset,
} from "./quota";

describe("creditLevel", () => {
  it.each([
    [null, "unknown"],
    [500, "normal"],
    [100, "normal"],
    [99, "warning"],
    [20, "warning"],
    [19, "blocked"],
  ] as const)("creditLevel(%s) = %s", (remaining, expected) => {
    expect(creditLevel(remaining)).toBe(expected);
  });
});

describe("estimateRefreshCredits", () => {
  it.each([
    [5, 7, 5],
    [3, 7, 3],
    [0, 7, 0],
    [2, 11, 4],
  ])("estimateRefreshCredits(%s, %s) = %s", (sports, books, expected) => {
    expect(estimateRefreshCredits(sports, books)).toBe(expected);
  });
});

describe("market count", () => {
  it("estimateRefreshCredits(4, 7, 3) === 12 === 3 * estimateRefreshCredits(4, 7)", () => {
    expect(estimateRefreshCredits(4, 7, 3)).toBe(12);
    expect(estimateRefreshCredits(4, 7, 3)).toBe(3 * estimateRefreshCredits(4, 7));
  });

  it("estimateRefreshCredits(4, 7) === 4 (default marketCount 1)", () => {
    expect(estimateRefreshCredits(4, 7)).toBe(4);
  });

  it("estimateRefreshCredits(2, 12, 3) === 12 (2 region-groups)", () => {
    expect(estimateRefreshCredits(2, 12, 3)).toBe(12);
  });
});

describe("evaluateRefreshGate", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");

  it("blocks low_credits when remaining is 19, even if confirmed", () => {
    const gate = evaluateRefreshGate({
      remaining: 19,
      lastRefreshAt: null,
      estimatedCredits: 3,
      now,
      confirmed: true,
    });
    expect(gate).toEqual({ action: "block", reason: "low_credits", remaining: 19, estimatedCredits: 3 });
  });

  it("blocks insufficient_credits when remaining is 25 and estimate is 30", () => {
    const gate = evaluateRefreshGate({
      remaining: 25,
      lastRefreshAt: null,
      estimatedCredits: 30,
      now,
      confirmed: false,
    });
    expect(gate).toEqual({
      action: "block",
      reason: "insufficient_credits",
      remaining: 25,
      estimatedCredits: 30,
    });
  });

  it("returns confirm with minutesSinceLastRefresh 10 when last refresh was 10 min ago and not confirmed", () => {
    const lastRefreshAt = new Date(now.getTime() - 10 * 60_000);
    const gate = evaluateRefreshGate({
      remaining: 300,
      lastRefreshAt,
      estimatedCredits: 2,
      now,
      confirmed: false,
    });
    expect(gate).toEqual({ action: "confirm", minutesSinceLastRefresh: 10, estimatedCredits: 2 });
  });

  it("proceeds when confirmed, even within the confirm window", () => {
    const lastRefreshAt = new Date(now.getTime() - 10 * 60_000);
    const gate = evaluateRefreshGate({
      remaining: 300,
      lastRefreshAt,
      estimatedCredits: 2,
      now,
      confirmed: true,
    });
    expect(gate).toEqual({ action: "proceed" });
  });

  it("proceeds at exactly 15 minutes since the last refresh (boundary, not confirmed)", () => {
    const lastRefreshAt = new Date(now.getTime() - CONFIRM_WINDOW_MINUTES * 60_000);
    const gate = evaluateRefreshGate({
      remaining: 300,
      lastRefreshAt,
      estimatedCredits: 2,
      now,
      confirmed: false,
    });
    expect(gate).toEqual({ action: "proceed" });
  });

  it("proceeds when remaining is null (first refresh ever)", () => {
    const gate = evaluateRefreshGate({
      remaining: null,
      lastRefreshAt: null,
      estimatedCredits: 5,
      now,
      confirmed: false,
    });
    expect(gate).toEqual({ action: "proceed" });
  });
});

describe("nextMonthlyReset", () => {
  it("returns the 1st of next month at 00:00:00Z", () => {
    expect(nextMonthlyReset(new Date("2026-09-25T18:00:00.000Z")).toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });

  it("rolls over the year for a December refresh", () => {
    expect(nextMonthlyReset(new Date("2026-12-31T23:59:00.000Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});

describe("effectiveRemaining (CR-01)", () => {
  const row = (recordedAt: string, requestsRemaining = 15) => ({ requestsRemaining, recordedAt: new Date(recordedAt) });

  it("returns null when there is no credit row", () => {
    expect(effectiveRemaining(null, new Date("2026-10-15T00:00:00.000Z"))).toBeNull();
  });

  it("returns the recorded balance when the row is from the current billing month", () => {
    expect(effectiveRemaining(row("2026-10-01T00:00:00.000Z"), new Date("2026-10-31T23:59:59.999Z"))).toBe(15);
  });

  it("returns null when the row predates the monthly reset (last month's balance)", () => {
    expect(effectiveRemaining(row("2026-09-30T23:59:59.999Z"), new Date("2026-10-01T00:00:00.000Z"))).toBeNull();
  });

  it("returns null across a year rollover", () => {
    expect(effectiveRemaining(row("2026-12-31T23:00:00.000Z"), new Date("2027-01-01T01:00:00.000Z"))).toBeNull();
  });

  it("a stale low-credit row no longer blocks the gate", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    const gate = evaluateRefreshGate({
      remaining: effectiveRemaining(row("2026-09-30T12:00:00.000Z", 5), now),
      lastRefreshAt: new Date("2026-09-30T12:00:00.000Z"),
      estimatedCredits: 3,
      now,
      confirmed: false,
    });
    expect(gate).toEqual({ action: "proceed" });
  });
});
