import { describe, expect, it } from "vitest";
import { promoDedupeKey } from "./dedupe";
import type { ScrapedPromo } from "./scraped";

const base: ScrapedPromo = {
  bookKey: "draftkings",
  externalId: "12345",
  promoType: "profit_boost",
  title: "NFL 50% Profit Boost",
  rawText: "NFL 50% Profit Boost -- any wager, -200 or longer, maximum bet $25.",
  sourceUrl: "https://api.draftkings.com/en/api/promotions/v3/promotions/query",
  sportKeyHint: "americanfootball_nfl",
  scopeText: "all NFL games on 9/27/2026",
  teamsText: [],
  windowStart: "2026-09-27T04:00:00.000Z",
  windowEnd: "2026-09-28T03:59:59.999Z",
  expiresAt: "2026-09-28T03:00:00.000Z",
  eligibleMarketTypes: ["moneyline", "spread", "total"],
  pinned: null,
  boostPercent: "50.00",
  boostedOddsAmerican: null,
  baseOddsAmerican: null,
  bonusAmount: null,
  maxStake: "25.00",
  maxWinnings: null,
  minOddsAmerican: -200,
  unparsedCapFields: [],
  claimRequired: "opt_in",
  finePrintNote: null,
};

describe("promoDedupeKey", () => {
  it("is a 64-char lowercase hex string", () => {
    const key = promoDedupeKey(base);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable when externalId is unchanged but rawText wording changes", () => {
    const a = promoDedupeKey(base);
    const b = promoDedupeKey({ ...base, rawText: "Different wording entirely." });
    expect(a).toBe(b);
  });

  it("is stable across case/whitespace-only rawText differences when externalId is null", () => {
    const a = promoDedupeKey({ ...base, externalId: null, rawText: "  Some Promo   Text  " });
    const b = promoDedupeKey({ ...base, externalId: null, rawText: "some promo text" });
    expect(a).toBe(b);
  });

  it("changes when boostPercent changes", () => {
    const a = promoDedupeKey(base);
    const b = promoDedupeKey({ ...base, boostPercent: "25.00" });
    expect(a).not.toBe(b);
  });

  it("changes when bonusAmount changes", () => {
    const a = promoDedupeKey({ ...base, promoType: "bonus_bet", boostPercent: null, bonusAmount: "25.00" });
    const b = promoDedupeKey({ ...base, promoType: "bonus_bet", boostPercent: null, bonusAmount: "50.00" });
    expect(a).not.toBe(b);
  });

  it("changes when boostedOddsAmerican changes", () => {
    const a = promoDedupeKey({ ...base, boostedOddsAmerican: 150, baseOddsAmerican: 100, pinned: { selectionText: "x", marketType: "moneyline", line: null } });
    const b = promoDedupeKey({ ...base, boostedOddsAmerican: 200, baseOddsAmerican: 100, pinned: { selectionText: "x", marketType: "moneyline", line: null } });
    expect(a).not.toBe(b);
  });

  it("changes when bookKey changes", () => {
    const a = promoDedupeKey(base);
    const b = promoDedupeKey({ ...base, bookKey: "ballybet" });
    expect(a).not.toBe(b);
  });

  it("is stable when only scope/match fields (teamsText, windowStart) differ (D-19)", () => {
    const a = promoDedupeKey(base);
    const b = promoDedupeKey({
      ...base,
      teamsText: ["LA Rams", "DEN Broncos"],
      windowStart: "2026-09-01T00:00:00.000Z",
      windowEnd: "2026-09-02T00:00:00.000Z",
    });
    expect(a).toBe(b);
  });
});
