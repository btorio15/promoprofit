import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ballybetScraper } from "./ballybet";

const FIXTURES_DIR = join(process.cwd(), "src/test/fixtures/promos");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

const LIST_FIXTURE = readFixture("ballybet-promos.json");
const DETAIL_RAMS_BRONCOS = readFixture("ballybet-promo-detail-rams-broncos.json");
const DETAIL_WNBA = readFixture("ballybet-promo-detail-wnba.json");
const DETAIL_RAVENS_LIVE = readFixture("ballybet-promo-detail-ravens-cowboys-live.json");

const RAMS_BRONCOS_KEY = "sbk-10-Rams-Broncos-Profit-Boost";
const WNBA_KEY = "sbk-25-WNBA-Profit-Boost";
const RAVENS_KEY = "sbk-30-Ravens-Cowboys-Live-Wager-Profit-Boost";

const CTX = { now: new Date("2026-09-27T12:00:00Z"), sourceUrl: "https://example.test/ignored" };

describe("ballybetScraper.listRequest", () => {
  it("is a GET to the Contract list URL with exactly the Contract headers and a null body", () => {
    const req = ballybetScraper.listRequest;
    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://dx-config-service.eks00.prod.na00.aws.ballys.tech/view/promotions");
    expect(req.body).toBeNull();
    expect(req.headers).toEqual({
      jurisdiction: "US-CO",
      brand: "ballybet",
      "accept-language": "en-US",
      "application-type": "WEB",
      referer: "https://play.ballybet.com/",
      accept: "application/json",
      "user-agent": req.headers["user-agent"],
    });
    expect(req.headers["user-agent"]).toMatch(/Chrome/);
  });
});

describe("ballybetScraper.planDetails", () => {
  it("plans exactly one detail request for the real fixture: today's Rams-Broncos boost", () => {
    const plans = ballybetScraper.planDetails(LIST_FIXTURE);
    expect(plans).toHaveLength(1);
    expect(plans[0].entryKey).toBe(RAMS_BRONCOS_KEY);
    expect(plans[0].request.method).toBe("GET");
    expect(plans[0].request.url).toBe(
      `https://dx-config-service.eks00.prod.na00.aws.ballys.tech/view/${RAMS_BRONCOS_KEY}`,
    );
    expect(plans[0].request.body).toBeNull();
    expect(plans[0].request.headers).toEqual(ballybetScraper.listRequest.headers);
  });

  it("caps at maxDetailRequests (6) when more cards qualify", () => {
    const cards = Array.from({ length: 10 }, (_, i) => ({
      sys: { id: `id-${i}` },
      type: "promotion_content_card",
      title: `${10 + i}% Some Team vs. Other Team Profit Boost`,
      description: "Any Wager",
      link: { url: `/promotions/synthetic-${i}` },
    }));
    const synthetic = JSON.stringify({
      sections: { primaryContent: [{ data: cards }] },
    });

    const plans = ballybetScraper.planDetails(synthetic);
    expect(plans).toHaveLength(6);
    expect(ballybetScraper.maxDetailRequests).toBe(6);
  });

  it("never fetches generic T&Cs, unsupported-sport, or SGP/parlay/futures/live-only cards", () => {
    const plans = ballybetScraper.planDetails(LIST_FIXTURE);
    const plannedKeys = plans.map((p) => p.entryKey);
    expect(plannedKeys).not.toContain("sbk-profit-boost-01"); // Bally's Profit Boost (generic)
    expect(plannedKeys).not.toContain(WNBA_KEY);
    expect(plannedKeys).not.toContain(RAVENS_KEY);
    expect(plannedKeys).not.toContain("sbk-25-Rams-Broncos-SGP-Profit-Boost");
    expect(plannedKeys).not.toContain("sbk-25-TD-Scorer-Parlay-Profit-Boost");
    expect(plannedKeys).not.toContain("sbk-50-MLB-Parlay-Profit-Boost");
    expect(plannedKeys).not.toContain("sbk-50-Stanley-Cup-Champion-Profit-Boost");
  });

  it("returns [] without throwing for '{}' or non-JSON", () => {
    expect(ballybetScraper.planDetails("{}")).toEqual([]);
    expect(ballybetScraper.planDetails("<html>maintenance</html>")).toEqual([]);
  });
});

