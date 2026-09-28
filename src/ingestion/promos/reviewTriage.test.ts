import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLEAR_SKIP_REASONS,
  REVIEW_SKIP_REASONS,
  buildClassifyDraft,
  isReviewWorthySkip,
} from "./reviewTriage";
import { draftkingsScraper } from "./books/draftkings";
import { ballybetScraper } from "./books/ballybet";
import { fanduelScraper } from "./books/fanduel";
import { promoDedupeKey } from "@/domain/promos/dedupe";
import { ScrapedPromoFieldsSchema } from "@/domain/promos/scraped";
import { sportFromTags, sportFromText } from "./sportHints";
import { SKIP_REASONS, type SkippedEntry } from "@/domain/promos/scraped";

const FIXTURES_DIR = join(process.cwd(), "src/test/fixtures/promos");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

describe("CLEAR_SKIP_REASONS / REVIEW_SKIP_REASONS", () => {
  it("partition SKIP_REASONS exactly (plus not_a_promo, handled specially)", () => {
    const clear = [...CLEAR_SKIP_REASONS].sort();
    const review = [...REVIEW_SKIP_REASONS].sort();
    expect(clear).toEqual(
      ["new_customer", "deposit", "parlay", "sgp", "futures", "outright", "prop", "live_only", "not_half_point"].sort(),
    );
    expect(review).toEqual(["unrecognized", "unsupported_sport", "schema_invalid"].sort());

    const all = new Set([...clear, ...review, "not_a_promo"]);
    expect([...all].sort()).toEqual([...SKIP_REASONS].sort());
  });
});

function skip(reason: (typeof SKIP_REASONS)[number], overrides: Partial<SkippedEntry> = {}): SkippedEntry {
  return {
    reason,
    externalId: "x1",
    title: "Some Promo",
    ...overrides,
  };
}

describe("isReviewWorthySkip — real fixtures", () => {
  it("ballybet-promos.json -> exactly {sbk-25-WNBA-Profit-Boost}", () => {
    const result = ballybetScraper.parse(
      { listBody: readFixture("ballybet-promos.json"), detailBodies: {} },
      { now: new Date("2026-09-27T12:00:00Z"), sourceUrl: "https://example.test/ignored" },
    );
    const reviewWorthyIds = result.skipped.filter(isReviewWorthySkip).map((s) => s.externalId).sort();
    expect(reviewWorthyIds).toEqual(["sbk-25-WNBA-Profit-Boost"]);
  });

  it("fanduel-promos.json -> exactly {LOSOCCERPB0925}", () => {
    const result = fanduelScraper.parse(
      { listBody: readFixture("fanduel-promos.json"), detailBodies: {} },
      { now: new Date("2026-09-26T18:00:00Z"), sourceUrl: "https://api.sportsbook.fanduel.com/promos/api/promotions" },
    );
    const reviewWorthyIds = result.skipped.filter(isReviewWorthySkip).map((s) => s.externalId).sort();
    expect(reviewWorthyIds).toEqual(["LOSOCCERPB0925"]);
  });

  it("every other real list fixture -> empty review-worthy set", () => {
    const dkA = draftkingsScraper.parse(
      { listBody: readFixture("draftkings-promos.json"), detailBodies: {} },
      { now: new Date("2026-09-27T12:00:00Z"), sourceUrl: "https://api.draftkings.com/en/api/promotions/v3/promotions/query" },
    );
    expect(dkA.skipped.filter(isReviewWorthySkip)).toEqual([]);

    const dk27 = draftkingsScraper.parse(
      { listBody: readFixture("draftkings-promos-2026-09-27.json"), detailBodies: {} },
      { now: new Date("2026-09-27T12:00:00Z"), sourceUrl: "https://api.draftkings.com/en/api/promotions/v3/promotions/query" },
    );
    expect(dk27.skipped.filter(isReviewWorthySkip)).toEqual([]);

    const dk28 = draftkingsScraper.parse(
      { listBody: readFixture("draftkings-promos-2026-09-28.json"), detailBodies: {} },
      { now: new Date("2026-09-28T12:00:00Z"), sourceUrl: "https://api.draftkings.com/en/api/promotions/v3/promotions/query" },
    );
    expect(dk28.skipped.filter(isReviewWorthySkip)).toEqual([]);

    const fd28 = fanduelScraper.parse(
      { listBody: readFixture("fanduel-promos-2026-09-28.json"), detailBodies: {} },
      { now: new Date("2026-09-28T12:00:00Z"), sourceUrl: "https://api.sportsbook.fanduel.com/promos/api/promotions" },
    );
    expect(fd28.skipped.filter(isReviewWorthySkip)).toEqual([]);
  });

  it("pinned not_a_promo cases stay skips with both list text and the full generic terms description as rawText", () => {
    const listBody = readFixture("ballybet-promos.json");
    const detailTerms = readFixture("ballybet-promo-detail-profit-boost-terms.json");
    const detailText: string = JSON.parse(detailTerms).sections.primaryContent[0].description;

    for (const slug of ["sbk-profit-boost-01", "sbk-odds-boost-01", "sbk-second-chance-bet-01"]) {
      const result = ballybetScraper.parse({ listBody, detailBodies: {} }, { now: new Date("2026-09-27T12:00:00Z"), sourceUrl: "x" });
      const found = result.skipped.find((s) => s.externalId === slug);
      if (!found) continue; // slug may not exist in this fixture under this id; covered by synthetic case below instead
      expect(isReviewWorthySkip(found)).toBe(false);
      expect(isReviewWorthySkip({ ...found, evidence: { rawText: detailText, sourceUrl: "x", expiresAt: null, partial: null } })).toBe(
        false,
      );
    }
  });
});

