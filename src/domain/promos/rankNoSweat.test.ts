import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import {
  makeConversionRateFor,
  topConversionFor,
  type ConversionRate,
  type ConversionRateFor,
} from "@/domain/hedge/conversionRate";
import { solveNoSweat } from "@/domain/hedge/noSweat";
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

  describe("invalid promo fields return a typed result instead of throwing", () => {
    // Real rate function with cached refund-book markets: before validation,
    // a bad refundCap reached calculateBonusBetHedge and threw RangeError.
    const realRate = () =>
      makeConversionRateFor({
        events: [hardRockGame],
        now: NOW,
        hedgeBookKeys: HEDGE_BOOKS,
      });
    const cases: [string, Partial<NoSweatPromo>, string][] = [
      ["refundCap 0", { refundCap: new Decimal(0) }, "bad_refund_cap"],
      ["refundCap negative", { refundCap: new Decimal(-5) }, "bad_refund_cap"],
      ["refundCap > 2dp", { refundCap: new Decimal("5.001") }, "bad_refund_cap"],
      ["minOdds -50", { minOddsAmerican: -50 }, "bad_min_odds"],
      ["minOdds non-integer", { minOddsAmerican: 150.5 }, "bad_min_odds"],
    ];
    for (const [name, override, reason] of cases) {
      it(name, () => {
        const r = rankNoSweat(
          { ...promo, ...override },
          opts({ moneylineEvents: [hardRockGame], conversionRateFor: realRate() }),
        );
        expect(r).toEqual({ kind: "invalid_promo", reason, promoId: promo.id });
      });
    }
  });
});

function spreadsTotalsEvent(opts: {
  id: string;
  commenceTime?: string;
  spreadPoint?: number;
  quotes: {
    bookKey: string;
    spreadHome: number;
    spreadAway: number;
    over: number;
    under: number;
  }[];
  totalPoint?: number;
}): OddsEvent {
  const home = "Home " + opts.id;
  const away = "Away " + opts.id;
  const sp = opts.spreadPoint ?? -3.5;
  const tp = opts.totalPoint ?? 44.5;
  return {
    id: opts.id,
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: opts.commenceTime ?? plusHours(24),
    home_team: home,
    away_team: away,
    bookmakers: opts.quotes.map((q) => ({
      key: q.bookKey,
      title: q.bookKey,
      markets: [
        {
          key: "spreads",
          outcomes: [
            { name: home, price: q.spreadHome, point: sp },
            { name: away, price: q.spreadAway, point: -sp },
          ],
        },
        {
          key: "totals",
          outcomes: [
            { name: "Over", price: q.over, point: tp },
            { name: "Under", price: q.under, point: tp },
          ],
        },
      ],
    })),
  };
}

function solve(
  qualOdds: number,
  hedgeOdds: number,
  value = 3.5,
  precision: "cents" | "whole" = "cents",
) {
  return solveNoSweat({
    stake: new Decimal("5.00"),
    refundCap: new Decimal("5.00"),
    refundValue: new Decimal(value),
    qualifyingOddsAmerican: qualOdds,
    hedgeOddsAmerican: hedgeOdds,
    precision,
  });
}

