import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  findBestArbPair,
  moneylineToArbMarket,
  rankArbs,
  type ArbMarket,
  type ArbSideQuote,
} from "./rankArbs";
import type { TwoWayMoneylineMarket } from "./marketFilter";

const now = new Date("2026-10-01T12:00:00.000Z");

function market(overrides: Partial<ArbMarket> & { sideAQuotes: ArbSideQuote[]; sideBQuotes: ArbSideQuote[] }): ArbMarket {
  const { sideAQuotes, sideBQuotes, ...rest } = overrides;
  return {
    eventId: "event-1",
    sportKey: "basketball_nba",
    commenceTime: now,
    homeTeam: "Home",
    awayTeam: "Away",
    marketType: "moneyline",
    line: null,
    tieRisk: false,
    sideA: { selection: "Away", point: null, quotes: sideAQuotes },
    sideB: { selection: "Home", point: null, quotes: sideBQuotes },
    ...rest,
  };
}

describe("different books", () => {
  it("chooses draftkings/betmgm over any same-book pair, never draftkings with draftkings", () => {
    const pair = findBestArbPair(
      [
        { bookKey: "draftkings", oddsAmerican: 130 },
        { bookKey: "fanduel", oddsAmerican: 110 },
      ],
      [
        { bookKey: "draftkings", oddsAmerican: -105 },
        { bookKey: "betmgm", oddsAmerican: -120 },
      ],
    );

    expect(pair).not.toBeNull();
    expect(pair!.sideA.bookKey).toBe("draftkings");
    expect(pair!.sideB.bookKey).toBe("betmgm");
    expect(pair!.sideA.bookKey).not.toBe(pair!.sideB.bookKey);
  });

  it("yields no row when only one book quotes both sides", () => {
    const pair = findBestArbPair(
      [{ bookKey: "draftkings", oddsAmerican: 130 }],
      [{ bookKey: "draftkings", oddsAmerican: -120 }],
    );

    expect(pair).toBeNull();
  });
});

describe("tied books", () => {
  it("breaks an equal implied-sum tie alphabetically and lists exact-tie books, excluding near prices", () => {
    const pair = findBestArbPair(
      [
        { bookKey: "draftkings", oddsAmerican: 130 },
        { bookKey: "fanduel", oddsAmerican: 130 },
      ],
      [{ bookKey: "betmgm", oddsAmerican: -120 }],
    );

    expect(pair).not.toBeNull();
    expect(pair!.sideA.bookKey).toBe("draftkings");
    expect(pair!.tiedBooksA).toEqual(["fanduel"]);
    expect(pair!.tiedBooksB).toEqual([]);
  });

  it("never lists a near (non-exact) price as tied", () => {
    const pair = findBestArbPair(
      [
        { bookKey: "draftkings", oddsAmerican: 130 },
        { bookKey: "fanduel", oddsAmerican: 129 },
      ],
      [{ bookKey: "betmgm", oddsAmerican: -120 }],
    );

    expect(pair).not.toBeNull();
    expect(pair!.sideA.bookKey).toBe("draftkings");
    expect(pair!.tiedBooksA).toEqual([]);
  });
});

describe("moneylineToArbMarket", () => {
  it("maps away quotes to sideA and home quotes to sideB, carrying tieRisk", () => {
    const moneylineMarket: TwoWayMoneylineMarket = {
      eventId: "nfl-1",
      sportKey: "americanfootball_nfl",
      commenceTime: now,
      homeTeam: "Home Team",
      awayTeam: "Away Team",
      tieRisk: true,
      quotes: [
        { bookKey: "draftkings", outcome: "away", team: "Away Team", oddsAmerican: 130 },
        { bookKey: "draftkings", outcome: "home", team: "Home Team", oddsAmerican: -150 },
        { bookKey: "fanduel", outcome: "away", team: "Away Team", oddsAmerican: 125 },
        { bookKey: "fanduel", outcome: "home", team: "Home Team", oddsAmerican: -145 },
      ],
    };

    const arbMarket = moneylineToArbMarket(moneylineMarket);

    expect(arbMarket.marketType).toBe("moneyline");
    expect(arbMarket.line).toBeNull();
    expect(arbMarket.tieRisk).toBe(true);
    expect(arbMarket.sideA.selection).toBe("Away Team");
    expect(arbMarket.sideA.point).toBeNull();
    expect(arbMarket.sideA.quotes).toEqual([
      { bookKey: "draftkings", oddsAmerican: 130 },
      { bookKey: "fanduel", oddsAmerican: 125 },
    ]);
    expect(arbMarket.sideB.selection).toBe("Home Team");
    expect(arbMarket.sideB.quotes).toEqual([
      { bookKey: "draftkings", oddsAmerican: -150 },
      { bookKey: "fanduel", oddsAmerican: -145 },
    ]);
  });
});

