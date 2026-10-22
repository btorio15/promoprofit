import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import type {
  ConversionRate,
  ConversionRateFor,
} from "@/domain/hedge/conversionRate";
import {
  noSweatScope,
  rankNoSweat,
  type NoSweatPromo,
  type NoSweatRankOptions,
} from "./rankNoSweat";

const NOW = new Date("2026-09-27T00:00:00Z");

function plusHours(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function moneylineEvent(opts: {
  id: string;
  homeTeam?: string;
  awayTeam?: string;
  commenceTime?: string;
  sportKey?: string;
  quotes: { bookKey: string; homePrice: number; awayPrice: number }[];
}): OddsEvent {
  const homeTeam = opts.homeTeam ?? "Home " + opts.id;
  const awayTeam = opts.awayTeam ?? "Away " + opts.id;
  return {
    id: opts.id,
    sport_key: opts.sportKey ?? "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: opts.commenceTime ?? plusHours(24),
    home_team: homeTeam,
    away_team: awayTeam,
    bookmakers: opts.quotes.map((q) => ({
      key: q.bookKey,
      title: q.bookKey,
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: homeTeam, price: q.homePrice },
            { name: awayTeam, price: q.awayPrice },
          ],
        },
      ],
    })),
  };
}

function fixedRate(valueByBook: Record<string, number>): ConversionRateFor {
  return (bookKey, amount) => {
    const v = valueByBook[bookKey];
    if (v === undefined) return null;
    const profit = new Decimal(v);
    return {
      refundBookKey: bookKey,
      amount,
      profit,
      rate: profit.dividedBy(amount),
      pct: profit.dividedBy(amount).times(100).floor(),
      eventId: "fixed",
      hedgeBookKey: "draftkings",
    } satisfies ConversionRate;
  };
}

const HEDGE_BOOKS = new Set(["draftkings", "fanduel"]);

const promo: NoSweatPromo = {
  id: 1,
  bookKey: "hardrockbet",
  refundCap: new Decimal("5.00"),
  minOddsAmerican: -500,
  scope: { kind: "any" },
};

function opts(
  over: Partial<NoSweatRankOptions> &
    Pick<NoSweatRankOptions, "moneylineEvents">,
): NoSweatRankOptions {
  return {
    extendedEvents: [],
    now: NOW,
    hedgeBookKeys: HEDGE_BOOKS,
    precision: "cents",
    conversionRateFor: fixedRate({ hardrockbet: 3.5 }),
    ...over,
  };
}

const hardRockGame = moneylineEvent({
  id: "g1",
  quotes: [
    { bookKey: "hardrockbet", homePrice: -500, awayPrice: 150 },
    { bookKey: "draftkings", homePrice: -700, awayPrice: 380 },
  ],
});

describe("rankNoSweat", () => {
  it("Hard Rock worked example, cents precision", () => {
    const r = rankNoSweat(promo, opts({ moneylineEvents: [hardRockGame] }));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const o = r.opportunity;
    expect(o.qualifying.bookKey).toBe("hardrockbet");
    expect(o.qualifying.oddsAmerican).toBe(-500);
    expect(o.hedge.bookKey).toBe("draftkings");
    expect(o.solution.qualifyingStake.toFixed(2)).toBe("5.00");
    expect(o.solution.hedgeStake.toFixed(2)).toBe("0.52");
    expect(o.solution.profitIfWin.toFixed(2)).toBe("0.48");
    expect(o.solution.profitIfLose.toFixed(2)).toBe("0.47");
    expect(o.solution.estimatedProfit.toFixed(2)).toBe("0.47");
    expect(o.solution.worstCaseProfit.toFixed(2)).toBe("-3.03");
    expect(o.conversion.profit.toFixed(2)).toBe("3.50");
  });

  it("Hard Rock worked example, whole precision", () => {
    const r = rankNoSweat(
      promo,
      opts({ moneylineEvents: [hardRockGame], precision: "whole" }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.opportunity.solution.hedgeStake.toFixed(2)).toBe("1.00");
    expect(r.opportunity.solution.estimatedProfit.toFixed(2)).toBe("0.00");
    expect(r.opportunity.solution.worstCaseProfit.toFixed(2)).toBe("-1.20");
  });

  it("returns cant_price with no profit figure when the rate is null", () => {
    const r = rankNoSweat(
      promo,
      opts({
        moneylineEvents: [hardRockGame],
        conversionRateFor: fixedRate({}),
      }),
    );
    expect(r).toEqual({
      kind: "cant_price",
      reason: "no_refund_book_odds",
      refundBookKey: "hardrockbet",
    });
    expect("solution" in r).toBe(false);
    expect("opportunity" in r).toBe(false);
  });

  it("allows a line exactly at min odds and never picks one below it", () => {
    const below = moneylineEvent({
      id: "g2",
      quotes: [
        { bookKey: "hardrockbet", homePrice: -600, awayPrice: 400 },
        { bookKey: "draftkings", homePrice: -2000, awayPrice: 1500 },
      ],
    });
    const r = rankNoSweat(
      promo,
      opts({ moneylineEvents: [below, hardRockGame] }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.opportunity.selection.eventId).toBe("g1");
    expect(r.opportunity.qualifying.oddsAmerican).toBeGreaterThanOrEqual(-500);

    const only = rankNoSweat(
      { ...promo, minOddsAmerican: -500 },
      opts({
        moneylineEvents: [
          moneylineEvent({
            id: "g3",
            quotes: [
              { bookKey: "hardrockbet", homePrice: -600, awayPrice: -600 },
              { bookKey: "draftkings", homePrice: -700, awayPrice: 380 },
            ],
          }),
        ],
      }),
    );
    expect(only.kind).toBe("no_qualifying_line");
  });

  it("null minOdds applies no filter", () => {
    const g = moneylineEvent({
      id: "g4",
      quotes: [
        { bookKey: "hardrockbet", homePrice: -600, awayPrice: -600 },
        { bookKey: "draftkings", homePrice: 300, awayPrice: 300 },
      ],
    });
    const r = rankNoSweat(
      { ...promo, minOddsAmerican: null },
      opts({ moneylineEvents: [g] }),
    );
    expect(r.kind).toBe("ok");
  });

  it("hedges only at the member's books", () => {
    const g = moneylineEvent({
      id: "g5",
      quotes: [
        { bookKey: "hardrockbet", homePrice: -200, awayPrice: 150 },
        { bookKey: "draftkings", homePrice: 100, awayPrice: 100 },
        { bookKey: "betmgm", homePrice: 900, awayPrice: 900 },
      ],
    });
    const r = rankNoSweat(promo, opts({ moneylineEvents: [g] }));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.opportunity.hedge.bookKey).not.toBe("betmgm");
  });

  it("skips selections with no quote at the promo book", () => {
    const g = moneylineEvent({
      id: "g6",
      quotes: [
        { bookKey: "draftkings", homePrice: -110, awayPrice: -110 },
        { bookKey: "fanduel", homePrice: -110, awayPrice: -110 },
      ],
    });
    const r = rankNoSweat(promo, opts({ moneylineEvents: [g] }));
    expect(r).toEqual({ kind: "no_qualifying_line", candidatesEvaluated: 0 });
  });
});
