import { describe, expect, it } from "vitest";
import { ScrapedPromoSchema, SKIP_REASONS, type ScrapedPromo } from "./scraped";

/**
 * Base fixtures cover the two scope shapes recon found: sport-wide (no
 * named game) and game-wide (two named teams, no sport hint needed since
 * the game itself pins the sport). Every test below clones one of these
 * and overrides only the field(s) under test.
 */
const sportWideBoost: ScrapedPromo = {
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

const gameNamedBoost: ScrapedPromo = {
  ...sportWideBoost,
  bookKey: "ballybet",
  externalId: "sbk-10-Rams-Broncos-Profit-Boost",
  title: "10% LA Rams vs. DEN Broncos Profit Boost",
  rawText: "10% Profit Boost, Maximum Bet: $20, Minimum Odds: +100, Any Wager, LA Rams vs. DEN Broncos",
  sourceUrl:
    "https://dx-config-service.eks00.prod.na00.aws.ballys.tech/view/sbk-10-Rams-Broncos-Profit-Boost",
  sportKeyHint: null,
  scopeText: "LA Rams vs. DEN Broncos",
  teamsText: ["LA Rams", "DEN Broncos"],
  boostPercent: "10.00",
  maxStake: "20.00",
  minOddsAmerican: 100,
  claimRequired: "claim_token",
};

const bonusBetPromo: ScrapedPromo = {
  ...sportWideBoost,
  promoType: "bonus_bet",
  boostPercent: null,
  bonusAmount: "50.00",
};

const pinnedBoost: ScrapedPromo = {
  ...gameNamedBoost,
  boostPercent: null,
  boostedOddsAmerican: 150,
  baseOddsAmerican: 100,
  pinned: { selectionText: "DEN Broncos +3.5", marketType: "spread", line: 3.5 },
};

function expectValid(promo: ScrapedPromo) {
  const result = ScrapedPromoSchema.safeParse(promo);
  expect(result.success).toBe(true);
}

function expectInvalid(promo: unknown) {
  const result = ScrapedPromoSchema.safeParse(promo);
  expect(result.success).toBe(false);
}

describe("ScrapedPromoSchema", () => {
  it("accepts a sport-wide boost (no named game)", () => {
    expectValid(sportWideBoost);
  });

  it("accepts a game-named boost (two teams, no sport hint)", () => {
    expectValid(gameNamedBoost);
  });

  it("rejects teamsText of length 1 or 3", () => {
    expectInvalid({ ...gameNamedBoost, teamsText: ["LA Rams"] });
    expectInvalid({ ...gameNamedBoost, teamsText: ["LA Rams", "DEN Broncos", "SF 49ers"] });
  });

  it("rejects an empty eligibleMarketTypes array", () => {
    expectInvalid({ ...sportWideBoost, eligibleMarketTypes: [] });
  });

  it("rejects profit_boost with neither boostPercent nor boostedOddsAmerican", () => {
    expectInvalid({ ...sportWideBoost, boostPercent: null, boostedOddsAmerican: null });
  });

  it("rejects boostedOddsAmerican set while pinned is null (D-03)", () => {
    expectInvalid({ ...sportWideBoost, boostedOddsAmerican: 150 });
  });

  it("rejects bonus_bet without bonusAmount", () => {
    expectInvalid({ ...bonusBetPromo, bonusAmount: null });
  });

  it("accepts bonus_bet with bonusAmount", () => {
    expectValid(bonusBetPromo);
  });

  it("rejects a pinned spread with a whole-number line, accepts 3.5", () => {
    expectInvalid({ ...pinnedBoost, pinned: { ...pinnedBoost.pinned!, line: 3 } });
    expectValid({ ...pinnedBoost, pinned: { ...pinnedBoost.pinned!, line: 3.5 } });
  });

  it("rejects a pinned moneyline with a non-null line", () => {
    expectInvalid({
      ...pinnedBoost,
      pinned: { selectionText: "DEN Broncos ML", marketType: "moneyline", line: 100 },
    });
  });

  it("rejects boostedOddsAmerican/minOddsAmerican with |x| < 100", () => {
    expectInvalid({ ...pinnedBoost, boostedOddsAmerican: 50 });
  });

  it("rejects sportKeyHint values outside SPORT_KEYS", () => {
    expectInvalid({ ...sportWideBoost, sportKeyHint: "icehockey_nhl" });
  });

  it("rejects windowStart >= windowEnd", () => {
    expectInvalid({
      ...sportWideBoost,
      windowStart: "2026-09-28T03:59:59.999Z",
      windowEnd: "2026-09-27T04:00:00.000Z",
    });
  });

  it("rejects rawText longer than 2000 chars", () => {
    expectInvalid({ ...sportWideBoost, rawText: "a".repeat(2001) });
  });

  it("rejects title longer than 200 chars", () => {
    expectInvalid({ ...sportWideBoost, title: "a".repeat(201) });
  });

  it("rejects finePrintNote longer than 160 chars", () => {
    expectInvalid({ ...sportWideBoost, finePrintNote: "a".repeat(161) });
  });

  it("rejects an unknown extra key (strict schema)", () => {
    expectInvalid({ ...sportWideBoost, extraField: "not allowed" });
  });
});

describe("SKIP_REASONS", () => {
  it("includes every recon-required skip reason", () => {
    const expected = [
      "parlay",
      "sgp",
      "live_only",
      "futures",
      "outright",
      "prop",
      "new_customer",
      "deposit",
      "not_a_promo",
      "unsupported_sport",
      "not_half_point",
      "unrecognized",
      "schema_invalid",
    ];
    expect([...SKIP_REASONS].sort()).toEqual([...expected].sort());
  });
});
