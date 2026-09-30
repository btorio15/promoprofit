import { beforeEach, describe, expect, it, vi } from "vitest";

// 260930-hor: inspects what the action hands to runSpreadsTotalsRefresh.
const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  runSpreadsTotalsRefresh: vi.fn(),
  getActivePromos: vi.fn(),
  getUserBookKeys: vi.fn(),
  getHedgeBookKeys: vi.fn(),
  getPromoCompletions: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: m.requireUser }));
vi.mock("@/ingestion/odds/refreshExtended", () => ({ runSpreadsTotalsRefresh: m.runSpreadsTotalsRefresh }));
vi.mock("@/db/promos", () => ({ getActivePromos: m.getActivePromos }));
vi.mock("@/db/queries", () => ({ getUserBookKeys: m.getUserBookKeys, getHedgeBookKeys: m.getHedgeBookKeys }));
vi.mock("@/db/promoTracking", () => ({ getPromoCompletions: m.getPromoCompletions }));

import { refreshSpreadsTotals } from "./refresh-spreads-totals";

const promo = {
  id: 1,
  bookKey: "fanduel",
  promoType: "bonus_bet",
  scope: { kind: "any" },
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

beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue({ userId: 42, email: "a@b.c", displayName: "A" });
  m.runSpreadsTotalsRefresh.mockResolvedValue({ status: "confirm_required" });
  m.getActivePromos.mockResolvedValue([promo]);
  m.getUserBookKeys.mockResolvedValue(["fanduel"]);
  m.getHedgeBookKeys.mockResolvedValue(["fanduel", "draftkings"]);
  m.getPromoCompletions.mockResolvedValue([]);
});

describe("refreshSpreadsTotals league-wide alt picker wiring (260930-hor)", () => {
  it("unconfirmed press loads no promos or books and passes no hook", async () => {
    await refreshSpreadsTotals({ confirmed: false });
    expect(m.getActivePromos).not.toHaveBeenCalled();
    expect(m.getUserBookKeys).not.toHaveBeenCalled();
    expect(m.getHedgeBookKeys).not.toHaveBeenCalled();
    expect(m.runSpreadsTotalsRefresh.mock.calls[0][0].pickAltSpreadEventIds).toBeUndefined();
  });

  it("confirmed press loads the member's promos and hedge books and passes a picker", async () => {
    await refreshSpreadsTotals({ confirmed: true });
    expect(m.getActivePromos).toHaveBeenCalledWith(expect.any(Date), 42);
    expect(m.getUserBookKeys).toHaveBeenCalledWith(42);
    expect(m.getHedgeBookKeys).toHaveBeenCalledWith(new Set(["fanduel"]));
    const passed = m.runSpreadsTotalsRefresh.mock.calls[0][0];
    expect(typeof passed.pickAltSpreadEventIds).toBe("function");
    // No events -> nothing to pick, and the picker does not throw.
    expect(passed.pickAltSpreadEventIds({ moneylineEvents: [], extendedEvents: [], now: new Date() })).toEqual([]);
  });

  it("hedge-book load failure: refresh still runs with gyl altSpreads intact and no hook", async () => {
    m.getHedgeBookKeys.mockRejectedValue(new Error("db"));
    await refreshSpreadsTotals({ confirmed: true });
    const passed = m.runSpreadsTotalsRefresh.mock.calls[0][0];
    expect(passed.pickAltSpreadEventIds).toBeUndefined();
    expect(passed.altSpreads).toEqual({ pins: [], scopedEventIds: [] });
  });

  it("promo load failure: refresh still runs with no altSpreads and no hook", async () => {
    m.getActivePromos.mockRejectedValue(new Error("db"));
    await refreshSpreadsTotals({ confirmed: true });
    const passed = m.runSpreadsTotalsRefresh.mock.calls[0][0];
    expect(passed.pickAltSpreadEventIds).toBeUndefined();
    expect(passed.altSpreads).toEqual({ pins: [], scopedEventIds: [] });
    expect(m.getHedgeBookKeys).not.toHaveBeenCalled();
  });
});
