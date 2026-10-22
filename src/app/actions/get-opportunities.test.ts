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
  mockRecordMemberProfitObservations,
  mockGetMemberProfitHistory,
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
  mockRecordMemberProfitObservations: vi.fn(),
  mockGetMemberProfitHistory: vi.fn(),
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
vi.mock("@/db/memberObservations", () => ({
  recordMemberProfitObservations: mockRecordMemberProfitObservations,
  getMemberProfitHistory: mockGetMemberProfitHistory,
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
    scraped: true,
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
  mockRecordMemberProfitObservations.mockResolvedValue(undefined);
  mockGetMemberProfitHistory.mockResolvedValue({ status: "ready", graphStartDay: null, rows: [] });
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
    expect(await getOpportunities({ precision: "whole", userId: 2 })).toEqual({ status: "invalid" });
    expect(await getOpportunities({ precision: "whole", range: "7d" })).toEqual({ status: "invalid" });
    expect(mockGetActivePromos).not.toHaveBeenCalled();
  });

  it("returns 'no-odds' when no odds are cached", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: null });
    const result = await getOpportunities({ precision: "whole" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("no-odds");
    expect(result.dashboard.extracted.allTime).toBe("0.00");
    expect(result.dashboard.counts.promosDone).toBe(0);
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
    expect(result.dashboard).toBeDefined();
  });

  it("passes the session user id to getActivePromos and skips the group-wide available read (D-01)", async () => {
    mockGetActivePromos.mockResolvedValue([]);
    await getOpportunities({ precision: "cents" });
    expect(mockGetActivePromos).toHaveBeenCalledWith(expect.any(Date), 1);
    expect(mockGetProfitObservationsSince).not.toHaveBeenCalled();
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

  it("a done promo is absent from the feed", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo({ id: 1 })]);
    mockGetPromoCompletions.mockResolvedValue([
      { promoId: 1, snapshot: null, profitExtracted: "0.00", completedAt: new Date(NOW_ISO) },
    ]);
    const result = await getOpportunities({ precision: "cents" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.sources.every((s) => s.items.length === 0)).toBe(true);
    expect(result.dashboard.counts.promosDone).toBe(1);
  });

  it("dashboard.available is the sum of the member's own series days", async () => {
    const today = denverDate(new Date());
    mockGetMemberProfitHistory.mockResolvedValue({
      status: "ready",
      graphStartDay: today,
      rows: [
        { promoId: 1, denverDate: today, profit: "12.34" },
        { promoId: 2, denverDate: today, profit: "5.00" },
      ],
    });
    const result = await getOpportunities({ precision: "cents" });
    if (result.status !== "ok" || result.profitSeries.status !== "ready") throw new Error("unreachable");
    const expected = result.profitSeries.days.reduce((s, d) => s + Number(d.available), 0).toFixed(2);
    expect(result.dashboard.available).not.toBeNull();
    expect(result.dashboard.available?.allTime).toBe(expected);
    expect(result.dashboard.available?.sinceDay).toBe(today);
    expect(mockGetProfitObservationsSince).not.toHaveBeenCalled();
  });

  it("dashboard.extracted includes completions dated before the graph start day (D-18)", async () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    mockGetPromoCompletions.mockResolvedValue([
      { promoId: 7, snapshot: null, profitExtracted: "10.00", completedAt: old },
      { promoId: 8, snapshot: null, profitExtracted: "2.50", completedAt: new Date(NOW_ISO) },
    ]);
    const result = await getOpportunities({ precision: "cents" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.dashboard.extracted.allTime).toBe("12.50");
    expect(result.dashboard.extracted.last7).toBe("2.50");
    expect(result.dashboard.counts.promosDone).toBe(2);
  });

  it("counts a pair once: the pair_member marker row is not a promo done (D-10)", async () => {
    mockGetPromoCompletions.mockResolvedValue([
      { promoId: 1, snapshot: null, profitExtracted: "9.00", completedAt: new Date(NOW_ISO) },
      {
        promoId: 2,
        snapshot: { version: 1, kind: "pair_member", pairedWithPromoId: 1 },
        profitExtracted: "0.00",
        completedAt: new Date(NOW_ISO),
      },
    ]);
    const result = await getOpportunities({ precision: "cents" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.dashboard.counts.promosDone).toBe(1);
    expect(result.dashboard.extracted.allTime).toBe("9.00");
  });

  it("dashboard.available is null when the member series is not-ready, extracted still populated", async () => {
    mockGetMemberProfitHistory.mockResolvedValue({ status: "not-ready" });
    mockGetPromoCompletions.mockResolvedValue([
      { promoId: 1, snapshot: null, profitExtracted: "4.00", completedAt: new Date(NOW_ISO) },
    ]);
    const result = await getOpportunities({ precision: "cents" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.dashboard.available).toBeNull();
    expect(result.dashboard.extracted.allTime).toBe("4.00");
  });

  it("carries dashboard in every empty-variant branch", async () => {
    const none = await getOpportunities({ precision: "whole" });
    if (none.status !== "ok") throw new Error("unreachable");
    expect(none.emptyVariant).toBe("none-scraped");
    expect(none.dashboard).toBeDefined();

    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: new Date(NOW_ISO) });
    const nothing = await getOpportunities({ precision: "whole" });
    if (nothing.status !== "ok") throw new Error("unreachable");
    expect(nothing.emptyVariant).toBe("nothing-profitable");
    expect(nothing.dashboard).toBeDefined();
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

    it("returns a pair, keeps both promos in the promos source, and carries the dashboard", async () => {
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

      expect(result.dashboard).toBeDefined();
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
    for (const banned of ["ingestion/odds/client", "fetchSportOdds", "listSports", "loadAvailableProfit"]) {
      expect(src).not.toContain(banned);
    }
  });
});

