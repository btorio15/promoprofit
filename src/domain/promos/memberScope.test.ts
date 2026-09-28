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
});
