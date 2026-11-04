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

describe("book-vs-market arbs", () => {
  const opts = { totalStake: new Decimal(200), precision: "whole" as const };
  // Kalshi YES at 44c is American +127 (100 / 2.27 = 44.05% -> 44c).
  const kalshi44: ArbSideQuote = { bookKey: "kalshi", oddsAmerican: 127 };
  const dk120: ArbSideQuote = { bookKey: "draftkings", oddsAmerican: 120 };

  it("ignores market quotes in findBestArbPair and in tie lists", () => {
    const pair = findBestArbPair(
      [
        { bookKey: "kalshi", oddsAmerican: 300 },
        { bookKey: "draftkings", oddsAmerican: 130 },
        { bookKey: "polymarket_us", oddsAmerican: 130 },
      ],
      [{ bookKey: "betmgm", oddsAmerican: -120 }],
    );
    expect(pair!.sideA.bookKey).toBe("draftkings");
    expect(pair!.tiedBooksA).toEqual([]);
  });

  it("leaves book-only rows with market null on both legs", () => {
    const results = rankArbs(
      [market({ sideAQuotes: [dk120], sideBQuotes: [{ bookKey: "fanduel", oddsAmerican: -105 }] })],
      opts,
    );
    expect(results[0].sideA.market).toBeNull();
    expect(results[0].sideB.market).toBeNull();
  });

  it("builds a DraftKings +120 vs Kalshi 44c arb under the stake cap", () => {
    // Book decimal 2.20: 1/2.2 + 0.44 = 0.8945; fee rate 0.07 x .44 x .56 = 0.0172 -> still < 1.
    const results = rankArbs([market({ sideAQuotes: [dk120], sideBQuotes: [kalshi44] })], opts);
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.sideA.market).toBeNull();
    expect(r.sideB.bookKey).toBe("kalshi");
    const fill = r.sideB.market!;
    expect(fill.priceCents).toBe(44);
    expect(fill.cost.equals(new Decimal(fill.contracts).times("0.44"))).toBe(true);
    expect(r.result.stakeB.equals(fill.outlay)).toBe(true);
    expect(r.result.payoutB.equals(fill.contracts)).toBe(true);
    expect(r.result.totalLaid.equals(r.result.stakeA.plus(r.result.stakeB))).toBe(true);
    expect(r.result.totalLaid.lte(200)).toBe(true);
    expect(r.result.guaranteedProfit.gt(0)).toBe(true);
    expect(
      r.result.guaranteedProfit.equals(Decimal.min(r.result.netIfAWins, r.result.netIfBWins)),
    ).toBe(true);
  });

  it("swaps stakes to follow leg order when the market is on side A", () => {
    const onB = rankArbs([market({ sideAQuotes: [dk120], sideBQuotes: [kalshi44] })], opts)[0];
    const onA = rankArbs([market({ sideAQuotes: [kalshi44], sideBQuotes: [dk120] })], opts)[0];
    expect(onA.sideA.market).not.toBeNull();
    expect(onA.sideB.market).toBeNull();
    expect(onA.result.stakeA.equals(onB.result.stakeB)).toBe(true);
    expect(onA.result.stakeB.equals(onB.result.stakeA)).toBe(true);
    expect(onA.result.guaranteedProfit.equals(onB.result.guaranteedProfit)).toBe(true);
  });

  it("never pairs two market legs (D-04)", () => {
    const results = rankArbs(
      [
        market({
          sideAQuotes: [{ bookKey: "kalshi", oddsAmerican: 127 }],
          sideBQuotes: [{ bookKey: "polymarket_us", oddsAmerican: 127 }],
        }),
      ],
      opts,
    );
    expect(results).toHaveLength(0);
  });

  it("picks the best sportsbook opposite the market (highest odds, ties by key)", () => {
    const results = rankArbs(
      [
        market({
          sideAQuotes: [
            { bookKey: "fanduel", oddsAmerican: 120 },
            { bookKey: "betmgm", oddsAmerican: 120 },
            { bookKey: "caesars", oddsAmerican: 110 },
          ],
          sideBQuotes: [kalshi44],
        }),
      ],
      opts,
    );
    expect(results[0].sideA.bookKey).toBe("betmgm");
  });

  it("uses the market arb only when strictly more profitable than the book-book arb", () => {
    const a: ArbSideQuote = { bookKey: "draftkings", oddsAmerican: 105 };
    const fd: ArbSideQuote = { bookKey: "fanduel", oddsAmerican: -104 };
    // Book-book is a tiny arb; Kalshi 44c against DK +105 is far richer.
    const richer = rankArbs([market({ sideAQuotes: [a], sideBQuotes: [fd, kalshi44] })], opts);
    expect(richer[0].sideB.bookKey).toBe("kalshi");
    // Kalshi 50c vs DK +105: 1/2.05 + 0.5 + fee > 1 -> no market arb, book-book kept.
    const poorer = rankArbs(
      [market({ sideAQuotes: [a], sideBQuotes: [fd, { bookKey: "kalshi", oddsAmerican: 100 }] })],
      opts,
    );
    expect(poorer[0].sideB.bookKey).toBe("fanduel");
    expect(poorer[0].sideB.market).toBeNull();
  });

  it("works for spread rows with an exact line", () => {
    const results = rankArbs(
      [market({ marketType: "spread", line: -3.5, sideAQuotes: [dk120], sideBQuotes: [kalshi44] })],
      opts,
    );
    expect(results[0].rowKey).toBe("event-1:spread:-3.5");
    expect(results[0].sideB.market).not.toBeNull();
  });

  it("caps contracts at the displayed depth", () => {
    const results = rankArbs(
      [market({ sideAQuotes: [dk120], sideBQuotes: [{ ...kalshi44, askSize: 10 }] })],
      opts,
    );
    expect(results[0].sideB.market!.contracts).toBeLessThanOrEqual(10);
  });
});
