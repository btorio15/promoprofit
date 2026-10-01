import { describe, expect, it } from "vitest";
import { SPORT_KEYS } from "@/config/sports";
import type { RankablePromo } from "./rankPromoHedges";
import { estimatePromoAltGames, promoRefreshSportKeys } from "./promoRefreshScope";

function promo(over: Partial<RankablePromo> & { id?: number } = {}): RankablePromo {
  return {
    id: 1,
    bookKey: "fanduel",
    promoType: "bonus_bet",
    scope: { kind: "any" },
    pinned: null,
    eligibleMarketTypes: ["moneyline"],
    boostPercent: null,
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: "50",
    maxStake: null,
    winningsCap: null,
    minOddsAmerican: null,
    ...over,
  };
}

describe("promoRefreshSportKeys (D-01)", () => {
  it("event scope -> its sport; sport_window -> its sport", () => {
    expect(
      promoRefreshSportKeys([
        promo({ scope: { kind: "event", eventId: "e1", sportKey: "icehockey_nhl" } }),
        promo({
          id: 2,
          scope: {
            kind: "sport_window",
            sportKey: "americanfootball_nfl",
            windowStart: new Date("2026-10-01T00:00:00Z"),
            windowEnd: new Date("2026-10-02T00:00:00Z"),
          },
        }),
      ]),
    ).toEqual(["americanfootball_nfl", "icehockey_nhl"]); // SPORTS config order
  });

  it("any-scope unpinned -> every configured sport", () => {
    expect(promoRefreshSportKeys([promo()])).toEqual([...SPORT_KEYS]);
  });

  it("any-scope pinned: known event -> only that sport; unknown -> every sport", () => {
    const pinned = promo({ pinned: { eventId: "e9", marketType: "moneyline", line: null, side: "home" } });
    expect(promoRefreshSportKeys([pinned], { sportOfEvent: (id) => (id === "e9" ? "basketball_nba" : undefined) })).toEqual([
      "basketball_nba",
    ]);
    expect(promoRefreshSportKeys([pinned], { sportOfEvent: () => undefined })).toEqual([...SPORT_KEYS]);
    expect(promoRefreshSportKeys([pinned])).toEqual([...SPORT_KEYS]);
  });

  it("a promo with no eligible market types contributes nothing; duplicates collapse; unknown sports dropped", () => {
    expect(promoRefreshSportKeys([promo({ eligibleMarketTypes: [] })])).toEqual([]);
    expect(
      promoRefreshSportKeys([
        promo({ scope: { kind: "event", eventId: "a", sportKey: "baseball_mlb" } }),
        promo({ id: 2, scope: { kind: "event", eventId: "b", sportKey: "baseball_mlb" } }),
        promo({ id: 3, scope: { kind: "event", eventId: "c", sportKey: "curling_world" } }),
      ]),
    ).toEqual(["baseball_mlb"]);
  });

  it("empty input -> []", () => {
    expect(promoRefreshSportKeys([])).toEqual([]);
  });
});

describe("estimatePromoAltGames (D-04)", () => {
  const eventSpread = (n: number, over: Partial<RankablePromo> = {}) =>
    promo({
      id: n,
      scope: { kind: "event", eventId: `e${n}`, sportKey: "americanfootball_nfl" },
      eligibleMarketTypes: ["spread"],
      ...over,
    });

  it("no promos -> 0", () => {
    expect(estimatePromoAltGames([])).toBe(0);
  });

  it("counts distinct scoped events plus one per league-wide spread promo", () => {
    expect(
      estimatePromoAltGames([
        eventSpread(1),
        eventSpread(1), // same event, counted once
        promo({ id: 5, eligibleMarketTypes: ["spread"] }), // league-wide
      ]),
    ).toBe(2);
  });

  it("caps at the 5-game limit", () => {
    expect(estimatePromoAltGames([1, 2, 3, 4, 5, 6, 7].map((n) => eventSpread(n)))).toBe(5);
  });

  it("excludes a profit_boost with no max stake (D-18)", () => {
    expect(estimatePromoAltGames([eventSpread(1, { promoType: "profit_boost", maxStake: null })])).toBe(0);
  });
});
