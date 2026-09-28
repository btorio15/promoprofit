import { describe, expect, it } from "vitest";
import { groupSignupOffersForMember, type SignupOfferRow } from "./signupOffers";

function row(overrides: Partial<SignupOfferRow> = {}): SignupOfferRow {
  return {
    id: 1,
    bookKey: "draftkings",
    title: "Some Offer",
    description: "Some description",
    bonusAmount: null,
    sourceUrl: "https://sportsbook.draftkings.com/",
    expiresAt: null,
    ...overrides,
  };
}

describe("groupSignupOffersForMember", () => {
  it("owned [draftkings] with offers at draftkings, fanduel and ballybet gives groups for fanduel and ballybet only, ordered by COLORADO_BOOKS sortOrder", () => {
    const rows = [
      row({ id: 1, bookKey: "draftkings" }),
      row({ id: 2, bookKey: "ballybet", sourceUrl: "https://play.ballybet.com/" }),
      row({ id: 3, bookKey: "fanduel", sourceUrl: "https://sportsbook.fanduel.com/" }),
    ];
    const result = groupSignupOffersForMember(rows, new Set(["draftkings"]));

    expect(result.empty).toBeNull();
    expect(result.groups.map((g) => g.bookKey)).toEqual(["fanduel", "ballybet"]);
    expect(result.groups.every((g) => g.offers.length === 1)).toBe(true);
  });

  it("owned every book that has an offer gives groups [] and empty have-all", () => {
    const rows = [row({ bookKey: "draftkings" }), row({ bookKey: "fanduel", sourceUrl: "https://sportsbook.fanduel.com/" })];
    const result = groupSignupOffersForMember(rows, new Set(["draftkings", "fanduel"]));
    expect(result.groups).toEqual([]);
    expect(result.empty).toBe("have-all");
  });

  it("no offers at all gives groups [] and empty none", () => {
    const result = groupSignupOffersForMember([], new Set());
    expect(result.groups).toEqual([]);
    expect(result.empty).toBe("none");
  });

  it("an unknown owned key is ignored", () => {
    const rows = [row({ bookKey: "draftkings" })];
    const result = groupSignupOffersForMember(rows, new Set(["not-a-real-book"]));
    expect(result.groups.map((g) => g.bookKey)).toEqual(["draftkings"]);
    expect(result.empty).toBeNull();
  });

  it("an unparseable or javascript: sourceUrl gives link null; an https URL passes through", () => {
    const rows = [
      row({ id: 1, bookKey: "draftkings", sourceUrl: "javascript:alert(1)" }),
      row({ id: 2, bookKey: "draftkings", sourceUrl: "not a url" }),
      row({ id: 3, bookKey: "draftkings", sourceUrl: "https://sportsbook.draftkings.com/" }),
    ];
    const result = groupSignupOffersForMember(rows, new Set());
    const offers = result.groups[0].offers;
    expect(offers.find((o) => o.id === 1)?.link).toBeNull();
    expect(offers.find((o) => o.id === 2)?.link).toBeNull();
    expect(offers.find((o) => o.id === 3)?.link).toBe("https://sportsbook.draftkings.com/");
  });

  it("bonusAmount '150.00' gives bonusLabel '$150.00' via formatUsd; null gives null", () => {
    const rows = [row({ id: 1, bonusAmount: "150.00" }), row({ id: 2, bonusAmount: null })];
    const result = groupSignupOffersForMember(rows, new Set());
    const offers = result.groups[0].offers;
    expect(offers.find((o) => o.id === 1)?.bonusLabel).toBe("$150.00");
    expect(offers.find((o) => o.id === 2)?.bonusLabel).toBeNull();
  });

  it("within a group, offers are sorted by bonus amount descending (Decimal compare, nulls last), then title", () => {
    const rows = [
      row({ id: 1, title: "B Offer", bonusAmount: "50.00" }),
      row({ id: 2, title: "A Offer", bonusAmount: null }),
      row({ id: 3, title: "C Offer", bonusAmount: "150.00" }),
      row({ id: 4, title: "A Tie", bonusAmount: "50.00" }),
      row({ id: 5, title: "Z Offer", bonusAmount: null }),
    ];
    const result = groupSignupOffersForMember(rows, new Set());
    expect(result.groups[0].offers.map((o) => o.id)).toEqual([3, 4, 1, 2, 5]);
  });
});
