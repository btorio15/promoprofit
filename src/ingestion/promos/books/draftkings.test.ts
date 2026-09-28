import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { draftkingsScraper } from "./draftkings";
import { matchPromo } from "@/domain/promos/matcher";
import type { OddsEvent } from "@/domain/odds/schemas";
import { ScrapedPromoSchema, type ScrapedPromo } from "@/domain/promos/scraped";

const FIXTURE_PATH = join(
  process.cwd(),
  "src/test/fixtures/promos/draftkings-promos.json",
);

const FIXTURE_PATH_20260927 = join(
  process.cwd(),
  "src/test/fixtures/promos/draftkings-promos-2026-09-27.json",
);

const FIXTURE_PATH_20260928 = join(
  process.cwd(),
  "src/test/fixtures/promos/draftkings-promos-2026-09-28.json",
);

function loadFixture(): string {
  return readFileSync(FIXTURE_PATH, "utf-8");
}

function loadFixture20260927(): string {
  return readFileSync(FIXTURE_PATH_20260927, "utf-8");
}

function loadFixture20260928(): string {
  return readFileSync(FIXTURE_PATH_20260928, "utf-8");
}

function parseFixture() {
  return draftkingsScraper.parse(
    { listBody: loadFixture(), detailBodies: {} },
    { now: new Date("2026-09-27T12:00:00.000Z"), sourceUrl: "https://api.draftkings.com/en/api/promotions/v3/promotions/query" },
  );
}

function parseFixture20260927() {
  return draftkingsScraper.parse(
    { listBody: loadFixture20260927(), detailBodies: {} },
    { now: new Date("2026-09-27T12:00:00.000Z"), sourceUrl: "https://api.draftkings.com/en/api/promotions/v3/promotions/query" },
  );
}

function findCandidate(id: string): ScrapedPromo {
  const result = parseFixture();
  const candidate = result.candidates.find((c) => c.externalId === id);
  if (!candidate) throw new Error(`candidate ${id} not found`);
  return candidate;
}

function findCandidate20260927(id: string): ScrapedPromo {
  const result = parseFixture20260927();
  const candidate = result.candidates.find((c) => c.externalId === id);
  if (!candidate) throw new Error(`candidate ${id} not found`);
  return candidate;
}

