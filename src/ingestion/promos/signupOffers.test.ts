import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractSignupOffers, parseSignupBonusAmount, signupDedupeKey, SIGNUP_PAGE_URLS } from "./signupOffers";
import { draftkingsScraper } from "./books/draftkings";
import { fanduelScraper } from "./books/fanduel";
import { ballybetScraper } from "./books/ballybet";
import type { SkippedEntry } from "@/domain/promos/scraped";

const FIXTURES_DIR = join(process.cwd(), "src/test/fixtures/promos");
const NOW = new Date("2026-09-28T12:00:00.000Z");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

function newCustomerSkip(overrides: Partial<SkippedEntry> = {}, evidenceOverrides: Partial<NonNullable<SkippedEntry["evidence"]>> = {}): SkippedEntry {
  return {
    reason: "new_customer",
    externalId: "x-1",
    title: "Some Offer",
    evidence: {
      rawText: "Some raw text",
      sourceUrl: "https://example.com/api",
      expiresAt: null,
      partial: null,
      ...evidenceOverrides,
    },
    ...overrides,
  };
}

describe("extractSignupOffers -- real fixtures", () => {
  it("DK 2026-09-28: exactly 1118611 (150.00), 779769 (null), 1107235 (null); 2 referrals, 1 notSignup", () => {
    const result = draftkingsScraper.parse(
      { listBody: readFixture("draftkings-promos-2026-09-28.json"), detailBodies: {} },
      { now: NOW, sourceUrl: draftkingsScraper.listRequest.url },
    );
    const extracted = extractSignupOffers("draftkings", result.skipped);

    expect(extracted.offers.map((o) => o.externalId).sort()).toEqual(["1107235", "1118611", "779769"].sort());
    expect(extracted.offers.find((o) => o.externalId === "1118611")?.bonusAmount).toBe("150.00");
    expect(extracted.offers.find((o) => o.externalId === "779769")?.bonusAmount).toBeNull();
    expect(extracted.offers.find((o) => o.externalId === "1107235")?.bonusAmount).toBeNull();
    expect(extracted.referralsExcluded).toBe(2);
    expect(extracted.notSignup).toBe(1);
    for (const offer of extracted.offers) {
      expect(offer.sourceUrl).toBe(SIGNUP_PAGE_URLS.draftkings);
    }
  });

  it("FanDuel 2026-09-28: ACQB5G50BB921 gives 250.00, ACQPECBB1G100ST gives 100.00", () => {
    const result = fanduelScraper.parse(
      { listBody: readFixture("fanduel-promos-2026-09-28.json"), detailBodies: {} },
      { now: NOW, sourceUrl: fanduelScraper.listRequest.url },
    );
    const extracted = extractSignupOffers("fanduel", result.skipped);

    expect(extracted.offers.find((o) => o.externalId === "ACQB5G50BB921")?.bonusAmount).toBe("250.00");
    expect(extracted.offers.find((o) => o.externalId === "ACQPECBB1G100ST")?.bonusAmount).toBe("100.00");
    for (const offer of extracted.offers) {
      expect(offer.sourceUrl).toBe(SIGNUP_PAGE_URLS.fanduel);
    }
  });

  it("Bally list fixture: promo-code-sports with amount null", () => {
    const result = ballybetScraper.parse(
      { listBody: readFixture("ballybet-promos.json"), detailBodies: {} },
      { now: NOW, sourceUrl: ballybetScraper.listRequest.url },
    );
    const extracted = extractSignupOffers("ballybet", result.skipped);

    const offer = extracted.offers.find((o) => o.externalId === "promo-code-sports");
    expect(offer).toBeDefined();
    expect(offer?.bonusAmount).toBeNull();
    expect(offer?.sourceUrl).toBe(SIGNUP_PAGE_URLS.ballybet);
  });
});

describe("parseSignupBonusAmount", () => {
  it.each([
    ["Bet $5 Get $150 in Bonus Bets", "", "150.00"],
    ["", "$1,000 in Bonus Bets", "1000.00"],
    ["", "$50 bonus bet", "50.00"],
    ["", "Get $25.50 in bonus", "25.50"],
    ["Deposit Bonus up to $1,000", "", null],
    ["Bet $5, Get $50 for 5 days", "", null],
    ["GET $10 IN CROWN CASH", "", null],
    ["no dollar sign here", "still none", null],
  ])("parseSignupBonusAmount(%j, %j) -> %j", (title, body, expected) => {
    expect(parseSignupBonusAmount(title, body)).toBe(expected);
  });

  it("title match wins over a larger body match", () => {
    expect(parseSignupBonusAmount("$150 in Bonus Bets", "$500 in Bonus Bets")).toBe("150.00");
  });

  it("falls back to the largest body match when the title has none", () => {
    expect(
      parseSignupBonusAmount("New User Bet & Get", "Get $250 in Bonus Bets guaranteed! ... earn $50 in Bonus Bets daily."),
    ).toBe("250.00");
  });
});

