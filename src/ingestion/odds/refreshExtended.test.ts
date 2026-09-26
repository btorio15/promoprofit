import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";

vi.mock("@/ingestion/odds/client", () => ({
  listSports: vi.fn(),
  fetchSportOdds: vi.fn(),
}));

vi.mock("@/ingestion/odds/store", () => ({
  getLatestCreditUsage: vi.fn(),
  commitOddsRefresh: vi.fn(),
  commitSpreadsTotalsRefresh: vi.fn(),
  recordCreditUsage: vi.fn(),
  tryAcquireRefreshLock: vi.fn(),
  releaseRefreshLock: vi.fn(),
}));

import { listSports, fetchSportOdds } from "@/ingestion/odds/client";
import {
  commitOddsRefresh,
  commitSpreadsTotalsRefresh,
  getLatestCreditUsage,
  recordCreditUsage,
  releaseRefreshLock,
  tryAcquireRefreshLock,
} from "@/ingestion/odds/store";
import { EXTENDED_MARKETS, runSpreadsTotalsRefresh, toH2hOnlyEvents } from "./refreshExtended";
import { runOddsRefresh } from "./refresh";

const mockListSports = vi.mocked(listSports);
const mockFetchSportOdds = vi.mocked(fetchSportOdds);
const mockGetLatestCreditUsage = vi.mocked(getLatestCreditUsage);
const mockCommitOddsRefresh = vi.mocked(commitOddsRefresh);
const mockCommitSpreadsTotalsRefresh = vi.mocked(commitSpreadsTotalsRefresh);
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
  mockCommitOddsRefresh.mockResolvedValue(undefined);
  mockCommitSpreadsTotalsRefresh.mockResolvedValue(undefined);
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
    const now = new Date("2026-10-15T12:00:00.000Z");
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
    const now = new Date("2026-10-15T12:00:00.000Z");
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
    const now = new Date("2026-10-15T12:00:00.000Z");
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

  it("confirmed ok: fetches h2h+spreads+totals per sport, commits both caches in one transaction after the loop, and records total spend", async () => {
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

    // One all-or-nothing commit carries both caches' rows (extended events
    // plus their h2h projection) and both caches' purges (WR-01).
    expect(mockCommitSpreadsTotalsRefresh).toHaveBeenCalledTimes(1);
    expect(mockCommitSpreadsTotalsRefresh).toHaveBeenCalledWith(
      [
        {
          sportKey: "basketball_nba",
          extendedEvents: nbaEvents,
          h2hEvents: toH2hOnlyEvents(nbaEvents),
        },
        {
          sportKey: "baseball_mlb",
          extendedEvents: mlbEvents,
          h2hEvents: toH2hOnlyEvents(mlbEvents),
        },
      ],
      now,
    );
    // The commit runs only after every fetch returned.
    expect(mockCommitSpreadsTotalsRefresh.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockFetchSportOdds.mock.invocationCallOrder[1],
    );
    expect(mockCommitOddsRefresh).not.toHaveBeenCalled();

    expect(mockRecordCreditUsage).toHaveBeenCalledWith({
      requestsRemaining: 294,
      requestsUsed: 206,
      refreshCost: 6,
      sportsFetched: 2,
      recordedAt: now,
      triggeredByUserId: null,
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

  it("records triggeredByUserId from opts when a caller provides one, and null when it doesn't (CLI path)", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockListSports.mockResolvedValue([sport("basketball_nba")]);
    mockFetchSportOdds.mockResolvedValue({ events: [], quota: { remaining: 499, used: 1, last: 3 } });

    const cliOutcome = await runSpreadsTotalsRefresh({ confirmed: true, now });
    expect(cliOutcome.status).toBe("ok");
    expect(mockRecordCreditUsage).toHaveBeenCalledWith(
      expect.objectContaining({ triggeredByUserId: null }),
    );

    mockRecordCreditUsage.mockClear();
    const userOutcome = await runSpreadsTotalsRefresh({ confirmed: true, now, triggeredByUserId: 42 });
    expect(userOutcome.status).toBe("ok");
    expect(mockRecordCreditUsage).toHaveBeenCalledWith(
      expect.objectContaining({ triggeredByUserId: 42 }),
    );
  });

  it("mid-loop error: neither cache changes (no write, no purge), the first sport's spend is still recorded, and the result is a key-free error", async () => {
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

    // 01.1 review WR-01: the first sport's fetched events are discarded, so
    // both caches keep their previous batch intact -- a failed search can
    // no longer hide sports from the Arbitrage tab or the finder.
    expect(mockCommitSpreadsTotalsRefresh).not.toHaveBeenCalled();
    expect(mockCommitOddsRefresh).not.toHaveBeenCalled();

    // sportsFetched is the run's in-season count (2), not the 1 sport that
    // finished, so the next extended estimate isn't under-stated (WR-03).
    expect(mockRecordCreditUsage).toHaveBeenCalledWith({
      requestsRemaining: 297,
      requestsUsed: 203,
      refreshCost: 3,
      sportsFetched: 2,
      recordedAt: now,
      triggeredByUserId: null,
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
    expect(mockCommitOddsRefresh).toHaveBeenCalledTimes(1);
    expect(mockCommitSpreadsTotalsRefresh).not.toHaveBeenCalled();
  });

  it("commit failure: returns a key-free error but still records every fetched sport's spend", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockListSports.mockResolvedValue([sport("basketball_nba"), sport("baseball_mlb")]);
    mockFetchSportOdds
      .mockResolvedValueOnce({ events: [], quota: { remaining: 297, used: 203, last: 3 } })
      .mockResolvedValueOnce({ events: [], quota: { remaining: 294, used: 206, last: 3 } });
    mockCommitSpreadsTotalsRefresh.mockRejectedValueOnce(new Error("db write failed"));

    const outcome = await runSpreadsTotalsRefresh({ confirmed: true, now });

    expect(outcome).toEqual({
      status: "error",
      message: "Couldn't search spreads & totals: the Odds API didn't respond.",
    });
    expect(mockRecordCreditUsage).toHaveBeenCalledWith({
      requestsRemaining: 294,
      requestsUsed: 206,
      refreshCost: 6,
      sportsFetched: 2,
      recordedAt: now,
      triggeredByUserId: null,
    });
    expect(mockReleaseRefreshLock).toHaveBeenCalledTimes(1);
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
