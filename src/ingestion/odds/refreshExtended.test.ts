import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";

vi.mock("@/ingestion/odds/client", () => ({
  listSports: vi.fn(),
  fetchSportOdds: vi.fn(),
}));

vi.mock("@/ingestion/odds/store", () => ({
  getLatestCreditUsage: vi.fn(),
  replaceSportOdds: vi.fn(),
  replaceExtendedSportOdds: vi.fn(),
  purgeStartedEvents: vi.fn(),
  purgeUnrefreshedEvents: vi.fn(),
  purgeStartedExtendedEvents: vi.fn(),
  purgeUnrefreshedExtendedEvents: vi.fn(),
  recordCreditUsage: vi.fn(),
  tryAcquireRefreshLock: vi.fn(),
  releaseRefreshLock: vi.fn(),
}));

import { listSports, fetchSportOdds } from "@/ingestion/odds/client";
import {
  getLatestCreditUsage,
  purgeStartedEvents,
  purgeStartedExtendedEvents,
  purgeUnrefreshedEvents,
  purgeUnrefreshedExtendedEvents,
  recordCreditUsage,
  releaseRefreshLock,
  replaceExtendedSportOdds,
  replaceSportOdds,
  tryAcquireRefreshLock,
} from "@/ingestion/odds/store";
import { EXTENDED_MARKETS, runSpreadsTotalsRefresh, toH2hOnlyEvents } from "./refreshExtended";
import { runOddsRefresh } from "./refresh";

const mockListSports = vi.mocked(listSports);
const mockFetchSportOdds = vi.mocked(fetchSportOdds);
const mockGetLatestCreditUsage = vi.mocked(getLatestCreditUsage);
const mockReplaceSportOdds = vi.mocked(replaceSportOdds);
const mockReplaceExtendedSportOdds = vi.mocked(replaceExtendedSportOdds);
const mockPurgeStartedEvents = vi.mocked(purgeStartedEvents);
const mockPurgeUnrefreshedEvents = vi.mocked(purgeUnrefreshedEvents);
const mockPurgeStartedExtendedEvents = vi.mocked(purgeStartedExtendedEvents);
const mockPurgeUnrefreshedExtendedEvents = vi.mocked(purgeUnrefreshedExtendedEvents);
const mockRecordCreditUsage = vi.mocked(recordCreditUsage);
const mockTryAcquireRefreshLock = vi.mocked(tryAcquireRefreshLock);
const mockReleaseRefreshLock = vi.mocked(releaseRefreshLock);

function sport(key: string, active = true) {
  return { key, group: "Basketball", title: key, active };
}

