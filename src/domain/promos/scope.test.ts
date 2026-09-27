import { describe, expect, it } from "vitest";
import { ScopeGuessSchema, eventInScope, scopeFromGuess, type ScopeGuess } from "./scope";

const validEventGuess: ScopeGuess = {
  kind: "event",
  eventId: "nfl-rams-broncos",
  sportKey: "americanfootball_nfl",
  homeTeam: "Denver Broncos",
  awayTeam: "LA Rams",
  commenceTime: "2026-09-27T00:00:00Z",
};

const validSportWindowGuess: ScopeGuess = {
  kind: "sport_window",
  sportKey: "americanfootball_nfl",
  windowStart: "2026-09-27T00:00:00Z",
  windowEnd: "2026-09-27T23:59:59Z",
};

describe("ScopeGuessSchema", () => {
  it("accepts a valid event guess", () => {
    const result = ScopeGuessSchema.safeParse(validEventGuess);
    expect(result.success).toBe(true);
  });

  it("accepts a valid sport_window guess", () => {
    const result = ScopeGuessSchema.safeParse(validSportWindowGuess);
    expect(result.success).toBe(true);
  });

  it("rejects a sportKey not in SPORT_KEYS", () => {
    const result = ScopeGuessSchema.safeParse({
      ...validSportWindowGuess,
      sportKey: "hockey_nhl",
    });
    expect(result.success).toBe(false);
  });

  it("rejects windowStart >= windowEnd", () => {
    const result = ScopeGuessSchema.safeParse({
      ...validSportWindowGuess,
      windowStart: "2026-09-27T23:59:59Z",
      windowEnd: "2026-09-27T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects windowStart === windowEnd", () => {
    const result = ScopeGuessSchema.safeParse({
      ...validSportWindowGuess,
      windowStart: "2026-09-27T12:00:00Z",
      windowEnd: "2026-09-27T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an extra key (strict)", () => {
    const result = ScopeGuessSchema.safeParse({
      ...validEventGuess,
      extraField: "not allowed",
    });
    expect(result.success).toBe(false);
  });
});

describe("eventInScope", () => {
  it("event scope: true when ev.id matches scope.eventId", () => {
    const scope = scopeFromGuess(validEventGuess);
    expect(
      eventInScope(
        { id: "nfl-rams-broncos", sport_key: "americanfootball_nfl", commence_time: "2026-09-27T00:00:00Z" },
        scope,
      ),
    ).toBe(true);
  });

  it("event scope: false when ev.id differs", () => {
    const scope = scopeFromGuess(validEventGuess);
    expect(
      eventInScope(
        { id: "some-other-event", sport_key: "americanfootball_nfl", commence_time: "2026-09-27T00:00:00Z" },
        scope,
      ),
    ).toBe(false);
  });

  it("sport_window scope: true for an event of the same sport inside the window", () => {
    const scope = scopeFromGuess(validSportWindowGuess);
    expect(
      eventInScope(
        { id: "evt-1", sport_key: "americanfootball_nfl", commence_time: "2026-09-27T12:00:00Z" },
        scope,
      ),
    ).toBe(true);
  });

  it("sport_window scope: true exactly at the windowStart boundary", () => {
    const scope = scopeFromGuess(validSportWindowGuess);
    expect(
      eventInScope(
        { id: "evt-1", sport_key: "americanfootball_nfl", commence_time: "2026-09-27T00:00:00Z" },
        scope,
      ),
    ).toBe(true);
  });

  it("sport_window scope: true exactly at the windowEnd boundary", () => {
    const scope = scopeFromGuess(validSportWindowGuess);
    expect(
      eventInScope(
        { id: "evt-1", sport_key: "americanfootball_nfl", commence_time: "2026-09-27T23:59:59Z" },
        scope,
      ),
    ).toBe(true);
  });

  it("sport_window scope: false for an event outside the window", () => {
    const scope = scopeFromGuess(validSportWindowGuess);
    expect(
      eventInScope(
        { id: "evt-1", sport_key: "americanfootball_nfl", commence_time: "2026-09-28T00:00:01Z" },
        scope,
      ),
    ).toBe(false);
  });

  it("sport_window scope: false for a different sport inside the window", () => {
    const scope = scopeFromGuess(validSportWindowGuess);
    expect(
      eventInScope(
        { id: "evt-1", sport_key: "americanfootball_ncaaf", commence_time: "2026-09-27T12:00:00Z" },
        scope,
      ),
    ).toBe(false);
  });
});
