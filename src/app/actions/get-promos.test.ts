import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import type { ActivePromo } from "@/db/promos";
import type { QueueRow } from "@/db/promoReview";
import type { ScrapedPromo } from "@/domain/promos/scraped";
import { formatKickoff } from "@/lib/format";
import { denverDate } from "@/domain/promos/profitTotals";

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
  mockGetPromoCompletions,
  mockGetProfitObservationsSince,
  mockRecordCurrentProfitObservations,
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
  mockGetPromoCompletions: vi.fn(),
  mockGetProfitObservationsSince: vi.fn(),
  mockRecordCurrentProfitObservations: vi.fn(),
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
vi.mock("@/db/promoTracking", () => ({
  getPromoCompletions: mockGetPromoCompletions,
  getProfitObservationsSince: mockGetProfitObservationsSince,
}));
vi.mock("@/db/promoObservations", () => ({
  recordCurrentProfitObservations: mockRecordCurrentProfitObservations,
}));

import { getPromos } from "./get-promos";
import { computeMemberPromoState } from "@/db/memberPromoState";
import { buildDoneSnapshot } from "@/domain/promos/doneSnapshot";
import type { PromoRowDTO } from "@/domain/promos/dto";

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
    addedByYou: false,
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
    addedByYou: false,
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
    maxWinningsKind: null,
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
    maxWinningsKind: "total_payout",
    minOddsAmerican: null,
    bonusAmount: null,
    unparsedCapFields: ["maxStake", "minOdds"],
    ...overrides,
  };
}

function classifyQueueRow(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 20,
    bookKey: "draftkings",
    promoType: "profit_boost",
    reviewReason: "classify",
    parsed: baseParsed({
      promoType: "profit_boost",
      boostPercent: null,
      title: "Mystery Promo",
      rawText: "  Mystery Promo   raw   text  ",
      sourceUrl: "https://sportsbook.draftkings.com/promo/1",
      expiresAt: null,
      sportKeyHint: null,
    }),
    bestGuess: null,
    flagged: false,
    scope: null,
    maxStake: null,
    maxWinnings: null,
    maxWinningsKind: null,
    minOddsAmerican: null,
    bonusAmount: null,
    unparsedCapFields: [],
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
  mockGetPromoCompletions.mockResolvedValue([]);
  mockGetProfitObservationsSince.mockResolvedValue([]);
  mockRecordCurrentProfitObservations.mockResolvedValue(undefined);
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
    // quick-260927-edt: zero active promos at all -> no promo to evaluate,
    // so unprofitableRows stays empty (distinct from the zero-profitable-
    // rows-but-some-promos-exist case below).
    expect(result.unprofitableRows).toEqual([]);
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
    expect(result.unprofitableRows).toEqual([]);
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

  it("passes the session user id to getActivePromos and getProfitObservationsSince (T-5-visibility)", async () => {
    mockGetActivePromos.mockResolvedValue([]);
    await getPromos({ precision: "cents" });
    expect(mockGetActivePromos).toHaveBeenCalledWith(expect.any(Date), 1);
    expect(mockGetProfitObservationsSince).toHaveBeenCalledWith(expect.any(String), 1);
  });

  it("maps addedByYou onto the row DTO (true for own added promo, false for scraped)", async () => {
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
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });
    mockGetActivePromos.mockResolvedValue([activeBoostPromo({ addedByYou: true })]);
    const own = await getPromos({ precision: "cents" });
    if (own.status !== "ok") throw new Error("unreachable");
    expect(own.rows[0].addedByYou).toBe(true);

    mockGetActivePromos.mockResolvedValue([activeBoostPromo({ addedByYou: false })]);
    const scraped = await getPromos({ precision: "cents" });
    if (scraped.status !== "ok") throw new Error("unreachable");
    expect(scraped.rows[0].addedByYou).toBe(false);
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
    // quick-260927-edt: "no-books" still wins over showing greyed rows.
    expect(result.unprofitableRows).toEqual([]);
  });

  // quick-260927-edt: zero profitable rows + at least one unprofitable
  // active promo now shows the greyed unprofitable rows instead of the
  // "no-active" empty state -- updated from the prior expectation.
  it("returns emptyVariant null with a greyed unprofitable row (not 'no-active') when no profitable rows exist at any usable book", async () => {
    // No book at all quotes this event's opposite side -- rankPromoHedges
    // finds zero candidates regardless of book scoping, so the promo can't
    // even be evaluated (bestGuaranteedProfit null).
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
    expect(result.emptyVariant).toBeNull();
    expect(result.rows).toEqual([]);
    expect(result.unprofitableRows).toHaveLength(1);
    expect(result.unprofitableRows[0].bestGuaranteedProfit).toBeNull();
    expect(result.unprofitableRows[0].note).toBe("No eligible bets right now");
  });
});

