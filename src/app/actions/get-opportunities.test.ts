import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import type { ActivePromo } from "@/db/promos";
import { denverDate } from "@/domain/promos/profitTotals";

const {
  mockRequireUser,
  mockGetActivePromos,
  mockGetBonusBooks,
  mockGetCachedEvents,
  mockGetCachedExtendedEvents,
  mockGetHedgeBookKeys,
  mockGetUserBookKeys,
  mockGetPromoCompletions,
  mockGetProfitObservationsSince,
  mockRecordCurrentProfitObservations,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetActivePromos: vi.fn(),
  mockGetBonusBooks: vi.fn(),
  mockGetCachedEvents: vi.fn(),
  mockGetCachedExtendedEvents: vi.fn(),
  mockGetHedgeBookKeys: vi.fn(),
  mockGetUserBookKeys: vi.fn(),
  mockGetPromoCompletions: vi.fn(),
  mockGetProfitObservationsSince: vi.fn(),
  mockRecordCurrentProfitObservations: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/promos", () => ({ getActivePromos: mockGetActivePromos }));
vi.mock("@/db/queries", () => ({
  getBonusBooks: mockGetBonusBooks,
  getCachedEvents: mockGetCachedEvents,
  getCachedExtendedEvents: mockGetCachedExtendedEvents,
  getHedgeBookKeys: mockGetHedgeBookKeys,
  getUserBookKeys: mockGetUserBookKeys,
}));
vi.mock("@/db/promoTracking", () => ({
  getPromoCompletions: mockGetPromoCompletions,
  getProfitObservationsSince: mockGetProfitObservationsSince,
}));
vi.mock("@/db/promoObservations", () => ({
  recordCurrentProfitObservations: mockRecordCurrentProfitObservations,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getOpportunities } from "./get-opportunities";

const NOW_ISO = new Date().toISOString();

function plusHours(hours: number): string {
  return new Date(new Date(NOW_ISO).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function moneylineEvent(opts: {
  id: string;
  homeTeam: string;
  awayTeam: string;
  quotes: { bookKey: string; homePrice: number; awayPrice: number }[];
}): OddsEvent {
  return {
    id: opts.id,
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: plusHours(6),
    home_team: opts.homeTeam,
    away_team: opts.awayTeam,
    bookmakers: opts.quotes.map((q) => ({
      key: q.bookKey,
      title: q.bookKey,
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: opts.homeTeam, price: q.homePrice },
            { name: opts.awayTeam, price: q.awayPrice },
          ],
        },
      ],
    })),
  };
}

function activeBoostPromo(overrides: Partial<ActivePromo> = {}): ActivePromo {
  return {
    id: 1,
    bookKey: "draftkings",
    promoType: "profit_boost",
    scope: {
      kind: "sport_window",
      sportKey: "americanfootball_nfl",
      windowStart: new Date(NOW_ISO),
      windowEnd: new Date(plusHours(48)),
    },
    pinned: null,
    eligibleMarketTypes: ["moneyline"],
    boostPercent: "50.00",
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: "25.00",
    winningsCap: null,
    minOddsAmerican: null,
    finePrintNote: null,
    claimHint: null,
    scopeLabel: "Any NFL game · Sun, Sep 27",
    autoMatched: true,
    attribution: [],
    addedByYou: false,
    ...overrides,
  };
}

const EVENT = moneylineEvent({
  id: "nfl-a",
  homeTeam: "DEN Broncos",
  awayTeam: "LA Rams",
  quotes: [
    { bookKey: "draftkings", homePrice: -275, awayPrice: 220 },
    { bookKey: "fanduel", homePrice: -260, awayPrice: 210 },
  ],
});

function memberBooksAreHedgeBooks(every: string[]) {
  mockGetHedgeBookKeys.mockImplementation(async (allowed?: ReadonlySet<string>) => {
    if (!allowed) return every;
    return every.filter((k) => allowed.has(k));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue({ userId: 1, email: "friend@example.com", displayName: "Friend" });
  mockGetActivePromos.mockResolvedValue([]);
  mockGetBonusBooks.mockResolvedValue([
    { key: "draftkings", displayName: "DraftKings" },
    { key: "fanduel", displayName: "FanDuel" },
    { key: "betmgm", displayName: "BetMGM" },
  ]);
  mockGetCachedEvents.mockResolvedValue({ events: [EVENT], fetchedAt: new Date(NOW_ISO) });
  mockGetCachedExtendedEvents.mockResolvedValue({ events: [], fetchedAt: null });
  memberBooksAreHedgeBooks(["draftkings", "fanduel"]);
  mockGetUserBookKeys.mockResolvedValue(["draftkings", "fanduel"]);
  mockGetPromoCompletions.mockResolvedValue([]);
  mockGetProfitObservationsSince.mockResolvedValue([]);
  mockRecordCurrentProfitObservations.mockResolvedValue(undefined);
});

describe("getOpportunities (D-16, D-17, T-04-01..04)", () => {
  it("rejects when logged out, before any db read", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(getOpportunities({ precision: "whole" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockGetActivePromos).not.toHaveBeenCalled();
    expect(mockGetUserBookKeys).not.toHaveBeenCalled();
    expect(mockGetPromoCompletions).not.toHaveBeenCalled();
  });

  it("returns invalid for bad or extra input without reading the db", async () => {
    expect(await getOpportunities({ precision: "bogus" })).toEqual({ status: "invalid" });
    expect(await getOpportunities({ precision: "whole", userId: 9 })).toEqual({ status: "invalid" });
    expect(mockGetActivePromos).not.toHaveBeenCalled();
  });

  it("returns 'no-odds' when no odds are cached", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: null });
    const result = await getOpportunities({ precision: "whole" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("no-odds");
    expect(result.totals.totalProfit).toBe("0.00");
  });

  it("includes an own-book promo with its ranking fields mapped from the row DTO", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    const result = await getOpportunities({ precision: "cents" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBeNull();
    const promos = result.sources.find((s) => s.id === "promos");
    expect(promos?.items).toHaveLength(1);
    const item = promos!.items[0];
    expect(item.rowKey).toBe(item.data.rowKey);
    expect(item.profit).toBe(item.data.guaranteedProfit);
    expect(item.pct).toBe(item.data.ratePct);
    expect(item.pctLabel).toBe(item.data.rateLabel);
    expect(item.commenceTime).toBe(item.data.commenceTime);
    expect(result.totals.totalProfit).toBe(item.data.guaranteedProfit);
  });

  it("passes the session user id to getActivePromos and getProfitObservationsSince (T-5-visibility)", async () => {
    mockGetActivePromos.mockResolvedValue([]);
    await getOpportunities({ precision: "cents" });
    expect(mockGetActivePromos).toHaveBeenCalledWith(expect.any(Date), 1);
    expect(mockGetProfitObservationsSince).toHaveBeenCalledWith(expect.any(String), 1);
  });

  it("D-16: a promo at a non-member book is absent", async () => {
    mockGetActivePromos.mockResolvedValue([
      activeBoostPromo({ id: 1, bookKey: "draftkings" }),
      activeBoostPromo({ id: 3, bookKey: "betmgm" }),
    ]);
    const result = await getOpportunities({ precision: "cents" });
    if (result.status !== "ok") throw new Error("unreachable");
    const ids = result.sources.flatMap((s) => (s.id === "promos" ? s.items.map((i) => i.data.promoId) : []));
    expect(ids).toEqual([1]);
  });

  it("D-17: hedge legs are only at the member's books", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    const both = await getOpportunities({ precision: "cents" });
    if (both.status !== "ok") throw new Error("unreachable");
    const bothPromos = both.sources.find((s) => s.id === "promos");
    if (bothPromos?.id !== "promos") throw new Error("unreachable");
    expect(bothPromos.items[0].data.hedge.bookKey).toBe("fanduel");

    mockGetUserBookKeys.mockResolvedValue(["draftkings"]);
    const only = await getOpportunities({ precision: "cents" });
    if (only.status !== "ok") throw new Error("unreachable");
    for (const source of only.sources) {
      if (source.id !== "promos") continue;
      for (const item of source.items) {
        expect(item.data.hedge.bookKey).toBe("draftkings");
      }
    }
    expect(mockGetHedgeBookKeys).toHaveBeenCalledWith(new Set(["draftkings"]));
  });

  it("a done promo is absent and excluded from the total", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo({ id: 1 })]);
    mockGetPromoCompletions.mockResolvedValue([
      { promoId: 1, snapshot: null, profitExtracted: "0.00", completedAt: new Date(NOW_ISO) },
    ]);
    const result = await getOpportunities({ precision: "cents" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.sources.every((s) => s.items.length === 0)).toBe(true);
    expect(result.totals.totalProfit).toBe("0.00");
  });

  it("excludes the viewer's Done promos from availableProfit.today only (quick-260930-fge)", async () => {
    const today = denverDate(new Date());
    mockGetPromoCompletions.mockResolvedValue([
      { promoId: 1, snapshot: null, profitExtracted: "0.00", completedAt: new Date(NOW_ISO) },
    ]);
    mockGetProfitObservationsSince.mockResolvedValue([
      { promoId: 1, bookKey: "draftkings", denverDate: today, maxGuaranteedProfit: "12.34" },
      { promoId: 2, bookKey: "draftkings", denverDate: today, maxGuaranteedProfit: "5.00" },
    ]);
    const result = await getOpportunities({ precision: "cents" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.totals.availableProfit).toEqual({ today: "5.00", week: "17.34", month: "17.34" });
  });

  it("'nothing-profitable' when the member has every usable book and no odds match", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: new Date(NOW_ISO) });
    const result = await getOpportunities({ precision: "whole" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("nothing-profitable");
  });

  it("'no-books' when rows exist only at books the member lacks", async () => {
    const event = moneylineEvent({
      id: "nfl-b",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      quotes: [
        { bookKey: "betmgm", homePrice: -150, awayPrice: 130 },
        { bookKey: "draftkings", homePrice: -140, awayPrice: 120 },
      ],
    });
    mockGetActivePromos.mockResolvedValue([activeBoostPromo({ bookKey: "betmgm", boostPercent: "100.00" })]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });
    mockGetUserBookKeys.mockResolvedValue(["fanduel"]);
    memberBooksAreHedgeBooks(["draftkings", "fanduel", "betmgm"]);
    const result = await getOpportunities({ precision: "whole" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("no-books");
  });

  it("'none-scraped' when there are no active promos", async () => {
    const result = await getOpportunities({ precision: "whole" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("none-scraped");
  });

  describe("pairs source (D-07, D-08, D-12, D-18, D-20)", () => {
    const twoBoosts = () => [
      activeBoostPromo({ id: 1, bookKey: "draftkings", boostPercent: "50.00", maxStake: "50.00" }),
      activeBoostPromo({ id: 2, bookKey: "fanduel", boostPercent: "50.00", maxStake: "50.00" }),
    ];

    const PAIR_EVENT = moneylineEvent({
      id: "nfl-pair",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      quotes: [
        { bookKey: "draftkings", homePrice: -110, awayPrice: -110 },
        { bookKey: "fanduel", homePrice: -110, awayPrice: -110 },
      ],
    });

    beforeEach(() => {
      mockGetCachedEvents.mockResolvedValue({ events: [PAIR_EVENT], fetchedAt: new Date(NOW_ISO) });
    });

    it("returns a pair, keeps both promos in the promos source, and counts the pair once in the total", async () => {
      mockGetActivePromos.mockResolvedValue(twoBoosts());
      const result = await getOpportunities({ precision: "cents" });
      if (result.status !== "ok") throw new Error("unreachable");
      const pairs = result.sources.find((s) => s.id === "pairs");
      if (pairs?.id !== "pairs") throw new Error("unreachable");
      expect(pairs.items).toHaveLength(1);
      const item = pairs.items[0];
      expect(item.rowKey).toBe("pair-1-2");
      expect(item.profit).toBe(item.data.guaranteedProfit);
      expect(item.pct).toBe(item.data.roiPct);
      expect(item.pctLabel).toBe("ROI");

      const promos = result.sources.find((s) => s.id === "promos");
      if (promos?.id !== "promos") throw new Error("unreachable");
      expect(promos.items.map((i) => i.data.promoId).sort()).toEqual([1, 2]);

      // D-12: the total is the pair's profit alone, not the pair plus the two singles.
      expect(result.totals.totalProfit).toBe(item.data.guaranteedProfit);
    });

    it("is deterministic across calls", async () => {
      mockGetActivePromos.mockResolvedValue(twoBoosts());
      const a = await getOpportunities({ precision: "cents" });
      const b = await getOpportunities({ precision: "cents" });
      if (a.status !== "ok" || b.status !== "ok") throw new Error("unreachable");
      const pa = a.sources.find((s) => s.id === "pairs");
      const pb = b.sources.find((s) => s.id === "pairs");
      expect(pa?.items.map((i) => [i.rowKey, i.profit])).toEqual(pb?.items.map((i) => [i.rowKey, i.profit]));
    });

    it("D-18: no pair when one of the two books is not a member book", async () => {
      mockGetActivePromos.mockResolvedValue(twoBoosts());
      mockGetUserBookKeys.mockResolvedValue(["draftkings"]);
      const result = await getOpportunities({ precision: "cents" });
      if (result.status !== "ok") throw new Error("unreachable");
      const pairs = result.sources.find((s) => s.id === "pairs");
      expect(pairs?.items).toHaveLength(0);
    });

    it("a done promo never appears in a pair", async () => {
      mockGetActivePromos.mockResolvedValue(twoBoosts());
      mockGetPromoCompletions.mockResolvedValue([
        { promoId: 2, snapshot: null, profitExtracted: "0.00", completedAt: new Date(NOW_ISO) },
      ]);
      const result = await getOpportunities({ precision: "cents" });
      if (result.status !== "ok") throw new Error("unreachable");
      const pairs = result.sources.find((s) => s.id === "pairs");
      expect(pairs?.items).toHaveLength(0);
    });
  });

  describe("arbs source (D-18, D-21)", () => {
    const ARB_EVENT = moneylineEvent({
      id: "nfl-arb",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      quotes: [
        { bookKey: "draftkings", homePrice: 120, awayPrice: -150 },
        { bookKey: "fanduel", homePrice: -150, awayPrice: 110 },
      ],
    });

    it("returns an arb between two member books ranked at a fixed $100 stake", async () => {
      mockGetCachedEvents.mockResolvedValue({ events: [ARB_EVENT], fetchedAt: new Date(NOW_ISO) });
      const result = await getOpportunities({ precision: "cents" });
      if (result.status !== "ok") throw new Error("unreachable");
      const arbs = result.sources.find((s) => s.id === "arbs");
      if (arbs?.id !== "arbs") throw new Error("unreachable");
      expect(arbs.items).toHaveLength(1);
      const item = arbs.items[0];
      expect(item.profit).toBe(item.data.guaranteedProfit);
      expect(item.pct).toBe(item.data.returnPct);
      expect(item.pctLabel).toBe("ROI");
      // Stakes are rounded to cents, so the total laid is within a dollar of the fixed $100.
      expect(Math.abs(Number(item.data.totalLaid) - 100)).toBeLessThan(1);
      const legBooks = [item.data.sideA.bookKey, item.data.sideB.bookKey];
      expect(legBooks.sort()).toEqual(["draftkings", "fanduel"]);
      expect(result.emptyVariant).toBeNull();
    });

    it("ignores any client totalStake (strict input)", async () => {
      expect(await getOpportunities({ precision: "cents", totalStake: "5000" })).toEqual({ status: "invalid" });
    });

    it("does not build an arb from a non-member book; classifies as 'no-books'", async () => {
      // The only arb needs betmgm's home price, which the member lacks.
      const event = moneylineEvent({
        id: "nfl-arb2",
        homeTeam: "DEN Broncos",
        awayTeam: "LA Rams",
        quotes: [
          { bookKey: "betmgm", homePrice: 125, awayPrice: -160 },
          { bookKey: "draftkings", homePrice: -140, awayPrice: 100 },
          { bookKey: "fanduel", homePrice: -150, awayPrice: 105 },
        ],
      });
      // A promo that matches nothing, so promos are empty but not "none-scraped".
      mockGetActivePromos.mockResolvedValue([
        activeBoostPromo({
          scope: {
            kind: "sport_window",
            sportKey: "basketball_nba",
            windowStart: new Date(NOW_ISO),
            windowEnd: new Date(plusHours(48)),
          },
        }),
      ]);
      mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });
      memberBooksAreHedgeBooks(["draftkings", "fanduel", "betmgm"]);
      const result = await getOpportunities({ precision: "cents" });
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.sources.every((s) => s.items.length === 0)).toBe(true);
      expect(result.emptyVariant).toBe("no-books");
    });

    it("'nothing-profitable' when no arb exists at any usable book", async () => {
      mockGetActivePromos.mockResolvedValue([
        activeBoostPromo({
          scope: {
            kind: "sport_window",
            sportKey: "basketball_nba",
            windowStart: new Date(NOW_ISO),
            windowEnd: new Date(plusHours(48)),
          },
        }),
      ]);
      memberBooksAreHedgeBooks(["draftkings", "fanduel", "betmgm"]);
      const result = await getOpportunities({ precision: "cents" });
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.emptyVariant).toBe("nothing-profitable");
    });
  });

  it("spends 0 API credits: never references the odds-fetch client", () => {
    const src = readFileSync(join(__dirname, "get-opportunities.ts"), "utf8");
    for (const banned of ["ingestion/odds/client", "fetchSportOdds", "listSports"]) {
      expect(src).not.toContain(banned);
    }
  });
});