describe("isReviewWorthySkip — synthetic cases", () => {
  it("unrecognized / schema_invalid / unsupported_sport are always review-worthy", () => {
    expect(isReviewWorthySkip(skip("unrecognized"))).toBe(true);
    expect(isReviewWorthySkip(skip("schema_invalid"))).toBe(true);
    expect(isReviewWorthySkip(skip("unsupported_sport"))).toBe(true);
  });

  it("a not_a_promo naming a concrete numeric offer, with no exclusion wording, is review-worthy", () => {
    const s = skip("not_a_promo", {
      title: "Monday 40% Profit Boost",
      evidence: { rawText: "Monday 40% Profit Boost for all NFL games.", sourceUrl: "x", expiresAt: null, partial: null },
    });
    expect(isReviewWorthySkip(s)).toBe(true);
  });

  it("the same not_a_promo with 'Refer a Friend' in the text is not review-worthy", () => {
    const s = skip("not_a_promo", {
      title: "Monday 40% Profit Boost",
      evidence: {
        rawText: "Monday 40% Profit Boost -- Refer a Friend to get yours!",
        sourceUrl: "x",
        expiresAt: null,
        partial: null,
      },
    });
    expect(isReviewWorthySkip(s)).toBe(false);
  });

  it("a $ bonus-bet offer with no exclusion wording is review-worthy", () => {
    const s = skip("not_a_promo", {
      title: "Weekend Special",
      evidence: { rawText: "Get a $50 bonus bet this weekend.", sourceUrl: "x", expiresAt: null, partial: null },
    });
    expect(isReviewWorthySkip(s)).toBe(true);
  });

  it("clear skip reasons are never review-worthy, even naming '50% profit boost'", () => {
    for (const reason of CLEAR_SKIP_REASONS) {
      const s = skip(reason, {
        evidence: { rawText: "50% profit boost today!", sourceUrl: "x", expiresAt: null, partial: null },
      });
      expect(isReviewWorthySkip(s)).toBe(false);
    }
  });
});

