import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { SPORT_KEYS } from "@/config/sports";
import { usableOddsBooks } from "@/config/books";
import { buildFixtureEvents } from "@/test/fixtures/oddsEvents";
import { extractTwoWayMoneylines } from "./marketFilter";
import { rankBonusBetHedges } from "./rankBonusBetHedges";
import { makeConversionRateFor, rankRefundOpportunities, topConversionFor } from "./conversionRate";

const now = new Date("2026-10-01T12:00:00.000Z");
const events = buildFixtureEvents(now);
const allKeys = new Set(usableOddsBooks().map((b) => b.key));

function finderTop(bookKey: string, amount: Decimal, hedgeBookKeys: ReadonlySet<string>) {
  const markets = extractTwoWayMoneylines(events, {
    now,
    windowDays: 7,
    allowedBookKeys: new Set([...hedgeBookKeys, bookKey]),
    sportKeys: new Set(SPORT_KEYS),
  });
  return rankBonusBetHedges(markets, {
    bonusBookKey: bookKey,
    bonusAmount: amount,
    hedgeBookKeys,
    limit: 1,
  })[0];
}

describe("topConversionFor", () => {
  it("values draftkings $100 at the finder's top-1 (80.00)", () => {
    const r = topConversionFor({
      events,
      now,
      refundBookKey: "draftkings",
      amount: new Decimal(100),
      hedgeBookKeys: allKeys,
    });
    expect(r).not.toBeNull();
    expect(r!.profit.toFixed(2)).toBe("80.00");
    expect(r!.rate.times(100).toFixed(2)).toBe("80.00");
    const top = finderTop("draftkings", new Decimal(100), allKeys);
    expect(r!.profit.equals(top.result.guaranteedProfit)).toBe(true);
    expect(r!.pct.equals(top.result.conversionPct)).toBe(true);
    expect(r!.eventId).toBe(top.eventId);
  });

  it("keeps refund book quotes even when it is outside My Books", () => {
    const hedge = new Set([...allKeys].filter((k) => k !== "draftkings"));
    const r = topConversionFor({
      events,
      now,
      refundBookKey: "draftkings",
      amount: new Decimal(100),
      hedgeBookKeys: hedge,
    });
    expect(r).not.toBeNull();
    expect(r!.hedgeBookKey).not.toBe("draftkings");
  });

  it("returns null when the refund book has no cached odds", () => {
    expect(
      topConversionFor({
        events,
        now,
        refundBookKey: "nonexistent_book",
        amount: new Decimal(100),
        hedgeBookKeys: allKeys,
      }),
    ).toBeNull();
  });

  it("returns null with no hedge books", () => {
    expect(
      topConversionFor({
        events,
        now,
        refundBookKey: "draftkings",
        amount: new Decimal(100),
        hedgeBookKeys: new Set(),
      }),
    ).toBeNull();
  });

  it("computes at the given amount, not a scaled rate", () => {
    const r = topConversionFor({
      events,
      now,
      refundBookKey: "draftkings",
      amount: new Decimal(25),
      hedgeBookKeys: allKeys,
    });
    const top = finderTop("draftkings", new Decimal(25), allKeys);
    expect(r!.profit.equals(top.result.guaranteedProfit)).toBe(true);
  });
});

