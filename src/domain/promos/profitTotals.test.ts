import { describe, expect, it } from "vitest";
import {
  denverDate,
  periodStartDates,
  summarizeAvailableProfit,
  sumOwnBookProfit,
  sumPortfolioProfit,
  type ProfitObservation,
} from "./profitTotals";

describe("sumPortfolioProfit (D-12: a pair counts once)", () => {
  const singles = [
    { promoId: 1, guaranteedProfit: "20.00", hasPromoBook: true },
    { promoId: 2, guaranteedProfit: "15.00", hasPromoBook: true },
    { promoId: 3, guaranteedProfit: "5.00", hasPromoBook: true },
  ];

  it("with no pairs equals sumOwnBookProfit", () => {
    expect(sumPortfolioProfit(singles, [], new Set())).toBe(sumOwnBookProfit(singles, new Set()));
  });

  it("counts a pair once in place of its two singles", () => {
    const pairs = [{ promoIdA: 1, promoIdB: 2, guaranteedProfit: "60.00" }];
    expect(sumPortfolioProfit(singles, pairs, new Set())).toBe("65.00");
  });

  it("excludes done promos", () => {
    expect(sumPortfolioProfit(singles, [], new Set([3]))).toBe("35.00");
  });

  it("returns 0.00 when empty", () => {
    expect(sumPortfolioProfit([], [], new Set())).toBe("0.00");
  });

  it("sums exactly", () => {
    const rows = [
      { promoId: 1, guaranteedProfit: "0.10", hasPromoBook: true },
      { promoId: 2, guaranteedProfit: "0.20", hasPromoBook: true },
    ];
    expect(sumPortfolioProfit(rows, [], new Set())).toBe("0.30");
  });
});

describe("sumOwnBookProfit (quick-260927-n12, owner decision 1)", () => {
  it("sums only own-book, not-used rows", () => {
    const rows = [
      { promoId: 1, guaranteedProfit: "10.10", hasPromoBook: true },
      { promoId: 2, guaranteedProfit: "20.20", hasPromoBook: true },
      { promoId: 3, guaranteedProfit: "99.99", hasPromoBook: false },
    ];
    expect(sumOwnBookProfit(rows, new Set([2]))).toBe("10.10");
  });

  it("returns 0.00 for an empty row list", () => {
    expect(sumOwnBookProfit([], new Set())).toBe("0.00");
  });

  it("sums exactly with decimal.js (float would give 0.30000000000000004)", () => {
    const rows = [
      { promoId: 1, guaranteedProfit: "0.10", hasPromoBook: true },
      { promoId: 2, guaranteedProfit: "0.20", hasPromoBook: true },
    ];
    expect(sumOwnBookProfit(rows, new Set())).toBe("0.30");
  });

  it("sums many small values exactly", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      promoId: i + 1,
      guaranteedProfit: "0.01",
      hasPromoBook: true,
    }));
    expect(sumOwnBookProfit(rows, new Set())).toBe("0.10");
  });
});

