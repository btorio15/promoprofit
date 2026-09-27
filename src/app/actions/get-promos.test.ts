import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import type { ActivePromo } from "@/db/promos";
import type { QueueRow } from "@/db/promoReview";
import type { ScrapedPromo } from "@/domain/promos/scraped";
import { formatKickoff } from "@/lib/format";

const {
  mockRequireUser,
  mockGetScrapeStatus,
  mockGetActivePromos,
  mockGetReviewQueue,
  mockGetBonusBooks,
  mockGetCachedEvents,
  mockGetCachedExtendedEvents,
  mockGetHedgeBookKeys,
  mockGetUserBookKeys,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetScrapeStatus: vi.fn(),
  mockGetActivePromos: vi.fn(),
  mockGetReviewQueue: vi.fn(),
  mockGetBonusBooks: vi.fn(),
  mockGetCachedEvents: vi.fn(),
  mockGetCachedExtendedEvents: vi.fn(),
  mockGetHedgeBookKeys: vi.fn(),
  mockGetUserBookKeys: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/promos", () => ({
  getScrapeStatus: mockGetScrapeStatus,
  getActivePromos: mockGetActivePromos,
}));
vi.mock("@/db/promoReview", () => ({
  getReviewQueue: mockGetReviewQueue,
}));
vi.mock("@/db/queries", () => ({
  getBonusBooks: mockGetBonusBooks,
  getCachedEvents: mockGetCachedEvents,
  getCachedExtendedEvents: mockGetCachedExtendedEvents,
  getHedgeBookKeys: mockGetHedgeBookKeys,
  getUserBookKeys: mockGetUserBookKeys,
}));

import { getPromos } from "./get-promos";

// get-promos.ts calls `new Date()` internally (not an injected clock), so
// every fixture's timing is anchored to the real wall clock at test-file
// load time rather than a fixed past instant, which would otherwise drift
// into the past as soon as this file's load time trails behind it.
const NOW_ISO = new Date().toISOString();

function plusHours(hours: number): string {
  return new Date(new Date(NOW_ISO).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function moneylineEvent(opts: {
  id: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime?: string;
  sportKey?: string;
  quotes: { bookKey: string; homePrice: number; awayPrice: number }[];
}): OddsEvent {
  return {
    id: opts.id,
    sport_key: opts.sportKey ?? "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: opts.commenceTime ?? plusHours(24),
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
    ...overrides,
  };
}

function activeBonusPromo(overrides: Partial<ActivePromo> = {}): ActivePromo {
  return {
    id: 2,
    bookKey: "fanduel",
    promoType: "bonus_bet",
    scope: { kind: "event", eventId: "nfl-1", sportKey: "americanfootball_nfl" },
    pinned: null,
    eligibleMarketTypes: ["moneyline"],
    boostPercent: null,
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: "50.00",
    maxStake: null,
    winningsCap: null,
    minOddsAmerican: null,
    finePrintNote: null,
    claimHint: null,
    scopeLabel: "LA Rams @ DEN Broncos",
    autoMatched: false,
    attribution: [],
    ...overrides,
  };
}

function baseParsed(overrides: Partial<ScrapedPromo> = {}): ScrapedPromo {
  return {
    bookKey: "draftkings",
    externalId: null,
    promoType: "profit_boost",
    title: "50% Profit Boost",
    rawText: "50% Profit Boost",
    sourceUrl: "https://draftkings.com/promo",
    sportKeyHint: "americanfootball_nfl",
    scopeText: "all NFL games on 9/27/2026",
    teamsText: [],
    windowStart: null,
    windowEnd: null,
    expiresAt: null,
    eligibleMarketTypes: ["moneyline"],
    pinned: null,
    boostPercent: "50.00",
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: "25.00",
    maxWinnings: null,
    minOddsAmerican: null,
    unparsedCapFields: [],
    claimRequired: null,
    finePrintNote: null,
    ...overrides,
  };
}

function matchQueueRow(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 10,
    bookKey: "draftkings",
    promoType: "profit_boost",
    reviewReason: "match",
    parsed: baseParsed(),
    bestGuess: {
      kind: "event",
      eventId: "nfl-9",
      sportKey: "americanfootball_nfl",
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: plusHours(6),
    },
    flagged: false,
    scope: null,
    maxStake: "25.00",
    maxWinnings: null,
    minOddsAmerican: null,
    bonusAmount: null,
    unparsedCapFields: [],
    ...overrides,
  };
}

function capsQueueRow(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 11,
    bookKey: "fanduel",
    promoType: "profit_boost",
    reviewReason: "caps",
    parsed: baseParsed({ bookKey: "fanduel" }),
    bestGuess: null,
    flagged: false,
    scope: {
      kind: "event",
      eventId: "nfl-9",
      sportKey: "americanfootball_nfl",
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: plusHours(6),
    },
    maxStake: null,
    maxWinnings: "500.00",
    minOddsAmerican: null,
    bonusAmount: null,
    unparsedCapFields: ["maxStake", "minOdds"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue({ userId: 1, email: "friend@example.com", displayName: "Friend" });
  mockGetScrapeStatus.mockResolvedValue(new Map());
  mockGetActivePromos.mockResolvedValue([]);
  mockGetReviewQueue.mockResolvedValue([]);
  mockGetBonusBooks.mockResolvedValue([
    { key: "draftkings", displayName: "DraftKings" },
    { key: "fanduel", displayName: "FanDuel" },
  ]);
  mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: new Date(NOW_ISO) });
  mockGetCachedExtendedEvents.mockResolvedValue({ events: [], fetchedAt: null });
  mockGetHedgeBookKeys.mockResolvedValue(["draftkings", "fanduel"]);
  mockGetUserBookKeys.mockResolvedValue(["draftkings", "fanduel"]);
});

