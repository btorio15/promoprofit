import { describe, expect, it } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import { SPORT_KEYS } from "@/config/sports";
import { usableOddsBooks } from "@/config/books";
import { buildFixtureEvents } from "@/test/fixtures/oddsEvents";
import { extractTwoWayMoneylines } from "./marketFilter";

const now = new Date("2026-10-01T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const allowedBookKeys = new Set(usableOddsBooks().map((b) => b.key));
const sportKeys = new Set(SPORT_KEYS);
const defaultOpts = { now, windowDays: 7, allowedBookKeys, sportKeys };

describe("extractTwoWayMoneylines", () => {
  it("keeps in-window two-way moneylines and drops the out-of-window event", () => {
    const markets = extractTwoWayMoneylines(buildFixtureEvents(now), defaultOpts);
    const eventIds = markets.map((m) => m.eventId);

    expect(eventIds).toContain("nba-nuggets-jazz");
    expect(eventIds).toContain("mlb-dodgers-rockies");
    expect(eventIds).toContain("nfl-packers-panthers");
    expect(eventIds).toContain("nba-lakers-warriors");
    // (d) is 9 days out — outside the 7-day window (D-03).
    expect(eventIds).not.toContain("nba-celtics-heat");
  });

  it("drops a bookmaker's market that has a 3rd outcome, keeps other books' quotes for that event", () => {
    const markets = extractTwoWayMoneylines(buildFixtureEvents(now), defaultOpts);
    const lakersWarriors = markets.find((m) => m.eventId === "nba-lakers-warriors");

    expect(lakersWarriors).toBeDefined();
    expect(new Set(lakersWarriors?.quotes.map((q) => q.bookKey))).toEqual(new Set(["fanduel"]));
  });

  it("excludes an event that has already started", () => {
    const startedEvent: OddsEvent = {
      id: "already-started",
      sport_key: "basketball_nba",
      commence_time: new Date(now.getTime() - 60_000).toISOString(),
      home_team: "Home Team",
      away_team: "Away Team",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Home Team", price: -150 },
                { name: "Away Team", price: 130 },
              ],
            },
          ],
        },
      ],
    };

    const markets = extractTwoWayMoneylines([startedEvent], defaultOpts);
    expect(markets.find((m) => m.eventId === "already-started")).toBeUndefined();
  });

  it("drops a bookmaker whose h2h outcome names don't match home_team/away_team exactly", () => {
    const mismatchedEvent: OddsEvent = {
      id: "name-mismatch",
      sport_key: "basketball_nba",
      commence_time: new Date(now.getTime() + DAY_MS).toISOString(),
      home_team: "Los Angeles Rams",
      away_team: "San Francisco 49ers",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                // "LA Rams" does not match home_team "Los Angeles Rams" exactly.
                { name: "LA Rams", price: -150 },
                { name: "San Francisco 49ers", price: 130 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Los Angeles Rams", price: -145 },
                { name: "San Francisco 49ers", price: 125 },
              ],
            },
          ],
        },
      ],
    };

    const markets = extractTwoWayMoneylines([mismatchedEvent], defaultOpts);
    const market = markets.find((m) => m.eventId === "name-mismatch");
    expect(new Set(market?.quotes.map((q) => q.bookKey))).toEqual(new Set(["fanduel"]));
  });

  it("ignores non-h2h markets (spreads/totals)", () => {
    const spreadsOnlyEvent: OddsEvent = {
      id: "spreads-only",
      sport_key: "basketball_nba",
      commence_time: new Date(now.getTime() + DAY_MS).toISOString(),
      home_team: "Home Team",
      away_team: "Away Team",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "Home Team", price: -110, point: -3.5 },
                { name: "Away Team", price: -110, point: 3.5 },
              ],
            },
          ],
        },
      ],
    };

    const markets = extractTwoWayMoneylines([spreadsOnlyEvent], defaultOpts);
    expect(markets.find((m) => m.eventId === "spreads-only")).toBeUndefined();
  });

  it("ignores books outside allowedBookKeys, including paid-tier williamhill_us", () => {
    const events = buildFixtureEvents(now);
    const dodgersRockies = events.find((e) => e.id === "mlb-dodgers-rockies");
    expect(dodgersRockies).toBeDefined();
    const withCaesars: OddsEvent = {
      ...dodgersRockies!,
      bookmakers: [
        ...dodgersRockies!.bookmakers,
        {
          key: "williamhill_us",
          title: "Caesars",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Colorado Rockies", price: 295 },
                { name: "Los Angeles Dodgers", price: -305 },
              ],
            },
          ],
        },
      ],
    };

    const restrictedOpts = { ...defaultOpts, allowedBookKeys: new Set(["draftkings"]) };
    const markets = extractTwoWayMoneylines([withCaesars], restrictedOpts);
    const market = markets.find((m) => m.eventId === "mlb-dodgers-rockies");
    expect(new Set(market?.quotes.map((q) => q.bookKey))).toEqual(new Set(["draftkings"]));
  });

  it("excludes sports outside sportKeys", () => {
    const restrictedOpts = { ...defaultOpts, sportKeys: new Set(["basketball_nba"]) };
    const markets = extractTwoWayMoneylines(buildFixtureEvents(now), restrictedOpts);
    const sportKeysFound = new Set(markets.map((m) => m.sportKey));

    expect(sportKeysFound.has("baseball_mlb")).toBe(false);
    expect(sportKeysFound.has("americanfootball_nfl")).toBe(false);
    expect(sportKeysFound.has("basketball_nba")).toBe(true);
  });

  it("flags tieRisk true for NFL markets and false for other sports", () => {
    const markets = extractTwoWayMoneylines(buildFixtureEvents(now), defaultOpts);
    const nfl = markets.find((m) => m.sportKey === "americanfootball_nfl");
    const nba = markets.find((m) => m.sportKey === "basketball_nba");
    const mlb = markets.find((m) => m.sportKey === "baseball_mlb");

    expect(nfl?.tieRisk).toBe(true);
    expect(nba?.tieRisk).toBe(false);
    expect(mlb?.tieRisk).toBe(false);
  });
});
