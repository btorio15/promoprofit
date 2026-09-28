import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueRow } from "@/db/promoReview";
import type { ScrapedPromo } from "@/domain/promos/scraped";
import type { OddsEvent } from "@/domain/odds/schemas";

const {
  mockRequireUser,
  mockGetPendingPromo,
  mockApplyConfirmedMatch,
  mockApplyDismissal,
  mockApplyCorrectedMatch,
  mockApplyCapEntry,
  mockApplyClassification,
  mockGetActivePromoForFlag,
  mockApplyFlag,
  mockGetCachedEvents,
  mockGetCachedExtendedEvents,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetPendingPromo: vi.fn(),
  mockApplyConfirmedMatch: vi.fn(),
  mockApplyDismissal: vi.fn(),
  mockApplyCorrectedMatch: vi.fn(),
  mockApplyCapEntry: vi.fn(),
  mockApplyClassification: vi.fn(),
  mockGetActivePromoForFlag: vi.fn(),
  mockApplyFlag: vi.fn(),
  mockGetCachedEvents: vi.fn(),
  mockGetCachedExtendedEvents: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/promoReview", () => ({
  getPendingPromo: mockGetPendingPromo,
  applyConfirmedMatch: mockApplyConfirmedMatch,
  applyDismissal: mockApplyDismissal,
  applyCorrectedMatch: mockApplyCorrectedMatch,
  applyCapEntry: mockApplyCapEntry,
  applyClassification: mockApplyClassification,
  getActivePromoForFlag: mockGetActivePromoForFlag,
  applyFlag: mockApplyFlag,
}));
vi.mock("@/db/queries", () => ({
  getCachedEvents: mockGetCachedEvents,
  getCachedExtendedEvents: mockGetCachedExtendedEvents,
}));

import { revalidatePath } from "next/cache";
import { confirmPromoMatch } from "./confirm-promo-match";
import { dismissPromo } from "./dismiss-promo";
import { correctPromoMatch } from "./correct-promo-match";
import { enterPromoCaps } from "./enter-promo-caps";
import { flagPromoMatch } from "./flag-promo-match";
import { classifyPromo } from "./classify-promo";

const mockRevalidatePath = vi.mocked(revalidatePath);

// confirm-promo-match.ts calls `new Date()` internally (not an injected
// clock), so every fixture's timing is anchored to the real wall clock at
// test-file load time (mirrors get-promos.test.ts's NOW_ISO pattern).
const NOW_ISO = new Date().toISOString();

function plusHours(hours: number): string {
  return new Date(new Date(NOW_ISO).getTime() + hours * 60 * 60 * 1000).toISOString();
}

