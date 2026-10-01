import { describe, expect, it } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import { effectiveBoostedDecimal, decimalToAmericanDisplay } from "@/domain/hedge/profitBoost";
import Decimal from "decimal.js";
import { findPairCandidates } from "./pairPromos";
import { rankPromoHedges, type RankOptions } from "./rankPromoHedges";
import { toPromoRowDTO, type PresentablePromo } from "./promoRowDto";
import { toPairRowDTO } from "./pairRowDto";
import { buildPriceAgeContext } from "./priceAge";

const NOW = new Date("2026-09-27T00:00:00Z");
const COMMENCE = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();
const ML_AT = new Date("2026-09-27T09:43:00.000Z");
const EXT_AT = new Date("2026-09-27T09:20:00.000Z");

const h2hEvent: OddsEvent = {
  id: "e1",
  sport_key: "americanfootball_nfl",
  sport_title: "NFL",
  commence_time: COMMENCE,
  home_team: "Home Team",
  away_team: "Away Team",
  bookmakers: [
    {
      key: "draftkings",
      title: "draftkings",
      markets: [{ key: "h2h", outcomes: [{ name: "Home Team", price: 150 }, { name: "Away Team", price: -180 }] }],
    },
    {
      key: "fanduel",
      title: "fanduel",
      markets: [{ key: "h2h", outcomes: [{ name: "Home Team", price: -170 }, { name: "Away Team", price: 140 }] }],
    },
  ],
};

const spreadEvent: OddsEvent = {
  ...h2hEvent,
  id: "s1",
  bookmakers: [
    {
      key: "draftkings",
      title: "draftkings",
      markets: [
        {
          key: "spreads",
          outcomes: [
            { name: "Home Team", price: 450, point: -3.5 },
            { name: "Away Team", price: -1000, point: 3.5 },
          ],
        },
      ],
    },
    {
      key: "fanduel",
      title: "fanduel",
      markets: [
        {
          key: "spreads",
          outcomes: [
            { name: "Home Team", price: -500, point: -3.5 },
            { name: "Away Team", price: 100, point: 3.5 },
          ],
        },
      ],
    },
  ],
};

function boost(id: number, bookKey: string, eventId: string, market: "moneyline" | "spread"): PresentablePromo {
  return {
    id,
    bookKey,
    promoType: "profit_boost",
    scope: { kind: "event", eventId, sportKey: "americanfootball_nfl" },
    pinned: null,
    eligibleMarketTypes: [market],
    boostPercent: "50",
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: "50",
    promoMaxStake: "50",
    capOverride: null,
    winningsCap: null,
    minOddsAmerican: null,
    finePrintNote: null,
    claimHint: null,
    scopeLabel: "Any game",
    autoMatched: false,
    attribution: [],
  };
}

function bonus(id: number, bookKey: string): PresentablePromo {
  return {
    ...boost(id, bookKey, "e1", "moneyline"),
    promoType: "bonus_bet",
    boostPercent: null,
    bonusAmount: "50",
    maxStake: null,
    promoMaxStake: null,
  };
}

const bookNames = new Map([
  ["draftkings", "DraftKings"],
  ["fanduel", "FanDuel"],
]);
const books = new Set(["draftkings", "fanduel"]);

function opts(moneyline: OddsEvent[], extended: OddsEvent[]): RankOptions & { memberBookKeys: ReadonlySet<string> } {
  return {
    moneylineEvents: moneyline,
    extendedEvents: extended,
    hedgeBookKeys: books,
    precision: "cents",
    now: NOW,
    memberBookKeys: books,
  };
}

