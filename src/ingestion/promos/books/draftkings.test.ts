import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { draftkingsScraper } from "./draftkings";
import type { ScrapedPromo } from "@/domain/promos/scraped";

const FIXTURE_PATH = join(
  process.cwd(),
  "src/test/fixtures/promos/draftkings-promos.json",
);

function loadFixture(): string {
  return readFileSync(FIXTURE_PATH, "utf-8");
}

function parseFixture() {
  return draftkingsScraper.parse(
    { listBody: loadFixture(), detailBodies: {} },
    { now: new Date("2026-09-27T12:00:00.000Z"), sourceUrl: "https://api.draftkings.com/en/api/promotions/v3/promotions/query" },
  );
}

function findCandidate(id: string): ScrapedPromo {
  const result = parseFixture();
  const candidate = result.candidates.find((c) => c.externalId === id);
  if (!candidate) throw new Error(`candidate ${id} not found`);
  return candidate;
}

/** A single-zone, single-promotion body shaped like the real Contract
 * response, for the synthetic edge-case tests below. */
function buildSyntheticBody(overrides: {
  promotionId?: number;
  startDate?: string;
  expirationDate?: string;
  category?: string;
  isOptInPromotion?: boolean;
  promotionHeadline?: string;
  additionalDetail?: string;
  terms?: string;
  promotionDescription?: string;
}): string {
  return JSON.stringify({
    zones: [
      {
        promotions: [
          {
            promotionId: overrides.promotionId ?? 9999999,
            startDate: overrides.startDate ?? "2026-09-27T04:00:00.0000000Z",
            expirationDate: overrides.expirationDate ?? "2026-09-28T03:00:00.0000000Z",
            category: overrides.category ?? "Click to Claim",
            isOptInPromotion: overrides.isOptInPromotion ?? true,
            merchandisingData: {
              promotionHeadline: overrides.promotionHeadline ?? "Synthetic 50% Profit Boost",
              ...(overrides.additionalDetail !== undefined
                ? { additionalDetail: overrides.additionalDetail }
                : {}),
              terms:
                overrides.terms ??
                "1. Opt-in and get One (1) Profit Boost for all NFL games on 9/27/2026!\n2. Profit Boost: 50% (Profit boost only applies to winnings, excluding original bet amount)\n3. Profit Boost Token only applies to a NFL Single, Parlay, SGP, or SGPx bet.\n4. Total bet odds must be -200 or longer.\n5. Max betting limits apply.",
              promotionDescription: overrides.promotionDescription ?? "Get a 50% boost for any NFL bet today!",
            },
          },
        ],
      },
    ],
  });
}

describe("draftkingsScraper — request shape and detail plan", () => {
  it("listRequest is a POST to the Contract URL with the Contract body and headers", () => {
    expect(draftkingsScraper.bookKey).toBe("draftkings");
    expect(draftkingsScraper.render).toBe("http");
    expect(draftkingsScraper.stealth).toBe(false);
    expect(draftkingsScraper.sourceFormat).toBe("json");
    expect(draftkingsScraper.maxDetailRequests).toBe(0);

    expect(draftkingsScraper.listRequest.method).toBe("POST");
    expect(draftkingsScraper.listRequest.url).toBe(
      "https://api.draftkings.com/en/api/promotions/v3/promotions/query",
    );
    expect(draftkingsScraper.listRequest.body).toBe(
      '{"productName":"Sportsbook","filterByProduct":false,"zones":{"zoneName":"UniversalPromoPage"},"siteExperience":"US-CO-SB"}',
    );
    expect(draftkingsScraper.listRequest.headers["content-type"]).toBe("application/json");
    expect(draftkingsScraper.listRequest.headers["accept"]).toBe("application/json");
    expect(draftkingsScraper.listRequest.headers["referer"]).toBe("https://sportsbook.draftkings.com/");
    expect(draftkingsScraper.listRequest.headers["user-agent"]).toMatch(/Chrome/);
  });

  it("planDetails always returns [] (no detail requests for this book)", () => {
    expect(draftkingsScraper.planDetails(loadFixture())).toEqual([]);
    expect(draftkingsScraper.planDetails("{}")).toEqual([]);
    expect(draftkingsScraper.planDetails("not json")).toEqual([]);
  });
});

