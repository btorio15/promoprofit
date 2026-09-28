import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fanduelScraper } from "./fanduel";

function readFixture(fixturePath: string): string {
  return readFileSync(path.join(process.cwd(), fixturePath), "utf-8");
}

const listFixture = readFixture("src/test/fixtures/promos/fanduel-promos.json");
const cfbDetailFixture = readFixture("src/test/fixtures/promos/fanduel-promo-detail-cfb-boost.json");
const listFixture20260928 = readFixture("src/test/fixtures/promos/fanduel-promos-2026-09-28.json");

const DETAIL_URL =
  "https://api.sportsbook.fanduel.com/promos/api/promotions/LOCFB50PBT0926?channel=desktop&rewardsHubEnabled=true&cyrWithPromosEnabled=true&isChallengesEnabled=true&rewardBoxEnabled=false";

function buildSyntheticList(promoCodes: string[]): string {
  return JSON.stringify({
    promoPlacements: [
      {
        placementId: "SBK_PROMOHUB",
        promotions: promoCodes.map((code, i) => ({
          promoCode: code,
          title: `${(i + 1) * 5}% Profit Boost`,
          name: `Get a ${(i + 1) * 5}% Profit Boost Token to use on ANY wager for any NFL Games on October ${i + 1}, 2026!`,
          tags: ["nfl", "american-football"],
        })),
      },
    ],
  });
}

describe("fanduelScraper — Task 1: requests, classification, detail planning", () => {
  it("listRequest is GET to the exact Contract URL with exactly the Contract headers, body null", () => {
    expect(fanduelScraper.listRequest.method).toBe("GET");
    expect(fanduelScraper.listRequest.url).toBe(
      "https://api.sportsbook.fanduel.com/promos/api/promotions?containers=SBK_PROMOHUB&channel=desktop&page=1&generosityGamesEnabled=false&cyrWithPromosEnabled=true&isChallengesEnabled=true&rewardBoxEnabled=false&filterPlayItAgainPromosEnabled=false&filterMultiCyrPromosEnabled=false",
    );
    expect(fanduelScraper.listRequest.body).toBeNull();
    expect(fanduelScraper.listRequest.headers["x-sportsbook-region"]).toBe("CO");
    expect(fanduelScraper.listRequest.headers.accept).toBe("application/json");
    expect(fanduelScraper.listRequest.headers.referer).toBe("https://sportsbook.fanduel.com/");
    expect(fanduelScraper.listRequest.headers["user-agent"]).toMatch(/Chrome/);
    expect(fanduelScraper.listRequest.headers["x-px-context"]).toBeUndefined();
  });

  it("never sends an x-px-context header in any planned detail request", () => {
    const plans = fanduelScraper.planDetails(listFixture);
    for (const plan of plans) {
      expect(plan.request.headers["x-px-context"]).toBeUndefined();
    }
  });

  it("planDetails(list fixture) returns exactly one DetailPlan for LOCFB50PBT0926", () => {
    const plans = fanduelScraper.planDetails(listFixture);
    expect(plans).toHaveLength(1);
    expect(plans[0].entryKey).toBe("LOCFB50PBT0926");
    expect(plans[0].request.method).toBe("GET");
    expect(plans[0].request.url).toBe(DETAIL_URL);
  });

  it("classifies every other list entry with the Contract's reasons via parse()'s skipped list", () => {
    const result = fanduelScraper.parse(
      { listBody: listFixture, detailBodies: {} },
      { now: new Date("2026-09-26T18:00:00Z"), sourceUrl: "https://api.sportsbook.fanduel.com/promos/api/promotions" },
    );

    const reasonByCode = new Map(result.skipped.map((s) => [s.externalId, s.reason]));
    expect(reasonByCode.get("LOSOCCERPB0925")).toBe("unsupported_sport");
    expect(reasonByCode.get("LOGOLFPBT0924")).toBe("outright");
    expect(reasonByCode.get("ACQPECBB1G100ST")).toBe("new_customer");
    expect(reasonByCode.get("ACQB5G50BB921")).toBe("new_customer");
    expect(reasonByCode.get("CFBPICKFTPST0923")).toBe("not_a_promo");
    expect(reasonByCode.get("BPNEPSEAST0902")).toBe("not_a_promo");
    expect(reasonByCode.get("LORTCTST26")).toBe("not_a_promo");
    expect(reasonByCode.get("FACEOFFPROMO4")).toBe("not_a_promo");
    expect(reasonByCode.get("RAF092126STAT")).toBe("not_a_promo");
    expect(reasonByCode.get("MLBPHSTATIC0901")).toBe("not_a_promo");
    expect(reasonByCode.get("APVTNFSTATIC0917")).toBe("not_a_promo");
  });

  it("caps a synthetic list of 10 qualifying boost tokens at 6 detail plans", () => {
    const codes = Array.from({ length: 10 }, (_, i) => `SYN${i + 1}`);
    const synthetic = buildSyntheticList(codes);
    const plans = fanduelScraper.planDetails(synthetic);
    expect(plans).toHaveLength(6);
  });

  it("planDetails('{}') or non-JSON returns []", () => {
    expect(fanduelScraper.planDetails("{}")).toEqual([]);
    expect(fanduelScraper.planDetails("not json")).toEqual([]);
  });
});

