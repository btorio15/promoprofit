import { describe, expect, it } from "vitest";
import { mapActivePromoRow } from "@/db/promos";
import type { AddPromoInput } from "./addedPromoInput";
import { buildAddedPromoRow, etExpiryInstant, type AddedPromoInsert } from "./buildAddedPromo";
import { ScrapedPromoSchema } from "./scraped";
import { PROMO_MARKET_TYPES } from "./types";

const NOW = new Date("2026-10-01T16:00:00.000Z");
const EXPIRES = new Date("2026-10-05T03:59:00.000Z");

const input: AddPromoInput = {
  promoType: "bonus_bet",
  bookKey: "fanduel",
  bonusAmount: "50",
  expires: { etDate: "2026-10-04", etTime: "23:59" },
  scope: null,
};

function build(scope: Parameters<typeof buildAddedPromoRow>[0]["scope"], overrides: Partial<AddPromoInput> = {}) {
  return buildAddedPromoRow({
    input: { ...input, ...overrides } as AddPromoInput,
    scope,
    bookName: "FanDuel",
    now: NOW,
    expiresAt: EXPIRES,
    userId: 7,
    dedupeKey: "added:test",
  });
}

function toActiveRow(values: AddedPromoInsert) {
  return {
    id: 1,
    bookKey: values.bookKey,
    promoType: values.promoType,
    scopeKind: values.scopeKind ?? null,
    eventId: values.eventId ?? null,
    sportKey: values.sportKey ?? null,
    homeTeam: values.homeTeam ?? null,
    awayTeam: values.awayTeam ?? null,
    windowStart: values.windowStart ?? null,
    windowEnd: values.windowEnd ?? null,
    marketType: values.marketType ?? null,
    line: values.line ?? null,
    side: values.side ?? null,
    parsed: values.parsed,
    boostPercent: values.boostPercent ?? null,
    boostedOddsAmerican: values.boostedOddsAmerican ?? null,
    baseOddsAmerican: values.baseOddsAmerican ?? null,
    bonusAmount: values.bonusAmount ?? null,
    maxStake: values.maxStake ?? null,
    maxWinnings: values.maxWinnings ?? null,
    maxWinningsKind: values.maxWinningsKind ?? null,
    minOddsAmerican: values.minOddsAmerican ?? null,
    finePrintNote: values.finePrintNote ?? null,
    autoMatched: values.autoMatched ?? false,
    addedByUserId: values.addedByUserId,
    confirmedByName: null,
    correctedByName: null,
    capEnteredByName: null,
  };
}

describe("etExpiryInstant", () => {
  it("is DST-correct: EDT in October", () => {
    expect(etExpiryInstant("2026-10-04", "23:59")).toBe("2026-10-05T03:59:00.000Z");
  });

  it("is DST-correct: EST in December", () => {
    expect(etExpiryInstant("2026-12-01", "23:59")).toBe("2026-12-02T04:59:00.000Z");
  });

  it("handles midnight and noon", () => {
    expect(etExpiryInstant("2026-10-04", "00:00")).toBe("2026-10-04T04:00:00.000Z");
    expect(etExpiryInstant("2026-10-04", "12:00")).toBe("2026-10-04T16:00:00.000Z");
  });

  it("returns null for an impossible date", () => {
    expect(etExpiryInstant("2026-02-30", "10:00")).toBeNull();
  });
});