describe("getPromos server action (D-01, D-05, D-08, D-16, T-03-15-01..04)", () => {
  it("rejects when logged out, before any DB read (requireUser is the first statement)", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(getPromos({ precision: "whole" })).rejects.toThrow("NEXT_REDIRECT");

    expect(mockGetScrapeStatus).not.toHaveBeenCalled();
    expect(mockGetActivePromos).not.toHaveBeenCalled();
  });

  it("returns invalid for a bogus precision, without reading the DB", async () => {
    const result = await getPromos({ precision: "bogus" });

    expect(result).toEqual({ status: "invalid" });
    expect(mockGetScrapeStatus).not.toHaveBeenCalled();
    expect(mockGetActivePromos).not.toHaveBeenCalled();
  });

  it("returns emptyVariant 'none-scraped' when no target book has an ok run and there are no active promos", async () => {
    mockGetActivePromos.mockResolvedValue([]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("none-scraped");
    expect(result.rows).toEqual([]);
    // Ordered by config/books.ts's sortOrder among the three D-09 http
    // targets (draftkings, fanduel, ballybet), not SCRAPE_TARGET_BOOK_KEYS's
    // own array order.
    expect(result.scrapeStatus).toEqual([
      { bookKey: "draftkings", bookName: "DraftKings", lastOkAt: null, lastRunFailed: false },
      { bookKey: "fanduel", bookName: "FanDuel", lastOkAt: null, lastRunFailed: false },
      { bookKey: "ballybet", bookName: "Bally Bet", lastOkAt: null, lastRunFailed: false },
    ]);
  });

  it("returns emptyVariant 'no-active' when an ok run exists but there are no active promos", async () => {
    const okAt = new Date("2026-09-27T00:00:00.000Z");
    mockGetScrapeStatus.mockResolvedValue(
      new Map([["ballybet", { lastOkAt: okAt, lastStatus: "ok" as const }]]),
    );
    mockGetActivePromos.mockResolvedValue([]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("no-active");
    expect(result.rows).toEqual([]);
  });

  it("marks lastRunFailed true when the latest run's status is 'failed'", async () => {
    mockGetScrapeStatus.mockResolvedValue(
      new Map([["ballybet", { lastOkAt: null, lastStatus: "failed" as const }]]),
    );
    mockGetActivePromos.mockResolvedValue([]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.scrapeStatus.find((line) => line.bookKey === "ballybet")).toEqual({
      bookKey: "ballybet",
      bookName: "Bally Bet",
      lastOkAt: null,
      lastRunFailed: true,
    });
  });

  it("returns emptyVariant 'no-odds' when active promos exist but both caches have fetchedAt null", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: null });
    mockGetCachedExtendedEvents.mockResolvedValue({ events: [], fetchedAt: null });

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("no-odds");
    expect(result.rows).toEqual([]);
  });

  it("returns a mapped row for a sport_window boost promo at the member's books", async () => {
    const event = moneylineEvent({
      id: "nfl-a",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      commenceTime: plusHours(6),
      quotes: [
        { bookKey: "draftkings", homePrice: -275, awayPrice: 220 },
        { bookKey: "fanduel", homePrice: -260, awayPrice: 210 },
      ],
    });
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });

    const result = await getPromos({ precision: "cents" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBeNull();
    expect(result.rows).toHaveLength(1);

    const row = result.rows[0];
    expect(row.promoId).toBe(1);
    expect(row.promoTypeLabel).toBe("Boost");
    expect(row.rateLabel).toBe("ROI");
    expect(row.scopeLabel).toBe("Any NFL game · Sun, Sep 27");
    expect(row.marketBadge).toBe("Moneyline");
    expect(row.candidatesEvaluated).toBeGreaterThanOrEqual(1);
    expect(row.autoMatched).toBe(true);
    expect(row.promo.bookName).toBe("DraftKings");
    expect(row.hedge.bookName).toBe("FanDuel");
  });

  it("returns a mapped row for an event-scope bonus bet with scopeLabel '{away} @ {home}'", async () => {
    const event = moneylineEvent({
      id: "nfl-1",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      commenceTime: plusHours(6),
      quotes: [{ bookKey: "fanduel", homePrice: -150, awayPrice: 130 }],
    });
    mockGetActivePromos.mockResolvedValue([
      activeBonusPromo({ pinned: { eventId: "nfl-1", marketType: "moneyline", line: null, side: "home" } }),
    ]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });
    mockGetHedgeBookKeys.mockResolvedValue(["fanduel"]);
    mockGetUserBookKeys.mockResolvedValue(["fanduel"]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].promoTypeLabel).toBe("Bonus bet");
    expect(result.rows[0].rateLabel).toBe("Conversion");
    expect(result.rows[0].scopeLabel).toBe("LA Rams @ DEN Broncos");
  });

  it("sets claimHint when the promo's claimRequired is non-null, null otherwise", async () => {
    const event = moneylineEvent({
      id: "nfl-a",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      commenceTime: plusHours(6),
      quotes: [{ bookKey: "draftkings", homePrice: -275, awayPrice: 220 }],
    });
    mockGetActivePromos.mockResolvedValue([
      activeBoostPromo({ claimHint: "Opt in / claim in the app first" }),
    ]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });
    mockGetHedgeBookKeys.mockResolvedValue(["draftkings"]);
    mockGetUserBookKeys.mockResolvedValue(["draftkings"]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.rows[0].claimHint).toBe("Opt in / claim in the app first");
  });

  it("calls getHedgeBookKeys with the user's own book set (D-05)", async () => {
    const event = moneylineEvent({
      id: "nfl-a",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      commenceTime: plusHours(6),
      quotes: [{ bookKey: "draftkings", homePrice: -275, awayPrice: 220 }],
    });
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });
    mockGetUserBookKeys.mockResolvedValue(["draftkings"]);

    await getPromos({ precision: "whole" });

    expect(mockGetHedgeBookKeys).toHaveBeenCalledWith(new Set(["draftkings"]));
  });

  it("returns 'no-books' when no rows exist at the user's books but rows exist at every usable book", async () => {
    const event = moneylineEvent({
      id: "nfl-a",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      commenceTime: plusHours(6),
      quotes: [
        { bookKey: "betmgm", homePrice: -150, awayPrice: 130 },
        { bookKey: "draftkings", homePrice: -140, awayPrice: 120 },
      ],
    });
    // The promo's own book (betmgm) can hedge against draftkings's opposite
    // side, but the member's own selected books are neither -- only fanduel.
    mockGetActivePromos.mockResolvedValue([activeBoostPromo({ bookKey: "betmgm", boostPercent: "100.00" })]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });
    mockGetUserBookKeys.mockResolvedValue(["fanduel"]);
    mockGetHedgeBookKeys.mockImplementation(async (allowed?: ReadonlySet<string>) => {
      if (!allowed) return ["draftkings", "fanduel", "betmgm"]; // every usable book
      return [...allowed].filter((k) => ["draftkings", "fanduel", "betmgm"].includes(k));
    });

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("no-books");
    expect(result.rows).toEqual([]);
  });

  it("returns 'no-active' when no rows exist at any usable book", async () => {
    // No book at all quotes this event's opposite side -- rankPromoHedges
    // finds zero candidates regardless of book scoping.
    mockGetActivePromos.mockResolvedValue([activeBoostPromo({ bookKey: "betmgm" })]);
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: new Date(NOW_ISO) });
    mockGetUserBookKeys.mockResolvedValue(["draftkings"]);
    mockGetHedgeBookKeys.mockImplementation(async (allowed?: ReadonlySet<string>) => {
      if (!allowed) return ["draftkings", "fanduel", "betmgm"];
      return [...allowed];
    });

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("no-active");
    expect(result.rows).toEqual([]);
  });
});