describe("draftkingsScraper — parse: candidates and skip classification from the real fixture", () => {
  it("finds exactly the two hedgeable boosts as candidates", () => {
    const result = parseFixture();

    const candidateIds = result.candidates.map((c) => c.externalId).sort();
    expect(candidateIds).toEqual(["1123723", "1125805"]);
  });

  it("found equals candidates + skipped", () => {
    const result = parseFixture();
    expect(result.found).toBe(result.candidates.length + result.skipped.length);
    expect(result.found).toBe(22);
  });

  it("skips every excluded/non-promo entry with the expected reason", () => {
    const result = parseFixture();
    const reasonById = new Map(result.skipped.map((s) => [s.externalId, s.reason]));

    expect(reasonById.get("1118611")).toBe("new_customer");
    expect(["deposit", "new_customer"]).toContain(reasonById.get("779769"));
    expect(reasonById.get("1124791")).toBe("parlay");
    expect(reasonById.get("1126395")).toBe("sgp");
    // Deviation from the plan's literal expectation ("parlay"): the shared,
    // unmodified classifyExclusion (Plan 05) checks SGP before Parlay in its
    // final bet-type-restriction branch, and this promo's terms mention both
    // "parlays" and "SGP" -- the real, already-committed classifier
    // deterministically returns "sgp" for this exact text, not "parlay". See
    // SUMMARY.md Deviations.
    expect(reasonById.get("1124647")).toBe("sgp");
    expect(reasonById.get("1119078")).toBe("futures");

    // casino / sweepstakes / racing / offer-card / discord rows -- none
    // name a profit boost, odds boost or bonus bet.
    const notAPromoIds = [
      "1116571", // Sweepstakes
      "1120650", // Bet and Get (racing)
      "1123721", // Bet and Get (racing)
      "1098879", // Bet and Get (racing)
      "1001646", // Offer Card Messaging (racing)
      "1020206", // Offer Card Messaging (responsible gaming)
      "861287", // Offer Card Messaging (account linking)
      "1114582", // Sweepstakes
      "1119017", // Sweepstakes
      "600295", // Exclusive (Discord)
    ];
    for (const id of notAPromoIds) {
      expect(reasonById.get(id)).toBe("not_a_promo");
    }

    // Deviation from the plan's generic "casino/refer-a-friend/DK Horse ->
    // not_a_promo" bucket: these four rows' own REAL (not synthetic) terms
    // genuinely say "sign up" / "sign up for a new ... account" deep in
    // their gated/eligibility text, which correctly matches the shared
    // classifier's new-customer text pattern -- they are still excluded
    // (never candidates), just via a more specific real SkipReason than
    // the plan anticipated without reading the raw fixture bodies. See
    // SUMMARY.md Deviations.
    const newCustomerViaRealTextIds = [
      "1098873", // Casino ("Please log in or sign up to view terms...")
      "882364", // Refer a Friend ("...sign up to view terms...")
      "782037", // Refer a Friend ("...sign up to view terms...")
      "1107235", // DK Horse ("...sign up for a new Racing account...")
    ];
    for (const id of newCustomerViaRealTextIds) {
      expect(reasonById.get(id)).toBe("new_customer");
    }
  });

  it("parse of '{}' or non-JSON returns found 0 and never throws", () => {
    expect(() => draftkingsScraper.parse({ listBody: "{}", detailBodies: {} }, { now: new Date(), sourceUrl: "x" })).not.toThrow();
    const emptyResult = draftkingsScraper.parse({ listBody: "{}", detailBodies: {} }, { now: new Date(), sourceUrl: "x" });
    expect(emptyResult.found).toBe(0);
    expect(emptyResult.candidates).toEqual([]);
    expect(emptyResult.skipped).toEqual([]);

    expect(() =>
      draftkingsScraper.parse({ listBody: "not json at all", detailBodies: {} }, { now: new Date(), sourceUrl: "x" }),
    ).not.toThrow();
    const nonJsonResult = draftkingsScraper.parse(
      { listBody: "not json at all", detailBodies: {} },
      { now: new Date(), sourceUrl: "x" },
    );
    expect(nonJsonResult.found).toBe(0);
  });
});