function parseFixture20260928() {
  return draftkingsScraper.parse(
    { listBody: loadFixture20260928(), detailBodies: {} },
    { now: new Date("2026-09-28T12:00:00.000Z"), sourceUrl: "https://api.draftkings.com/en/api/promotions/v3/promotions/query" },
  );
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

  it("a candidate with no parseable 'Profit Boost: N%' is skipped as unrecognized before any candidate is built (no console.warn)", () => {
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
      expect(result.skipped[0].reason).toBe("unrecognized");
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("a genuine schema failure (mocked safeParse) is still skipped as schema_invalid with a console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const schemaSpy = vi
      .spyOn(ScrapedPromoSchema, "safeParse")
      .mockReturnValueOnce({ success: false, error: { issues: [] } } as unknown as ReturnType<
        typeof ScrapedPromoSchema.safeParse
      >);
    try {
      // Default synthetic body DOES include "Profit Boost: 50%", so it
      // clears the new missing-boost-% guard and reaches ScrapedPromoSchema,
      // whose mocked failure is what produces schema_invalid here.
      const body = buildSyntheticBody({});
      const result = draftkingsScraper.parse(
        { listBody: body, detailBodies: {} },
        { now: new Date("2026-09-27T12:00:00.000Z"), sourceUrl: "x" },
      );
      expect(result.candidates).toEqual([]);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe("schema_invalid");
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      schemaSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

describe("draftkingsScraper — 2026-09-28 fixture: MLB HR Bet and Get (1127668) classified as prop", () => {
  it("found is 23, candidates [] (the honest kept set), and no unrecognized or schema_invalid skips", () => {
    const result = parseFixture20260928();
    expect(result.found).toBe(23);
    expect(result.candidates).toEqual([]);
  });

  it("pins the full skip map -- 1127668 is prop, every other id unchanged from before the fix", () => {
    const result = parseFixture20260928();
    const reasonById: Record<string, string> = {};
    for (const s of result.skipped) {
      reasonById[s.externalId as string] = s.reason;
    }
    expect(reasonById).toEqual({
      "600295": "not_a_promo",
      "779769": "new_customer",
      "782037": "new_customer",
      "861287": "not_a_promo",
      "882364": "new_customer",
      "1001646": "not_a_promo",
      "1020206": "not_a_promo",
      "1098873": "new_customer",
      "1098879": "not_a_promo",
      "1107235": "new_customer",
      "1114582": "not_a_promo",
      "1116571": "not_a_promo",
      "1118611": "new_customer",
      "1119017": "not_a_promo",
      "1119078": "futures",
      "1120652": "not_a_promo",
      "1125873": "unsupported_sport",
      "1126077": "sgp",
      "1126078": "futures",
      "1127118": "prop",
      "1127122": "not_a_promo",
      "1127668": "prop",
      "1127861": "not_a_promo",
    });
    expect(Object.values(reasonById)).not.toContain("unrecognized");
    expect(Object.values(reasonById)).not.toContain("schema_invalid");
  });
});

describe("draftkingsScraper — DK single-game 'for the A @ B game on <date>' boosts (2026-09-27 fixture)", () => {
  it("found is 23, 3 candidates, and the kept externalIds are 1123723/1126385/1126403", () => {
    const result = parseFixture20260927();
    expect(result.found).toBe(23);
    expect(result.candidates).toHaveLength(3);
    const candidateIds = result.candidates.map((c) => c.externalId).sort();
    expect(candidateIds).toEqual(["1123723", "1126385", "1126403"]);
  });

  it("pins the full skip map for the new fixture -- no unrecognized or schema_invalid skips", () => {
    const result = parseFixture20260927();
    const reasonById: Record<string, string> = {};
    for (const s of result.skipped) {
      reasonById[s.externalId as string] = s.reason;
    }
    expect(reasonById).toEqual({
      "1118611": "new_customer",
      "1098873": "new_customer",
      "1127153": "prop",
      "1116571": "not_a_promo",
      "1124647": "sgp",
      "1126395": "sgp",
      "1126078": "futures",
      "1123721": "not_a_promo",
      "1098879": "not_a_promo",
      "1001646": "not_a_promo",
      "1020206": "not_a_promo",
      "882364": "new_customer",
      "1119078": "futures",
      "782037": "new_customer",
      "861287": "not_a_promo",
      "1107235": "new_customer",
      "1114582": "not_a_promo",
      "1119017": "not_a_promo",
      "600295": "not_a_promo",
      "779769": "new_customer",
    });
    expect(Object.values(reasonById)).not.toContain("unrecognized");
    expect(Object.values(reasonById)).not.toContain("schema_invalid");
  });

  it("1126403 (LA Rams @ DEN Broncos 50% Profit Boost) -- every field, exactly", () => {
    const candidate = findCandidate20260927("1126403");

    expect(candidate.promoType).toBe("profit_boost");
    expect(candidate.boostPercent).toBe("50.00");
    expect(candidate.maxStake).toBe("25.00");
    expect(candidate.minOddsAmerican).toBe(-200);
    expect(candidate.teamsText).toEqual(["LA Rams", "DEN Broncos"]);
    expect(candidate.sportKeyHint).toBe("americanfootball_nfl");
    expect(candidate.scopeText).toBe("LA Rams @ DEN Broncos game on 9/27/2026 at 08:20 PM ET");
    expect(candidate.windowStart).toBe("2026-09-27T04:00:00.000Z");
    expect(candidate.windowEnd).toBe("2026-09-28T03:59:59.999Z");
    expect(candidate.expiresAt).toBe("2026-09-28T03:59:00.000Z");
    expect(candidate.claimRequired).toBe("opt_in");
    expect(candidate.winningsCapKind).toBe("boost_extra");

    // The window contains the 8:20 PM ET kickoff.
    const kickoffMs = new Date("2026-09-28T00:20:00.000Z").getTime();
    expect(new Date(candidate.windowStart as string).getTime()).toBeLessThanOrEqual(kickoffMs);
    expect(new Date(candidate.windowEnd as string).getTime()).toBeGreaterThanOrEqual(kickoffMs);

    const validated = ScrapedPromoSchema.safeParse(candidate);
    expect(validated.success).toBe(true);
  });

  it("1123723 and 1126385 keep exactly their current sport-wide fields", () => {
    const c1123723 = findCandidate20260927("1123723");
    expect(c1123723.teamsText).toEqual([]);
    expect(c1123723.sportKeyHint).toBe("americanfootball_nfl");
    expect(c1123723.windowStart).toBe("2026-09-27T04:00:00.000Z");
    expect(c1123723.windowEnd).toBe("2026-09-28T03:59:59.999Z");

    const c1126385 = findCandidate20260927("1126385");
    expect(c1126385.teamsText).toEqual([]);
    expect(c1126385.sportKeyHint).toBe("americanfootball_nfl");
    expect(c1126385.windowStart).toBe("2026-09-27T15:45:00.000Z");
    expect(c1126385.windowEnd).toBe("2026-09-28T03:15:00.000Z");
  });

  it("1126403 matches a synthetic Rams/Broncos event, with or without a sport hint", () => {
    const candidate = findCandidate20260927("1126403");
    const event: OddsEvent = {
      id: "evt-rams-broncos",
      sport_key: "americanfootball_nfl",
      commence_time: "2026-09-28T00:20:00Z",
      home_team: "Denver Broncos",
      away_team: "Los Angeles Rams",
      bookmakers: [],
    };
    const events = { moneyline: [event], extended: [] as OddsEvent[] };

    const result = matchPromo(candidate, events, { now: new Date("2026-09-27T12:00:00.000Z") });
    expect(result.status).toBe("matched");

    const noHintCandidate = { ...candidate, sportKeyHint: null };
    const noHintResult = matchPromo(noHintCandidate, events, { now: new Date("2026-09-27T12:00:00.000Z") });
    expect(noHintResult.status).toBe("matched");
  });

  it("(a) a game phrase whose teams resolve to no known sport is kept with sportKeyHint null and teamsText of length 2", () => {
    const body = buildSyntheticBody({
      terms:
        "1. Opt-in and get One (1) Profit Boost for the Boise State Broncos @ Colorado State Rams game on 9/27/2026 at 08:20 PM ET!\n2. Profit Boost: 50% (Profit boost only applies to winnings, excluding original bet amount)\n3. Profit Boost Token only applies to a Single, Parlay, SGP, or SGPx bet.\n4. Total bet odds must be -200 or longer.\n5. Max betting limits apply.",
      promotionDescription: "Get a 50% boost on this game today!",
    });
    const result = draftkingsScraper.parse(
      { listBody: body, detailBodies: {} },
      { now: new Date("2026-09-27T12:00:00.000Z"), sourceUrl: "x" },
    );
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.sportKeyHint).toBeNull();
    expect(candidate.teamsText).toHaveLength(2);
    expect(result.skipped.find((s) => s.reason === "unrecognized")).toBeUndefined();
  });

  it("(b) a game phrase without the 'at HH:MM PM ET' suffix still parses", () => {
    const body = buildSyntheticBody({
      terms:
        "1. Opt-in and get One (1) Profit Boost for the LA Rams @ DEN Broncos game on 9/27/2026!\n2. Profit Boost: 50% (Profit boost only applies to winnings, excluding original bet amount)\n3. Profit Boost Token only applies to a Single, Parlay, SGP, or SGPx bet.\n4. Total bet odds must be -200 or longer.\n5. Max betting limits apply.",
    });
    const result = draftkingsScraper.parse(
      { listBody: body, detailBodies: {} },
      { now: new Date("2026-09-27T12:00:00.000Z"), sourceUrl: "x" },
    );
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.teamsText).toEqual(["LA Rams", "DEN Broncos"]);
    expect(candidate.sportKeyHint).toBe("americanfootball_nfl");
  });

  it("(c) terms with neither 'for all <sport> games' nor 'for the A @ B game' and no sport word are still skipped as unrecognized", () => {
    const body = buildSyntheticBody({
      terms:
        "1. Opt-in and get One (1) Profit Boost!\n2. Profit Boost: 50% (Profit boost only applies to winnings, excluding original bet amount)\n3. Profit Boost Token only applies to a Single, Parlay, SGP, or SGPx bet.\n4. Total bet odds must be -200 or longer.\n5. Max betting limits apply.",
      promotionDescription: "Get a 50% boost today!",
    });
    const result = draftkingsScraper.parse(
      { listBody: body, detailBodies: {} },
      { now: new Date("2026-09-27T12:00:00.000Z"), sourceUrl: "x" },
    );
    expect(result.candidates).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("unrecognized");
  });

  it("(d) terms saying 'end of the final NFL game on 9/27/2026' never produce teamsText", () => {
    const body = buildSyntheticBody({
      terms:
        "1. Opt-in and get One (1) Profit Boost for all NFL games on 9/27/2026!\n2. Profit Boost: 50% (Profit boost only applies to winnings, excluding original bet amount)\n3. Profit Boost Token only applies to a NFL Single, Parlay, SGP, or SGPx bet.\n4. Profit Boost Token expires at the end of the final NFL game on 9/27/2026.\n5. Max betting limits apply.",
    });
    const result = draftkingsScraper.parse(
      { listBody: body, detailBodies: {} },
      { now: new Date("2026-09-27T12:00:00.000Z"), sourceUrl: "x" },
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].teamsText).toEqual([]);
  });
});
