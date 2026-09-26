import { describe, expect, it } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import { SPORT_KEYS } from "@/config/sports";
import { usableOddsBooks } from "@/config/books";
import { extractTwoWaySpreadsAndTotals, isHalfPoint } from "./spreadsTotalsFilter";

const now = new Date("2026-10-01T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const allowedBookKeys = new Set(usableOddsBooks().map((b) => b.key));
const sportKeys = new Set(SPORT_KEYS);
const defaultOpts = { now, windowDays: 7, allowedBookKeys, sportKeys };

function commenceInWindow(): string {
  return new Date(now.getTime() + DAY_MS).toISOString();
}

describe("isHalfPoint", () => {
  it("returns true for half-point lines", () => {
    expect(isHalfPoint(3.5)).toBe(true);
    expect(isHalfPoint(-3.5)).toBe(true);
    expect(isHalfPoint(44.5)).toBe(true);
  });

  it("returns false for whole numbers, zero, undefined, NaN and non-numeric input", () => {
    expect(isHalfPoint(-3)).toBe(false);
    expect(isHalfPoint(44)).toBe(false);
    expect(isHalfPoint(0)).toBe(false);
    expect(isHalfPoint(undefined)).toBe(false);
    expect(isHalfPoint(NaN)).toBe(false);
    expect(isHalfPoint("3.5")).toBe(false);
  });
});

describe("extractTwoWaySpreadsAndTotals — spreads", () => {
  it("groups two books at the same half-point spread into one ArbMarket", () => {
    const event: OddsEvent = {
      id: "spread-match",
      sport_key: "basketball_nba",
      commence_time: commenceInWindow(),
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
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "Home Team", price: -108, point: -3.5 },
                { name: "Away Team", price: -112, point: 3.5 },
              ],
            },
          ],
        },
      ],
    };

    const markets = extractTwoWaySpreadsAndTotals([event], defaultOpts);

    expect(markets).toHaveLength(1);
    const [market] = markets;
    expect(market.marketType).toBe("spread");
    expect(market.line).toBe(-3.5);
    expect(market.sideA.selection).toBe("Away Team");
    expect(market.sideA.point).toBe(3.5);
    expect(market.sideA.quotes).toEqual([
      { bookKey: "draftkings", oddsAmerican: -110 },
      { bookKey: "fanduel", oddsAmerican: -112 },
    ]);
    expect(market.sideB.selection).toBe("Home Team");
    expect(market.sideB.point).toBe(-3.5);
    expect(market.sideB.quotes).toEqual([
      { bookKey: "draftkings", oddsAmerican: -110 },
      { bookKey: "fanduel", oddsAmerican: -108 },
    ]);
  });

  it("keeps a different-magnitude spread as a separate market, never mixed into another line's group", () => {
    const event: OddsEvent = {
      id: "spread-two-lines",
      sport_key: "basketball_nba",
      commence_time: commenceInWindow(),
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
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "Home Team", price: -105, point: -4.5 },
                { name: "Away Team", price: -115, point: 4.5 },
              ],
            },
          ],
        },
      ],
    };

    const markets = extractTwoWaySpreadsAndTotals([event], defaultOpts);
    const lines = markets.filter((m) => m.marketType === "spread").map((m) => m.line);

    expect(lines).toEqual([-4.5, -3.5]);
    const minus45 = markets.find((m) => m.line === -4.5);
    expect(minus45?.sideA.quotes).toEqual([{ bookKey: "fanduel", oddsAmerican: -115 }]);
    expect(minus45?.sideB.quotes).toEqual([{ bookKey: "fanduel", oddsAmerican: -105 }]);
  });

  it("treats a flipped favorite as two separate markets, never pairing Team A +1.5 with Team B +1.5", () => {
    const event: OddsEvent = {
      id: "flipped-favorite",
      sport_key: "basketball_nba",
      commence_time: commenceInWindow(),
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
                { name: "Home Team", price: -110, point: -1.5 },
                { name: "Away Team", price: -110, point: 1.5 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "Home Team", price: -110, point: 1.5 },
                { name: "Away Team", price: -110, point: -1.5 },
              ],
            },
          ],
        },
      ],
    };

    const markets = extractTwoWaySpreadsAndTotals([event], defaultOpts);
    const spreadMarkets = markets.filter((m) => m.marketType === "spread");

    expect(spreadMarkets).toHaveLength(2);
    const lines = spreadMarkets.map((m) => m.line).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(lines).toEqual([-1.5, 1.5]);

    const minus15 = spreadMarkets.find((m) => m.line === -1.5);
    expect(minus15?.sideA.quotes).toEqual([{ bookKey: "draftkings", oddsAmerican: -110 }]);
    const plus15 = spreadMarkets.find((m) => m.line === 1.5);
    expect(plus15?.sideA.quotes).toEqual([{ bookKey: "fanduel", oddsAmerican: -110 }]);
  });

  it("excludes a whole-number spread line entirely", () => {
    const event: OddsEvent = {
      id: "whole-number-spread",
      sport_key: "basketball_nba",
      commence_time: commenceInWindow(),
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
                { name: "Home Team", price: -110, point: -3 },
                { name: "Away Team", price: -110, point: 3 },
              ],
            },
          ],
        },
      ],
    };

    const markets = extractTwoWaySpreadsAndTotals([event], defaultOpts);
    expect(markets).toHaveLength(0);
  });

  it("skips a bookmaker whose spread outcome names don't match home_team/away_team, or whose points aren't exact negatives", () => {
    const event: OddsEvent = {
      id: "spread-invalid-bookmakers",
      sport_key: "basketball_nba",
      commence_time: commenceInWindow(),
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
                { name: "Wrong Name", price: -110, point: -3.5 },
                { name: "Away Team", price: -110, point: 3.5 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "Home Team", price: -110, point: -3.5 },
                { name: "Away Team", price: -110, point: 4.5 },
              ],
            },
          ],
        },
        {
          key: "betmgm",
          title: "BetMGM",
          markets: [
            {
              key: "spreads",
              outcomes: [{ name: "Home Team", price: -110, point: -3.5 }],
            },
          ],
        },
        {
          key: "hardrockbet",
          title: "Hard Rock Bet",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "Home Team", price: -110, point: undefined },
                { name: "Away Team", price: -110, point: 3.5 },
              ],
            },
          ],
        },
      ],
    };

    const markets = extractTwoWaySpreadsAndTotals([event], defaultOpts);
    expect(markets).toHaveLength(0);
  });
});