// quick-260927-edt: greyed-out unprofitable-promo rows.
describe("getPromos unprofitableRows (quick-260927-edt)", () => {
  it("one profitable + one negative promo: rows has the profitable row only, unprofitableRows has one entry, emptyVariant null", async () => {
    const profitableEvent = moneylineEvent({
      id: "nfl-profitable",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      commenceTime: plusHours(6),
      quotes: [
        { bookKey: "draftkings", homePrice: -275, awayPrice: 220 },
        { bookKey: "fanduel", homePrice: -260, awayPrice: 210 },
      ],
    });
    const negativeEvent = moneylineEvent({
      id: "nfl-worked",
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: plusHours(6),
      quotes: [
        { bookKey: "ballybet", homePrice: 107, awayPrice: -135 },
        { bookKey: "betmgm", homePrice: 105, awayPrice: -125 },
      ],
    });

    const profitablePromo = activeBoostPromo({ id: 1, bookKey: "draftkings" });
    const negativePromo = activeBoostPromo({
      id: 2,
      bookKey: "ballybet",
      boostPercent: "10.00",
      maxStake: "20.00",
      minOddsAmerican: 100,
      scopeLabel: "Denver Broncos @ Los Angeles Rams",
      autoMatched: true,
    });

    mockGetActivePromos.mockResolvedValue([profitablePromo, negativePromo]);
    mockGetCachedEvents.mockResolvedValue({
      events: [profitableEvent, negativeEvent],
      fetchedAt: new Date(NOW_ISO),
    });
    mockGetBonusBooks.mockResolvedValue([
      { key: "draftkings", displayName: "DraftKings" },
      { key: "fanduel", displayName: "FanDuel" },
      { key: "ballybet", displayName: "Bally Bet" },
      { key: "betmgm", displayName: "BetMGM" },
    ]);
    mockGetUserBookKeys.mockResolvedValue(["draftkings", "fanduel", "ballybet", "betmgm"]);
    mockGetHedgeBookKeys.mockResolvedValue(["draftkings", "fanduel", "ballybet", "betmgm"]);

    const result = await getPromos({ precision: "cents" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBeNull();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].promoId).toBe(1);
    expect(result.unprofitableRows).toHaveLength(1);
    expect(result.unprofitableRows[0].promoId).toBe(2);
  });

  it("only the worked-example negative promo: emptyVariant null, rows [], unprofitableRows[0] matches exactly", async () => {
    const event = moneylineEvent({
      id: "nfl-worked",
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: plusHours(6),
      quotes: [
        { bookKey: "ballybet", homePrice: 107, awayPrice: -135 },
        { bookKey: "betmgm", homePrice: 105, awayPrice: -125 },
      ],
    });

    const negativePromo = activeBoostPromo({
      id: 3,
      bookKey: "ballybet",
      boostPercent: "10.00",
      maxStake: "20.00",
      minOddsAmerican: 100,
      scopeLabel: "Denver Broncos @ Los Angeles Rams",
      autoMatched: true,
    });

    mockGetActivePromos.mockResolvedValue([negativePromo]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });
    mockGetBonusBooks.mockResolvedValue([
      { key: "ballybet", displayName: "Bally Bet" },
      { key: "betmgm", displayName: "BetMGM" },
    ]);
    mockGetUserBookKeys.mockResolvedValue(["betmgm"]);
    mockGetHedgeBookKeys.mockResolvedValue(["betmgm"]);

    const result = await getPromos({ precision: "cents" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBeNull();
    expect(result.rows).toEqual([]);
    expect(result.unprofitableRows).toEqual([
      {
        rowKey: "unprofitable-promo-3",
        promoId: 3,
        promoType: "profit_boost",
        promoTypeLabel: "Boost",
        bookKey: "ballybet",
        bookName: "Bally Bet",
        title: "10% profit boost",
        scopeLabel: "Denver Broncos @ Los Angeles Rams",
        autoMatched: true,
        bestGuaranteedProfit: "-0.65",
        note: "No profitable hedge right now (best: −$0.65)",
        // The member only has BetMGM, not the promo's own book (WR-07).
        hasPromoBook: false,
      },
    ]);
  });

  it("bonus-bet title is '$25.00 bonus bet'", async () => {
    const event = moneylineEvent({
      id: "nfl-bonus-title",
      homeTeam: "Team H",
      awayTeam: "Team A",
      commenceTime: plusHours(6),
      quotes: [{ bookKey: "fanduel", homePrice: -400, awayPrice: 320 }],
    });

    const promo = activeBonusPromo({
      id: 4,
      bookKey: "fanduel",
      bonusAmount: "25.00",
      pinned: { eventId: "nfl-bonus-title", marketType: "moneyline", line: null, side: "home" },
    });

    mockGetActivePromos.mockResolvedValue([promo]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });
    mockGetUserBookKeys.mockResolvedValue([]);
    mockGetHedgeBookKeys.mockResolvedValue([]);

    const result = await getPromos({ precision: "cents" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.unprofitableRows).toHaveLength(1);
    expect(result.unprofitableRows[0].title).toBe("$25.00 bonus bet");
  });

  it("pinned boost with boostedOddsAmerican 150 has title 'Boosted to +150'", async () => {
    const event = moneylineEvent({
      id: "nfl-boosted-title",
      homeTeam: "Team H",
      awayTeam: "Team A",
      commenceTime: plusHours(6),
      quotes: [{ bookKey: "draftkings", homePrice: -400, awayPrice: 320 }],
    });

    const promo = activeBoostPromo({
      id: 5,
      bookKey: "draftkings",
      boostPercent: null,
      boostedOddsAmerican: 150,
      pinned: { eventId: "nfl-boosted-title", marketType: "moneyline", line: null, side: "home" },
    });

    mockGetActivePromos.mockResolvedValue([promo]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });
    mockGetUserBookKeys.mockResolvedValue([]);
    mockGetHedgeBookKeys.mockResolvedValue([]);

    const result = await getPromos({ precision: "cents" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.unprofitableRows).toHaveLength(1);
    expect(result.unprofitableRows[0].title).toBe("Boosted to +150");
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

  it("maps a scraped multi-day window to scrapedWindow ET days; null window -> null", async () => {
    mockGetReviewQueue.mockResolvedValue([
      matchQueueRow({
        id: 30,
        parsed: baseParsed({
          sportKeyHint: "icehockey_nhl",
          windowStart: "2026-09-29T04:00:00.000Z",
          windowEnd: "2026-10-01T03:59:59.999Z",
        }),
      }),
      matchQueueRow({ id: 31, parsed: baseParsed({ windowStart: null, windowEnd: null }) }),
    ]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.queue[0].scrapedWindow).toEqual({
      sportKey: "icehockey_nhl",
      startEtDate: "2026-09-29",
      endEtDate: "2026-09-30",
    });
    expect(result.queue[1].scrapedWindow).toBeNull();
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

  it("maps a classify-kind item's title/excerpt/sourceUrl/suggested fields, classify non-null only for classify kind", async () => {
    mockGetReviewQueue.mockResolvedValue([classifyQueueRow(), matchQueueRow()]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const classifyItem = result.queue.find((q) => q.promoId === 20);
    const matchItem = result.queue.find((q) => q.promoId === 10);
    expect(classifyItem?.kind).toBe("classify");
    expect(classifyItem?.description).toBe("Mystery Promo");
    expect(classifyItem?.classify).toEqual({
      title: "Mystery Promo",
      excerpt: "Mystery Promo raw text",
      sourceUrl: "https://sportsbook.draftkings.com/promo/1",
      expiresAt: null,
      suggested: {
        promoType: "profit_boost",
        boostPercent: null,
        bonusAmount: null,
        maxStake: null,
        maxWinnings: null,
        minOdds: null,
        sportKey: null,
      },
      maxWinningsKindKnown: false,
    });
    expect(matchItem?.classify).toBeNull();
  });

  it("classify excerpt collapses whitespace and truncates at 280 chars with an ellipsis", async () => {
    const longText = "A".repeat(300);
    mockGetReviewQueue.mockResolvedValue([
      classifyQueueRow({ parsed: baseParsed({ promoType: "profit_boost", boostPercent: null, rawText: longText }) }),
    ]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const excerpt = result.queue[0].classify?.excerpt ?? "";
    expect(excerpt.length).toBe(280);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it("classify sourceUrl becomes null for a non-http(s) scheme", async () => {
    mockGetReviewQueue.mockResolvedValue([
      classifyQueueRow({
        parsed: baseParsed({ promoType: "profit_boost", boostPercent: null, sourceUrl: "javascript:alert(1)" }),
      }),
    ]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.queue[0].classify?.sourceUrl).toBeNull();
  });

  it("classify maxWinningsKindKnown is true when the row's maxWinningsKind is set", async () => {
    mockGetReviewQueue.mockResolvedValue([classifyQueueRow({ maxWinningsKind: "net_winnings" })]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.queue[0].classify?.maxWinningsKindKnown).toBe(true);
  });
});

describe("getPromos correction options (Plan 09, T-03-09-06)", () => {
  it("returns empty correctionOptions and fetches no cache when the queue has no match-kind item", async () => {
    mockGetReviewQueue.mockResolvedValue([capsQueueRow()]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.correctionOptions).toEqual({ events: [], sportDays: [] });
    expect(mockGetCachedEvents).not.toHaveBeenCalled();
    expect(mockGetCachedExtendedEvents).not.toHaveBeenCalled();
  });

  it("quick-260928-it1: fetches cached events and builds correctionOptions when a classify-kind item exists and no match item", async () => {
    const event = moneylineEvent({
      id: "nfl-9",
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: plusHours(6),
      quotes: [{ bookKey: "draftkings", homePrice: -180, awayPrice: 150 }],
    });
    mockGetActivePromos.mockResolvedValue([]);
    mockGetReviewQueue.mockResolvedValue([classifyQueueRow()]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(mockGetCachedEvents).toHaveBeenCalledTimes(1);
    expect(result.correctionOptions.events.map((e) => e.eventId)).toEqual(["nfl-9"]);
  });

  it("fetches cached events and builds correctionOptions when a match-kind item exists, even with zero active promos", async () => {
    const event = moneylineEvent({
      id: "nfl-9",
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: plusHours(6),
      quotes: [{ bookKey: "draftkings", homePrice: -180, awayPrice: 150 }],
    });
    mockGetActivePromos.mockResolvedValue([]);
    mockGetReviewQueue.mockResolvedValue([matchQueueRow()]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(mockGetCachedEvents).toHaveBeenCalledTimes(1);
    expect(result.correctionOptions.events.map((e) => e.eventId)).toEqual(["nfl-9"]);
  });

  it("reuses the already-fetched odds cache for correctionOptions when active promos exist (no double fetch)", async () => {
    const event = moneylineEvent({
      id: "nfl-a",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      commenceTime: plusHours(6),
      quotes: [{ bookKey: "draftkings", homePrice: -275, awayPrice: 220 }],
    });
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });
    mockGetReviewQueue.mockResolvedValue([matchQueueRow({ id: 99 })]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(mockGetCachedEvents).toHaveBeenCalledTimes(1);
    expect(result.correctionOptions.events.map((e) => e.eventId)).toEqual(["nfl-a"]);
  });

  it("returns empty correctionOptions when emptyVariant is 'no-odds' even with a match-kind item, without throwing", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo()]);
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: null });
    mockGetCachedExtendedEvents.mockResolvedValue({ events: [], fetchedAt: null });
    mockGetReviewQueue.mockResolvedValue([matchQueueRow()]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("no-odds");
    expect(result.correctionOptions).toEqual({ events: [], sportDays: [] });
  });
});

describe("getPromos promo-book ordering (WR-07)", () => {
  it("keeps other-book promos, flags them hasPromoBook false, and sorts them after own-book rows in profit order", async () => {
    const event = moneylineEvent({
      id: "nfl-order",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      commenceTime: plusHours(6),
      quotes: [
        { bookKey: "draftkings", homePrice: -275, awayPrice: 220 },
        { bookKey: "fanduel", homePrice: -275, awayPrice: 220 },
        { bookKey: "betmgm", homePrice: -275, awayPrice: 220 },
      ],
    });

    const ownBig = activeBoostPromo({ id: 1, bookKey: "draftkings", maxStake: "25.00" });
    const ownSmall = activeBoostPromo({ id: 2, bookKey: "fanduel", maxStake: "10.00" });
    const otherBiggest = activeBoostPromo({ id: 3, bookKey: "betmgm", maxStake: "100.00" });

    mockGetActivePromos.mockResolvedValue([ownSmall, otherBiggest, ownBig]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });
    mockGetBonusBooks.mockResolvedValue([
      { key: "draftkings", displayName: "DraftKings" },
      { key: "fanduel", displayName: "FanDuel" },
      { key: "betmgm", displayName: "BetMGM" },
    ]);
    mockGetUserBookKeys.mockResolvedValue(["draftkings", "fanduel"]);
    mockGetHedgeBookKeys.mockResolvedValue(["draftkings", "fanduel"]);

    const result = await getPromos({ precision: "cents" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBeNull();
    // The other-book promo is the most profitable, but is still shown last.
    expect(result.rows.map((r) => r.promoId)).toEqual([1, 2, 3]);
    expect(result.rows.map((r) => r.hasPromoBook)).toEqual([true, true, false]);
    // Within the own-book group, profit order is kept.
    expect(Number(result.rows[0].guaranteedProfit)).toBeGreaterThan(Number(result.rows[1].guaranteedProfit));
    expect(Number(result.rows[2].guaranteedProfit)).toBeGreaterThan(Number(result.rows[0].guaranteedProfit));
  });

  it("sorts other-book unprofitable rows after own-book ones, keeping each group's order", async () => {
    const noEventsScope = {
      kind: "sport_window" as const,
      sportKey: "basketball_nba",
      windowStart: new Date(NOW_ISO),
      windowEnd: new Date(plusHours(48)),
    };
    mockGetActivePromos.mockResolvedValue([
      activeBoostPromo({ id: 5, bookKey: "fanduel", scope: noEventsScope }),
      activeBoostPromo({ id: 6, bookKey: "draftkings", scope: noEventsScope }),
      activeBoostPromo({ id: 7, bookKey: "fanduel", scope: noEventsScope }),
    ]);
    mockGetUserBookKeys.mockResolvedValue(["draftkings"]);
    mockGetHedgeBookKeys.mockResolvedValue(["draftkings"]);

    const result = await getPromos({ precision: "cents" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.rows).toEqual([]);
    expect(result.emptyVariant).toBeNull();
    expect(result.unprofitableRows.map((r) => r.promoId)).toEqual([6, 5, 7]);
    expect(result.unprofitableRows.map((r) => r.hasPromoBook)).toEqual([true, false, false]);
  });
});

// quick-260929-igk: done promos leave the feed and totalProfit, render in
// doneRows from their saved snapshot, and sum into totalExtracted.
function completion(over: Record<string, unknown> = {}) {
  return {
    promoId: 2,
    completedAt: new Date("2026-09-28T12:00:00.000Z"),
    snapshot: null,
    profitExtracted: "0.00",
    promoBookKey: "draftkings",
    promoType: "profit_boost",
    promoParsed: {},
    promoBoostPercent: "50.00",
    promoBoostedOddsAmerican: null,
    promoBonusAmount: null,
    ...over,
  };
}

describe("getPromos done-split and totalProfit (quick-260929-igk)", () => {
  const event = moneylineEvent({
    id: "nfl-total",
    homeTeam: "DEN Broncos",
    awayTeam: "LA Rams",
    commenceTime: plusHours(6),
    quotes: [
      { bookKey: "draftkings", homePrice: -275, awayPrice: 220 },
      { bookKey: "fanduel", homePrice: -260, awayPrice: 210 },
    ],
  });

  it("removes a done promo from rows and totalProfit, and renders it in doneRows from its snapshot", async () => {
    const promoA = activeBoostPromo({ id: 1, bookKey: "draftkings", maxStake: "25.00" });
    const promoB = activeBoostPromo({ id: 2, bookKey: "draftkings", maxStake: "10.00" });
    mockGetActivePromos.mockResolvedValue([promoA, promoB]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });

    // Freeze promo B as done via the same recompute the action uses.
    const before = await getPromos({ precision: "cents" });
    if (before.status !== "ok") throw new Error("unreachable");
    const rowB = before.rows.find((r) => r.promoId === 2);
    const rowA = before.rows.find((r) => r.promoId === 1);
    expect(rowB).toBeDefined();
    const { snapshot, profitExtracted } = buildDoneSnapshot(
      {
        kind: "hedge",
        terms: {
          id: 2, bookKey: "draftkings", promoType: "profit_boost", title: "50% profit boost", boostPercent: "50.00",
          boostedOddsAmerican: null, baseOddsAmerican: null, bonusAmount: null, maxStake: "10.00", winningsCap: null,
          minOddsAmerican: null,
        },
        row: { ...(rowB as PromoRowDTO), guaranteedProfit: "99.99" },
      },
      { now: new Date(NOW_ISO), precision: "cents", oddsFetchedAt: { moneyline: new Date(NOW_ISO), spreadsTotals: null } },
    );
    mockGetPromoCompletions.mockResolvedValue([
      completion({ promoId: 2, snapshot: JSON.parse(JSON.stringify(snapshot)), profitExtracted }),
    ]);

    const result = await getPromos({ precision: "cents" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.rows.map((r) => r.promoId)).toEqual([1]);
    expect(result.totalProfit).toBe(rowA?.guaranteedProfit);
    expect(result.doneRows).toHaveLength(1);
    expect(result.doneRows[0].kind).toBe("hedge");
    // Snapshot numbers win over what live odds now give.
    expect(result.doneRows[0].row?.guaranteedProfit).toBe("99.99");
    expect(result.doneRows[0].profitExtracted).toBe("99.99");
    expect(result.totalExtracted).toBe("99.99");
  });

  it("a legacy completion (no snapshot) is a labeled $0 done row", async () => {
    mockGetActivePromos.mockResolvedValue([activeBoostPromo({ id: 1 })]);
    mockGetPromoCompletions.mockResolvedValue([completion({ promoId: 1 })]);

    const result = await getPromos({ precision: "cents" });

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.doneRows[0]).toMatchObject({ kind: "legacy", note: "Marked done before profit tracking", profitExtracted: "0.00" });
    expect(result.totalExtracted).toBe("0.00");
    expect(result.rows).toEqual([]);
    expect(result.unprofitableRows).toEqual([]);
  });

  it("returns doneRows and totalExtracted in the empty and no-odds branches", async () => {
    mockGetActivePromos.mockResolvedValue([]);
    mockGetPromoCompletions.mockResolvedValue([completion({ promoId: 9 })]);
    const empty = await getPromos({ precision: "whole" });
    if (empty.status !== "ok") throw new Error("unreachable");
    expect(empty.doneRows).toHaveLength(1);
    expect(empty.totalExtracted).toBe("0.00");

    mockGetActivePromos.mockResolvedValue([activeBoostPromo({ id: 1 })]);
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: null });
    mockGetCachedExtendedEvents.mockResolvedValue({ events: [], fetchedAt: null });
    const noOdds = await getPromos({ precision: "whole" });
    if (noOdds.status !== "ok") throw new Error("unreachable");
    expect(noOdds.emptyVariant).toBe("no-odds");
    expect(noOdds.doneRows).toHaveLength(1);
  });

  it("recordCurrentProfitObservations still receives ALL active promos, including done ones", async () => {
    const promoA = activeBoostPromo({ id: 1 });
    const promoB = activeBoostPromo({ id: 2 });
    mockGetActivePromos.mockResolvedValue([promoA, promoB]);
    mockGetPromoCompletions.mockResolvedValue([completion({ promoId: 2 })]);

    await getPromos({ precision: "cents" });

    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledWith(expect.any(Date), {
      activePromos: [promoA, promoB],
      precision: "cents",
    });
  });

  it("totalProfit is '0.00' when there are no rows", async () => {
    mockGetActivePromos.mockResolvedValue([]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.totalProfit).toBe("0.00");
  });
});

describe("computeMemberPromoState parity with getPromos (quick-260929-igk)", () => {
  it("recomputing one promo yields the identical feed row (hedge) and unprofitable row (no_hedge)", async () => {
    const event = moneylineEvent({
      id: "nfl-parity",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      commenceTime: plusHours(6),
      quotes: [
        { bookKey: "draftkings", homePrice: -275, awayPrice: 220 },
        { bookKey: "fanduel", homePrice: -260, awayPrice: 210 },
      ],
    });
    const profitable = activeBoostPromo({ id: 1, bookKey: "draftkings", maxStake: "25.00" });
    // Requires odds far above anything offered, so nothing is eligible/profitable.
    const greyed = activeBoostPromo({ id: 4, bookKey: "draftkings", minOddsAmerican: 100000 });
    mockGetActivePromos.mockResolvedValue([profitable, greyed]);
    mockGetCachedEvents.mockResolvedValue({ events: [event], fetchedAt: new Date(NOW_ISO) });

    const feed = await getPromos({ precision: "cents" });
    if (feed.status !== "ok") throw new Error("unreachable");

    const hedge = await computeMemberPromoState({ userId: 1, promoId: 1, precision: "cents", now: new Date() });
    expect(hedge.kind).toBe("hedge");
    if (hedge.kind !== "hedge") throw new Error("unreachable");
    expect(hedge.row).toEqual(feed.rows.find((r) => r.promoId === 1));

    const noHedge = await computeMemberPromoState({ userId: 1, promoId: 4, precision: "cents", now: new Date() });
    expect(noHedge.kind).toBe("no_hedge");
    if (noHedge.kind !== "no_hedge") throw new Error("unreachable");
    expect(noHedge.row).toEqual(feed.unprofitableRows.find((r) => r.promoId === 4));

    const gone = await computeMemberPromoState({ userId: 1, promoId: 999, precision: "cents", now: new Date() });
    expect(gone.kind).toBe("not_active");
  });
});

// quick-260927-n12 owner decision 3 + scope change B: profit-observation
// recording is unconditional (every "ok" branch), and availableProfit
// always reflects persisted observations at the member's own books.
describe("getPromos profit observation recording + availableProfit (quick-260927-n12)", () => {
  it("calls recordCurrentProfitObservations with now, the loaded activePromos, and precision", async () => {
    const promo = activeBoostPromo();
    mockGetActivePromos.mockResolvedValue([promo]);

    await getPromos({ precision: "cents" });

    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledWith(expect.any(Date), {
      activePromos: [promo],
      precision: "cents",
    });
  });

  it("still calls recordCurrentProfitObservations when there are zero active promos", async () => {
    mockGetActivePromos.mockResolvedValue([]);

    await getPromos({ precision: "whole" });

    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledWith(expect.any(Date), {
      activePromos: [],
      precision: "whole",
    });
  });

  it("returns availableProfit from getProfitObservationsSince, scoped to the member's own books, even with zero active promos", async () => {
    const today = denverDate(new Date());
    mockGetActivePromos.mockResolvedValue([]);
    mockGetUserBookKeys.mockResolvedValue(["draftkings"]);
    mockGetProfitObservationsSince.mockResolvedValue([
      { promoId: 1, bookKey: "draftkings", denverDate: today, maxGuaranteedProfit: "12.34" },
      // Not an own book -- excluded from every period.
      { promoId: 2, bookKey: "fanduel", denverDate: today, maxGuaranteedProfit: "999.00" },
    ]);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.availableProfit).toEqual({ today: "12.34", week: "12.34", month: "12.34" });
  });

  it("queries getProfitObservationsSince with an ISO date string covering both week and month starts", async () => {
    mockGetActivePromos.mockResolvedValue([]);

    await getPromos({ precision: "whole" });

    expect(mockGetProfitObservationsSince).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });
});