describe("makeConversionRateFor", () => {
  it("matches topConversionFor and memoizes per (book, amount)", () => {
    const fn = makeConversionRateFor({ events, now });
    const direct = topConversionFor({
      events,
      now,
      refundBookKey: "draftkings",
      amount: new Decimal(100),
      hedgeBookKeys: allKeys,
    });
    const a = fn("draftkings", new Decimal(100), allKeys);
    expect(a).toEqual(direct);
    expect(fn("draftkings", new Decimal("100.00"), allKeys)).toBe(a);
    // Same set, different insertion order: same cache entry.
    expect(fn("draftkings", new Decimal(100), new Set([...allKeys].reverse()))).toBe(a);
    const b = fn("draftkings", new Decimal(25), allKeys);
    expect(b).not.toBe(a);
    expect(fn("nonexistent_book", new Decimal(100), allKeys)).toBeNull();
  });

  it("rejects amounts the cache key would round, in either call order", () => {
    const fn = makeConversionRateFor({ events, now });
    expect(() => fn("draftkings", new Decimal("25.004"), allKeys)).toThrow(RangeError);
    const exact = fn("draftkings", new Decimal(25), allKeys);
    expect(exact!.amount.toFixed(2)).toBe("25.00");
    expect(() => fn("draftkings", new Decimal("25.004"), allKeys)).toThrow(RangeError);
    expect(() => fn("draftkings", new Decimal(0), allKeys)).toThrow(RangeError);
    expect(() => fn("draftkings", new Decimal(-5), allKeys)).toThrow(RangeError);
  });

  it("values at the hedge books passed per call, keyed separately in the cache (D-03)", () => {
    const fn = makeConversionRateFor({ events, now });
    const narrow = new Set([...allKeys].filter((k) => k !== "draftkings"));
    const wide = fn("draftkings", new Decimal(100), allKeys);
    const mine = fn("draftkings", new Decimal(100), narrow);
    expect(mine).toEqual(
      topConversionFor({
        events,
        now,
        refundBookKey: "draftkings",
        amount: new Decimal(100),
        hedgeBookKeys: narrow,
      }),
    );
    expect(mine).not.toBe(wide);
    expect(mine!.hedgeBookKey).not.toBe("draftkings");
    expect(fn("draftkings", new Decimal(100), new Set())).toBeNull();
  });

  it("ignores market venues in hedgeBookKeys (Phase 12: no-sweat markets deferred)", () => {
    const withMarket = new Set([...allKeys, "kalshi", "polymarket_us"]);
    const a = topConversionFor({ events, now, refundBookKey: "draftkings", amount: new Decimal(100), hedgeBookKeys: withMarket });
    const b = topConversionFor({ events, now, refundBookKey: "draftkings", amount: new Decimal(100), hedgeBookKeys: allKeys });
    expect(a).toEqual(b);
  });
});

describe("rankRefundOpportunities", () => {
  const cases: Array<[string, string, ReadonlySet<string>]> = [
    ["draftkings", "100", allKeys],
    ["fanduel", "25", allKeys],
    ["draftkings", "40", new Set([...allKeys].filter((k) => k !== "draftkings"))],
  ];

  it.each(cases)("limit 1 matches topConversionFor for %s %s", (book, amt, hedge) => {
    const amount = new Decimal(amt);
    const ranked = rankRefundOpportunities({ events, now, refundBookKey: book, amount, hedgeBookKeys: hedge, limit: 1 });
    const top = topConversionFor({ events, now, refundBookKey: book, amount, hedgeBookKeys: hedge });
    expect(ranked[0].eventId).toBe(top!.eventId);
    expect(ranked[0].hedge.bookKey).toBe(top!.hedgeBookKey);
    expect(ranked[0].result.guaranteedProfit.equals(top!.profit)).toBe(true);
  });

  it("returns [] and null when the refund book has no odds", () => {
    const args = { events, now, refundBookKey: "no_such_book", amount: new Decimal(50), hedgeBookKeys: allKeys };
    expect(rankRefundOpportunities({ ...args, limit: 1 })).toEqual([]);
    expect(topConversionFor(args)).toBeNull();
  });

  it("limit 3 returns at most 3, best first", () => {
    const r = rankRefundOpportunities({
      events, now, refundBookKey: "draftkings", amount: new Decimal(100), hedgeBookKeys: allKeys, limit: 3,
    });
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r.length).toBeGreaterThan(0);
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].result.guaranteedProfit.gte(r[i].result.guaranteedProfit)).toBe(true);
    }
  });

  it("rejects bad amounts", () => {
    expect(() =>
      rankRefundOpportunities({ events, now, refundBookKey: "draftkings", amount: new Decimal("25.004"), hedgeBookKeys: allKeys, limit: 1 }),
    ).toThrow(RangeError);
  });
});