describe("denverDate (America/Denver, DST-safe via Intl)", () => {
  it("2026-01-15T06:30:00Z (23:30 MST Jan 14) -> 2026-01-14", () => {
    expect(denverDate(new Date("2026-01-15T06:30:00Z"))).toBe("2026-01-14");
  });

  it("2026-01-15T07:00:00Z -> 2026-01-15", () => {
    expect(denverDate(new Date("2026-01-15T07:00:00Z"))).toBe("2026-01-15");
  });

  it("2026-07-15T05:30:00Z (23:30 MDT Jul 14) -> 2026-07-14", () => {
    expect(denverDate(new Date("2026-07-15T05:30:00Z"))).toBe("2026-07-14");
  });

  it("2026-07-15T06:00:00Z -> 2026-07-15", () => {
    expect(denverDate(new Date("2026-07-15T06:00:00Z"))).toBe("2026-07-15");
  });

  it("maps correctly around the spring-forward DST day (2026-03-08)", () => {
    // MST (UTC-7) before 2am local on 3/8; MDT (UTC-6) after. 08:59Z is
    // still 1:59 AM MST on 3/8; 09:00Z jumps to 3:00 AM MDT (still 3/8).
    expect(denverDate(new Date("2026-03-08T08:59:00Z"))).toBe("2026-03-08");
    expect(denverDate(new Date("2026-03-08T09:00:00Z"))).toBe("2026-03-08");
    // Just before local midnight on 3/7 (MST, UTC-7): 06:59Z is 11:59 PM 3/7.
    expect(denverDate(new Date("2026-03-08T06:59:00Z"))).toBe("2026-03-07");
  });

  it("maps correctly around the fall-back DST day (2026-11-01)", () => {
    // MDT (UTC-6) before 2am local on 11/1; MST (UTC-7) after.
    // Just before local midnight on 10/31 (MDT, UTC-6): 05:59Z is 11:59 PM 10/31.
    expect(denverDate(new Date("2026-11-01T05:59:00Z"))).toBe("2026-10-31");
    expect(denverDate(new Date("2026-11-01T06:00:00Z"))).toBe("2026-11-01");
  });
});

describe("periodStartDates (Monday-start week, America/Denver)", () => {
  it("Sunday 2026-09-27 local -> week 2026-09-21, month 2026-09-01", () => {
    // 2026-09-27 is a Sunday; noon local (18:00Z in MDT, UTC-6) is safely mid-day.
    const now = new Date("2026-09-27T18:00:00Z");
    expect(periodStartDates(now)).toEqual({ today: "2026-09-27", weekStart: "2026-09-21", monthStart: "2026-09-01" });
  });

  it("Monday -> week start is itself", () => {
    // 2026-09-28 is a Monday.
    const now = new Date("2026-09-28T18:00:00Z");
    expect(periodStartDates(now)).toEqual({ today: "2026-09-28", weekStart: "2026-09-28", monthStart: "2026-09-01" });
  });

  it("a week spanning a month boundary: Thu 2026-10-01 -> week 2026-09-28, month 2026-10-01", () => {
    const now = new Date("2026-10-01T18:00:00Z");
    expect(periodStartDates(now)).toEqual({ today: "2026-10-01", weekStart: "2026-09-28", monthStart: "2026-10-01" });
  });

  it("an instant at 05:00Z on the 1st that is still the prior month in Denver -> prior month's start", () => {
    // 2026-10-01T05:00:00Z is 2026-09-30 23:00 MDT (UTC-6) -- still September in Denver.
    const now = new Date("2026-10-01T05:00:00Z");
    const result = periodStartDates(now);
    expect(result.today).toBe("2026-09-30");
    expect(result.monthStart).toBe("2026-09-01");
  });
});