describe("getOpportunities profitSeries (STATS-01..03)", () => {
  it("carries profitSeries in the no-odds branch without recording", async () => {
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: null });
    const result = await getOpportunities({ precision: "whole" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("no-odds");
    expect(result.profitSeries.status).toBe("ready");
    expect(mockRecordMemberProfitObservations).not.toHaveBeenCalled();
  });

  it("carries profitSeries in the nothing-profitable / none-scraped branches", async () => {
    const result = await getOpportunities({ precision: "whole" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("none-scraped");
    expect(result.profitSeries).toBeDefined();
  });

  it("records the member feed with the session id before reading history", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    const result = await getOpportunities({ precision: "whole" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.profitSeries.status).toBe("ready");
    expect(mockRecordMemberProfitObservations).toHaveBeenCalledTimes(1);
    const [uid, entries, at] = mockRecordMemberProfitObservations.mock.calls[0];
    expect(uid).toBe(1);
    expect(Array.isArray(entries)).toBe(true);
    expect(at).toBeInstanceOf(Date);
    expect(mockGetMemberProfitHistory).toHaveBeenCalledWith(1);
    expect(mockRecordMemberProfitObservations.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetMemberProfitHistory.mock.invocationCallOrder[0],
    );
  });

  it("records observations at whole precision even when the member views cents (WR-01)", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    await getOpportunities({ precision: "whole" });
    const wholeEntries = mockRecordMemberProfitObservations.mock.calls[0][1];
    mockRecordMemberProfitObservations.mockClear();
    await getOpportunities({ precision: "cents" });
    expect(mockRecordMemberProfitObservations).toHaveBeenCalledTimes(1);
    expect(mockRecordMemberProfitObservations.mock.calls[0][1]).toEqual(wholeEntries);
  });

  it("still returns ok when the group recorder rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockRecordCurrentProfitObservations.mockRejectedValue(new Error("boom"));
    const result = await getOpportunities({ precision: "whole" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.profitSeries.status).toBe("ready");
    expect(result.sources).toHaveLength(3);
    mockRecordCurrentProfitObservations.mockResolvedValue(undefined);
  });

  it("still returns ok when member recording fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockRecordMemberProfitObservations.mockRejectedValue(new Error("boom"));
    const result = await getOpportunities({ precision: "whole" });
    expect(result.status).toBe("ok");
    mockRecordMemberProfitObservations.mockResolvedValue(undefined);
  });

  it("hands the group recorder the already-loaded odds and book list", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    await getOpportunities({ precision: "whole" });
    const opts = mockRecordCurrentProfitObservations.mock.calls[0][1];
    expect(opts.cached.moneylineEvents).toEqual([EVENT]);
    expect(opts.cached.extendedEvents).toEqual([]);
    expect(opts.cached.everyUsableHedgeBookKeys).toEqual(["draftkings", "fanduel", "betmgm"]);
    expect(mockGetCachedEvents).toHaveBeenCalledTimes(1);
    expect(mockGetCachedExtendedEvents).toHaveBeenCalledTimes(1);
  });

  it("maps a missing table to not-ready and keeps the feed", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockGetMemberProfitHistory.mockResolvedValue({ status: "not-ready" });
    const result = await getOpportunities({ precision: "whole" });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.profitSeries).toEqual({ status: "not-ready" });
    expect(result.sources).toHaveLength(3);
  });

  it("maps a history failure to error while the feed still loads", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetMemberProfitHistory.mockRejectedValue(new Error("boom"));
    const result = await getOpportunities({ precision: "whole" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.profitSeries).toEqual({ status: "error" });
  });

  it("starts the graph today when the table is empty", async () => {
    const result = await getOpportunities({ precision: "whole" });
    if (result.status !== "ok" || result.profitSeries.status !== "ready") throw new Error("unreachable");
    expect(result.profitSeries.graphStartDay).toBe(denverDate(new Date()));
    expect(result.profitSeries.days).toHaveLength(1);
  });
});
