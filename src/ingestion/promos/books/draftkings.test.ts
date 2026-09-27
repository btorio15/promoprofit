import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { draftkingsScraper } from "./draftkings";

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

    // casino / sweepstakes / racing / refer-a-friend / offer-card / discord
    // / DK Horse rows -- none name a profit boost, odds boost or bonus bet.
    const notAPromoIds = [
      "1098873", // Casino
      "1116571", // Sweepstakes
      "1120650", // Bet and Get (racing)
      "1123721", // Bet and Get (racing)
      "1098879", // Bet and Get (racing)
      "1001646", // Offer Card Messaging (racing)
      "1020206", // Offer Card Messaging (responsible gaming)
      "882364", // Refer a Friend
      "782037", // Refer a Friend
      "861287", // Offer Card Messaging (account linking)
      "1107235", // DK Horse
      "1114582", // Sweepstakes
      "1119017", // Sweepstakes
      "600295", // Exclusive (Discord)
    ];
    for (const id of notAPromoIds) {
      expect(reasonById.get(id)).toBe("not_a_promo");
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
