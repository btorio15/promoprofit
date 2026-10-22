import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { SPORT_KEYS } from "@/config/sports";
import { usableOddsBooks } from "@/config/books";
import { buildFixtureEvents } from "@/test/fixtures/oddsEvents";
import { extractTwoWayMoneylines } from "./marketFilter";
import { rankBonusBetHedges } from "./rankBonusBetHedges";
import { makeConversionRateFor, topConversionFor } from "./conversionRate";

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
    const fn = makeConversionRateFor({ events, now, hedgeBookKeys: allKeys });
    const direct = topConversionFor({
      events,
      now,
      refundBookKey: "draftkings",
      amount: new Decimal(100),
      hedgeBookKeys: allKeys,
    });
    const a = fn("draftkings", new Decimal(100));
    expect(a).toEqual(direct);
    expect(fn("draftkings", new Decimal("100.00"))).toBe(a);
    const b = fn("draftkings", new Decimal(25));
    expect(b).not.toBe(a);
    expect(fn("nonexistent_book", new Decimal(100))).toBeNull();
  });
});