describe("extractSignupOffers -- referral filter and boilerplate rule", () => {
  it("excludes 'Refer a Friend!' by title", () => {
    const skip = newCustomerSkip({ title: "Refer a Friend!" }, { rawText: "Refer a Friend to get rewards!" });
    const result = extractSignupOffers("draftkings", [skip]);
    expect(result.offers).toHaveLength(0);
    expect(result.referralsExcluded).toBe(1);
  });

  it("excludes 'Refer-A-Friend Get Bonus Bets' by title", () => {
    const skip = newCustomerSkip({ title: "Refer-A-Friend Get Bonus Bets" }, { rawText: "Invite your friends to join FanDuel from anywhere and earn Bonus Bets!" });
    const result = extractSignupOffers("fanduel", [skip]);
    expect(result.offers).toHaveLength(0);
    expect(result.referralsExcluded).toBe(1);
  });

  it("excludes 'Invite your friends to join' text alone", () => {
    const skip = newCustomerSkip({ title: "Some Bonus" }, { rawText: "Invite your friends to join and earn rewards." });
    const result = extractSignupOffers("draftkings", [skip]);
    expect(result.offers).toHaveLength(0);
    expect(result.referralsExcluded).toBe(1);
  });

  it("excludes 'referral bonus' text", () => {
    const skip = newCustomerSkip({ title: "Get Rewarded" }, { rawText: "Earn a referral bonus for every friend who signs up." });
    const result = extractSignupOffers("draftkings", [skip]);
    expect(result.offers).toHaveLength(0);
    expect(result.referralsExcluded).toBe(1);
  });

  it("DK's 'the refer-a-friend program' boilerplate ALONE does not exclude", () => {
    const skip = newCustomerSkip(
      { title: "New Customers Bonus", externalId: "np-1" },
      { rawText: "New customers get a welcome bonus. Abusing the platform, the refer-a-friend program, or other offers voids this promotion." },
    );
    const result = extractSignupOffers("draftkings", [skip]);
    expect(result.referralsExcluded).toBe(0);
    expect(result.offers).toHaveLength(1);
  });

  it("strips DK's logged-out boilerplate and excludes when nothing new-customer-shaped remains (Daily Rewards Rocket Turbo case)", () => {
    const skip = newCustomerSkip(
      { title: "Daily Rewards Rocket Turbo!", externalId: "1098873" },
      { rawText: "Please log in or sign up to view terms and conditions.\nReady To Take Off? Power Up The Free Daily Rewards Rocket!" },
    );
    const result = extractSignupOffers("draftkings", [skip]);
    expect(result.offers).toHaveLength(0);
    expect(result.notSignup).toBe(1);
    expect(result.referralsExcluded).toBe(0);
  });

  it("keeps an entry whose boilerplate is stripped but new-customer wording still remains", () => {
    const skip = newCustomerSkip(
      { title: "New Customers Offer", externalId: "np-2" },
      { rawText: "Please log in or sign up to view terms and conditions.\nNew customers get $20 in bonus after signing up." },
    );
    const result = extractSignupOffers("draftkings", [skip]);
    expect(result.offers).toHaveLength(1);
    expect(result.notSignup).toBe(0);
  });

  it("an unknown book key gets no offer URL: skipped and counted as notSignup", () => {
    const skip = newCustomerSkip({ title: "Some Offer", externalId: "u-1" }, { rawText: "New customers get a bonus." });
    const result = extractSignupOffers("unknownbook", [skip]);
    expect(result.offers).toHaveLength(0);
    expect(result.notSignup).toBe(1);
  });

  it("only considers reason === new_customer entries with evidence; other reasons and evidence-less entries are ignored", () => {
    const otherReason: SkippedEntry = { reason: "prop", externalId: "p-1", title: "Prop Boost", evidence: { rawText: "x", sourceUrl: "https://x", expiresAt: null, partial: null } };
    const noEvidence: SkippedEntry = { reason: "new_customer", externalId: "ne-1", title: "No Evidence" };
    const result = extractSignupOffers("draftkings", [otherReason, noEvidence]);
    expect(result.offers).toHaveLength(0);
    expect(result.referralsExcluded).toBe(0);
    expect(result.notSignup).toBe(0);
  });

  it("dedupes entries within one call by dedupeKey -- the first one wins", () => {
    const skipA = newCustomerSkip({ title: "Dup Offer", externalId: "dup-1" }, { rawText: "New customers get $10 bonus.", expiresAt: null });
    const skipB = newCustomerSkip({ title: "Dup Offer Updated", externalId: "dup-1" }, { rawText: "New customers get $20 bonus." });
    const result = extractSignupOffers("draftkings", [skipA, skipB]);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].title).toBe("Dup Offer");
  });
});

describe("signupDedupeKey", () => {
  it("'signup:draftkings:1118611' when there's an externalId", () => {
    expect(signupDedupeKey("draftkings", "1118611", "New Sportsbook Customers Bet $5 Get $150 in Bonus Bets")).toBe(
      "signup:draftkings:1118611",
    );
  });

  it("a stable 'signup:{bookKey}:t:' plus a 16-hex sha256 of the normalized title when externalId is null", () => {
    const key1 = signupDedupeKey("ballybet", null, "  Promo   Code  ");
    const key2 = signupDedupeKey("ballybet", null, "promo code");
    expect(key1).toBe(key2);
    expect(key1.startsWith("signup:ballybet:t:")).toBe(true);
    expect(key1.replace("signup:ballybet:t:", "")).toHaveLength(16);
  });
});

describe("SIGNUP_PAGE_URLS", () => {
  it("maps each of the three target books to their public sportsbook origin", () => {
    expect(SIGNUP_PAGE_URLS.draftkings).toBe("https://sportsbook.draftkings.com/");
    expect(SIGNUP_PAGE_URLS.fanduel).toBe("https://sportsbook.fanduel.com/");
    expect(SIGNUP_PAGE_URLS.ballybet).toBe("https://play.ballybet.com/");
  });
});
