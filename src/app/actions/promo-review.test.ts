import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueRow } from "@/db/promoReview";
import type { ScrapedPromo } from "@/domain/promos/scraped";
import type { OddsEvent } from "@/domain/odds/schemas";

const {
  mockRequireUser,
  mockGetPendingPromo,
  mockApplyConfirmedMatch,
  mockApplyDismissal,
  mockGetCachedEvents,
  mockGetCachedExtendedEvents,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetPendingPromo: vi.fn(),
  mockApplyConfirmedMatch: vi.fn(),
  mockApplyDismissal: vi.fn(),
  mockGetCachedEvents: vi.fn(),
  mockGetCachedExtendedEvents: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/promoReview", () => ({
  getPendingPromo: mockGetPendingPromo,
  applyConfirmedMatch: mockApplyConfirmedMatch,
  applyDismissal: mockApplyDismissal,
}));
vi.mock("@/db/queries", () => ({
  getCachedEvents: mockGetCachedEvents,
  getCachedExtendedEvents: mockGetCachedExtendedEvents,
}));

import { revalidatePath } from "next/cache";
import { confirmPromoMatch } from "./confirm-promo-match";
import { dismissPromo } from "./dismiss-promo";

const mockRevalidatePath = vi.mocked(revalidatePath);

// confirm-promo-match.ts calls `new Date()` internally (not an injected
// clock), so every fixture's timing is anchored to the real wall clock at
// test-file load time (mirrors get-promos.test.ts's NOW_ISO pattern).
const NOW_ISO = new Date().toISOString();

function plusHours(hours: number): string {
  return new Date(new Date(NOW_ISO).getTime() + hours * 60 * 60 * 1000).toISOString();
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