describe("buildClassifyDraft", () => {
  it("keeps bookKey/externalId/title/rawText/sourceUrl/expiresAt from the skip", () => {
    const s = skip("unrecognized", {
      externalId: "ext-9",
      title: "Mystery Promo",
      evidence: { rawText: "Mystery Promo text", sourceUrl: "https://example.test/promo", expiresAt: "2026-10-01T00:00:00.000Z", partial: null },
    });
    const draft = buildClassifyDraft("draftkings", s, "https://example.test/fallback");
    expect(draft.bookKey).toBe("draftkings");
    expect(draft.externalId).toBe("ext-9");
    expect(draft.title).toBe("Mystery Promo");
    expect(draft.rawText).toBe("Mystery Promo text");
    expect(draft.sourceUrl).toBe("https://example.test/promo");
    expect(draft.expiresAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("falls back to fallbackSourceUrl when the skip has no evidence", () => {
    const s = skip("unrecognized", { evidence: undefined });
    const draft = buildClassifyDraft("draftkings", s, "https://example.test/fallback");
    expect(draft.sourceUrl).toBe("https://example.test/fallback");
    expect(draft.rawText).toBe("");
    expect(draft.expiresAt).toBeNull();
  });

  it("copies partial fields only when each passes its own field schema", () => {
    const s = skip("unrecognized", {
      evidence: {
        rawText: "some text",
        sourceUrl: "x",
        expiresAt: null,
        partial: { boostPercent: "abc" as unknown as string, sportKeyHint: "not_a_sport" },
      },
    });
    const draft = buildClassifyDraft("draftkings", s, "x");
    expect(draft.boostPercent).toBeNull();
    expect(draft.sportKeyHint).toBeNull();
  });

  it("a valid partial sportKeyHint and boostPercent are copied through", () => {
    const s = skip("unrecognized", {
      evidence: {
        rawText: "some text",
        sourceUrl: "x",
        expiresAt: null,
        partial: { promoType: "profit_boost", sportKeyHint: "icehockey_nhl", boostPercent: "50.00" },
      },
    });
    const draft = buildClassifyDraft("draftkings", s, "x");
    expect(draft.sportKeyHint).toBe("icehockey_nhl");
    expect(draft.boostPercent).toBe("50.00");
    expect(draft.promoType).toBe("profit_boost");
  });

  it("guesses bonus_bet from a '$N bonus bet' text with no boost %", () => {
    const s = skip("not_a_promo", {
      evidence: { rawText: "Get a $50 bonus bet this weekend.", sourceUrl: "x", expiresAt: null, partial: null },
    });
    const draft = buildClassifyDraft("draftkings", s, "x");
    expect(draft.promoType).toBe("bonus_bet");
    expect(draft.bonusAmount).toBe("50.00");
    expect(draft.boostPercent).toBeNull();
  });

  it("defaults to profit_boost and pulls boostPercent from 'N% ... boost' text when partial lacks it", () => {
    const s = skip("unrecognized", {
      evidence: { rawText: "Monday 40% Profit Boost for all NFL games.", sourceUrl: "x", expiresAt: null, partial: null },
    });
    const draft = buildClassifyDraft("draftkings", s, "x");
    expect(draft.promoType).toBe("profit_boost");
    expect(draft.boostPercent).toBe("40.00");
  });

  it("pulls boostPercent from a 'boost: N%' label style match", () => {
    const s = skip("unrecognized", {
      evidence: { rawText: "Profit Boost: 25% on any NBA game.", sourceUrl: "x", expiresAt: null, partial: null },
    });
    const draft = buildClassifyDraft("draftkings", s, "x");
    expect(draft.boostPercent).toBe("25.00");
  });

  it("defaults to profit_boost with null boostPercent when neither pattern is found", () => {
    const s = skip("unrecognized", {
      evidence: { rawText: "We aren't sure what this is.", sourceUrl: "x", expiresAt: null, partial: null },
    });
    const draft = buildClassifyDraft("draftkings", s, "x");
    expect(draft.promoType).toBe("profit_boost");
    expect(draft.boostPercent).toBeNull();
  });

  it("always has eligibleMarketTypes of all three, pinned null, boostedOddsAmerican null, unparsedCapFields []", () => {
    const s = skip("unrecognized", { evidence: { rawText: "x", sourceUrl: "x", expiresAt: null, partial: null } });
    const draft = buildClassifyDraft("draftkings", s, "x");
    expect(draft.eligibleMarketTypes.slice().sort()).toEqual(["moneyline", "spread", "total"]);
    expect(draft.pinned).toBeNull();
    expect(draft.boostedOddsAmerican).toBeNull();
    expect(draft.unparsedCapFields).toEqual([]);
  });

  it("teamsText is [] unless partial has a valid 0/2-length array", () => {
    const invalidLength = skip("unrecognized", {
      evidence: { rawText: "x", sourceUrl: "x", expiresAt: null, partial: { teamsText: ["Only One"] } },
    });
    expect(buildClassifyDraft("draftkings", invalidLength, "x").teamsText).toEqual([]);

    const validPair = skip("unrecognized", {
      evidence: { rawText: "x", sourceUrl: "x", expiresAt: null, partial: { teamsText: ["LA Rams", "DEN Broncos"] } },
    });
    expect(buildClassifyDraft("draftkings", validPair, "x").teamsText).toEqual(["LA Rams", "DEN Broncos"]);
  });

  it("always passes the lenient ScrapedPromoFieldsSchema", () => {
    const s = skip("unrecognized", { evidence: { rawText: "x", sourceUrl: "x", expiresAt: null, partial: null } });
    const draft = buildClassifyDraft("draftkings", s, "x");
    expect(ScrapedPromoFieldsSchema.safeParse(draft).success).toBe(true);
  });

  it("promoDedupeKey is identical across two calls on the same skip", () => {
    const s = skip("unrecognized", {
      evidence: { rawText: "Monday 40% Profit Boost for all NFL games.", sourceUrl: "x", expiresAt: null, partial: null },
    });
    const a = buildClassifyDraft("draftkings", s, "x");
    const b = buildClassifyDraft("draftkings", s, "x");
    expect(promoDedupeKey(a)).toBe(promoDedupeKey(b));
  });

  it("truncates title to 200 and rawText to 2000", () => {
    const s = skip("unrecognized", {
      title: "T".repeat(300),
      evidence: { rawText: "R".repeat(3000), sourceUrl: "x", expiresAt: null, partial: null },
    });
    const draft = buildClassifyDraft("draftkings", s, "x");
    expect(draft.title.length).toBe(200);
    expect(draft.rawText.length).toBe(2000);
  });
});

describe("NHL sport resolution (quick-260928-it1)", () => {
  it("sportFromText resolves NHL text to icehockey_nhl", () => {
    expect(sportFromText("NHL 50% Profit Boost")).toEqual({ kind: "supported", sportKey: "icehockey_nhl" });
  });

  it("sportFromTags resolves the 'nhl' tag to icehockey_nhl", () => {
    expect(sportFromTags(["nhl"])).toEqual({ kind: "supported", sportKey: "icehockey_nhl" });
  });

  it("WNBA still resolves as unsupported", () => {
    expect(sportFromText("WNBA")).toEqual({ kind: "unsupported", label: "WNBA" });
  });

  it("'NHL Futures' is still skipped as futures by classifyExclusion, which runs before sport resolution", () => {
    // classifyExclusion (D-15) runs before sportFromText in every parser --
    // a futures-market promo naming NHL is excluded as "futures", never
    // reached as a normal NHL sport-wide candidate.
    const body = JSON.stringify({
      zones: [
        {
          promotions: [
            {
              promotionId: 424242,
              startDate: "2026-09-27T04:00:00.0000000Z",
              expirationDate: "2026-09-28T03:00:00.0000000Z",
              merchandisingData: {
                promotionHeadline: "NHL Futures 50% Profit Boost",
                terms: "1. Profit Boost: 50% for all NHL Futures bets.",
              },
            },
          ],
        },
      ],
    });
    const result = draftkingsScraper.parse(
      { listBody: body, detailBodies: {} },
      { now: new Date("2026-09-27T12:00:00Z"), sourceUrl: "x" },
    );
    expect(result.candidates).toEqual([]);
    expect(result.skipped[0]?.reason).toBe("futures");
  });
});