describe("rankArbs", () => {
  const opts = { totalStake: new Decimal(200), precision: "whole" as const };

  it("drops markets with no true arb", () => {
    const noArbMarket = market({
      eventId: "no-arb",
      sideAQuotes: [{ bookKey: "draftkings", oddsAmerican: 100 }],
      sideBQuotes: [{ bookKey: "fanduel", oddsAmerican: -105 }],
    });

    const results = rankArbs([noArbMarket], opts);
    expect(results).toHaveLength(0);
  });

  it("emits one ArbOpportunity per market with the expected rowKey", () => {
    const arbMarket = market({
      eventId: "event-a",
      marketType: "spread",
      line: -3.5,
      sideAQuotes: [{ bookKey: "draftkings", oddsAmerican: 120 }],
      sideBQuotes: [{ bookKey: "fanduel", oddsAmerican: -105 }],
    });

    const results = rankArbs([arbMarket], opts);
    expect(results).toHaveLength(1);
    expect(results[0].rowKey).toBe("event-a:spread:-3.5");
    expect(results[0].sideA.bookKey).toBe("draftkings");
    expect(results[0].sideB.bookKey).toBe("fanduel");
  });

  it("uses 'ml' as the line placeholder for moneyline rowKeys", () => {
    const arbMarket = market({
      eventId: "event-b",
      marketType: "moneyline",
      line: null,
      sideAQuotes: [{ bookKey: "draftkings", oddsAmerican: 120 }],
      sideBQuotes: [{ bookKey: "fanduel", oddsAmerican: -105 }],
    });

    const results = rankArbs([arbMarket], opts);
    expect(results[0].rowKey).toBe("event-b:moneyline:ml");
  });

  it("sorts by returnPct desc, then commenceTime asc, then rowKey asc, with no result limit", () => {
    // Higher return %: +150/-105 -> a bigger edge than +120/-105.
    const highReturn = market({
      eventId: "high-return",
      commenceTime: new Date(now.getTime() + 2 * 3_600_000),
      sideAQuotes: [{ bookKey: "draftkings", oddsAmerican: 150 }],
      sideBQuotes: [{ bookKey: "fanduel", oddsAmerican: -105 }],
    });
    // Two markets tied on returnPct, ordered by commenceTime.
    const tiedEarlier = market({
      eventId: "tied-earlier",
      commenceTime: new Date(now.getTime() + 3_600_000),
      sideAQuotes: [{ bookKey: "draftkings", oddsAmerican: 120 }],
      sideBQuotes: [{ bookKey: "fanduel", oddsAmerican: -105 }],
    });
    const tiedLater = market({
      eventId: "tied-later",
      commenceTime: new Date(now.getTime() + 4 * 3_600_000),
      sideAQuotes: [{ bookKey: "draftkings", oddsAmerican: 120 }],
      sideBQuotes: [{ bookKey: "fanduel", oddsAmerican: -105 }],
    });

    const results = rankArbs([tiedLater, highReturn, tiedEarlier], opts);

    expect(results.map((r) => r.eventId)).toEqual(["high-return", "tied-earlier", "tied-later"]);
    expect(results).toHaveLength(3);
  });
});