function eventWith(id: string, markets: { key: string; outcomes: { name: string; price: number }[] }[]): OddsEvent {
  return {
    id,
    sport_key: "basketball_nba",
    commence_time: "2026-10-01T00:00:00Z",
    home_team: "Home",
    away_team: "Away",
    bookmakers: [{ key: "draftkings", title: "DraftKings", markets }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPurgeStartedEvents.mockResolvedValue(undefined);
  mockPurgeUnrefreshedEvents.mockResolvedValue(undefined);
  mockPurgeStartedExtendedEvents.mockResolvedValue(undefined);
  mockPurgeUnrefreshedExtendedEvents.mockResolvedValue(undefined);
  mockReplaceSportOdds.mockResolvedValue(undefined);
  mockReplaceExtendedSportOdds.mockResolvedValue(undefined);
  mockRecordCreditUsage.mockResolvedValue(undefined);
  mockTryAcquireRefreshLock.mockResolvedValue(true);
  mockReleaseRefreshLock.mockResolvedValue(undefined);
});

describe("runSpreadsTotalsRefresh", () => {
  it("returns busy without calling listSports or fetchSportOdds when the lock isn't acquired", async () => {
    mockTryAcquireRefreshLock.mockResolvedValue(false);

    const outcome = await runSpreadsTotalsRefresh({ confirmed: true });

    expect(outcome).toEqual({
      status: "busy",
      message: "Another odds refresh is already running. Try again in a minute.",
    });
    expect(mockListSports).not.toHaveBeenCalled();
    expect(mockFetchSportOdds).not.toHaveBeenCalled();
  });

  it("always returns confirm_required when unconfirmed, even outside the 15-minute window (D-14)", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 400,
      requestsUsed: 100,
      refreshCost: 4,
      sportsFetched: 4,
      recordedAt: new Date(now.getTime() - 60 * 60_000), // 60 min ago -- outside the confirm window
    });
    mockListSports.mockResolvedValue([sport("basketball_nba")]);

    const outcome = await runSpreadsTotalsRefresh({ confirmed: false, now });

    expect(mockFetchSportOdds).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      status: "confirm_required",
      estimatedCredits: 3, // 1 sport * 1 region-group * 3 markets
      remaining: 400,
      minutesSinceLastRefresh: null,
    });
  });

  it("returns confirm_required with the floored minutes when unconfirmed within the 15-minute window", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 400,
      requestsUsed: 100,
      refreshCost: 4,
      sportsFetched: 4,
      recordedAt: new Date(now.getTime() - 5 * 60_000),
    });
    mockListSports.mockResolvedValue([sport("basketball_nba")]);

    const outcome = await runSpreadsTotalsRefresh({ confirmed: false, now });

    expect(mockFetchSportOdds).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      status: "confirm_required",
      estimatedCredits: 3,
      remaining: 400,
      minutesSinceLastRefresh: 5,
    });
  });

  it("blocks low_credits when remaining is 19, even when confirmed, and never fetches", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 19,
      requestsUsed: 481,
      refreshCost: 3,
      sportsFetched: 1,
      recordedAt: new Date(now.getTime() - 24 * 60 * 60_000),
    });
    mockListSports.mockResolvedValue([sport("basketball_nba")]);

    const outcome = await runSpreadsTotalsRefresh({ confirmed: true, now });

    expect(mockFetchSportOdds).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      status: "blocked",
      reason: "low_credits",
      remaining: 19,
      estimatedCredits: 3,
      resetsOn: "2026-11-01T00:00:00.000Z",
    });
  });

  it("blocks low_credits before insufficient_credits when remaining is 10 with an estimate of 12", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 10,
      requestsUsed: 490,
      refreshCost: 3,
      sportsFetched: 1,
      recordedAt: new Date(now.getTime() - 24 * 60 * 60_000),
    });
    // 4 in-season sports * 1 region-group (7 books) * 3 markets = 12
    mockListSports.mockResolvedValue([
      sport("basketball_nba"),
      sport("baseball_mlb"),
      sport("americanfootball_nfl"),
      sport("americanfootball_ncaaf"),
    ]);

    const outcome = await runSpreadsTotalsRefresh({ confirmed: true, now });

    expect(mockFetchSportOdds).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      status: "blocked",
      reason: "low_credits",
      remaining: 10,
      estimatedCredits: 12,
      resetsOn: "2026-11-01T00:00:00.000Z",
    });
  });

  it("blocks insufficient_credits when remaining is 25 with 9 in-season sports (estimate 27), even when confirmed", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 25,
      requestsUsed: 475,
      refreshCost: 3,
      sportsFetched: 1,
      recordedAt: new Date(now.getTime() - 24 * 60 * 60_000),
    });
    mockListSports.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => sport(i % 2 === 0 ? "basketball_nba" : "baseball_mlb")),
    );

    const outcome = await runSpreadsTotalsRefresh({ confirmed: true, now });

    expect(mockFetchSportOdds).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      status: "blocked",
      reason: "insufficient_credits",
      remaining: 25,
      estimatedCredits: 27,
      resetsOn: "2026-11-01T00:00:00.000Z",
    });
  });

  it("confirmed ok: fetches h2h+spreads+totals per sport, writes both caches, purges only after the loop, and records total spend", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 300,
      requestsUsed: 200,
      refreshCost: 4,
      sportsFetched: 2,
      recordedAt: new Date(now.getTime() - 24 * 60 * 60_000),
    });
    mockListSports.mockResolvedValue([sport("basketball_nba"), sport("baseball_mlb")]);

    const nbaEvents = [
      eventWith("nba-1", [
        { key: "h2h", outcomes: [{ name: "Home", price: -150 }, { name: "Away", price: 130 }] },
        { key: "spreads", outcomes: [{ name: "Home", price: -110 }, { name: "Away", price: -110 }] },
      ]),
    ];
    const mlbEvents = [
      eventWith("mlb-1", [{ key: "h2h", outcomes: [{ name: "Home", price: -120 }, { name: "Away", price: 110 }] }]),
    ];

    mockFetchSportOdds.mockImplementation(async (sportKey: string) => {
      if (sportKey === "basketball_nba") {
        return { events: nbaEvents, quota: { remaining: 297, used: 203, last: 3 } };
      }
      return { events: mlbEvents, quota: { remaining: 294, used: 206, last: 3 } };
    });

    const outcome = await runSpreadsTotalsRefresh({ confirmed: true, now });

    expect(mockFetchSportOdds).toHaveBeenCalledTimes(2);
    for (const call of mockFetchSportOdds.mock.calls) {
      expect(call[1].markets).toEqual(EXTENDED_MARKETS);
    }

    expect(mockReplaceExtendedSportOdds).toHaveBeenCalledWith("basketball_nba", nbaEvents, now);
    expect(mockReplaceExtendedSportOdds).toHaveBeenCalledWith("baseball_mlb", mlbEvents, now);
    expect(mockReplaceSportOdds).toHaveBeenCalledWith("basketball_nba", toH2hOnlyEvents(nbaEvents), now);
    expect(mockReplaceSportOdds).toHaveBeenCalledWith("baseball_mlb", toH2hOnlyEvents(mlbEvents), now);

    expect(mockPurgeUnrefreshedExtendedEvents).toHaveBeenCalledTimes(1);
    expect(mockPurgeUnrefreshedExtendedEvents).toHaveBeenCalledWith(now);
    expect(mockPurgeStartedExtendedEvents).toHaveBeenCalledTimes(1);
    expect(mockPurgeStartedExtendedEvents).toHaveBeenCalledWith(now);
    expect(mockPurgeUnrefreshedEvents).toHaveBeenCalledTimes(1);
    expect(mockPurgeUnrefreshedEvents).toHaveBeenCalledWith(now);
    expect(mockPurgeStartedEvents).toHaveBeenCalledTimes(1);
    expect(mockPurgeStartedEvents).toHaveBeenCalledWith(now);

    expect(mockRecordCreditUsage).toHaveBeenCalledWith({
      requestsRemaining: 294,
      requestsUsed: 206,
      refreshCost: 6,
      sportsFetched: 2,
      recordedAt: now,
    });

    expect(outcome).toEqual({
      status: "ok",
      fetchedAt: now.toISOString(),
      sportsFetched: ["basketball_nba", "baseball_mlb"],
      creditsSpent: 6,
      remaining: 294,
    });

    expect(mockReleaseRefreshLock).toHaveBeenCalledTimes(1);
  });

  it("mid-loop error: no purge runs, the first sport's spend is still recorded, and the result is a key-free error", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 300,
      requestsUsed: 200,
      refreshCost: 4,
      sportsFetched: 2,
      recordedAt: new Date(now.getTime() - 24 * 60 * 60_000),
    });
    mockListSports.mockResolvedValue([sport("basketball_nba"), sport("baseball_mlb")]);

    mockFetchSportOdds
      .mockResolvedValueOnce({ events: [], quota: { remaining: 297, used: 203, last: 3 } })
      .mockRejectedValueOnce(new Error("network down, key=super-secret-value"));

    const outcome = await runSpreadsTotalsRefresh({ confirmed: true, now });

    expect(mockPurgeUnrefreshedExtendedEvents).not.toHaveBeenCalled();
    expect(mockPurgeStartedExtendedEvents).not.toHaveBeenCalled();
    expect(mockPurgeUnrefreshedEvents).not.toHaveBeenCalled();
    expect(mockPurgeStartedEvents).not.toHaveBeenCalled();

    expect(mockRecordCreditUsage).toHaveBeenCalledWith({
      requestsRemaining: 297,
      requestsUsed: 203,
      refreshCost: 3,
      sportsFetched: 1,
      recordedAt: now,
    });

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.message).toBe("Couldn't search spreads & totals: the Odds API didn't respond.");
      expect(outcome.message).not.toContain("super-secret-value");
    }
    expect(mockReleaseRefreshLock).toHaveBeenCalledTimes(1);
  });

  it("D-16: runOddsRefresh never calls any extended-cache function", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockListSports.mockResolvedValue([sport("basketball_nba")]);
    mockFetchSportOdds.mockResolvedValue({ events: [], quota: { remaining: 499, used: 1, last: 1 } });

    const outcome = await runOddsRefresh({ confirmed: true, now });

    expect(outcome.status).toBe("ok");
    expect(mockReplaceExtendedSportOdds).not.toHaveBeenCalled();
    expect(mockPurgeStartedExtendedEvents).not.toHaveBeenCalled();
    expect(mockPurgeUnrefreshedExtendedEvents).not.toHaveBeenCalled();
  });
});