describe("toPromoRowDTO base price and pricesAsOf", () => {
  it("spread boost: +450 base -> +675 boosted (display unchanged); pricesAsOf is the extended cache", () => {
    const o = opts([], [spreadEvent]);
    const [opp] = rankPromoHedges([boost(20, "draftkings", "s1", "spread")], o);
    expect(opp).toBeDefined();
    const ctx = buildPriceAgeContext(o.moneylineEvents, ML_AT, EXT_AT);
    const dto = toPromoRowDTO(opp, bookNames, books, ctx);
    expect(dto.promo.baseOddsAmerican).toBe(450);
    expect(dto.promo.oddsAmerican).toBe(675);
    const { decimal } = effectiveBoostedDecimal({
      boostedOddsAmerican: null,
      baseOddsAmerican: 450,
      boostPercent: new Decimal("50"),
    });
    expect(dto.promo.oddsAmerican).toBe(decimalToAmericanDisplay(decimal));
    expect(dto.pricesAsOf).toBe(EXT_AT.toISOString());
  });

  it("h2h boost in the moneyline cache -> pricesAsOf is the moneyline cache", () => {
    const o = opts([h2hEvent], []);
    const [opp] = rankPromoHedges([boost(21, "draftkings", "e1", "moneyline")], o);
    expect(opp).toBeDefined();
    const dto = toPromoRowDTO(opp, bookNames, books, buildPriceAgeContext([h2hEvent], ML_AT, EXT_AT));
    expect(dto.pricesAsOf).toBe(ML_AT.toISOString());
    expect(dto.promo.baseOddsAmerican).not.toBeNull();
  });

  it("bonus-bet row: no base price, no yourCap", () => {
    const o = opts([h2hEvent], []);
    const [opp] = rankPromoHedges([bonus(22, "draftkings")], o);
    expect(opp).toBeDefined();
    const dto = toPromoRowDTO(opp, bookNames, books, buildPriceAgeContext([h2hEvent], ML_AT, EXT_AT));
    expect(dto.promo.baseOddsAmerican).toBeNull();
    expect(dto.yourCap).toBeUndefined();
  });

  it("without the price-age context pricesAsOf is null (snapshot callers)", () => {
    const o = opts([h2hEvent], []);
    const [opp] = rankPromoHedges([boost(23, "draftkings", "e1", "moneyline")], o);
    expect(toPromoRowDTO(opp, bookNames, books).pricesAsOf).toBeNull();
  });
});

describe("toPairRowDTO base price, yourCap and pricesAsOf", () => {
  const ctx = buildPriceAgeContext([h2hEvent], ML_AT, EXT_AT);

  function cachedPrice(sel: { promoSideQuotes: { bookKey: string; oddsAmerican: number }[] }, bookKey: string): number | undefined {
    return sel.promoSideQuotes.find((q) => q.bookKey === bookKey)?.oddsAmerican;
  }

  it("boost + boost: each leg carries its base price and yourCap; pricesAsOf is the moneyline cache", () => {
    const found = findPairCandidates([boost(1, "draftkings", "e1", "moneyline"), boost(2, "fanduel", "e1", "moneyline")], new Map(), opts([h2hEvent], []));
    expect(found).toHaveLength(1);
    const c = found[0];
    const dto = toPairRowDTO(c, bookNames, ctx);
    expect(dto.legA.baseOddsAmerican).toBe(cachedPrice(c.selectionA, c.promoA.bookKey));
    expect(dto.legB.baseOddsAmerican).toBe(cachedPrice(c.selectionB, c.promoB.bookKey));
    expect(dto.legA.yourCap).toEqual({ promoCap: "50", override: null });
    expect(dto.legB.yourCap).toEqual({ promoCap: "50", override: null });
    expect(dto.pricesAsOf).toBe(ML_AT.toISOString());
  });

  it("boost + bonus: only the boost leg has base price and yourCap", () => {
    const found = findPairCandidates([boost(9, "draftkings", "e1", "moneyline"), bonus(3, "fanduel")], new Map(), opts([h2hEvent], []));
    expect(found).toHaveLength(1);
    const dto = toPairRowDTO(found[0], bookNames, ctx);
    expect(dto.legA.promoTypeLabel).toBe("Boost");
    expect(dto.legA.baseOddsAmerican).not.toBeNull();
    expect(dto.legA.yourCap).toBeDefined();
    expect(dto.legB.baseOddsAmerican).toBeNull();
    expect(dto.legB.yourCap).toBeUndefined();
  });

  it("without the price-age context pricesAsOf is null", () => {
    const found = findPairCandidates([boost(1, "draftkings", "e1", "moneyline"), boost(2, "fanduel", "e1", "moneyline")], new Map(), opts([h2hEvent], []));
    expect(toPairRowDTO(found[0], bookNames).pricesAsOf).toBeNull();
  });
});
