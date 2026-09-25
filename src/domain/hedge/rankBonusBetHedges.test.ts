import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { SPORT_KEYS } from "@/config/sports";
import { usableOddsBooks } from "@/config/books";
import { buildFixtureEvents } from "@/test/fixtures/oddsEvents";
import { extractTwoWayMoneylines, type TwoWayMoneylineMarket } from "./marketFilter";
import { rankBonusBetHedges } from "./rankBonusBetHedges";

const now = new Date("2026-10-01T12:00:00.000Z");
const allowedBookKeys = new Set(usableOddsBooks().map((b) => b.key));
const hedgeBookKeys = allowedBookKeys;

function fixtureMarkets(): TwoWayMoneylineMarket[] {
  return extractTwoWayMoneylines(buildFixtureEvents(now), {
    now,
    windowDays: 7,
    allowedBookKeys,
    sportKeys: new Set(SPORT_KEYS),
  });
}

describe("rankBonusBetHedges", () => {
  it("ranks the fixture markets with Nuggets/Jazz first for draftkings / $100", () => {
    const results = rankBonusBetHedges(fixtureMarkets(), {
      bonusBookKey: "draftkings",
      bonusAmount: new Decimal(100),
      hedgeBookKeys,
    });

    expect(results.map((r) => r.eventId)).toEqual([
      "nba-nuggets-jazz",
      "nfl-packers-panthers",
      "mlb-dodgers-rockies",
    ]);

    const [first] = results;
    expect(first.bonus.bookKey).toBe("draftkings");
    expect(first.bonus.team).toBe("Utah Jazz");
    expect(first.hedge.bookKey).toBe("fanduel");
    expect(first.hedge.team).toBe("Denver Nuggets");
    expect(first.sameBook).toBe(false);
    expect(first.result.hedgeStake.toFixed(2)).toBe("220.00");
    expect(first.result.guaranteedProfit.toFixed(2)).toBe("80.00");

    const nfl = results.find((r) => r.eventId === "nfl-packers-panthers");
    expect(nfl?.tieRisk).toBe(true);
    expect(nfl?.bonus.team).toBe("Carolina Panthers");
    expect(nfl?.hedge.bookKey).toBe("fanduel");
    expect(nfl?.result.hedgeStake.toFixed(2)).toBe("306.92");

    const mlb = results.find((r) => r.eventId === "mlb-dodgers-rockies");
    expect(mlb?.bonus.team).toBe("Colorado Rockies");
    expect(mlb?.hedge.bookKey).toBe("draftkings");
    expect(mlb?.sameBook).toBe(true);
    expect(mlb?.result.hedgeStake.toFixed(2)).toBe("217.50");
    expect(mlb?.result.guaranteedProfit.toFixed(2)).toBe("72.50");
  });

  it("keeps one row per game, choosing the more profitable orientation", () => {
    const market: TwoWayMoneylineMarket = {
      eventId: "both-orientations",
      sportKey: "basketball_nba",
      commenceTime: new Date(now.getTime() + 86_400_000),
      homeTeam: "Home",
      awayTeam: "Away",
      tieRisk: false,
      quotes: [
        { bookKey: "bookA", outcome: "home", team: "Home", oddsAmerican: 250 },
        { bookKey: "bookA", outcome: "away", team: "Away", oddsAmerican: 150 },
        { bookKey: "bookB", outcome: "away", team: "Away", oddsAmerican: -150 },
        { bookKey: "bookB", outcome: "home", team: "Home", oddsAmerican: -150 },
      ],
    };

    // hedgeBookKeys deliberately excludes bookA, so the only hedge candidate
    // for either orientation is bookB — isolating orientation selection from
    // D-17's separate "hedge can be the bonus book" behavior (tested below).
    const results = rankBonusBetHedges([market], {
      bonusBookKey: "bookA",
      bonusAmount: new Decimal(100),
      hedgeBookKeys: new Set(["bookB"]),
    });

    expect(results).toHaveLength(1);
    // Bonus on Home @ +250 hedged at -150 nets $100 guaranteed, vs. bonus on
    // Away @ +150 hedged at -150 nets only $60 — the home orientation wins.
    expect(results[0].bonus.outcome).toBe("home");
    expect(results[0].result.guaranteedProfit.toFixed(2)).toBe("100.00");
  });

  it("allows the bonus book to also be the hedge book (D-17)", () => {
    const results = rankBonusBetHedges(fixtureMarkets(), {
      bonusBookKey: "draftkings",
      bonusAmount: new Decimal(100),
      hedgeBookKeys,
    });

    const mlb = results.find((r) => r.eventId === "mlb-dodgers-rockies");
    expect(mlb?.sameBook).toBe(true);
    expect(mlb?.hedge.bookKey).toBe(mlb?.bonus.bookKey);
  });

  it("breaks hedge-price ties alphabetically by bookKey", () => {
    const market: TwoWayMoneylineMarket = {
      eventId: "tied-hedge",
      sportKey: "basketball_nba",
      commenceTime: new Date(now.getTime() + 86_400_000),
      homeTeam: "Home",
      awayTeam: "Away",
      tieRisk: false,
      quotes: [
        { bookKey: "bookA", outcome: "away", team: "Away", oddsAmerican: 200 },
        { bookKey: "zeta", outcome: "home", team: "Home", oddsAmerican: -200 },
        { bookKey: "alpha", outcome: "home", team: "Home", oddsAmerican: -200 },
      ],
    };

    const results = rankBonusBetHedges([market], {
      bonusBookKey: "bookA",
      bonusAmount: new Decimal(100),
      hedgeBookKeys: new Set(["bookA", "zeta", "alpha"]),
    });

    expect(results).toHaveLength(1);
    expect(results[0].hedge.bookKey).toBe("alpha");
  });

  it("skips games where the bonus book has no quote", () => {
    const market: TwoWayMoneylineMarket = {
      eventId: "no-bonus-book-quote",
      sportKey: "basketball_nba",
      commenceTime: new Date(now.getTime() + 86_400_000),
      homeTeam: "Home",
      awayTeam: "Away",
      tieRisk: false,
      quotes: [{ bookKey: "bookB", outcome: "home", team: "Home", oddsAmerican: -150 }],
    };

    const results = rankBonusBetHedges([market], {
      bonusBookKey: "bookA",
      bonusAmount: new Decimal(100),
      hedgeBookKeys: new Set(["bookA", "bookB"]),
    });

    expect(results).toHaveLength(0);
  });

  it("drops results whose guaranteed profit rounds to zero or below", () => {
    const market: TwoWayMoneylineMarket = {
      eventId: "rounds-to-zero",
      sportKey: "basketball_nba",
      commenceTime: new Date(now.getTime() + 86_400_000),
      homeTeam: "Home",
      awayTeam: "Away",
      tieRisk: false,
      quotes: [
        { bookKey: "bookA", outcome: "away", team: "Away", oddsAmerican: 100 },
        { bookKey: "bookB", outcome: "home", team: "Home", oddsAmerican: -100000 },
      ],
    };

    const results = rankBonusBetHedges([market], {
      bonusBookKey: "bookA",
      bonusAmount: new Decimal("0.01"),
      hedgeBookKeys: new Set(["bookA", "bookB"]),
    });

    expect(results).toHaveLength(0);
  });

  it("sorts by guaranteed profit desc, then commenceTime asc, then eventId asc, and defaults limit to 10", () => {
    const markets: TwoWayMoneylineMarket[] = Array.from({ length: 12 }, (_, i) => ({
      eventId: `game-${String(i).padStart(2, "0")}`,
      sportKey: "basketball_nba",
      commenceTime: new Date(now.getTime() + (i + 1) * 3_600_000),
      homeTeam: `Home${i}`,
      awayTeam: `Away${i}`,
      tieRisk: false,
      quotes: [
        { bookKey: "bookA", outcome: "away", team: `Away${i}`, oddsAmerican: 200 },
        { bookKey: "bookB", outcome: "home", team: `Home${i}`, oddsAmerican: -200 },
      ],
    }));

    const results = rankBonusBetHedges(markets, {
      bonusBookKey: "bookA",
      bonusAmount: new Decimal(100),
      hedgeBookKeys: new Set(["bookA", "bookB"]),
    });

    expect(results).toHaveLength(10);
    // All 12 synthetic games have identical guaranteed profit, so the tie
    // breaks on commenceTime asc, i.e. eventId order (game-00 .. game-09).
    expect(results.map((r) => r.eventId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `game-${String(i).padStart(2, "0")}`),
    );
  });
});