describe("ballybetScraper.parse — real fixture", () => {
  it("parses 19 entries into exactly one candidate (Rams-Broncos) with the rest skipped", () => {
    const result = ballybetScraper.parse(
      { listBody: LIST_FIXTURE, detailBodies: { [RAMS_BRONCOS_KEY]: DETAIL_RAMS_BRONCOS } },
      CTX,
    );

    expect(result.found).toBe(19);
    expect(result.candidates).toHaveLength(1);
    expect(result.skipped).toHaveLength(18);

    const promo = result.candidates[0];
    expect(promo.bookKey).toBe("ballybet");
    expect(promo.externalId).toBe(RAMS_BRONCOS_KEY);
    expect(promo.promoType).toBe("profit_boost");
    expect(promo.boostPercent).toBe("10.00");
    expect(promo.maxStake).toBe("20.00");
    expect(promo.minOddsAmerican).toBe(100);
    expect(promo.maxWinnings).toBeNull();
    expect(promo.unparsedCapFields).toEqual([]);
    expect(promo.teamsText).toEqual(["LA Rams", "DEN Broncos"]);
    expect(promo.scopeText).toBe("LA Rams vs. DEN Broncos");
    expect(promo.sportKeyHint).toBe("americanfootball_nfl");
    expect(promo.windowStart).toBe("2026-09-27T04:00:00.000Z");
    expect(promo.windowEnd).toBe("2026-09-28T03:30:00.000Z");
    expect(promo.expiresAt).toBe(promo.windowEnd);
    expect(promo.eligibleMarketTypes).toEqual(["moneyline", "spread", "total"]);
    expect(promo.pinned).toBeNull();
    expect(promo.boostedOddsAmerican).toBeNull();
    expect(promo.claimRequired).toBe("claim_token");
    expect(promo.sourceUrl).toBe(
      `https://dx-config-service.eks00.prod.na00.aws.ballys.tech/view/${RAMS_BRONCOS_KEY}`,
    );
  });

  it("skips every excluded/unsupported/not-a-promo card with the expected reason", () => {
    const result = ballybetScraper.parse(
      { listBody: LIST_FIXTURE, detailBodies: { [RAMS_BRONCOS_KEY]: DETAIL_RAMS_BRONCOS } },
      CTX,
    );

    const byTitle = new Map(result.skipped.map((s) => [s.title, s.reason]));

    expect(byTitle.get("25% LA Rams vs. DEN Broncos SGP Profit Boost")).toBe("sgp");
    expect(byTitle.get("25% NFL TD Scorer Parlay Profit Boost")).toBe("parlay");
    expect(byTitle.get("50% MLB Parlay Profit Boost")).toBe("parlay");
    expect(byTitle.get("50% Stanley Cup Champion Profit Boost")).toBe("futures");
    expect(byTitle.get("30% BAL Ravens vs. DAL Cowboys Live Wager Profit Boost")).toBe("live_only");
    expect(byTitle.get("25% WNBA Profit Boost")).toBe("unsupported_sport");

    expect(byTitle.get("NFL Weekly Pick 'Em - Over $1,000,000 in Bonus Bets! ")).toBe("not_a_promo");
    expect(byTitle.get("MLB Weekly Pick 'Em")).toBe("not_a_promo");
    expect(byTitle.get("Fastest Touchdown Frenzy")).toBe("not_a_promo");
    expect(byTitle.get("Bally Bet Fan View")).toBe("not_a_promo");
    expect(byTitle.get("🌟 Unlock the Ultimate VIP Experience 🌟")).toBe("not_a_promo");
    expect(byTitle.get("Bally's Profit Boost")).toBe("not_a_promo");
    expect(byTitle.get("Bally's Odds Boost")).toBe("not_a_promo");
    expect(byTitle.get("Second Chance Bet")).toBe("not_a_promo");
    expect(byTitle.get("Game In Good Hands")).toBe("not_a_promo");

    // Not explicitly named in the plan's behavior list, but every one still
    // carries a real SkipReason from the shared classifyExclusion helper.
    expect(byTitle.get("Parlay Zone")).toBe("parlay");
    expect(byTitle.get("Bally's Bet & Get")).toBe("not_a_promo");
    expect(byTitle.get("Promo Code")).toBe("new_customer");
  });

  it("still classifies WNBA as unsupported_sport and Ravens as live_only even when their details are supplied", () => {
    const result = ballybetScraper.parse(
      {
        listBody: LIST_FIXTURE,
        detailBodies: {
          [RAMS_BRONCOS_KEY]: DETAIL_RAMS_BRONCOS,
          [WNBA_KEY]: DETAIL_WNBA,
          [RAVENS_KEY]: DETAIL_RAVENS_LIVE,
        },
      },
      CTX,
    );

    const byTitle = new Map(result.skipped.map((s) => [s.title, s.reason]));
    expect(byTitle.get("25% WNBA Profit Boost")).toBe("unsupported_sport");
    expect(byTitle.get("30% BAL Ravens vs. DAL Cowboys Live Wager Profit Boost")).toBe("live_only");
    expect(result.candidates).toHaveLength(1);
  });

  it("builds the Rams-Broncos candidate from the list card alone when its planned detail is missing (D-18)", () => {
    const result = ballybetScraper.parse({ listBody: LIST_FIXTURE, detailBodies: {} }, CTX);

    expect(result.candidates).toHaveLength(1);
    const promo = result.candidates[0];
    expect(promo.boostPercent).toBe("10.00");
    expect(promo.teamsText).toEqual(["LA Rams", "DEN Broncos"]);
    expect(promo.maxStake).toBeNull();
    expect(promo.minOddsAmerican).toBeNull();
    expect(promo.unparsedCapFields).toEqual(["maxStake", "minOdds"]);
    expect(promo.windowStart).toBeNull();
    expect(promo.windowEnd).toBeNull();
    expect(promo.expiresAt).toBeNull();
  });

  it("parses '<html>maintenance</html>' or '{}' as found 0 with no throw", () => {
    expect(ballybetScraper.parse({ listBody: "<html>maintenance</html>", detailBodies: {} }, CTX)).toEqual({
      found: 0,
      candidates: [],
      skipped: [],
    });
    expect(ballybetScraper.parse({ listBody: "{}", detailBodies: {} }, CTX)).toEqual({
      found: 0,
      candidates: [],
      skipped: [],
    });
  });

  it("drops a candidate that fails ScrapedPromoSchema into skipped as schema_invalid, with a console.warn, never throwing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const badListBody = JSON.stringify({
      sections: {
        primaryContent: [
          {
            data: [
              {
                type: "promotion_content_card",
                title: "40% Bad Team vs. Worse Team Profit Boost",
                description: "40% Profit Boost",
                link: { url: "/promotions/bad-window" },
              },
            ],
          },
        ],
      },
    });
    const badDetailBody = JSON.stringify({
      sections: {
        primaryContent: [
          {
            componentType: "promotion_details",
            promotionIdentifier: "bad-window",
            title: "40% Bad Team vs. Worse Team Profit Boost",
            description: "<p>40% Profit Boost</p><p>Any Wager</p>",
            terms:
              "<p>Promotion claimable for Bad Team vs. Worse Team between September 27, 2026 at 11:30 PM ET and September 27, 2026 at 12:00 AM ET.</p>",
            promotionCta: { url: "/sports#sports-hub/american_football/nfl" },
          },
        ],
      },
    });

    const result = ballybetScraper.parse(
      { listBody: badListBody, detailBodies: { "bad-window": badDetailBody } },
      CTX,
    );

    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toEqual([
      { reason: "schema_invalid", externalId: "bad-window", title: "40% Bad Team vs. Worse Team Profit Boost" },
    ]);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("skips a qualifying candidate with unrecognized market wording rather than guessing", () => {
    const listBody = JSON.stringify({
      sections: {
        primaryContent: [
          {
            data: [
              {
                type: "promotion_content_card",
                title: "40% Some Team vs. Other Team Profit Boost",
                description: "40% Profit Boost",
                link: { url: "/promotions/unrecognized-market" },
              },
            ],
          },
        ],
      },
    });
    const detailBody = JSON.stringify({
      sections: {
        primaryContent: [
          {
            componentType: "promotion_details",
            promotionIdentifier: "unrecognized-market",
            title: "40% Some Team vs. Other Team Profit Boost",
            description: "<p>40% Profit Boost</p><p>Maximum Bet: $10</p><p>First-Half Wagers Only</p>",
            terms:
              "<p>Promotion claimable for Some Team vs. Other Team between September 27, 2026 at 12:00 AM ET and September 27, 2026 at 11:30 PM ET.</p>",
            promotionCta: { url: "/sports#sports-hub/american_football/nfl" },
          },
        ],
      },
    });

    const result = ballybetScraper.parse(
      { listBody, detailBodies: { "unrecognized-market": detailBody } },
      CTX,
    );

    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toEqual([
      {
        reason: "unrecognized",
        externalId: "unrecognized-market",
        title: "40% Some Team vs. Other Team Profit Boost",
      },
    ]);
  });
});