describe("fanduelScraper — Task 2: parsing the real CFB boost with its hidden cap", () => {
  it("parses the CFB boost field-by-field with detail present", () => {
    const result = fanduelScraper.parse(
      { listBody: listFixture, detailBodies: { LOCFB50PBT0926: cfbDetailFixture } },
      { now: new Date("2026-09-26T18:00:00Z"), sourceUrl: "https://api.sportsbook.fanduel.com/promos/api/promotions" },
    );

    expect(result.found).toBe(12);
    expect(result.candidates).toHaveLength(1);
    expect(result.found).toBe(result.candidates.length + result.skipped.length);

    const promo = result.candidates[0];
    expect(promo.bookKey).toBe("fanduel");
    expect(promo.externalId).toBe("LOCFB50PBT0926");
    expect(promo.promoType).toBe("profit_boost");
    expect(promo.boostPercent).toBe("50.00");
    expect(promo.maxStake).toBeNull();
    expect(promo.unparsedCapFields).toEqual(["maxStake"]);
    expect(promo.minOddsAmerican).toBe(-200);
    expect(promo.maxWinnings).toBeNull();
    expect(promo.winningsCapKind).toBe("boost_extra");
    expect(promo.sportKeyHint).toBe("americanfootball_ncaaf");
    expect(promo.teamsText).toEqual([]);
    expect(promo.scopeText).toContain("College Football Games on September 26th, 2026");
    expect(promo.windowStart).toBe("2026-09-26T04:00:00.000Z");
    expect(promo.windowEnd).toBe("2026-09-27T06:00:00.000Z");
    expect(promo.expiresAt).toBe("2026-09-27T06:00:00.000Z");
    expect(promo.eligibleMarketTypes.sort()).toEqual(["moneyline", "spread", "total"].sort());
    expect(promo.pinned).toBeNull();
    expect(promo.claimRequired).toBe("claim_token");
    expect(promo.sourceUrl).toBe(DETAIL_URL);
  });

  it("falls back to list-only data when the detail body is missing, with maxStake and minOdds unparsed", () => {
    const result = fanduelScraper.parse(
      { listBody: listFixture, detailBodies: {} },
      { now: new Date("2026-09-26T18:00:00Z"), sourceUrl: "https://api.sportsbook.fanduel.com/promos/api/promotions" },
    );

    const promo = result.candidates.find((c) => c.externalId === "LOCFB50PBT0926");
    expect(promo).toBeDefined();
    expect(promo!.boostPercent).toBe("50.00");
    expect(promo!.minOddsAmerican).toBeNull();
    expect(promo!.maxStake).toBeNull();
    expect(promo!.unparsedCapFields).toEqual(["maxStake", "minOdds"]);
  });

  it("skips a forced-invalid candidate as schema_invalid without throwing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const badList = JSON.stringify({
      promoPlacements: [
        {
          promotions: [
            {
              promoCode: "BADPBT0001",
              title: "NFL Profit Boost",
              name: "Get a Profit Boost Token to use on ANY wager for any NFL Games on October 1st, 2026!",
              tags: ["nfl", "american-football"],
            },
          ],
        },
      ],
    });

    expect(() =>
      fanduelScraper.parse(
        { listBody: badList, detailBodies: {} },
        { now: new Date("2026-09-26T18:00:00Z"), sourceUrl: "https://api.sportsbook.fanduel.com/promos/api/promotions" },
      ),
    ).not.toThrow();

    const result = fanduelScraper.parse(
      { listBody: badList, detailBodies: {} },
      { now: new Date("2026-09-26T18:00:00Z"), sourceUrl: "https://api.sportsbook.fanduel.com/promos/api/promotions" },
    );

    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("schema_invalid");
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe("fanduelScraper — 2026-09-28 fixture: 'pre-live wager' no longer false-positives as live_only", () => {
  it("pins the full keep/skip map -- LONFLMNFRE0928 is now a kept profit_boost candidate", () => {
    const result = fanduelScraper.parse(
      { listBody: listFixture20260928, detailBodies: {} },
      { now: new Date("2026-09-28T12:00:00Z"), sourceUrl: "https://api.sportsbook.fanduel.com/promos/api/promotions" },
    );

    expect(result.found).toBe(result.candidates.length + result.skipped.length);

    const candidateIds = result.candidates.map((c) => c.externalId).sort();
    expect(candidateIds).toEqual(["LONFLMNFRE0928"]);

    const reasonByCode = new Map(result.skipped.map((s) => [s.externalId, s.reason]));
    expect(reasonByCode).toEqual(
      new Map([
        ["ACQB5G50BB921", "new_customer"],
        ["ACQPECBB1G100ST", "new_customer"],
        ["BPNEPSEAST0902", "not_a_promo"],
        ["LORTCTST26", "not_a_promo"],
        ["RAF092126STAT", "not_a_promo"],
        ["MLBPHSTATIC0901", "not_a_promo"],
        ["APVTNFSTATIC0917", "not_a_promo"],
        ["FODAILYSWNG0928", "not_a_promo"],
        ["BPWNBAST0918", "not_a_promo"],
        ["COSBKRGMSCCSTAT", "not_a_promo"],
        ["CORGNFLSW0921", "not_a_promo"],
      ]),
    );
    expect(reasonByCode.get("LONFLMNFRE0928")).toBeUndefined();
  });

  it("LONFLMNFRE0928 (NFL Reward Escalator) -- every field, exactly", () => {
    const result = fanduelScraper.parse(
      { listBody: listFixture20260928, detailBodies: {} },
      { now: new Date("2026-09-28T12:00:00Z"), sourceUrl: "https://api.sportsbook.fanduel.com/promos/api/promotions" },
    );
    const promo = result.candidates.find((c) => c.externalId === "LONFLMNFRE0928");
    expect(promo).toBeDefined();

    expect(promo!.promoType).toBe("profit_boost");
    expect(promo!.title).toBe("NFL Reward Escalator");
    // The "UP TO a 100% PBT(s)" escalator ceiling wording must NOT win over
    // the promo's actual "30% Profit Boost" -- BOOST_PERCENT_RE only matches
    // a number directly followed by "% ... profit boost", which "100% PBT"
    // never satisfies.
    expect(promo!.boostPercent).toBe("30.00");
    expect(promo!.sportKeyHint).toBe("americanfootball_nfl");
    expect(promo!.teamsText).toEqual(["Eagles", "Bears"]);
    expect(promo!.scopeText).toBe("Eagles @ Bears game on September 28");
    expect(promo!.expiresAt).toBe("2026-09-29T00:15:00.000Z");
    // No detail body was fetched (list-only path) -- max stake is unknown in
    // the list data, so it lands in the normal cap-review path exactly like
    // every other FanDuel list-only candidate, never invented.
    expect(promo!.maxStake).toBeNull();
    expect(promo!.unparsedCapFields).toEqual(["maxStake", "minOdds"]);
    expect(promo!.winningsCapKind).toBe("boost_extra");
    expect(promo!.claimRequired).toBe("claim_token");

    // The window contains the named game's ET calendar day.
    expect(promo!.windowStart).toBe("2026-09-28T04:00:00.000Z");
    expect(promo!.windowEnd).toBe("2026-09-29T03:59:59.999Z");
  });
});