describe("toH2hOnlyEvents", () => {
  it("keeps only the h2h market per bookmaker and drops bookmakers left with none, without mutating the input", () => {
    const events: OddsEvent[] = [
      eventWith("evt-1", [
        { key: "h2h", outcomes: [{ name: "Home", price: -150 }, { name: "Away", price: 130 }] },
        { key: "spreads", outcomes: [{ name: "Home", price: -110 }, { name: "Away", price: -110 }] },
      ]),
    ];
    events.push({
      ...eventWith("evt-2", []),
      bookmakers: [
        { key: "fanduel", title: "FanDuel", markets: [{ key: "spreads", outcomes: [{ name: "Home", price: -110 }] }] },
      ],
    });
    const snapshot = JSON.parse(JSON.stringify(events));

    const result = toH2hOnlyEvents(events);

    expect(result[0].bookmakers).toHaveLength(1);
    expect(result[0].bookmakers[0].markets).toEqual([
      { key: "h2h", outcomes: [{ name: "Home", price: -150 }, { name: "Away", price: 130 }] },
    ]);
    // Bookmaker with only a spreads market (no h2h) is dropped entirely.
    expect(result[1].bookmakers).toHaveLength(0);
    // Input is never mutated.
    expect(events).toEqual(snapshot);
  });
});