describe("extractTwoWaySpreadsAndTotals — totals", () => {
  it("groups Over/Under at the same half-point total into one ArbMarket", () => {
    const event: OddsEvent = {
      id: "total-match",
      sport_key: "basketball_nba",
      commence_time: commenceInWindow(),
      home_team: "Home Team",
      away_team: "Away Team",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "totals",
              outcomes: [
                { name: "Over", price: -110, point: 44.5 },
                { name: "Under", price: -110, point: 44.5 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
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
    };

    const markets = extractTwoWaySpreadsAndTotals([event], defaultOpts);

    expect(markets).toHaveLength(1);
    const [market] = markets;
    expect(market.marketType).toBe("total");
    expect(market.line).toBe(44.5);
    expect(market.tieRisk).toBe(false);
    expect(market.sideA.selection).toBe("Over");
    expect(market.sideA.quotes).toEqual([
      { bookKey: "draftkings", oddsAmerican: -110 },
      { bookKey: "fanduel", oddsAmerican: -105 },
    ]);
    expect(market.sideB.selection).toBe("Under");
    expect(market.sideB.quotes).toEqual([
      { bookKey: "draftkings", oddsAmerican: -110 },
      { bookKey: "fanduel", oddsAmerican: -115 },
    ]);
  });

  it("excludes a whole-number total line entirely", () => {
    const event: OddsEvent = {
      id: "whole-number-total",
      sport_key: "basketball_nba",
      commence_time: commenceInWindow(),
      home_team: "Home Team",
      away_team: "Away Team",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "totals",
              outcomes: [
                { name: "Over", price: -110, point: 44 },
                { name: "Under", price: -110, point: 44 },
              ],
            },
          ],
        },
      ],
    };

    const markets = extractTwoWaySpreadsAndTotals([event], defaultOpts);
    expect(markets).toHaveLength(0);
  });

  it("contributes nothing from a book whose Over and Under points differ", () => {
    const event: OddsEvent = {
      id: "total-mismatched-points",
      sport_key: "basketball_nba",
      commence_time: commenceInWindow(),
      home_team: "Home Team",
      away_team: "Away Team",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "totals",
              outcomes: [
                { name: "Over", price: -110, point: 44.5 },
                { name: "Under", price: -110, point: 45.5 },
              ],
            },
          ],
        },
      ],
    };

    const markets = extractTwoWaySpreadsAndTotals([event], defaultOpts);
    expect(markets).toHaveLength(0);
  });
});

describe("extractTwoWaySpreadsAndTotals — shared filtering", () => {
  it("applies the same sportKeys, allowedBookKeys and commence-time window filtering as extractTwoWayMoneylines", () => {
    const inWindowEvent: OddsEvent = {
      id: "in-window",
      sport_key: "basketball_nba",
      commence_time: commenceInWindow(),
      home_team: "Home Team",
      away_team: "Away Team",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "totals",
              outcomes: [
                { name: "Over", price: -110, point: 44.5 },
                { name: "Under", price: -110, point: 44.5 },
              ],
            },
          ],
        },
        {
          key: "williamhill_us",
          title: "Caesars",
          markets: [
            {
              key: "totals",
              outcomes: [
                { name: "Over", price: -108, point: 44.5 },
                { name: "Under", price: -112, point: 44.5 },
              ],
            },
          ],
        },
      ],
    };

    const outOfWindowEvent: OddsEvent = {
      ...inWindowEvent,
      id: "out-of-window",
      commence_time: new Date(now.getTime() + 9 * DAY_MS).toISOString(),
    };

    const wrongSportEvent: OddsEvent = {
      ...inWindowEvent,
      id: "wrong-sport",
      sport_key: "not_a_tracked_sport",
    };

    const markets = extractTwoWaySpreadsAndTotals(
      [inWindowEvent, outOfWindowEvent, wrongSportEvent],
      defaultOpts,
    );

    expect(markets).toHaveLength(1);
    expect(markets[0].eventId).toBe("in-window");
    // williamhill_us (Caesars) is outside the free-tier allowedBookKeys.
    expect(markets[0].sideA.quotes.map((q) => q.bookKey)).toEqual(["draftkings"]);
  });
});