/** An ISO instant's ET calendar day as "YYYY-MM-DD". */
function etDateOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function minusHours(hours: number): string {
  return new Date(new Date(NOW_ISO).getTime() - hours * 60 * 60 * 1000).toISOString();
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
    id: 5,
    bookKey: "draftkings",
    promoType: "profit_boost",
    reviewReason: "match",
    parsed: baseParsed(),
    bestGuess: {
      kind: "event",
      eventId: "nfl-1",
      sportKey: "americanfootball_nfl",
      // Deliberately abbreviated vs. the cached event's full team names, so
      // tests can assert the written scope is refreshed FROM the cached
      // event, not copied verbatim from the stored guess.
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
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

function futureEvent(overrides: Partial<OddsEvent> = {}): OddsEvent {
  return {
    id: "nfl-1",
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: plusHours(6),
    home_team: "Denver Broncos",
    away_team: "Los Angeles Rams",
    bookmakers: [],
    ...overrides,
  };
}

/** Same event id as futureEvent(), with a real 2-way h2h/spread/total book quote so resolveSelection succeeds on a pinned spread/total. */
function extendedFutureEvent(overrides: Partial<OddsEvent> = {}): OddsEvent {
  return futureEvent({
    bookmakers: [
      {
        key: "fanduel",
        title: "FanDuel",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Denver Broncos", price: -180 },
              { name: "Los Angeles Rams", price: 150 },
            ],
          },
          {
            key: "spreads",
            outcomes: [
              { name: "Denver Broncos", price: -110, point: -3.5 },
              { name: "Los Angeles Rams", price: -110, point: 3.5 },
            ],
          },
          {
            key: "totals",
            outcomes: [
              { name: "Over", price: -105, point: 44.5 },
              { name: "Under", price: -115, point: 44.5 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  });
}

function capsQueueRow(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 8,
    bookKey: "fanduel",
    promoType: "profit_boost",
    reviewReason: "caps",
    parsed: baseParsed({ bookKey: "fanduel" }),
    bestGuess: null,
    flagged: false,
    scope: {
      kind: "event",
      eventId: "nfl-1",
      sportKey: "americanfootball_nfl",
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: plusHours(6),
    },
    maxStake: null,
    maxWinnings: null,
    maxWinningsKind: null,
    minOddsAmerican: null,
    bonusAmount: null,
    unparsedCapFields: ["maxStake"],
    ...overrides,
  };
}

function classifyQueueRow(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 12,
    bookKey: "draftkings",
    promoType: "profit_boost",
    reviewReason: "classify",
    parsed: baseParsed({
      promoType: "profit_boost",
      boostPercent: null,
      title: "Mystery Promo",
      rawText: "Mystery Promo text",
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
  mockRequireUser.mockResolvedValue({ userId: 7, email: "friend@example.com", displayName: "Friend" });
  mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: null });
  mockGetCachedExtendedEvents.mockResolvedValue({ events: [], fetchedAt: null });
});

describe("confirmPromoMatch server action (PROMO-04, D-10, D-12, T-03-07-01..04)", () => {
  it("rejects when logged out, before any read or write", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(confirmPromoMatch({ promoId: 5 })).rejects.toThrow("NEXT_REDIRECT");

    expect(mockGetPendingPromo).not.toHaveBeenCalled();
    expect(mockApplyConfirmedMatch).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric promoId without writing", async () => {
    const result = await confirmPromoMatch({ promoId: "abc" });

    expect(result).toEqual({ status: "invalid" });
    expect(mockGetPendingPromo).not.toHaveBeenCalled();
  });

  it("rejects an extra 'userId' field (strict schema, IDOR guard)", async () => {
    const result = await confirmPromoMatch({ promoId: 5, userId: 99 });

    expect(result).toEqual({ status: "invalid" });
    expect(mockGetPendingPromo).not.toHaveBeenCalled();
  });

  it("confirms an event match: scope is refreshed from the cached event, not the stored guess", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedEvents.mockResolvedValue({ events: [futureEvent()], fetchedAt: new Date() });
    mockApplyConfirmedMatch.mockResolvedValue(true);

    const result = await confirmPromoMatch({ promoId: 5 });

    expect(result).toEqual({ status: "ok" });
    expect(mockApplyConfirmedMatch).toHaveBeenCalledTimes(1);
    const args = mockApplyConfirmedMatch.mock.calls[0][0];
    expect(args.promoId).toBe(5);
    expect(args.userId).toBe(7);
    expect(args.scope).toEqual({
      kind: "event",
      eventId: "nfl-1",
      sportKey: "americanfootball_nfl",
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: futureEvent().commence_time,
    });
    expect(args.next).toEqual({ status: "active", reviewReason: null, unparsedCapFields: [] });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("finds the cached event in the extended-odds cache too (union of both caches)", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: new Date() });
    mockGetCachedExtendedEvents.mockResolvedValue({ events: [futureEvent()], fetchedAt: new Date() });
    mockApplyConfirmedMatch.mockResolvedValue(true);

    const result = await confirmPromoMatch({ promoId: 5 });

    expect(result).toEqual({ status: "ok" });
  });

  it("confirms a sport_window match without requiring a cached event", async () => {
    const row = matchQueueRow({
      bestGuess: {
        kind: "sport_window",
        sportKey: "americanfootball_nfl",
        windowStart: NOW_ISO,
        windowEnd: plusHours(48),
      },
    });
    mockGetPendingPromo.mockResolvedValue(row);
    mockApplyConfirmedMatch.mockResolvedValue(true);

    const result = await confirmPromoMatch({ promoId: 5 });

    expect(result).toEqual({ status: "ok" });
    expect(mockGetCachedEvents).not.toHaveBeenCalled();
    expect(mockGetCachedExtendedEvents).not.toHaveBeenCalled();
    const args = mockApplyConfirmedMatch.mock.calls[0][0];
    expect(args.scope).toEqual(row.bestGuess);
  });

  it("routes a boost with maxStake null to cap review instead of active (D-18)", async () => {
    const row = matchQueueRow({ maxStake: null });
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedEvents.mockResolvedValue({ events: [futureEvent()], fetchedAt: new Date() });
    mockApplyConfirmedMatch.mockResolvedValue(true);

    await confirmPromoMatch({ promoId: 5 });

    const args = mockApplyConfirmedMatch.mock.calls[0][0];
    expect(args.next).toEqual({
      status: "pending_review",
      reviewReason: "caps",
      unparsedCapFields: ["maxStake"],
    });
  });

  it("returns stale when there is no best guess to confirm", async () => {
    const row = matchQueueRow({ bestGuess: null });
    mockGetPendingPromo.mockResolvedValue(row);

    const result = await confirmPromoMatch({ promoId: 5 });

    expect(result).toEqual({
      status: "stale",
      message: "There's no suggested match to confirm. Correct or dismiss it instead.",
    });
    expect(mockApplyConfirmedMatch).not.toHaveBeenCalled();
  });

  it("returns stale for a caps-review row (no Confirm action for caps kind)", async () => {
    const row = matchQueueRow({ reviewReason: "caps" });
    mockGetPendingPromo.mockResolvedValue(row);

    const result = await confirmPromoMatch({ promoId: 5 });

    expect(result).toEqual({
      status: "stale",
      message: "There's no suggested match to confirm. Correct or dismiss it instead.",
    });
    expect(mockApplyConfirmedMatch).not.toHaveBeenCalled();
  });

  it("returns stale when the event guess's game is no longer in the cached odds", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: new Date() });

    const result = await confirmPromoMatch({ promoId: 5 });

    expect(result).toEqual({
      status: "stale",
      message: "That game is no longer in the cached odds. Correct or dismiss this promo instead.",
    });
    expect(mockApplyConfirmedMatch).not.toHaveBeenCalled();
  });

  it("returns stale when the event guess's game has already started", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedEvents.mockResolvedValue({
      events: [futureEvent({ commence_time: minusHours(1) })],
      fetchedAt: new Date(),
    });

    const result = await confirmPromoMatch({ promoId: 5 });

    expect(result).toEqual({
      status: "stale",
      message: "That game is no longer in the cached odds. Correct or dismiss this promo instead.",
    });
    expect(mockApplyConfirmedMatch).not.toHaveBeenCalled();
  });

  it("returns stale when the sport_window guess's window has ended", async () => {
    const row = matchQueueRow({
      bestGuess: {
        kind: "sport_window",
        sportKey: "americanfootball_nfl",
        windowStart: minusHours(48),
        windowEnd: minusHours(1),
      },
    });
    mockGetPendingPromo.mockResolvedValue(row);

    const result = await confirmPromoMatch({ promoId: 5 });

    expect(result).toEqual({
      status: "stale",
      message: "That promo window has ended. Dismiss this promo instead.",
    });
    expect(mockApplyConfirmedMatch).not.toHaveBeenCalled();
  });

  it("returns conflict when the promo is no longer pending review", async () => {
    mockGetPendingPromo.mockResolvedValue(null);

    const result = await confirmPromoMatch({ promoId: 5 });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
  });

  it("returns conflict when the conditional write affects zero rows (concurrent reviewers)", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedEvents.mockResolvedValue({ events: [futureEvent()], fetchedAt: new Date() });
    mockApplyConfirmedMatch.mockResolvedValue(false);

    const result = await confirmPromoMatch({ promoId: 5 });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
  });
});