describe("getPromos review queue mapping (PROMO-04, D-13)", () => {
  it("includes queue items in first-seen order for both kinds", async () => {
    mockGetReviewQueue.mockResolvedValue([matchQueueRow(), capsQueueRow()]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.queue.map((q) => q.promoId)).toEqual([10, 11]);
  });

  it("maps a match-kind item's bookName, description, and bestGuessLabel", async () => {
    const row = matchQueueRow();
    mockGetReviewQueue.mockResolvedValue([row]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.queue).toHaveLength(1);
    const item = result.queue[0];
    expect(item.promoId).toBe(10);
    expect(item.kind).toBe("match");
    expect(item.bookName).toBe("DraftKings");
    expect(item.promoTypeLabel).toBe("Boost");
    expect(item.description).toBe("50% profit boost · all NFL games on 9/27/2026");
    if (row.bestGuess === null || row.bestGuess.kind !== "event") throw new Error("unreachable");
    expect(item.bestGuessLabel).toBe(
      `Best guess: Los Angeles Rams @ Denver Broncos, ${formatKickoff(row.bestGuess.commenceTime)}.`,
    );
    expect(item.matchedLabel).toBeNull();
    expect(item.capRecap).toBeNull();
  });

  it("returns bestGuessLabel null for a match-kind item with no guess", async () => {
    mockGetReviewQueue.mockResolvedValue([matchQueueRow({ bestGuess: null })]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.queue[0].bestGuessLabel).toBeNull();
  });

  it("maps a caps-kind item's matchedLabel, capRecap, and unparsedCapFields (null fields stay null)", async () => {
    const row = capsQueueRow();
    mockGetReviewQueue.mockResolvedValue([row]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const item = result.queue[0];
    expect(item.kind).toBe("caps");
    expect(item.bestGuessLabel).toBeNull();
    if (row.scope === null || row.scope.kind !== "event") throw new Error("unreachable");
    expect(item.matchedLabel).toBe(`Los Angeles Rams @ Denver Broncos, ${formatKickoff(row.scope.commenceTime)}`);
    expect(item.capRecap).toEqual({ maxStake: null, maxWinnings: "500.00", minOdds: null });
    expect(item.unparsedCapFields).toEqual(["maxStake", "minOdds"]);
  });

  it("returns the queue even when emptyVariant is 'none-scraped'", async () => {
    mockGetReviewQueue.mockResolvedValue([matchQueueRow()]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("none-scraped");
    expect(result.queue).toHaveLength(1);
  });

  it("returns the queue even when emptyVariant is 'no-odds'", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: null });
    mockGetCachedExtendedEvents.mockResolvedValue({ events: [], fetchedAt: null });
    mockGetReviewQueue.mockResolvedValue([matchQueueRow()]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("no-odds");
    expect(result.queue).toHaveLength(1);
  });
});