describe("rankNoSweat search", () => {
  it("highest estimated profit beats longest qualifying odds", () => {
    const longOdds = moneylineEvent({
      id: "a",
      quotes: [
        { bookKey: "hardrockbet", homePrice: 400, awayPrice: -600 },
        { bookKey: "draftkings", homePrice: -300, awayPrice: -700 },
      ],
    });
    const good = moneylineEvent({
      id: "b",
      quotes: [
        { bookKey: "hardrockbet", homePrice: 150, awayPrice: -180 },
        { bookKey: "draftkings", homePrice: -140, awayPrice: 135 },
        { bookKey: "fanduel", homePrice: -150, awayPrice: 130 },
      ],
    });
    const mid = moneylineEvent({
      id: "c",
      quotes: [
        { bookKey: "hardrockbet", homePrice: 100, awayPrice: -120 },
        { bookKey: "draftkings", homePrice: -125, awayPrice: 105 },
      ],
    });
    const events = [longOdds, good, mid];
    const r = rankNoSweat(promo, opts({ moneylineEvents: events }));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const best = r.opportunity.solution.estimatedProfit;
    for (const [q, h] of [
      [400, -700],
      [-600, -300],
      [150, 130],
      [-180, 135],
      [100, 105],
      [-120, -125],
      [-120, 105],
    ]) {
      if (q < -500) continue;
      expect(best.gte(solve(q, h).estimatedProfit)).toBe(true);
    }
    expect(r.opportunity.selection.eventId).not.toBe("a");
  });

  it("chooses the higher-odds member hedge book", () => {
    const g = moneylineEvent({
      id: "h",
      quotes: [
        { bookKey: "hardrockbet", homePrice: 120, awayPrice: -140 },
        { bookKey: "draftkings", homePrice: -150, awayPrice: 110 },
        { bookKey: "fanduel", homePrice: -130, awayPrice: 115 },
      ],
    });
    const r = rankNoSweat(promo, opts({ moneylineEvents: [g] }));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const o = r.opportunity;
    const other = o.hedge.bookKey === "fanduel" ? "draftkings" : "fanduel";
    const otherOdds = g.bookmakers
      .find((b) => b.key === other)!
      .markets[0].outcomes.find(
        (x) =>
          x.name === (o.selection.side === "home" ? g.away_team : g.home_team),
      )!.price;
    expect(o.hedge.oddsAmerican).toBeGreaterThanOrEqual(otherOdds);
    expect(
      o.solution.estimatedProfit.gte(
        solve(o.qualifying.oddsAmerican, otherOdds).estimatedProfit,
      ),
    ).toBe(true);
  });

  it("considers spreads and totals, never whole-number lines", () => {
    const ev = spreadsTotalsEvent({
      id: "st",
      quotes: [
        {
          bookKey: "hardrockbet",
          spreadHome: 200,
          spreadAway: -250,
          over: 190,
          under: -240,
        },
        {
          bookKey: "draftkings",
          spreadHome: -240,
          spreadAway: 190,
          over: -230,
          under: 180,
        },
      ],
    });
    const r = rankNoSweat(
      promo,
      opts({ moneylineEvents: [], extendedEvents: [ev] }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(["spread", "total"]).toContain(r.opportunity.selection.marketType);
    expect(Math.abs(r.opportunity.selection.line ?? 0) % 1).toBe(0.5);

    const whole = spreadsTotalsEvent({
      id: "whole",
      spreadPoint: -3,
      totalPoint: 44,
      quotes: [
        {
          bookKey: "hardrockbet",
          spreadHome: 200,
          spreadAway: -250,
          over: 190,
          under: -240,
        },
        {
          bookKey: "draftkings",
          spreadHome: -240,
          spreadAway: 190,
          over: -230,
          under: 180,
        },
      ],
    });
    const w = rankNoSweat(
      promo,
      opts({ moneylineEvents: [], extendedEvents: [whole] }),
    );
    expect(w.kind).toBe("no_qualifying_line");
  });

  it("respects the sport limit", () => {
    const nba = moneylineEvent({
      id: "nba",
      sportKey: "basketball_nba",
      quotes: [
        { bookKey: "hardrockbet", homePrice: 200, awayPrice: -250 },
        { bookKey: "draftkings", homePrice: -230, awayPrice: 190 },
      ],
    });
    const nfl = moneylineEvent({
      id: "nfl",
      quotes: [
        { bookKey: "hardrockbet", homePrice: 110, awayPrice: -130 },
        { bookKey: "draftkings", homePrice: -120, awayPrice: 100 },
      ],
    });
    expect(noSweatScope(null, NOW)).toEqual({ kind: "any" });
    const limited = rankNoSweat(
      { ...promo, scope: noSweatScope("americanfootball_nfl", NOW) },
      opts({ moneylineEvents: [nba, nfl] }),
    );
    expect(limited.kind === "ok" && limited.opportunity.selection.eventId).toBe(
      "nfl",
    );
    const open = rankNoSweat(
      { ...promo, scope: noSweatScope(null, NOW) },
      opts({ moneylineEvents: [nba, nfl] }),
    );
    expect(open.kind === "ok" && open.opportunity.selection.eventId).toBe(
      "nba",
    );
  });

  it("breaks ties by commence time then event id", () => {
    const quotes = [
      { bookKey: "hardrockbet", homePrice: 110, awayPrice: 110 },
      { bookKey: "draftkings", homePrice: 105, awayPrice: 105 },
    ];
    const later = moneylineEvent({
      id: "a",
      commenceTime: plusHours(48),
      quotes,
    });
    const earlier = moneylineEvent({
      id: "z",
      commenceTime: plusHours(24),
      quotes,
    });
    const r1 = rankNoSweat(promo, opts({ moneylineEvents: [later, earlier] }));
    expect(r1.kind === "ok" && r1.opportunity.selection.eventId).toBe("z");
    const e2 = moneylineEvent({ id: "b", commenceTime: plusHours(24), quotes });
    const e1 = moneylineEvent({ id: "a", commenceTime: plusHours(24), quotes });
    const r2 = rankNoSweat(promo, opts({ moneylineEvents: [e2, e1] }));
    expect(r2.kind === "ok" && r2.opportunity.selection.eventId).toBe("a");
  });

  it("keeps a negative best estimate", () => {
    const g = moneylineEvent({
      id: "neg",
      quotes: [
        { bookKey: "hardrockbet", homePrice: -400, awayPrice: -400 },
        { bookKey: "draftkings", homePrice: -400, awayPrice: -400 },
      ],
    });
    const r = rankNoSweat(
      { ...promo, minOddsAmerican: null },
      opts({
        moneylineEvents: [g],
        conversionRateFor: fixedRate({ hardrockbet: 0.5 }),
      }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.opportunity.solution.estimatedProfit.lt(0)).toBe(true);
  });

  it("values the refund through the real finder rate", () => {
    const g = moneylineEvent({
      id: "f",
      quotes: [
        { bookKey: "hardrockbet", homePrice: 150, awayPrice: -180 },
        { bookKey: "draftkings", homePrice: -140, awayPrice: 135 },
      ],
    });
    const rateFor = makeConversionRateFor({
      events: [g],
      now: NOW,
      hedgeBookKeys: HEDGE_BOOKS,
    });
    const r = rankNoSweat(
      promo,
      opts({ moneylineEvents: [g], conversionRateFor: rateFor }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const top = topConversionFor({
      events: [g],
      now: NOW,
      refundBookKey: "hardrockbet",
      amount: promo.refundCap,
      hedgeBookKeys: HEDGE_BOOKS,
    })!;
    expect(r.opportunity.solution.refundValue.toFixed(2)).toBe(
      top.profit.toFixed(2),
    );

    const missing = rankNoSweat(
      { ...promo, bookKey: "caesars" },
      opts({ moneylineEvents: [g], conversionRateFor: rateFor }),
    );
    expect(missing.kind).toBe("cant_price");

    const nonMember = moneylineEvent({
      id: "nm",
      quotes: [
        { bookKey: "betmgm", homePrice: 150, awayPrice: -180 },
        { bookKey: "draftkings", homePrice: -140, awayPrice: 135 },
      ],
    });
    const rateFor2 = makeConversionRateFor({
      events: [nonMember],
      now: NOW,
      hedgeBookKeys: HEDGE_BOOKS,
    });
    const priced = rankNoSweat(
      { ...promo, bookKey: "betmgm" },
      opts({ moneylineEvents: [nonMember], conversionRateFor: rateFor2 }),
    );
    expect(priced.kind).not.toBe("cant_price");
  });

  it("carries tieRisk and sameBook through", () => {
    const g = moneylineEvent({
      id: "t",
      quotes: [
        { bookKey: "hardrockbet", homePrice: 120, awayPrice: -140 },
        { bookKey: "draftkings", homePrice: -130, awayPrice: 110 },
      ],
    });
    const r = rankNoSweat(promo, opts({ moneylineEvents: [g] }));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.opportunity.sameBook).toBe(false);
    expect(typeof r.opportunity.tieRisk).toBe("boolean");
    expect(r.opportunity.tieRisk).toBe(r.opportunity.selection.tieRisk);
  });
});
