import { describe, expect, it } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import {
  PRICE_STALE_AFTER_MINUTES,
  buildPriceAgeContext,
  describePriceAge,
  isPriceStale,
  oddsSourceFor,
  pricesAsOfFor,
} from "./priceAge";

const ML_AT = new Date("2026-10-01T15:43:00.000Z");
const EXT_AT = new Date("2026-10-01T15:20:00.000Z");

function evt(id: string): OddsEvent {
  return {
    id,
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: "2026-10-02T00:00:00Z",
    home_team: "H",
    away_team: "A",
    bookmakers: [],
  };
}

const ctx = buildPriceAgeContext([evt("inML")], ML_AT, EXT_AT);

describe("oddsSourceFor", () => {
  it("moneyline in the moneyline cache -> moneyline", () => {
    expect(oddsSourceFor({ eventId: "inML", marketType: "moneyline" }, ctx)).toBe("moneyline");
  });
  it("moneyline only in the extended cache -> extended", () => {
    expect(oddsSourceFor({ eventId: "extOnly", marketType: "moneyline" }, ctx)).toBe("extended");
  });
  it("spread and total are always extended, even when the event is in the moneyline cache", () => {
    expect(oddsSourceFor({ eventId: "inML", marketType: "spread" }, ctx)).toBe("extended");
    expect(oddsSourceFor({ eventId: "inML", marketType: "total" }, ctx)).toBe("extended");
  });
});

describe("pricesAsOfFor", () => {
  it("picks the cache the selection came from", () => {
    expect(pricesAsOfFor([{ eventId: "inML", marketType: "moneyline" }], ctx)).toBe(ML_AT.toISOString());
    expect(pricesAsOfFor([{ eventId: "inML", marketType: "spread" }], ctx)).toBe(EXT_AT.toISOString());
  });
  it("uses the OLDER of two caches", () => {
    const legs = [
      { eventId: "inML", marketType: "moneyline" as const },
      { eventId: "inML", marketType: "spread" as const },
    ];
    expect(pricesAsOfFor(legs, ctx)).toBe(EXT_AT.toISOString());
    const reversed = buildPriceAgeContext([evt("inML")], EXT_AT, ML_AT);
    expect(pricesAsOfFor(legs, reversed)).toBe(EXT_AT.toISOString());
    const swapped = buildPriceAgeContext([evt("inML")], new Date("2026-10-01T15:00:00Z"), ML_AT);
    expect(pricesAsOfFor(legs, swapped)).toBe("2026-10-01T15:00:00.000Z");
  });
  it("is null when a needed cache timestamp is unknown", () => {
    const noExt = buildPriceAgeContext([evt("inML")], ML_AT, null);
    expect(pricesAsOfFor([{ eventId: "inML", marketType: "spread" }], noExt)).toBeNull();
    expect(pricesAsOfFor([{ eventId: "inML", marketType: "moneyline" }, { eventId: "inML", marketType: "total" }], noExt)).toBeNull();
  });
});

describe("isPriceStale", () => {
  const asOf = "2026-10-01T15:00:00.000Z";
  it("threshold constant is 15 minutes", () => {
    expect(PRICE_STALE_AFTER_MINUTES).toBe(15);
  });
  it("exactly 15:00.000 is fresh; 15:00.001 is stale; 14:59 is fresh", () => {
    expect(isPriceStale(asOf, new Date("2026-10-01T15:15:00.000Z"))).toBe(false);
    expect(isPriceStale(asOf, new Date("2026-10-01T15:15:00.001Z"))).toBe(true);
    expect(isPriceStale(asOf, new Date("2026-10-01T15:14:00.000Z"))).toBe(false);
  });
  it("null is never stale", () => {
    expect(isPriceStale(null, new Date())).toBe(false);
  });
});

describe("describePriceAge", () => {
  it("same Denver day -> time only (Mountain time)", () => {
    const d = describePriceAge("2026-10-01T15:43:00Z", new Date("2026-10-01T15:50:00Z"));
    expect(d).toEqual({ label: "Prices as of 9:43 AM", stale: false });
  });
  it("earlier Denver day -> includes the weekday", () => {
    const d = describePriceAge("2026-09-30T15:43:00Z", new Date("2026-10-01T15:50:00Z"));
    expect(d?.label).toBe("Prices as of Wed 9:43 AM");
    expect(d?.stale).toBe(true);
  });
  it("stale flag follows isPriceStale", () => {
    expect(describePriceAge("2026-10-01T15:43:00Z", new Date("2026-10-01T15:58:00.001Z"))?.stale).toBe(true);
  });
  it("null -> null", () => {
    expect(describePriceAge(null, new Date())).toBeNull();
  });
});
