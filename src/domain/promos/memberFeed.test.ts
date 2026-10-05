import { describe, expect, it } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import { rankPromoHedges, type RankablePromo, type RankOptions } from "./rankPromoHedges";
import { findPairCandidates, selectPairs, singleProfitMap } from "./pairPromos";
import type { PromoScope } from "./scope";
import { computeMemberFeed } from "./memberFeed";

const NOW = new Date("2026-09-27T00:00:00Z");

function plusHours(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

const baseEvent: OddsEvent = {
  id: "e1",
  sport_key: "americanfootball_nfl",
  sport_title: "NFL",
  commence_time: plusHours(24),
  home_team: "Home Team",
  away_team: "Away Team",
  bookmakers: [
    { key: "draftkings", homePrice: 150, awayPrice: -180 },
    { key: "fanduel", homePrice: -170, awayPrice: 140 },
  ].map((q) => ({
    key: q.key,
    title: q.key,
    markets: [
      {
        key: "h2h",
        outcomes: [
          { name: "Home Team", price: q.homePrice },
          { name: "Away Team", price: q.awayPrice },
        ],
      },
    ],
  })),
};

function eventScope(eventId: string): PromoScope {
  return { kind: "event", eventId, sportKey: "americanfootball_nfl" };
}

function boostPromo(overrides: Partial<RankablePromo> & { id: number; bookKey: string }): RankablePromo {
  return {
    promoType: "profit_boost",
    scope: eventScope("e1"),
    pinned: null,
    eligibleMarketTypes: ["moneyline"],
    boostPercent: "50",
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: "50",
    winningsCap: null,
    minOddsAmerican: null,
    ...overrides,
  };
}

function rankOptsFor(members: string[], hedgeBooks: string[] = members): RankOptions {
  return {
    moneylineEvents: [baseEvent],
    extendedEvents: [],
    hedgeBookKeys: new Set(hedgeBooks),
    precision: "cents",
    now: NOW,
  };
}

const promos = [boostPromo({ id: 1, bookKey: "draftkings" }), boostPromo({ id: 2, bookKey: "fanduel" })];

describe("computeMemberFeed", () => {
  it("matches the inline feed composition (singles + chosen pairs)", () => {
    const members = ["draftkings", "fanduel"];
    // Hedge only at a book with no quotes so the singles are weak and the pair wins.
    const rankOpts = rankOptsFor(members, ["betmgm"]);
    const userBookSet = new Set(members);

    const out = computeMemberFeed({ feedPromos: promos, rankOpts, userBookSet });

    const singles = rankPromoHedges(promos, rankOpts);
    const pairs = selectPairs(
      findPairCandidates(promos, singleProfitMap(singles), { ...rankOpts, memberBookKeys: userBookSet }),
    );

    expect(out.singles.map((s) => s.promo.id)).toEqual(singles.map((s) => s.promo.id));
    expect(pairs.length).toBeGreaterThan(0);
    expect(out.chosenPairs).toHaveLength(pairs.length);
    expect(out.chosenPairs.map((p) => [p.promoA.id, p.promoB.id])).toEqual(
      pairs.map((p) => [p.promoA.id, p.promoB.id]),
    );
    expect(out.chosenPairs.map((p) => p.result.guaranteedProfit.toFixed(2))).toEqual(
      pairs.map((p) => p.result.guaranteedProfit.toFixed(2)),
    );
  });

  it("returns no pairs when one of the two books is not a member book", () => {
    const rankOpts = rankOptsFor(["draftkings", "fanduel"], ["betmgm"]);
    const out = computeMemberFeed({
      feedPromos: promos,
      rankOpts,
      userBookSet: new Set(["draftkings"]),
    });
    expect(out.chosenPairs).toEqual([]);
  });

  it("is deterministic across two calls", () => {
    const members = ["draftkings", "fanduel"];
    const args = { feedPromos: promos, rankOpts: rankOptsFor(members), userBookSet: new Set(members) };
    const a = computeMemberFeed(args);
    const b = computeMemberFeed(args);
    expect(a.singles.map((s) => s.promo.id)).toEqual(b.singles.map((s) => s.promo.id));
    expect(a.chosenPairs.map((p) => p.result.guaranteedProfit.toFixed(2))).toEqual(
      b.chosenPairs.map((p) => p.result.guaranteedProfit.toFixed(2)),
    );
  });
});
