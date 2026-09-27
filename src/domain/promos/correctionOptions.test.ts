import { describe, expect, it } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import { formatKickoff } from "@/lib/format";
import { listCorrectionOptions } from "./correctionOptions";
import { etDayLabel } from "./etTime";

const NOW = new Date("2026-09-27T00:00:00Z");

function plusHours(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function minusHours(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function plusDays(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** NFL event, 2-way h2h + half-point spread (home -3.5) + half-point total (44.5), same fixture shape as selection.test.ts. */
function fullEvent(overrides: Partial<OddsEvent> = {}): OddsEvent {
  return {
    id: "nfl-rams-broncos",
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: plusHours(24),
    home_team: "DEN Broncos",
    away_team: "LA Rams",
    bookmakers: [
      {
        key: "fanduel",
        title: "FanDuel",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "LA Rams", price: 150 },
              { name: "DEN Broncos", price: -180 },
            ],
          },
          {
            key: "spreads",
            outcomes: [
              { name: "LA Rams", price: -110, point: 3.5 },
              { name: "DEN Broncos", price: -110, point: -3.5 },
            ],
          },
          {
            key: "totals",
            outcomes: [
              { name: "Over", price: -105, point: 44.5 },
              { name: "Under", price: -115, point: 44.5 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

/** Same shape as fullEvent but with whole-number spread/total lines (CALC-05 excludes these). */
function wholeNumberLinesEvent(overrides: Partial<OddsEvent> = {}): OddsEvent {
  return fullEvent({
    id: "nfl-whole-lines",
    bookmakers: [
      {
        key: "fanduel",
        title: "FanDuel",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "LA Rams", price: 150 },
              { name: "DEN Broncos", price: -180 },
            ],
          },
          {
            key: "spreads",
            outcomes: [
              { name: "LA Rams", price: -110, point: 3 },
              { name: "DEN Broncos", price: -110, point: -3 },
            ],
          },
          {
            key: "totals",
            outcomes: [
              { name: "Over", price: -105, point: 44 },
              { name: "Under", price: -115, point: 44 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  });
}

describe("listCorrectionOptions (D-14, T-03-09-06)", () => {
  it("builds best-first market options for a full 2-way event, sourced only from the cache", () => {
    const event = fullEvent();
    const result = listCorrectionOptions({ moneyline: [event], extended: [event] }, { now: NOW });

    expect(result.events).toHaveLength(1);
    const eventOption = result.events[0];
    expect(eventOption.eventId).toBe(event.id);
    expect(eventOption.sportKey).toBe("americanfootball_nfl");
    expect(eventOption.sportLabel).toBe("NFL");
    expect(eventOption.label).toBe(`LA Rams @ DEN Broncos · ${formatKickoff(event.commence_time)}`);

    expect(eventOption.markets.map((m) => m.label)).toEqual([
      "Best available (app picks)",
      "Moneyline — DEN Broncos",
      "Moneyline — LA Rams",
      "Spread −3.5 — DEN Broncos",
      "Spread +3.5 — LA Rams",
      "Total O/U 44.5 — Over",
      "Total O/U 44.5 — Under",
    ]);

    expect(eventOption.markets[0]).toEqual({
      value: "best",
      label: "Best available (app picks)",
      pinned: null,
    });
    expect(eventOption.markets[1]).toEqual({
      value: "moneyline|ml|home",
      label: "Moneyline — DEN Broncos",
      pinned: { marketType: "moneyline", line: null, side: "home" },
    });
    expect(eventOption.markets[3]).toEqual({
      value: "spread|-3.5|home",
      label: "Spread −3.5 — DEN Broncos",
      pinned: { marketType: "spread", line: -3.5, side: "home" },
    });
    expect(eventOption.markets[6]).toEqual({
      value: "total|44.5|under",
      label: "Total O/U 44.5 — Under",
      pinned: { marketType: "total", line: 44.5, side: "under" },
    });
  });

  it("excludes whole-number spread/total lines, keeping moneyline (CALC-05)", () => {
    const event = wholeNumberLinesEvent();
    const result = listCorrectionOptions({ moneyline: [event], extended: [event] }, { now: NOW });

    expect(result.events).toHaveLength(1);
    expect(result.events[0].markets.map((m) => m.label)).toEqual([
      "Best available (app picks)",
      "Moneyline — DEN Broncos",
      "Moneyline — LA Rams",
    ]);
  });

  it("excludes a game that has already started", () => {
    const event = fullEvent({ id: "started", commence_time: minusHours(1) });
    const result = listCorrectionOptions({ moneyline: [event], extended: [event] }, { now: NOW });

    expect(result.events).toEqual([]);
  });

  it("excludes a game more than 7 days out, includes one exactly at the boundary", () => {
    const tooFar = fullEvent({ id: "too-far", commence_time: plusDays(7.01) });
    const atBoundary = fullEvent({ id: "at-boundary", commence_time: plusDays(7) });
    const result = listCorrectionOptions(
      { moneyline: [tooFar, atBoundary], extended: [tooFar, atBoundary] },
      { now: NOW },
    );

    expect(result.events.map((e) => e.eventId)).toEqual(["at-boundary"]);
  });

  it("excludes events for sports outside SPORT_KEYS", () => {
    const event = fullEvent({ id: "unsupported", sport_key: "icehockey_nhl" });
    const result = listCorrectionOptions({ moneyline: [event], extended: [event] }, { now: NOW });

    expect(result.events).toEqual([]);
  });

  it("dedupes an event present in both the moneyline and extended caches", () => {
    const event = fullEvent();
    const result = listCorrectionOptions({ moneyline: [event], extended: [event] }, { now: NOW });

    expect(result.events).toHaveLength(1);
  });

  it("sorts events by SPORTS order then commence time", () => {
    const laterNfl = fullEvent({ id: "nfl-later", commence_time: plusHours(48) });
    const earlierNfl = fullEvent({ id: "nfl-earlier", commence_time: plusHours(6) });
    const nba = fullEvent({
      id: "nba-1",
      sport_key: "basketball_nba",
      sport_title: "NBA",
      commence_time: plusHours(3),
    });
    const result = listCorrectionOptions(
      { moneyline: [laterNfl, nba, earlierNfl], extended: [laterNfl, nba, earlierNfl] },
      { now: NOW },
    );

    // NFL sorts before NBA (SPORTS order), and within NFL earlier commence first.
    expect(result.events.map((e) => e.eventId)).toEqual(["nfl-earlier", "nfl-later", "nba-1"]);
  });

  it("builds one sportDay option per (sport, ET day) with at least one not-started game, ordered by SPORTS order then date", () => {
    const nflDay1A = fullEvent({ id: "nfl-day1-a", commence_time: plusHours(6) });
    const nflDay1B = fullEvent({ id: "nfl-day1-b", commence_time: plusHours(9) });
    const nflDay2 = fullEvent({ id: "nfl-day2", commence_time: plusHours(30) });
    const nba = fullEvent({
      id: "nba-1",
      sport_key: "basketball_nba",
      sport_title: "NBA",
      commence_time: plusHours(6),
    });

    const result = listCorrectionOptions(
      { moneyline: [nflDay1A, nflDay1B, nflDay2, nba], extended: [nflDay1A, nflDay1B, nflDay2, nba] },
      { now: NOW },
    );

    expect(result.sportDays).toHaveLength(3);
    expect(result.sportDays.map((d) => d.sportKey)).toEqual([
      "americanfootball_nfl",
      "americanfootball_nfl",
      "basketball_nba",
    ]);
    expect(result.sportDays[0]).toEqual({
      value: `americanfootball_nfl|${result.sportDays[0].etDate}`,
      sportKey: "americanfootball_nfl",
      sportLabel: "NFL",
      etDate: result.sportDays[0].etDate,
      label: `Any NFL game · ${etDayLabel(nflDay1A.commence_time)} (ET)`,
    });
    expect(result.sportDays[2].label).toBe(`Any NBA game · ${etDayLabel(nba.commence_time)} (ET)`);
  });

  it("returns empty lists when there are no cached events at all", () => {
    const result = listCorrectionOptions({ moneyline: [], extended: [] }, { now: NOW });

    expect(result).toEqual({ events: [], sportDays: [] });
  });
});
