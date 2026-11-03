import { beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { buildTrackedSnapshotFixture } from "@/domain/promos/noSweatSnapshot.fixture";

const { mockActive, mockTracked, mockLowProfile, mockMakeRate } = vi.hoisted(() => ({
  mockActive: vi.fn(),
  mockTracked: vi.fn(),
  mockLowProfile: vi.fn(),
  mockMakeRate: vi.fn(),
}));

vi.mock("@/db/promos", () => ({ getActiveNoSweatPromos: mockActive }));
vi.mock("@/db/trackedNoSweats", () => ({ getTrackedNoSweats: mockTracked }));
vi.mock("@/db/lowProfile", () => ({ getMemberLowProfile: mockLowProfile }));
vi.mock("@/domain/hedge/conversionRate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/hedge/conversionRate")>();
  return {
    ...actual,
    makeConversionRateFor: (...args: Parameters<typeof actual.makeConversionRateFor>) => {
      mockMakeRate();
      return actual.makeConversionRateFor(...args);
    },
  };
});

import { loadNoSweatFeed, type MemberFeedContext } from "./noSweatFeed";

const NOW = new Date();
const plusHours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();

const EVENT: OddsEvent = {
  id: "evt-a",
  sport_key: "americanfootball_nfl",
  sport_title: "NFL",
  commence_time: plusHours(6),
  home_team: "DEN Broncos",
  away_team: "LA Rams",
  bookmakers: [
    { key: "draftkings", title: "DraftKings", markets: [{ key: "h2h", outcomes: [{ name: "DEN Broncos", price: -275 }, { name: "LA Rams", price: 220 }] }] },
    { key: "fanduel", title: "FanDuel", markets: [{ key: "h2h", outcomes: [{ name: "DEN Broncos", price: -260 }, { name: "LA Rams", price: 210 }] }] },
  ],
};

function ctxWith(overrides: Record<string, unknown> = {}): MemberFeedContext {
  const hedge = new Set(["draftkings", "fanduel"]);
  return {
    userBookSet: new Set(["draftkings", "fanduel", "betmgm"]),
    doneIds: new Set<number>(),
    bookNames: new Map([["draftkings", "DraftKings"], ["fanduel", "FanDuel"], ["betmgm", "BetMGM"]]),
    moneylineEvents: [EVENT],
    extendedEvents: [],
    oddsFetchedAt: NOW,
    extendedOddsFetchedAt: null,
    oddsFetchedAtByEventId: new Map(),
    extendedOddsFetchedAtByEventId: new Map(),
    rankOpts: { moneylineEvents: [EVENT], extendedEvents: [], hedgeBookKeys: hedge, precision: "whole", now: NOW },
    ...overrides,
  } as unknown as MemberFeedContext;
}

function promo(id: number, bookKey = "draftkings") {
  return {
    id,
    bookKey,
    title: "No-sweat",
    refundCap: new Decimal("50.00"),
    minOddsAmerican: null,
    scope: { kind: "any" as const },
    eligibleMarketTypes: ["moneyline" as const],
    expiresAt: null,
    finePrintNote: null,
    claimHint: null,
    scopeLabel: "Any game",
    autoMatched: true,
    scraped: true,
    attribution: [],
    addedByYou: false,
    addedByUserId: null,
  };
}

function tracked(promoId: number) {
  const snapshot = buildTrackedSnapshotFixture();
  snapshot.promo.id = promoId;
  return { promoId, state: "tracking" as const, trackedAt: NOW, outcome: null, outcomeAt: null, correction: null, snapshot };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockActive.mockResolvedValue([]);
  mockTracked.mockResolvedValue([]);
  mockLowProfile.mockResolvedValue({ oddsCapEnabled: false, oddsCapAmerican: 300, mainLinesOnly: false, naturalStakes: false });
});

describe("loadNoSweatFeed", () => {
  it("builds exactly one conversion-rate function per request", async () => {
    mockActive.mockResolvedValue([promo(1), promo(2), promo(3)]);
    await loadNoSweatFeed({ userId: 1, precision: "whole", now: NOW, ctx: ctxWith() });
    expect(mockMakeRate).toHaveBeenCalledTimes(1);
  });

  it("loads with the session user id and ranks priced promos", async () => {
    mockActive.mockResolvedValue([promo(1)]);
    const out = await loadNoSweatFeed({ userId: 42, precision: "whole", now: NOW, ctx: ctxWith() });
    expect(mockActive).toHaveBeenCalledWith(NOW, 42);
    expect(mockTracked).toHaveBeenCalledWith(42);
    expect(mockLowProfile).toHaveBeenCalledWith(42);
    expect(out.rows.map((r) => r.promoId)).toEqual([1]);
  });

  it("excludes done, tracked and not-my-book promos from ranking", async () => {
    mockActive.mockResolvedValue([promo(1), promo(2), promo(3), promo(4, "caesars")]);
    mockTracked.mockResolvedValue([tracked(2)]);
    const out = await loadNoSweatFeed({
      userId: 1,
      precision: "whole",
      now: NOW,
      ctx: ctxWith({ doneIds: new Set([3]) }),
    });
    expect(out.rows.map((r) => r.promoId)).toEqual([1]);
    expect(out.trackedIds.has(2)).toBe(true);
    expect(out.tracking.map((t) => t.promoId)).toEqual([2]);
  });

  it("drops tracking cards whose promo is already done", async () => {
    mockTracked.mockResolvedValue([tracked(9)]);
    const out = await loadNoSweatFeed({ userId: 1, precision: "whole", now: NOW, ctx: ctxWith({ doneIds: new Set([9]) }) });
    expect(out.tracking).toEqual([]);
  });

  it("puts can't-price promos in unsliced notes", async () => {
    mockActive.mockResolvedValue([promo(5, "betmgm")]);
    const out = await loadNoSweatFeed({ userId: 1, precision: "whole", now: NOW, ctx: ctxWith() });
    expect(out.rows).toEqual([]);
    expect(out.notes.map((n) => [n.promoId, n.note])).toEqual([[5, "cant_price"]]);
  });

  it("with no cached odds returns tracking cards and no rows", async () => {
    mockActive.mockResolvedValue([promo(1)]);
    mockTracked.mockResolvedValue([tracked(7)]);
    const out = await loadNoSweatFeed({
      userId: 1,
      precision: "whole",
      now: NOW,
      ctx: ctxWith({ oddsFetchedAt: null, extendedOddsFetchedAt: null, moneylineEvents: [] }),
    });
    expect(out.rows).toEqual([]);
    expect(out.notes).toEqual([]);
    expect(out.tracking.map((t) => t.promoId)).toEqual([7]);
  });
});
