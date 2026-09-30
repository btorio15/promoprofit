import { describe, expect, it } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import { isLeagueWideAltSpreadPromo, pickLeagueWideAltSpreadEventIds } from "./leagueWideAltTargets";
import type { RankablePromo } from "./rankPromoHedges";

const NOW = new Date("2026-09-30T00:00:00Z");
const hours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();

function game(id: string, commence: number, fdPrice: number, withAlt = false): OddsEvent {
  const fdMarkets: OddsEvent["bookmakers"][number]["markets"] = [
    {
      key: "spreads",
      outcomes: [
        { name: "Home", price: fdPrice, point: -2.5 },
        { name: "Away", price: -110, point: 2.5 },
      ],
    },
  ];
  const dkMarkets: OddsEvent["bookmakers"][number]["markets"] = [
    {
      key: "spreads",
      outcomes: [
        { name: "Home", price: -110, point: -2.5 },
        { name: "Away", price: -110, point: 2.5 },
      ],
    },
  ];
  if (withAlt) {
    // Would make this game the best if alt lines were (wrongly) used.
    fdMarkets.push({ key: "alternate_spreads", outcomes: [{ name: "Home", price: 900, point: -6.5 }] });
    dkMarkets.push({ key: "alternate_spreads", outcomes: [{ name: "Away", price: -110, point: 6.5 }] });
  }
  return {
    id,
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: hours(commence),
    home_team: "Home",
    away_team: "Away",
    bookmakers: [
      { key: "fanduel", title: "fanduel", markets: fdMarkets },
      { key: "draftkings", title: "draftkings", markets: dkMarkets },
    ],
  };
}

const boost: RankablePromo = {
  id: 1,
  bookKey: "fanduel",
  promoType: "profit_boost",
  scope: { kind: "sport_window", sportKey: "americanfootball_nfl", windowStart: NOW, windowEnd: new Date(hours(72)) },
  pinned: null,
  eligibleMarketTypes: ["spread"],
  boostPercent: "50",
  boostedOddsAmerican: null,
  baseOddsAmerican: null,
  bonusAmount: null,
  maxStake: "25",
  winningsCap: null,
  minOddsAmerican: null,
};
const bonus: RankablePromo = {
  ...boost,
  id: 2,
  promoType: "bonus_bet",
  boostPercent: null,
  bonusAmount: "50",
  maxStake: null,
  scope: { kind: "any" },
};

const mk = (extendedEvents: OddsEvent[]) => ({
  moneylineEvents: [] as OddsEvent[],
  extendedEvents,
  hedgeBookKeys: new Set(["fanduel", "draftkings"]),
  precision: "cents" as const,
  now: NOW,
});

// A has the better FanDuel price (+150) than B (+110); hedge at DraftKings Away -110.
const A = game("A", 24, 150);
const B = game("B", 30, 110);

describe("pickLeagueWideAltSpreadEventIds (260930-hor)", () => {
  it("returns exactly the best game for a promo covering two games", () => {
    expect(pickLeagueWideAltSpreadEventIds([boost], mk([A, B]))).toEqual(["A"]);
  });

  it("dedupes when several promos share the same best game", () => {
    expect(pickLeagueWideAltSpreadEventIds([boost, bonus], mk([A, B]))).toEqual(["A"]);
  });

  it("skips ineligible promos; empty when there is no profitable game", () => {
    const eventScoped = { ...boost, scope: { kind: "event" as const, eventId: "A", sportKey: "americanfootball_nfl" } };
    const pinned = { ...boost, pinned: { eventId: "A", marketType: "spread" as const, side: "home" as const, line: -2.5 } };
    expect(isLeagueWideAltSpreadPromo(eventScoped)).toBe(false);
    expect(isLeagueWideAltSpreadPromo(pinned)).toBe(false);
    expect(isLeagueWideAltSpreadPromo({ ...boost, eligibleMarketTypes: ["moneyline"] })).toBe(false);
    expect(isLeagueWideAltSpreadPromo({ ...boost, maxStake: null })).toBe(false);
    expect(isLeagueWideAltSpreadPromo(boost)).toBe(true);
    expect(isLeagueWideAltSpreadPromo(bonus)).toBe(true);
    expect(pickLeagueWideAltSpreadEventIds([eventScoped, pinned, { ...boost, maxStake: null }], mk([A, B]))).toEqual([]);
    expect(pickLeagueWideAltSpreadEventIds([boost], mk([]))).toEqual([]);
  });

  it("uses main lines only and does not mutate inputs", () => {
    const events = [A, game("B", 30, 110, true)];
    const snapshot = JSON.stringify(events);
    expect(pickLeagueWideAltSpreadEventIds([boost], mk(events))).toEqual(["A"]);
    expect(JSON.stringify(events)).toBe(snapshot);
  });
});
