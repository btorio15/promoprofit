import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  runPromoSportsRefresh: vi.fn(),
  getActivePromos: vi.fn(),
  getUserBookKeys: vi.fn(),
  getHedgeBookKeys: vi.fn(),
  getCachedEvents: vi.fn(),
  getCachedExtendedEvents: vi.fn(),
  getPromoCompletions: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/session", () => ({ requireUser: m.requireUser }));
vi.mock("@/ingestion/odds/refreshExtended", () => ({ runPromoSportsRefresh: m.runPromoSportsRefresh }));
vi.mock("@/db/promos", () => ({ getActivePromos: m.getActivePromos }));
vi.mock("@/db/queries", () => ({
  getUserBookKeys: m.getUserBookKeys,
  getHedgeBookKeys: m.getHedgeBookKeys,
  getCachedEvents: m.getCachedEvents,
  getCachedExtendedEvents: m.getCachedExtendedEvents,
}));
vi.mock("@/db/promoTracking", () => ({ getPromoCompletions: m.getPromoCompletions }));

import { refreshPromos } from "./refresh-promos";

const nflPromo = {
  id: 1,
  bookKey: "fanduel",
  promoType: "bonus_bet",
  scope: { kind: "event", eventId: "e1", sportKey: "americanfootball_nfl" },
  pinned: null,
  eligibleMarketTypes: ["spread"],
  boostPercent: null,
  boostedOddsAmerican: null,
  baseOddsAmerican: null,
  bonusAmount: "50",
  maxStake: null,
  winningsCap: null,
  minOddsAmerican: null,
};
const donePromo = { ...nflPromo, id: 2, scope: { kind: "event", eventId: "e2", sportKey: "icehockey_nhl" } };

beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue({ userId: 42, email: "a@b.c", displayName: "A" });
  m.runPromoSportsRefresh.mockResolvedValue({ status: "confirm_required" });
  m.getActivePromos.mockResolvedValue([nflPromo, donePromo]);
  m.getPromoCompletions.mockResolvedValue([{ promoId: 2 }]);
  m.getUserBookKeys.mockResolvedValue(["fanduel"]);
  m.getHedgeBookKeys.mockResolvedValue(["fanduel", "draftkings"]);
  m.getCachedEvents.mockResolvedValue({ events: [], fetchedAt: null });
  m.getCachedExtendedEvents.mockResolvedValue({ events: [], fetchedAt: null });
});

describe("refreshPromos", () => {
  it("requireUser runs first: a logged-out call never loads promos or reaches the runner", async () => {
    m.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(refreshPromos({ confirmed: true })).rejects.toThrow();
    expect(m.getActivePromos).not.toHaveBeenCalled();
    expect(m.runPromoSportsRefresh).not.toHaveBeenCalled();
  });

  it("invalid input -> error, no runner call", async () => {
    const out = await refreshPromos({ confirmed: "yes" });
    expect(out.status).toBe("error");
    expect(m.runPromoSportsRefresh).not.toHaveBeenCalled();
  });

  it("loads the viewer's promos (viewer-scoped) and scopes sports from non-Done promos only", async () => {
    await refreshPromos({ confirmed: false });
    expect(m.getActivePromos).toHaveBeenCalledWith(expect.any(Date), 42);
    const passed = m.runPromoSportsRefresh.mock.calls[0][0];
    expect(passed.confirmed).toBe(false);
    expect(passed.triggeredByUserId).toBe(42);
    expect(passed.sportKeys).toEqual(["americanfootball_nfl"]); // the Done NHL promo is excluded
    expect(passed.altGameEstimate).toBe(1);
    expect(passed.pickAltSpreadEventIds).toBeUndefined();
  });

  it("confirmed press passes alt requests from feed promos and a picker", async () => {
    await refreshPromos({ confirmed: true });
    const passed = m.runPromoSportsRefresh.mock.calls[0][0];
    expect(passed.confirmed).toBe(true);
    expect(passed.altSpreads).toEqual({ pins: [], scopedEventIds: ["e1"] });
    expect(m.getHedgeBookKeys).toHaveBeenCalledWith(new Set(["fanduel"]));
    expect(typeof passed.pickAltSpreadEventIds).toBe("function");
    expect(passed.pickAltSpreadEventIds({ moneylineEvents: [], extendedEvents: [], now: new Date() })).toEqual([]);
  });

  it("no active (non-Done) promos -> no_promos and the runner is NOT called", async () => {
    m.getActivePromos.mockResolvedValue([donePromo]);
    expect(await refreshPromos({ confirmed: true })).toEqual({
      status: "no_promos",
      message: "No active promos to refresh.",
    });
    expect(m.runPromoSportsRefresh).not.toHaveBeenCalled();

    m.getActivePromos.mockResolvedValue([]);
    expect((await refreshPromos({ confirmed: false })).status).toBe("no_promos");
    expect(m.runPromoSportsRefresh).not.toHaveBeenCalled();
  });

  it("promo load failure -> error with no runner call", async () => {
    m.getActivePromos.mockRejectedValue(new Error("db"));
    expect((await refreshPromos({ confirmed: true })).status).toBe("error");
    expect(m.runPromoSportsRefresh).not.toHaveBeenCalled();
  });

  it("revalidatePath only on ok", async () => {
    await refreshPromos({ confirmed: false });
    expect(m.revalidatePath).not.toHaveBeenCalled();
    m.runPromoSportsRefresh.mockResolvedValue({ status: "ok" });
    await refreshPromos({ confirmed: true });
    expect(m.revalidatePath).toHaveBeenCalledWith("/");
  });
});