describe("buildAddedPromoRow", () => {
  it("scope any: bonus bet with no scope columns", () => {
    const result = build({ kind: "any" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const v = result.values;
    expect(v).toMatchObject({
      scopeKind: "any",
      sportKey: null,
      eventId: null,
      windowStart: null,
      windowEnd: null,
      bonusAmount: "50.00",
      status: "active",
      autoMatched: false,
      addedByUserId: 7,
      sourceUrl: "user-added",
      rawText: "",
    });
    expect(v.expiresAt).toEqual(EXPIRES);
    const parsed = ScrapedPromoSchema.safeParse(v.parsed);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sourceUrl).toBe("user-added");
      expect(parsed.data.rawText).toBe("");
      expect(parsed.data.teamsText).toEqual([]);
      expect(parsed.data.eligibleMarketTypes).toEqual([...PROMO_MARKET_TYPES]);
    }
  });

  it("event scope: sets event columns and teamsText [away, home]", () => {
    const result = build({
      kind: "event",
      eventId: "evt-1",
      sportKey: "americanfootball_nfl",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      commenceTime: "2026-10-03T17:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toMatchObject({
      scopeKind: "event",
      eventId: "evt-1",
      sportKey: "americanfootball_nfl",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
    });
    expect(result.values.eventCommenceTime).toEqual(new Date("2026-10-03T17:00:00.000Z"));
    expect((result.values.parsed as { teamsText: string[] }).teamsText).toEqual(["LA Rams", "DEN Broncos"]);
  });

  it("sport_window scope: window dates on the row and ISO in parsed", () => {
    const result = build({
      kind: "sport_window",
      sportKey: "americanfootball_nfl",
      windowStart: "2026-10-04T04:00:00.000Z",
      windowEnd: "2026-10-06T03:59:59.999Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.scopeKind).toBe("sport_window");
    expect(result.values.windowStart).toEqual(new Date("2026-10-04T04:00:00.000Z"));
    expect(result.values.windowEnd).toEqual(new Date("2026-10-06T03:59:59.999Z"));
    const parsed = result.values.parsed as { windowStart: string; windowEnd: string };
    expect(parsed.windowStart).toBe("2026-10-04T04:00:00.000Z");
    expect(parsed.windowEnd).toBe("2026-10-06T03:59:59.999Z");
  });

  it("stores min odds when given", () => {
    const result = build({ kind: "any" }, { minOddsAmerican: -200 });
    expect(result.ok && result.values.minOddsAmerican).toBe(-200);
  });

  it("round-trips through mapActivePromoRow as addedByYou for the owner (read path never drops it)", () => {
    for (const scope of [
      { kind: "any" as const },
      {
        kind: "event" as const,
        eventId: "evt-1",
        sportKey: "americanfootball_nfl",
        homeTeam: "DEN Broncos",
        awayTeam: "LA Rams",
        commenceTime: "2026-10-03T17:00:00.000Z",
      },
      {
        kind: "sport_window" as const,
        sportKey: "americanfootball_nfl",
        windowStart: "2026-10-04T04:00:00.000Z",
        windowEnd: "2026-10-06T03:59:59.999Z",
      },
    ]) {
      const result = build(scope);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const mapped = mapActivePromoRow(toActiveRow(result.values), 7);
      expect(mapped).not.toBeNull();
      expect(mapped?.addedByYou).toBe(true);
      expect(mapped?.bonusAmount).toBe("50.00");
      expect(mapped?.scope.kind).toBe(scope.kind);
      expect(mapActivePromoRow(toActiveRow(result.values), 8)?.addedByYou).toBe(false);
    }
  });
});

describe("buildAddedPromoRow (profit boost)", () => {
  const eventScope = {
    kind: "event" as const,
    eventId: "evt-1",
    sportKey: "americanfootball_nfl",
    homeTeam: "DEN Broncos",
    awayTeam: "LA Rams",
    commenceTime: "2026-10-03T17:00:00.000Z",
  };
  const boostBase = {
    promoType: "profit_boost" as const,
    bookKey: "fanduel",
    maxStake: "25",
  };

  function buildBoost(
    boostInput: AddPromoInput,
    scope: Parameters<typeof buildAddedPromoRow>[0]["scope"],
    pinned?: Parameters<typeof buildAddedPromoRow>[0]["pinned"],
  ) {
    return buildAddedPromoRow({
      input: boostInput,
      scope,
      bookName: "FanDuel",
      now: NOW,
      expiresAt: null,
      userId: 7,
      dedupeKey: "added:test",
      pinned,
    });
  }

  it("pinned boosted odds: pin columns, odds set, percent null, round-trips with pinned", () => {
    const result = buildBoost(
      {
        ...boostBase,
        boost: { mode: "odds", boostedOddsAmerican: 250 },
        scope: { kind: "event", eventId: "evt-1", pinned: { marketType: "moneyline", line: null, side: "home" } },
      },
      eventScope,
      { marketType: "moneyline", line: null, side: "home", selectionText: "DEN Broncos" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const v = result.values;
    expect(v).toMatchObject({
      promoType: "profit_boost",
      marketType: "moneyline",
      line: null,
      side: "home",
      boostedOddsAmerican: 250,
      boostPercent: null,
      maxStake: "25.00",
      expiresAt: null,
    });
    const parsed = v.parsed as { pinned: { selectionText: string }; eligibleMarketTypes: string[] };
    expect(parsed.pinned.selectionText).toBe("DEN Broncos");
    expect(parsed.eligibleMarketTypes).toEqual(["moneyline"]);
    const mapped = mapActivePromoRow(toActiveRow(v), 7);
    expect(mapped).not.toBeNull();
    expect(mapped?.pinned).not.toBeNull();
  });

  it("boost %, unpinned: 2dp strings, cap kind stored, no expiry", () => {
    const result = buildBoost(
      {
        ...boostBase,
        boost: { mode: "percent", boostPercent: "50" },
        scope: { kind: "sport_day", sportKey: "americanfootball_nfl", etDate: "2026-10-04" },
        maxWinnings: { amount: "100", kind: "total_payout" },
      },
      {
        kind: "sport_window",
        sportKey: "americanfootball_nfl",
        windowStart: "2026-10-04T04:00:00.000Z",
        windowEnd: "2026-10-06T03:59:59.999Z",
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toMatchObject({
      boostPercent: "50.00",
      maxStake: "25.00",
      maxWinnings: "100.00",
      maxWinningsKind: "total_payout",
      marketType: null,
      side: null,
      expiresAt: null,
      scopeKind: "sport_window",
    });
    expect(mapActivePromoRow(toActiveRow(result.values), 7)?.addedByYou).toBe(true);
  });

  it("spread pin keeps the half-point line", () => {
    const result = buildBoost(
      {
        ...boostBase,
        boost: { mode: "percent", boostPercent: "30" },
        scope: { kind: "event", eventId: "evt-1", pinned: { marketType: "spread", line: -3.5, side: "away" } },
      },
      eventScope,
      { marketType: "spread", line: -3.5, side: "away", selectionText: "LA Rams" },
    );
    expect(result.ok && result.values.line).toBe(-3.5);
  });
});
