import { describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import type { ConversionRate, ConversionRateFor } from "@/domain/hedge/conversionRate";
import { DEFAULT_LOW_PROFILE, type LowProfileSettings } from "./lowProfile";
import type { NoSweatOpportunity, NoSweatPromo } from "./rankNoSweat";
import {
  deriveLowProfileWarnings,
  estRoiPct,
  rankNoSweatFeed,
} from "./rankNoSweatFeed";

const NOW = new Date("2026-09-27T00:00:00Z");
const HEDGE = new Set(["draftkings"]);

function game(
  id: string,
  quotes: Record<string, [number, number]>,
): OddsEvent {
  const h = "Home " + id;
  const a = "Away " + id;
  return {
    id,
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: new Date(NOW.getTime() + 24 * 3600 * 1000).toISOString(),
    home_team: h,
    away_team: a,
    bookmakers: Object.entries(quotes).map(([key, [hp, ap]]) => ({
      key,
      title: key,
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: h, price: hp },
            { name: a, price: ap },
          ],
        },
      ],
    })),
  };
}

function rateFor(valueByBook: Record<string, number>): ConversionRateFor {
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

function mkPromo(id: number, bookKey: string, cap = "25.00"): NoSweatPromo {
  return {
    id,
    bookKey,
    refundCap: new Decimal(cap),
    minOddsAmerican: null,
    scope: { kind: "any" },
  };
}

const lowOff: LowProfileSettings = {
  oddsCapEnabled: false,
  oddsCapAmerican: 300,
  mainLinesOnly: false,
  naturalStakes: false,
};

function base(over: Partial<Parameters<typeof rankNoSweatFeed>[0]>) {
  return {
    promos: [] as NoSweatPromo[],
    moneylineEvents: [] as OddsEvent[],
    extendedEvents: [] as OddsEvent[],
    now: NOW,
    hedgeBookKeys: HEDGE,
    precision: "cents" as const,
    lowProfile: lowOff,
    conversionRateFor: rateFor({}),
    ...over,
  };
}

describe("rankNoSweatFeed", () => {
  it("splits ranked / not worth it / cant price and sorts best first", () => {
    const events = [
      game("g1", {
        bookA: [150, -170],
        bookB: [150, -170],
        draftkings: [-165, 145],
      }),
      game("g2", { bookC: [-200, -200], draftkings: [-200, -200] }),
    ];
    const r = rankNoSweatFeed(
      base({
        promos: [
          mkPromo(1, "bookB"),
          mkPromo(2, "bookA"),
          mkPromo(3, "bookC"),
          mkPromo(4, "nobook"),
        ],
        moneylineEvents: events,
        conversionRateFor: rateFor({ bookA: 20, bookB: 12, bookC: 0 }),
      }),
    );
    expect(r.cantPrice.map((p) => p.id)).toEqual([4]);
    expect(r.ranked.map((e) => e.promo.id)).toEqual([2, 1]);
    expect(r.notWorthIt.map((e) => e.promo.id)).toEqual([3]);
    for (const e of r.ranked) expect(e.opportunity.solution.estimatedProfit.gt(0)).toBe(true);
    expect(r.notWorthIt[0].opportunity.solution.estimatedProfit.lte(0)).toBe(true);
  });

  it("a promo whose lines are all over the cap is lowProfileBlocked; no lines is noLine", () => {
    const r = rankNoSweatFeed(
      base({
        promos: [mkPromo(1, "bookA"), mkPromo(2, "bookNoQuote")],
        moneylineEvents: [
          game("long", { bookA: [450, 420], draftkings: [430, 410] }),
        ],
        lowProfile: DEFAULT_LOW_PROFILE,
        conversionRateFor: rateFor({ bookA: 10, bookNoQuote: 10 }),
      }),
    );
    expect(r.lowProfileBlocked.map((b) => b.promo.id)).toEqual([1]);
    expect(r.lowProfileBlocked[0].filteredOut).toBeGreaterThan(0);
    expect(r.noLine.map((p) => p.id)).toEqual([2]);
  });

  it("invalid refund cap is reported and conversionRateFor is never called for it", () => {
    const spy = vi.fn(rateFor({ bookA: 10 }));
    const r = rankNoSweatFeed(
      base({
        promos: [mkPromo(1, "bookA", "0.00"), mkPromo(2, "bookA", "10.005")],
        moneylineEvents: [game("g", { bookA: [150, -170], draftkings: [-165, 145] })],
        conversionRateFor: spy,
      }),
    );
    expect(r.invalid.map((i) => i.promoId)).toEqual([1, 2]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("passes the same conversionRateFor instance to every ranking call", () => {
    const spy = vi.fn(rateFor({ bookA: 10 }));
    rankNoSweatFeed(
      base({
        promos: [mkPromo(1, "bookA"), mkPromo(2, "bookA")],
        moneylineEvents: [game("g", { bookA: [150, -170], draftkings: [-165, 145] })],
        conversionRateFor: spy,
      }),
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("ties break by promo id ascending", () => {
    const r = rankNoSweatFeed(
      base({
        promos: [mkPromo(9, "bookA"), mkPromo(3, "bookA")],
        moneylineEvents: [game("g", { bookA: [150, -170], draftkings: [-165, 145] })],
        conversionRateFor: rateFor({ bookA: 20 }),
      }),
    );
    expect(r.ranked.map((e) => e.promo.id)).toEqual([3, 9]);
  });
});

describe("estRoiPct", () => {
  it("14.20 / (25.00 + 20.00) = 31.56", () => {
    expect(estRoiPct(new Decimal("14.20"), new Decimal("25.00"), new Decimal("20.00"))).toBe("31.56");
  });
  it("zero outlay is 0.00", () => {
    expect(estRoiPct(new Decimal(0), new Decimal(0), new Decimal(0))).toBe("0.00");
  });
});

describe("deriveLowProfileWarnings", () => {
  function opp(odds: number, hedgeStake: string, fromAlternate = false): NoSweatOpportunity {
    return {
      qualifying: { bookKey: "bookA", oddsAmerican: odds },
      selection: { fromAlternate },
      solution: { hedgeStake: new Decimal(hedgeStake) },
    } as unknown as NoSweatOpportunity;
  }
  it("long_odds only when the cap is disabled", () => {
    expect(deriveLowProfileWarnings(opp(450, "20.00"), lowOff)).toEqual(["long_odds"]);
    expect(
      deriveLowProfileWarnings(opp(450, "20.00"), { ...lowOff, oddsCapEnabled: true }),
    ).toEqual([]);
  });
  it("alternate_line when main-lines-only is off", () => {
    expect(deriveLowProfileWarnings(opp(150, "20.00", true), lowOff)).toContain("alternate_line");
    expect(
      deriveLowProfileWarnings(opp(150, "20.00", true), { ...lowOff, mainLinesOnly: true }),
    ).not.toContain("alternate_line");
  });
  it("exact_cent_stake only when natural stakes is off and cents are non-zero", () => {
    expect(deriveLowProfileWarnings(opp(150, "20.37"), lowOff)).toContain("exact_cent_stake");
    expect(deriveLowProfileWarnings(opp(150, "20.00"), lowOff)).not.toContain("exact_cent_stake");
    expect(
      deriveLowProfileWarnings(opp(150, "20.37"), { ...lowOff, naturalStakes: true }),
    ).not.toContain("exact_cent_stake");
  });
});
