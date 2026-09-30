import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireUser,
  mockGetUsableUserBooks,
  mockGetCachedEvents,
  mockGetCachedExtendedEvents,
  mockGetActivePromos,
  mockGetOwnActiveAddedPromo,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetUsableUserBooks: vi.fn(),
  mockGetCachedEvents: vi.fn(),
  mockGetCachedExtendedEvents: vi.fn(),
  mockGetActivePromos: vi.fn(),
  mockGetOwnActiveAddedPromo: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/queries", () => ({
  getUsableUserBooks: mockGetUsableUserBooks,
  getCachedEvents: mockGetCachedEvents,
  getCachedExtendedEvents: mockGetCachedExtendedEvents,
}));
vi.mock("@/db/promos", () => ({ getActivePromos: mockGetActivePromos }));
vi.mock("@/db/addedPromos", () => ({ getOwnActiveAddedPromo: mockGetOwnActiveAddedPromo }));

import { getAddPromoFormOptions } from "./get-add-promo-options";

function promo(over: Record<string, unknown>) {
  return {
    id: 1,
    bookKey: "fanduel",
    promoType: "bonus_bet",
    scope: { kind: "any" },
    bonusAmount: "50.00",
    boostPercent: null,
    boostedOddsAmerican: null,
    addedByYou: false,
    ...over,
  };
}

beforeEach(() => {
  mockRequireUser.mockReset().mockResolvedValue({ userId: 7 });
  mockGetUsableUserBooks.mockReset().mockResolvedValue([{ key: "fanduel", displayName: "FanDuel" }]);
  mockGetCachedEvents.mockReset().mockResolvedValue({ events: [] });
  mockGetCachedExtendedEvents.mockReset().mockResolvedValue({ events: [] });
  mockGetActivePromos.mockReset().mockResolvedValue([]);
  mockGetOwnActiveAddedPromo.mockReset().mockResolvedValue(null);
});

describe("getAddPromoFormOptions duplicateCandidates", () => {
  it("does not touch any data source when the session check rejects", async () => {
    mockRequireUser.mockRejectedValue(new Error("unauthenticated"));
    await expect(getAddPromoFormOptions({})).rejects.toThrow("unauthenticated");
    expect(mockGetActivePromos).not.toHaveBeenCalled();
    expect(mockGetUsableUserBooks).not.toHaveBeenCalled();
    expect(mockGetCachedEvents).not.toHaveBeenCalled();
  });

  it("reads promos scoped to the session user", async () => {
    await getAddPromoFormOptions({});
    expect(mockGetActivePromos).toHaveBeenCalledWith(expect.any(Date), 7);
  });

  it("excludes added promos and promos at books the member does not have", async () => {
    mockGetActivePromos.mockResolvedValue([
      promo({ id: 1 }),
      promo({ id: 2, addedByYou: true }),
      promo({ id: 3, bookKey: "betmgm" }),
    ]);
    const result = await getAddPromoFormOptions({});
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.duplicateCandidates).toHaveLength(1);
    expect(result.duplicateCandidates[0].bookKey).toBe("fanduel");
    expect(result.duplicateCandidates[0].bonusAmount).toBe("50.00");
  });

  it("serializes window dates as ISO strings", async () => {
    mockGetActivePromos.mockResolvedValue([
      promo({
        promoType: "profit_boost",
        bonusAmount: null,
        boostPercent: "50.00",
        scope: {
          kind: "sport_window",
          sportKey: "americanfootball_nfl",
          windowStart: new Date("2026-10-03T04:00:00.000Z"),
          windowEnd: new Date("2026-10-04T03:59:59.999Z"),
        },
      }),
    ]);
    const result = await getAddPromoFormOptions({});
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.duplicateCandidates[0].scope).toEqual({
      kind: "sport_window",
      sportKey: "americanfootball_nfl",
      windowStart: "2026-10-03T04:00:00.000Z",
      windowEnd: "2026-10-04T03:59:59.999Z",
    });
  });

  it("rejects unknown input keys", async () => {
    const result = await getAddPromoFormOptions({ nope: 1 });
    expect(result).toEqual({ status: "invalid" });
    expect(mockGetActivePromos).not.toHaveBeenCalled();
  });
});