describe("dismissPromo server action (D-14, T-03-07-01..03)", () => {
  it("rejects when logged out, before any write", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(dismissPromo({ promoId: 5 })).rejects.toThrow("NEXT_REDIRECT");

    expect(mockApplyDismissal).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric promoId without writing", async () => {
    const result = await dismissPromo({ promoId: "abc" });

    expect(result).toEqual({ status: "invalid" });
    expect(mockApplyDismissal).not.toHaveBeenCalled();
  });

  it("rejects an extra 'userId' field (strict schema, IDOR guard)", async () => {
    const result = await dismissPromo({ promoId: 5, userId: 99 });

    expect(result).toEqual({ status: "invalid" });
    expect(mockApplyDismissal).not.toHaveBeenCalled();
  });

  it("dismisses a promo with attribution and revalidates '/'", async () => {
    mockApplyDismissal.mockResolvedValue(true);

    const result = await dismissPromo({ promoId: 5 });

    expect(result).toEqual({ status: "ok" });
    expect(mockApplyDismissal).toHaveBeenCalledWith({ promoId: 5, userId: 7, now: expect.any(Date) });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("returns conflict when applyDismissal affects zero rows", async () => {
    mockApplyDismissal.mockResolvedValue(false);

    const result = await dismissPromo({ promoId: 5 });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
  });
});

describe("correctPromoMatch server action (PROMO-04, D-14, T-03-09-01/02/06)", () => {
  it("rejects when logged out, before any read or write", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(
      correctPromoMatch({ promoId: 5, scope: { kind: "event", eventId: "nfl-1", pinned: null } }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockGetPendingPromo).not.toHaveBeenCalled();
    expect(mockApplyCorrectedMatch).not.toHaveBeenCalled();
  });

  it("rejects a pinned spread with a whole-number line", async () => {
    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "event", eventId: "nfl-1", pinned: { marketType: "spread", line: 3, side: "home" } },
    });

    expect(result).toEqual({ status: "invalid" });
    expect(mockGetPendingPromo).not.toHaveBeenCalled();
  });

  it("rejects a pinned moneyline with a non-null line", async () => {
    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "event", eventId: "nfl-1", pinned: { marketType: "moneyline", line: 3.5, side: "home" } },
    });

    expect(result).toEqual({ status: "invalid" });
    expect(mockGetPendingPromo).not.toHaveBeenCalled();
  });

  it("rejects an extra 'userId' field (strict schema, IDOR guard)", async () => {
    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "event", eventId: "nfl-1", pinned: null },
      userId: 99,
    });

    expect(result).toEqual({ status: "invalid" });
    expect(mockGetPendingPromo).not.toHaveBeenCalled();
  });

  it("returns stale when the chosen game isn't in the current cached odds", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: new Date() });

    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "event", eventId: "nfl-1", pinned: null },
    });

    expect(result).toEqual({
      status: "stale",
      message: "That game is no longer in the cached odds. Pick another.",
    });
    expect(mockApplyCorrectedMatch).not.toHaveBeenCalled();
  });

  it("returns stale when the chosen game has already started", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedEvents.mockResolvedValue({
      events: [futureEvent({ commence_time: minusHours(1) })],
      fetchedAt: new Date(),
    });

    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "event", eventId: "nfl-1", pinned: null },
    });

    expect(result).toEqual({
      status: "stale",
      message: "That game is no longer in the cached odds. Pick another.",
    });
    expect(mockApplyCorrectedMatch).not.toHaveBeenCalled();
  });

  it("returns invalid with a selection field error when the pinned market isn't eligible for this promo", async () => {
    const row = matchQueueRow({ parsed: baseParsed({ eligibleMarketTypes: ["moneyline"] }) });
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedExtendedEvents.mockResolvedValue({ events: [extendedFutureEvent()], fetchedAt: new Date() });

    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "event", eventId: "nfl-1", pinned: { marketType: "spread", line: -3.5, side: "home" } },
    });

    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { selection: ["That market isn't available for this promo. Pick another."] },
    });
    expect(mockApplyCorrectedMatch).not.toHaveBeenCalled();
  });

  it("returns invalid with a selection field error when the pin doesn't resolve against cached odds", async () => {
    const row = matchQueueRow({ parsed: baseParsed({ eligibleMarketTypes: ["moneyline", "spread"] }) });
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedEvents.mockResolvedValue({ events: [futureEvent()], fetchedAt: new Date() });
    mockGetCachedExtendedEvents.mockResolvedValue({ events: [], fetchedAt: new Date() });

    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "event", eventId: "nfl-1", pinned: { marketType: "spread", line: -3.5, side: "home" } },
    });

    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { selection: ["That market isn't available for this promo. Pick another."] },
    });
    expect(mockApplyCorrectedMatch).not.toHaveBeenCalled();
  });

  it("WR-12: rejects an impossible sport_day date and a day beyond the 7-day correction window", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);

    for (const etDate of ["2026-02-31", "2099-01-01", etDateOf(plusHours(24 * 9))]) {
      const result = await correctPromoMatch({
        promoId: 5,
        scope: { kind: "sport_day", sportKey: "americanfootball_nfl", etDate },
      });
      expect(result).toEqual({ status: "invalid" });
    }
    expect(mockApplyCorrectedMatch).not.toHaveBeenCalled();
  });

  it("returns stale when the chosen sport_day's ET day has already ended", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);

    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "sport_day", sportKey: "americanfootball_nfl", etDate: "2020-01-01" },
    });

    expect(result).toEqual({
      status: "stale",
      message: "That day has already passed. Pick another.",
    });
    expect(mockApplyCorrectedMatch).not.toHaveBeenCalled();
  });

  it("corrects to a chosen game with no pin ('Best available'): scope built from the cached event, pinned null", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedEvents.mockResolvedValue({ events: [futureEvent()], fetchedAt: new Date() });
    mockApplyCorrectedMatch.mockResolvedValue(true);

    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "event", eventId: "nfl-1", pinned: null },
    });

    expect(result).toEqual({ status: "ok" });
    expect(mockApplyCorrectedMatch).toHaveBeenCalledTimes(1);
    const args = mockApplyCorrectedMatch.mock.calls[0][0];
    expect(args.promoId).toBe(5);
    expect(args.userId).toBe(7);
    expect(args.scope).toEqual({
      kind: "event",
      eventId: "nfl-1",
      sportKey: "americanfootball_nfl",
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: futureEvent().commence_time,
    });
    expect(args.pinned).toBeNull();
    expect(args.next).toEqual({ status: "active", reviewReason: null, unparsedCapFields: [] });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("corrects to a chosen game with a resolving pin", async () => {
    const row = matchQueueRow({ parsed: baseParsed({ eligibleMarketTypes: ["moneyline", "spread"] }) });
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedEvents.mockResolvedValue({ events: [futureEvent()], fetchedAt: new Date() });
    mockGetCachedExtendedEvents.mockResolvedValue({ events: [extendedFutureEvent()], fetchedAt: new Date() });
    mockApplyCorrectedMatch.mockResolvedValue(true);

    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "event", eventId: "nfl-1", pinned: { marketType: "spread", line: -3.5, side: "home" } },
    });

    expect(result).toEqual({ status: "ok" });
    const args = mockApplyCorrectedMatch.mock.calls[0][0];
    expect(args.pinned).toEqual({ eventId: "nfl-1", marketType: "spread", line: -3.5, side: "home" });
  });

  it("corrects to a sport_day scope: window built from etDayBounds, pinned null, no cached-event lookup needed", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);
    mockApplyCorrectedMatch.mockResolvedValue(true);

    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "sport_day", sportKey: "americanfootball_nfl", etDate: etDateOf(plusHours(24)) },
    });

    expect(result).toEqual({ status: "ok" });
    expect(mockGetCachedEvents).not.toHaveBeenCalled();
    expect(mockGetCachedExtendedEvents).not.toHaveBeenCalled();
    const args = mockApplyCorrectedMatch.mock.calls[0][0];
    expect(args.scope).toEqual({
      kind: "sport_window",
      sportKey: "americanfootball_nfl",
      windowStart: expect.any(String),
      windowEnd: expect.any(String),
    });
    expect(args.pinned).toBeNull();
  });

  it("returns conflict when the promo is no longer pending review", async () => {
    mockGetPendingPromo.mockResolvedValue(null);

    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "event", eventId: "nfl-1", pinned: null },
    });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
  });

  it("returns conflict for a caps-review row (no Correct action for caps kind)", async () => {
    const row = matchQueueRow({ reviewReason: "caps" });
    mockGetPendingPromo.mockResolvedValue(row);

    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "event", eventId: "nfl-1", pinned: null },
    });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
  });

  it("returns conflict when the conditional write affects zero rows (concurrent reviewers)", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);
    mockGetCachedEvents.mockResolvedValue({ events: [futureEvent()], fetchedAt: new Date() });
    mockApplyCorrectedMatch.mockResolvedValue(false);

    const result = await correctPromoMatch({
      promoId: 5,
      scope: { kind: "event", eventId: "nfl-1", pinned: null },
    });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
  });
});

