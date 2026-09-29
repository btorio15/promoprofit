import { describe, expect, it } from "vitest";
import { resolveMemberScope } from "./memberScope";
import type { OddsEvent } from "@/domain/odds/schemas";

const NOW = new Date("2026-09-27T12:00:00Z");

function futureEvent(overrides: Partial<OddsEvent> = {}): OddsEvent {
  return {
    id: "nfl-1",
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: "2026-09-27T18:00:00Z",
    home_team: "Denver Broncos",
    away_team: "Los Angeles Rams",
    bookmakers: [],
    ...overrides,
  };
}

describe("resolveMemberScope", () => {
  it("event found and in the future -> ok, scope built from the cached event, event returned", () => {
    const event = futureEvent();
    const result = resolveMemberScope(
      { kind: "event", eventId: "nfl-1" },
      { moneyline: [event], extended: [] },
      NOW,
    );
    expect(result).toEqual({
      status: "ok",
      scope: {
        kind: "event",
        eventId: "nfl-1",
        sportKey: "americanfootball_nfl",
        homeTeam: "Denver Broncos",
        awayTeam: "Los Angeles Rams",
        commenceTime: event.commence_time,
      },
      event,
    });
  });

  it("finds the event in the extended cache too (union of both)", () => {
    const event = futureEvent();
    const result = resolveMemberScope({ kind: "event", eventId: "nfl-1" }, { moneyline: [], extended: [event] }, NOW);
    expect(result.status).toBe("ok");
  });

  it("event missing from the cache -> stale", () => {
    const result = resolveMemberScope({ kind: "event", eventId: "nfl-1" }, { moneyline: [], extended: [] }, NOW);
    expect(result).toEqual({ status: "stale", message: "That game is no longer in the cached odds. Pick another." });
  });

  it("event already started -> stale", () => {
    const event = futureEvent({ commence_time: "2026-09-27T11:00:00Z" });
    const result = resolveMemberScope({ kind: "event", eventId: "nfl-1" }, { moneyline: [event], extended: [] }, NOW);
    expect(result).toEqual({ status: "stale", message: "That game is no longer in the cached odds. Pick another." });
  });

  it("sport_day: a valid future ET date -> ok, sport_window scope, event null", () => {
    const result = resolveMemberScope(
      { kind: "sport_day", sportKey: "americanfootball_nfl", etDate: "2026-09-28" },
      { moneyline: [], extended: [] },
      NOW,
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.scope).toEqual({
      kind: "sport_window",
      sportKey: "americanfootball_nfl",
      windowStart: expect.any(String),
      windowEnd: expect.any(String),
    });
    expect(result.event).toBeNull();
  });

  it("sport_day: an impossible calendar date -> invalid (WR-12)", () => {
    const result = resolveMemberScope(
      { kind: "sport_day", sportKey: "americanfootball_nfl", etDate: "2026-02-31" },
      { moneyline: [], extended: [] },
      NOW,
    );
    expect(result).toEqual({ status: "invalid" });
  });

  it("sport_day: a date whose ET day has already ended -> stale", () => {
    const result = resolveMemberScope(
      { kind: "sport_day", sportKey: "americanfootball_nfl", etDate: "2020-01-01" },
      { moneyline: [], extended: [] },
      NOW,
    );
    expect(result).toEqual({ status: "stale", message: "That day has already passed. Pick another." });
  });

  it("sport_day: a date beyond the correction window -> invalid", () => {
    const result = resolveMemberScope(
      { kind: "sport_day", sportKey: "americanfootball_nfl", etDate: "2099-01-01" },
      { moneyline: [], extended: [] },
      NOW,
    );
    expect(result).toEqual({ status: "invalid" });
  });

  describe("sport_day ranges (etEndDate)", () => {
    const none = { moneyline: [], extended: [] };
    const range = (etDate: string, etEndDate: string) =>
      resolveMemberScope({ kind: "sport_day", sportKey: "icehockey_nhl", etDate, etEndDate }, none, NOW);

    it.each([
      ["2026-09-28", "2026-09-29", "2026-09-28T04:00:00.000Z", "2026-09-30T03:59:59.999Z"],
      // start already over but the end day is still ahead
      ["2026-09-26", "2026-09-28", "2026-09-26T04:00:00.000Z", "2026-09-29T03:59:59.999Z"],
    ])("ok: %s..%s", (start, end, windowStart, windowEnd) => {
      const result = range(start, end);
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.scope).toEqual({ kind: "sport_window", sportKey: "icehockey_nhl", windowStart, windowEnd });
      expect(result.event).toBeNull();
    });

    it.each([
      ["end before start", "2026-09-29", "2026-09-28"],
      ["impossible end", "2026-09-28", "2026-09-31"],
      ["impossible start", "2026-02-31", "2026-09-28"],
      ["end beyond correction window", "2026-09-28", "2026-10-06"],
      ["start beyond correction window", "2026-10-06", "2026-10-07"],
    ])("invalid: %s", (_name, start, end) => {
      expect(range(start, end)).toEqual({ status: "invalid" });
    });

    it("stale when the END day is over", () => {
      expect(range("2026-09-20", "2026-09-25")).toEqual({
        status: "stale",
        message: "Those days have already passed. Pick another.",
      });
    });

    it("etEndDate === etDate behaves exactly like a single day", () => {
      const single = resolveMemberScope(
        { kind: "sport_day", sportKey: "icehockey_nhl", etDate: "2026-09-28" },
        none,
        NOW,
      );
      expect(range("2026-09-28", "2026-09-28")).toEqual(single);
      expect(range("2020-01-01", "2020-01-01")).toEqual({
        status: "stale",
        message: "That day has already passed. Pick another.",
      });
    });
  });
});