describe("summarizeAvailableProfit (owner decision 3: per-period dedupe/max)", () => {
  // Anchor "now" to Sunday 2026-09-27 noon MDT so week = [2026-09-21..],
  // month = [2026-09-01..].
  const now = new Date("2026-09-27T18:00:00Z");
  const ownBooks = new Set(["draftkings"]);

  it("same promo on 3 days of this week with 5.00/8.00/6.00 -> week counts 8.00 once, today counts only today's value", () => {
    const observations: ProfitObservation[] = [
      { promoId: 1, bookKey: "draftkings", denverDate: "2026-09-25", maxGuaranteedProfit: "5.00" },
      { promoId: 1, bookKey: "draftkings", denverDate: "2026-09-26", maxGuaranteedProfit: "8.00" },
      { promoId: 1, bookKey: "draftkings", denverDate: "2026-09-27", maxGuaranteedProfit: "6.00" },
    ];
    const result = summarizeAvailableProfit(observations, ownBooks, now, new Set());
    expect(result.week).toBe("8.00");
    expect(result.today).toBe("6.00");
  });

  it("excludes a promo at a non-own book from all three periods", () => {
    const observations: ProfitObservation[] = [
      { promoId: 1, bookKey: "fanduel", denverDate: "2026-09-27", maxGuaranteedProfit: "5.00" },
    ];
    const result = summarizeAvailableProfit(observations, ownBooks, now, new Set());
    expect(result).toEqual({ today: "0.00", week: "0.00", month: "0.00" });
  });

  it("includes a week day that falls before the month start in the week total, but excludes it from month", () => {
    // week start 2026-09-21 (Monday) is within September, so construct a
    // scenario using a week that spans the month boundary instead: anchor
    // "now" to Thu 2026-10-01 (week start 2026-09-28, month start 2026-10-01).
    const octNow = new Date("2026-10-01T18:00:00Z");
    const observations: ProfitObservation[] = [
      { promoId: 1, bookKey: "draftkings", denverDate: "2026-09-29", maxGuaranteedProfit: "7.00" },
    ];
    const result = summarizeAvailableProfit(observations, ownBooks, octNow, new Set());
    expect(result.week).toBe("7.00");
    expect(result.month).toBe("0.00");
  });

  it("returns 0.00 for today/week/month when observations is empty", () => {
    expect(summarizeAvailableProfit([], ownBooks, now, new Set())).toEqual({ today: "0.00", week: "0.00", month: "0.00" });
  });

  it("each promo counts at most once per period, summed across distinct promos", () => {
    const observations: ProfitObservation[] = [
      { promoId: 1, bookKey: "draftkings", denverDate: "2026-09-27", maxGuaranteedProfit: "5.00" },
      { promoId: 1, bookKey: "draftkings", denverDate: "2026-09-26", maxGuaranteedProfit: "50.00" },
      { promoId: 2, bookKey: "draftkings", denverDate: "2026-09-27", maxGuaranteedProfit: "3.00" },
    ];
    const result = summarizeAvailableProfit(observations, ownBooks, now, new Set());
    // today: promo 1 -> 5.00, promo 2 -> 3.00 => 8.00
    expect(result.today).toBe("8.00");
    // week: promo 1 max(5.00, 50.00) -> 50.00, promo 2 -> 3.00 => 53.00
    expect(result.week).toBe("53.00");
  });
});

describe("summarizeAvailableProfit excludeFromToday (quick-260930-fge)", () => {
  const now = new Date("2026-09-27T18:00:00Z");
  const ownBooks = new Set(["draftkings"]);
  const obs = (promoId: number, denverDate: string, v: string): ProfitObservation => ({
    promoId,
    bookKey: "draftkings",
    denverDate,
    maxGuaranteedProfit: v,
  });

  it("drops a Done promo from today only; week/month keep it", () => {
    const r = summarizeAvailableProfit(
      [obs(1, "2026-09-27", "6.00"), obs(2, "2026-09-27", "4.00")],
      ownBooks,
      now,
      new Set([1]),
    );
    expect(r).toEqual({ today: "4.00", week: "10.00", month: "10.00" });
  });

  it("excludes both promos of a Done pair from today", () => {
    const r = summarizeAvailableProfit(
      [obs(1, "2026-09-27", "6.00"), obs(2, "2026-09-27", "4.00"), obs(3, "2026-09-27", "2.50")],
      ownBooks,
      now,
      new Set([1, 2]),
    );
    expect(r.today).toBe("2.50");
    expect(r.week).toBe("12.50");
    expect(r.month).toBe("12.50");
  });

  it("a Done promo seen earlier this week at a higher value still counts in week at its max", () => {
    const r = summarizeAvailableProfit(
      [obs(1, "2026-09-25", "9.00"), obs(1, "2026-09-27", "6.00")],
      ownBooks,
      now,
      new Set([1]),
    );
    expect(r).toEqual({ today: "0.00", week: "9.00", month: "9.00" });
  });

  it("every promo Done -> today 0.00, week/month non-zero", () => {
    const r = summarizeAvailableProfit([obs(1, "2026-09-27", "6.00")], ownBooks, now, new Set([1]));
    expect(r).toEqual({ today: "0.00", week: "6.00", month: "6.00" });
  });
});