describe("enterPromoCaps server action (D-18, T-03-09-01/03)", () => {
  it("rejects when logged out, before any read or write", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(enterPromoCaps({ promoId: 8, maxStake: "25.00" })).rejects.toThrow("NEXT_REDIRECT");

    expect(mockGetPendingPromo).not.toHaveBeenCalled();
    expect(mockApplyCapEntry).not.toHaveBeenCalled();
  });

  it("enters a FanDuel-shaped boost's missing max stake, normalized to 2dp", async () => {
    const row = capsQueueRow({ unparsedCapFields: ["maxStake"] });
    mockGetPendingPromo.mockResolvedValue(row);
    mockApplyCapEntry.mockResolvedValue(true);

    const result = await enterPromoCaps({ promoId: 8, maxStake: "25" });

    expect(result).toEqual({ status: "ok" });
    expect(mockApplyCapEntry).toHaveBeenCalledWith({
      promoId: 8,
      userId: 7,
      maxStake: "25.00",
      maxWinnings: null,
      minOddsAmerican: null,
      now: expect.any(Date),
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("requires every field the row still needs (missing maxWinnings)", async () => {
    const row = capsQueueRow({ unparsedCapFields: ["maxStake", "maxWinnings"], maxWinningsKind: "net_winnings" });
    mockGetPendingPromo.mockResolvedValue(row);

    const result = await enterPromoCaps({ promoId: 8, maxStake: "25.00" });

    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { maxWinnings: ["Enter the max winnings."] },
    });
    expect(mockApplyCapEntry).not.toHaveBeenCalled();
  });

  it("rejects a zero maxStake with a field error, without reading the row", async () => {
    const result = await enterPromoCaps({ promoId: 8, maxStake: "0" });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") throw new Error("unreachable");
    expect(result.fieldErrors?.maxStake).toBeDefined();
    expect(mockGetPendingPromo).not.toHaveBeenCalled();
  });

  it("rejects a maxStake with 3 decimal digits with a field error", async () => {
    const result = await enterPromoCaps({ promoId: 8, maxStake: "12.345" });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") throw new Error("unreachable");
    expect(result.fieldErrors?.maxStake).toBeDefined();
  });

  it("rejects a minOddsAmerican below 100 in magnitude with a field error", async () => {
    const result = await enterPromoCaps({ promoId: 8, minOddsAmerican: 50 });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") throw new Error("unreachable");
    expect(result.fieldErrors?.minOdds).toBeDefined();
  });

  it("refuses to guess a winnings-cap kind the row doesn't know (D-18)", async () => {
    const row = capsQueueRow({ unparsedCapFields: ["maxWinnings"], maxStake: "25.00", maxWinningsKind: null });
    mockGetPendingPromo.mockResolvedValue(row);

    const result = await enterPromoCaps({ promoId: 8, maxWinnings: "500.00" });

    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { maxWinnings: ["This book's winnings rule is unknown. Dismiss this promo instead."] },
    });
    expect(mockApplyCapEntry).not.toHaveBeenCalled();
  });

  it("rejects an extra key the client should never send (strict schema, kind never comes from input)", async () => {
    const result = await enterPromoCaps({ promoId: 8, maxWinnings: "500.00", kind: "total_payout" });

    expect(result).toEqual({ status: "invalid" });
    expect(mockGetPendingPromo).not.toHaveBeenCalled();
  });

  it("returns conflict when the promo is no longer pending caps review", async () => {
    mockGetPendingPromo.mockResolvedValue(null);

    const result = await enterPromoCaps({ promoId: 8, maxStake: "25.00" });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
  });

  it("returns conflict for a match-review row (no cap entry for match kind)", async () => {
    const row = matchQueueRow();
    mockGetPendingPromo.mockResolvedValue(row);

    const result = await enterPromoCaps({ promoId: 5, maxStake: "25.00" });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
  });

  it("returns conflict when the conditional write affects zero rows", async () => {
    const row = capsQueueRow({ unparsedCapFields: ["maxStake"] });
    mockGetPendingPromo.mockResolvedValue(row);
    mockApplyCapEntry.mockResolvedValue(false);

    const result = await enterPromoCaps({ promoId: 8, maxStake: "25.00" });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
  });

  it("CR-04: requires a max stake for a boost with none, even when the stored unparsedCapFields is empty", async () => {
    const row = capsQueueRow({ unparsedCapFields: [], maxStake: null });
    mockGetPendingPromo.mockResolvedValue(row);

    const result = await enterPromoCaps({ promoId: 8 });

    expect(result).toEqual({ status: "invalid", fieldErrors: { maxStake: ["Enter the max stake."] } });
    expect(mockApplyCapEntry).not.toHaveBeenCalled();
  });

  it("CR-04: an empty stored field list still accepts and normalizes the boost's missing max stake", async () => {
    const row = capsQueueRow({ unparsedCapFields: [], maxStake: null });
    mockGetPendingPromo.mockResolvedValue(row);
    mockApplyCapEntry.mockResolvedValue(true);

    const result = await enterPromoCaps({ promoId: 8, maxStake: "30" });

    expect(result).toEqual({ status: "ok" });
    expect(mockApplyCapEntry).toHaveBeenCalledWith(expect.objectContaining({ maxStake: "30.00" }));
  });

  it("passes through the row's own already-known values for fields not being entered", async () => {
    const row = capsQueueRow({
      unparsedCapFields: ["minOdds"],
      maxStake: "25.00",
      maxWinnings: "500.00",
      maxWinningsKind: "net_winnings",
    });
    mockGetPendingPromo.mockResolvedValue(row);
    mockApplyCapEntry.mockResolvedValue(true);

    await enterPromoCaps({ promoId: 8, minOddsAmerican: -150 });

    expect(mockApplyCapEntry).toHaveBeenCalledWith({
      promoId: 8,
      userId: 7,
      maxStake: "25.00",
      maxWinnings: "500.00",
      minOddsAmerican: -150,
      now: expect.any(Date),
    });
  });
});