describe("draftkingsScraper — structured fields for the kept boosts (Task 2)", () => {
  it("1123723 (NFL 50% Profit Boost) — every field, exactly", () => {
    const candidate = findCandidate("1123723");

    expect(candidate.bookKey).toBe("draftkings");
    expect(candidate.externalId).toBe("1123723");
    expect(candidate.promoType).toBe("profit_boost");
    expect(candidate.title).toBe("NFL 50% Profit Boost");
    expect(candidate.boostPercent).toBe("50.00");
    expect(candidate.maxStake).toBe("25.00");
    expect(candidate.minOddsAmerican).toBe(-200);
    expect(candidate.maxWinnings).toBeNull();
    expect(candidate.winningsCapKind).toBe("boost_extra");
    expect(candidate.unparsedCapFields).toEqual([]);
    expect(candidate.sportKeyHint).toBe("americanfootball_nfl");
    expect(candidate.teamsText).toEqual([]);
    expect(candidate.scopeText).toContain("NFL games on 9/27/2026");
    expect(candidate.windowStart).toBe("2026-09-27T04:00:00.000Z");
    expect(candidate.windowEnd).toBe("2026-09-28T03:59:59.999Z");
    expect(candidate.expiresAt).toBe("2026-09-28T03:00:00.000Z");
    expect(candidate.eligibleMarketTypes.slice().sort()).toEqual(["moneyline", "spread", "total"]);
    expect(candidate.pinned).toBeNull();
    expect(candidate.claimRequired).toBe("opt_in");
  });

  it("1125805 (College Football 50% Profit Boost) — every field, exactly", () => {
    const candidate = findCandidate("1125805");

    expect(candidate.title).toBe("College Football 50% Profit Boost");
    expect(candidate.sportKeyHint).toBe("americanfootball_ncaaf");
    expect(candidate.boostPercent).toBe("50.00");
    expect(candidate.maxStake).toBe("25.00");
    expect(candidate.minOddsAmerican).toBe(-200);
    expect(candidate.windowStart).toBe("2026-09-26T04:00:00.000Z");
    // Slate extended to expiry: expirationDate (06:30 ET-equivalent UTC) is
    // later than the plain ET-day end by <=12h, so slateWindow extends the
    // window end to it rather than the plain calendar-day boundary.
    expect(candidate.windowEnd).toBe("2026-09-27T06:30:00.000Z");
    expect(candidate.expiresAt).toBe("2026-09-27T06:30:00.000Z");
    expect(candidate.claimRequired).toBe("opt_in");
  });

  it("every candidate from the real fixture passes ScrapedPromoSchema (no schema_invalid skips)", () => {
    const result = parseFixture();
    const schemaInvalidSkips = result.skipped.filter((s) => s.reason === "schema_invalid");
    expect(schemaInvalidSkips).toEqual([]);
    expect(result.candidates).toHaveLength(2);
  });

  it("additionalDetail removed, terms only say 'Max betting limits apply' -> maxStake null, unparsedCapFields includes maxStake", () => {
    const body = buildSyntheticBody({
      additionalDetail: undefined,
      terms:
        "1. Opt-in and get One (1) Profit Boost for all NFL games on 9/27/2026!\n2. Profit Boost: 50% (Profit boost only applies to winnings, excluding original bet amount)\n3. Profit Boost Token only applies to a NFL Single, Parlay, SGP, or SGPx bet.\n4. Total bet odds must be -200 or longer.\n5. Max betting limits apply.",
    });
    const result = draftkingsScraper.parse(
      { listBody: body, detailBodies: {} },
      { now: new Date("2026-09-27T12:00:00.000Z"), sourceUrl: "x" },
    );
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.maxStake).toBeNull();
    expect(candidate.unparsedCapFields).toContain("maxStake");
  });

  it("terms with no 'games on <date>' scope phrase -> window falls back to [startDate, expirationDate]", () => {
    const body = buildSyntheticBody({
      startDate: "2026-09-25T03:00:00.0000000Z",
      expirationDate: "2026-09-28T03:00:00.0000000Z",
      terms:
        "1. Opt-in and get One (1) Profit Boost for all NFL games!\n2. Profit Boost: 50% (Profit boost only applies to winnings, excluding original bet amount)\n3. Profit Boost Token only applies to a NFL Single, Parlay, SGP, or SGPx bet.\n4. Total bet odds must be -200 or longer.\n5. Max betting limits apply.",
    });
    const result = draftkingsScraper.parse(
      { listBody: body, detailBodies: {} },
      { now: new Date("2026-09-27T12:00:00.000Z"), sourceUrl: "x" },
    );
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.windowStart).toBe("2026-09-25T03:00:00.000Z");
    expect(candidate.windowEnd).toBe("2026-09-28T03:00:00.000Z");
  });

  it("a forced-invalid candidate (no boost percent, no boosted odds) is skipped as schema_invalid with a console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const body = buildSyntheticBody({
        terms:
          "1. Opt-in and get One (1) Profit Boost for all NFL games on 9/27/2026!\n3. Profit Boost Token only applies to a NFL Single, Parlay, SGP, or SGPx bet.\n4. Total bet odds must be -200 or longer.\n5. Max betting limits apply.",
      });
      const result = draftkingsScraper.parse(
        { listBody: body, detailBodies: {} },
        { now: new Date("2026-09-27T12:00:00.000Z"), sourceUrl: "x" },
      );
      expect(result.candidates).toEqual([]);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe("schema_invalid");
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
