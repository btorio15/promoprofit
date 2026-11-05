import { describe, expect, it } from "vitest";
import { splitIntroOffers } from "./introOffers";
import { ScrapedPromoSchema } from "@/domain/promos/scraped";

describe("splitIntroOffers", () => {
  it("sends flagged rows to intro and leaves the rest as promos", () => {
    const rows: { id: number; introOffer?: boolean }[] = [{ id: 1 }, { id: 2, introOffer: true }, { id: 3, introOffer: false }, { id: 4, introOffer: true }];
    const { promos, intro } = splitIntroOffers(rows);
    expect(intro.map((r) => r.id)).toEqual([2, 4]);
    expect(promos.map((r) => r.id)).toEqual([1, 3]);
  });

  it("returns empty intro when nothing is flagged", () => {
    expect(splitIntroOffers<{ id: number; introOffer?: boolean }>([{ id: 1 }]).intro).toEqual([]);
  });
});

describe("ScrapedPromoSchema introOffer", () => {
  it("keeps the flag when present and allows it to be absent", () => {
    const base = {
      bookKey: "betmgm", externalId: null, promoType: "no_sweat", title: "t", rawText: "", sourceUrl: "x",
      sportKeyHint: null, scopeText: "", teamsText: [], windowStart: null, windowEnd: null, expiresAt: null,
      eligibleMarketTypes: ["moneyline"], pinned: null, boostPercent: null, boostedOddsAmerican: null,
      baseOddsAmerican: null, bonusAmount: "1500.00", maxStake: null, maxWinnings: null, minOddsAmerican: null,
      unparsedCapFields: [], claimRequired: null, finePrintNote: null,
    };
    const withFlag = ScrapedPromoSchema.safeParse({ ...base, introOffer: true });
    expect(withFlag.success && withFlag.data.introOffer).toBe(true);
    const without = ScrapedPromoSchema.safeParse(base);
    expect(without.success && without.data.introOffer).toBeUndefined();
  });
});