describe("flagPromoMatch server action (D-11, D-12, T-03-10-01..02)", () => {
  it("rejects when logged out, before any read or write", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(flagPromoMatch({ promoId: 5 })).rejects.toThrow("NEXT_REDIRECT");

    expect(mockGetActivePromoForFlag).not.toHaveBeenCalled();
    expect(mockApplyFlag).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric promoId without reading or writing", async () => {
    const result = await flagPromoMatch({ promoId: "x" });

    expect(result).toEqual({ status: "invalid" });
    expect(mockGetActivePromoForFlag).not.toHaveBeenCalled();
  });

  it("rejects an extra 'userId' field (strict schema, IDOR guard)", async () => {
    const result = await flagPromoMatch({ promoId: 5, userId: 99 });

    expect(result).toEqual({ status: "invalid" });
    expect(mockGetActivePromoForFlag).not.toHaveBeenCalled();
  });

  it("flags an active auto-matched event-scope promo: guess is its current scope, ok, revalidates '/'", async () => {
    const guess = {
      kind: "event" as const,
      eventId: "nfl-1",
      sportKey: "americanfootball_nfl",
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: plusHours(6),
    };
    mockGetActivePromoForFlag.mockResolvedValue({ id: 5, autoMatched: true, guess });
    mockApplyFlag.mockResolvedValue(true);

    const result = await flagPromoMatch({ promoId: 5 });

    expect(result).toEqual({ status: "ok" });
    expect(mockApplyFlag).toHaveBeenCalledWith({
      promoId: 5,
      userId: 7,
      guess,
      now: expect.any(Date),
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("flags an active auto-matched sport_window promo (e.g. a sport-wide DraftKings boost)", async () => {
    const guess = {
      kind: "sport_window" as const,
      sportKey: "americanfootball_nfl",
      windowStart: NOW_ISO,
      windowEnd: plusHours(48),
    };
    mockGetActivePromoForFlag.mockResolvedValue({ id: 5, autoMatched: true, guess });
    mockApplyFlag.mockResolvedValue(true);

    const result = await flagPromoMatch({ promoId: 5 });

    expect(result).toEqual({ status: "ok" });
    expect(mockApplyFlag).toHaveBeenCalledWith({
      promoId: 5,
      userId: 7,
      guess,
      now: expect.any(Date),
    });
  });

  it("returns conflict when the active promo was human-confirmed (autoMatched false)", async () => {
    mockGetActivePromoForFlag.mockResolvedValue({
      id: 5,
      autoMatched: false,
      guess: {
        kind: "event" as const,
        eventId: "nfl-1",
        sportKey: "americanfootball_nfl",
        homeTeam: "Denver Broncos",
        awayTeam: "Los Angeles Rams",
        commenceTime: plusHours(6),
      },
    });

    const result = await flagPromoMatch({ promoId: 5 });

    expect(result).toEqual({ status: "conflict", message: "Only auto-matched promos can be flagged." });
    expect(mockApplyFlag).not.toHaveBeenCalled();
  });

  it("returns conflict when the promo is no longer active (already flagged/dismissed/expired)", async () => {
    mockGetActivePromoForFlag.mockResolvedValue(null);

    const result = await flagPromoMatch({ promoId: 5 });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
    expect(mockApplyFlag).not.toHaveBeenCalled();
  });

  it("returns conflict when the conditional write affects zero rows (concurrent reviewers)", async () => {
    mockGetActivePromoForFlag.mockResolvedValue({
      id: 5,
      autoMatched: true,
      guess: {
        kind: "event" as const,
        eventId: "nfl-1",
        sportKey: "americanfootball_nfl",
        homeTeam: "Denver Broncos",
        awayTeam: "Los Angeles Rams",
        commenceTime: plusHours(6),
      },
    });
    mockApplyFlag.mockResolvedValue(false);

    const result = await flagPromoMatch({ promoId: 5 });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
  });
});

describe("classifyPromo server action (quick-260928-it1, CR-04, T-it1-01..03)", () => {
  it("rejects when logged out, before any read or write", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(
      classifyPromo({ promoId: 12, promoType: "profit_boost", boostPercent: "50", scope: null }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockGetPendingPromo).not.toHaveBeenCalled();
    expect(mockApplyClassification).not.toHaveBeenCalled();
  });

  it("rejects an extra 'userId' field (strict schema, IDOR guard)", async () => {
    const result = await classifyPromo({
      promoId: 12,
      promoType: "profit_boost",
      boostPercent: "50",
      scope: null,
      userId: 99,
    });

    expect(result).toEqual({ status: "invalid" });
    expect(mockGetPendingPromo).not.toHaveBeenCalled();
  });

  it("rejects a malformed boostPercent ('abc'), without reading the row", async () => {
    const result = await classifyPromo({ promoId: 12, promoType: "profit_boost", boostPercent: "abc", scope: null });

    expect(result).toEqual({ status: "invalid" });
    expect(mockGetPendingPromo).not.toHaveBeenCalled();
  });

  it("rejects a zero or negative boostPercent", async () => {
    const zero = await classifyPromo({ promoId: 12, promoType: "profit_boost", boostPercent: "0", scope: null });
    expect(zero).toEqual({ status: "invalid" });

    const negative = await classifyPromo({ promoId: 12, promoType: "profit_boost", boostPercent: "-5", scope: null });
    expect(negative).toEqual({ status: "invalid" });
  });

  it("rejects a malformed maxStake ('abc')", async () => {
    const result = await classifyPromo({
      promoId: 12,
      promoType: "profit_boost",
      boostPercent: "50",
      maxStake: "abc",
      scope: null,
    });
    expect(result).toEqual({ status: "invalid" });
    expect(mockGetPendingPromo).not.toHaveBeenCalled();
  });

  it("rejects a malformed bonusAmount ('abc')", async () => {
    const result = await classifyPromo({ promoId: 12, promoType: "bonus_bet", bonusAmount: "abc", scope: null });
    expect(result).toEqual({ status: "invalid" });
    expect(mockGetPendingPromo).not.toHaveBeenCalled();
  });

  it("returns conflict when the row is missing", async () => {
    mockGetPendingPromo.mockResolvedValue(null);

    const result = await classifyPromo({ promoId: 12, promoType: "profit_boost", boostPercent: "50", scope: null });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
  });

  it("returns conflict when the row's reviewReason is not 'classify'", async () => {
    mockGetPendingPromo.mockResolvedValue(matchQueueRow());

    const result = await classifyPromo({ promoId: 5, promoType: "profit_boost", boostPercent: "50", scope: null });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
    expect(mockApplyClassification).not.toHaveBeenCalled();
  });

  it("returns stale when the chosen event is missing from the cache", async () => {
    mockGetPendingPromo.mockResolvedValue(classifyQueueRow());
    mockGetCachedEvents.mockResolvedValue({ events: [], fetchedAt: new Date() });

    const result = await classifyPromo({
      promoId: 12,
      promoType: "profit_boost",
      boostPercent: "50",
      maxStake: "25.00",
      scope: { kind: "event", eventId: "nfl-1" },
    });

    expect(result).toEqual({
      status: "stale",
      message: "That game is no longer in the cached odds. Pick another.",
    });
    expect(mockApplyClassification).not.toHaveBeenCalled();
  });

  it("returns stale when the chosen event has already started", async () => {
    mockGetPendingPromo.mockResolvedValue(classifyQueueRow());
    mockGetCachedEvents.mockResolvedValue({ events: [futureEvent({ commence_time: minusHours(1) })], fetchedAt: new Date() });

    const result = await classifyPromo({
      promoId: 12,
      promoType: "profit_boost",
      boostPercent: "50",
      maxStake: "25.00",
      scope: { kind: "event", eventId: "nfl-1" },
    });

    expect(result).toEqual({
      status: "stale",
      message: "That game is no longer in the cached odds. Pick another.",
    });
  });

  it("WR-12: rejects an impossible sport_day calendar date", async () => {
    mockGetPendingPromo.mockResolvedValue(classifyQueueRow());

    const result = await classifyPromo({
      promoId: 12,
      promoType: "profit_boost",
      boostPercent: "50",
      maxStake: "25.00",
      scope: { kind: "sport_day", sportKey: "americanfootball_nfl", etDate: "2026-02-31" },
    });

    expect(result).toEqual({ status: "invalid" });
    expect(mockApplyClassification).not.toHaveBeenCalled();
  });

  it("returns stale when the chosen sport_day has already passed", async () => {
    mockGetPendingPromo.mockResolvedValue(classifyQueueRow());

    const result = await classifyPromo({
      promoId: 12,
      promoType: "profit_boost",
      boostPercent: "50",
      maxStake: "25.00",
      scope: { kind: "sport_day", sportKey: "americanfootball_nfl", etDate: "2020-01-01" },
    });

    expect(result).toEqual({ status: "stale", message: "That day has already passed. Pick another." });
  });

  it("profit boost + max stake + event: active, maxStake normalized to 2dp, revalidates '/'", async () => {
    mockGetPendingPromo.mockResolvedValue(classifyQueueRow());
    mockGetCachedEvents.mockResolvedValue({ events: [futureEvent()], fetchedAt: new Date() });
    mockApplyClassification.mockResolvedValue(true);

    const result = await classifyPromo({
      promoId: 12,
      promoType: "profit_boost",
      boostPercent: "50",
      maxStake: "25",
      scope: { kind: "event", eventId: "nfl-1" },
    });

    expect(result).toEqual({ status: "ok" });
    expect(mockApplyClassification).toHaveBeenCalledTimes(1);
    const args = mockApplyClassification.mock.calls[0][0];
    expect(args.promoId).toBe(12);
    expect(args.userId).toBe(7);
    expect(args.promoType).toBe("profit_boost");
    expect(args.boostPercent).toBe("50.00");
    expect(args.maxStake).toBe("25.00");
    expect(args.scope).toEqual({
      kind: "event",
      eventId: "nfl-1",
      sportKey: "americanfootball_nfl",
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: futureEvent().commence_time,
    });
    expect(args.next).toEqual({ status: "active", reviewReason: null, unparsedCapFields: [] });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("CR-04: profit boost with NO max stake routes to pending_review/caps, never active", async () => {
    mockGetPendingPromo.mockResolvedValue(classifyQueueRow());
    mockGetCachedEvents.mockResolvedValue({ events: [futureEvent()], fetchedAt: new Date() });
    mockApplyClassification.mockResolvedValue(true);

    const result = await classifyPromo({
      promoId: 12,
      promoType: "profit_boost",
      boostPercent: "50",
      scope: { kind: "event", eventId: "nfl-1" },
    });

    expect(result).toEqual({ status: "ok" });
    const args = mockApplyClassification.mock.calls[0][0];
    expect(args.next).toEqual({
      status: "pending_review",
      reviewReason: "caps",
      unparsedCapFields: ["maxStake"],
    });
  });

  it("refuses maxWinnings when the row's maxWinningsKind is unknown", async () => {
    mockGetPendingPromo.mockResolvedValue(classifyQueueRow({ maxWinningsKind: null }));

    const result = await classifyPromo({
      promoId: 12,
      promoType: "profit_boost",
      boostPercent: "50",
      maxStake: "25.00",
      maxWinnings: "500.00",
      scope: null,
    });

    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { maxWinnings: ["This book's winnings rule is unknown. Dismiss this promo instead."] },
    });
    expect(mockApplyClassification).not.toHaveBeenCalled();
  });

  it("accepts maxWinnings when the row's maxWinningsKind is known", async () => {
    mockGetPendingPromo.mockResolvedValue(classifyQueueRow({ maxWinningsKind: "net_winnings" }));
    mockApplyClassification.mockResolvedValue(true);

    const result = await classifyPromo({
      promoId: 12,
      promoType: "profit_boost",
      boostPercent: "50",
      maxStake: "25.00",
      maxWinnings: "500",
      scope: null,
    });

    expect(result).toEqual({ status: "ok" });
    const args = mockApplyClassification.mock.calls[0][0];
    expect(args.maxWinnings).toBe("500.00");
    expect(args.maxWinningsKind).toBe("net_winnings");
  });

  it("bonus bet + sport_day: promoType bonus_bet, active, sport_window scope recomputed server-side", async () => {
    mockGetPendingPromo.mockResolvedValue(classifyQueueRow());
    mockApplyClassification.mockResolvedValue(true);

    const etDate = etDateOf(plusHours(24));
    const result = await classifyPromo({
      promoId: 12,
      promoType: "bonus_bet",
      bonusAmount: "50",
      scope: { kind: "sport_day", sportKey: "americanfootball_nfl", etDate },
    });

    expect(result).toEqual({ status: "ok" });
    const args = mockApplyClassification.mock.calls[0][0];
    expect(args.promoType).toBe("bonus_bet");
    expect(args.bonusAmount).toBe("50.00");
    expect(args.next).toEqual({ status: "active", reviewReason: null, unparsedCapFields: [] });
    expect(args.scope).toEqual({
      kind: "sport_window",
      sportKey: "americanfootball_nfl",
      windowStart: expect.any(String),
      windowEnd: expect.any(String),
    });
  });

  it("no scope chosen: pending_review/match, scope null", async () => {
    mockGetPendingPromo.mockResolvedValue(classifyQueueRow());
    mockApplyClassification.mockResolvedValue(true);

    const result = await classifyPromo({
      promoId: 12,
      promoType: "profit_boost",
      boostPercent: "50",
      maxStake: "25.00",
      scope: null,
    });

    expect(result).toEqual({ status: "ok" });
    const args = mockApplyClassification.mock.calls[0][0];
    expect(args.scope).toBeNull();
    expect(args.next).toEqual({ status: "pending_review", reviewReason: "match", unparsedCapFields: [] });
    expect(mockGetCachedEvents).not.toHaveBeenCalled();
  });

  it("returns conflict when applyClassification affects zero rows", async () => {
    mockGetPendingPromo.mockResolvedValue(classifyQueueRow());
    mockApplyClassification.mockResolvedValue(false);

    const result = await classifyPromo({
      promoId: 12,
      promoType: "profit_boost",
      boostPercent: "50",
      maxStake: "25.00",
      scope: null,
    });

    expect(result).toEqual({ status: "conflict", message: "Someone else already handled this promo." });
  });
});
