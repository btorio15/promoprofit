import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SignupOfferRow } from "@/domain/promos/signupOffers";

const { mockRequireUser, mockGetUserBookKeys, mockGetActiveSignupOffers } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetUserBookKeys: vi.fn(),
  mockGetActiveSignupOffers: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/queries", () => ({ getUserBookKeys: mockGetUserBookKeys }));
vi.mock("@/db/signupOffers", () => ({ getActiveSignupOffers: mockGetActiveSignupOffers }));

import { getSignupOffers } from "./get-signup-offers";

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

describe("getSignupOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes no arguments -- the client can never supply a userId", () => {
    expect(getSignupOffers.length).toBe(0);
  });

  it("when requireUser rejects, getUserBookKeys and getActiveSignupOffers are never called and the action rejects", async () => {
    mockRequireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(getSignupOffers()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockGetUserBookKeys).not.toHaveBeenCalled();
    expect(mockGetActiveSignupOffers).not.toHaveBeenCalled();
  });

  it("getUserBookKeys is called with exactly the session's userId", async () => {
    mockRequireUser.mockResolvedValue({ userId: 42, email: "a@b.com", displayName: "A" });
    mockGetUserBookKeys.mockResolvedValue([]);
    mockGetActiveSignupOffers.mockResolvedValue([]);

    await getSignupOffers();

    expect(mockGetUserBookKeys).toHaveBeenCalledWith(42);
    expect(mockGetUserBookKeys).toHaveBeenCalledTimes(1);
  });

  it("filters end to end: a member owning fanduel sees no fanduel group, but sees draftkings and ballybet", async () => {
    mockRequireUser.mockResolvedValue({ userId: 7, email: "a@b.com", displayName: "A" });
    mockGetUserBookKeys.mockResolvedValue(["fanduel"]);
    mockGetActiveSignupOffers.mockResolvedValue([
      row({ id: 1, bookKey: "draftkings" }),
      row({ id: 2, bookKey: "fanduel", sourceUrl: "https://sportsbook.fanduel.com/" }),
      row({ id: 3, bookKey: "ballybet", sourceUrl: "https://play.ballybet.com/" }),
    ]);

    const result = await getSignupOffers();

    expect(result.status).toBe("ok");
    expect(result.groups.map((g) => g.bookKey)).toEqual(["draftkings", "ballybet"]);
    expect(result.groups.some((g) => g.bookKey === "fanduel")).toBe(false);
  });

  it("a thrown DB error propagates", async () => {
    mockRequireUser.mockResolvedValue({ userId: 1, email: "a@b.com", displayName: "A" });
    mockGetUserBookKeys.mockResolvedValue([]);
    mockGetActiveSignupOffers.mockRejectedValue(new Error("db exploded"));

    await expect(getSignupOffers()).rejects.toThrow("db exploded");
  });
});
