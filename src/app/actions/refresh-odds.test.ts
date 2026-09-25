import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFixtureEvents } from "@/test/fixtures/oddsEvents";
import { usableOddsBooks } from "@/config/books";
import type { OddsEvent } from "@/domain/odds/schemas";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/ingestion/odds/client", () => ({
  listSports: vi.fn(),
  fetchSportOdds: vi.fn(),
}));

vi.mock("@/ingestion/odds/store", () => ({
  getLatestCreditUsage: vi.fn(),
  replaceSportOdds: vi.fn(),
  purgeStartedEvents: vi.fn(),
  purgeUnrefreshedEvents: vi.fn(),
  recordCreditUsage: vi.fn(),
  tryAcquireRefreshLock: vi.fn(),
  releaseRefreshLock: vi.fn(),
}));

vi.mock("@/db/queries", () => ({
  getBonusBooks: vi.fn(),
  getHedgeBookKeys: vi.fn(),
  getCachedEvents: vi.fn(),
}));

import { listSports, fetchSportOdds } from "@/ingestion/odds/client";
import {
  getLatestCreditUsage,
  purgeStartedEvents,
  purgeUnrefreshedEvents,
  recordCreditUsage,
  releaseRefreshLock,
  replaceSportOdds,
  tryAcquireRefreshLock,
} from "@/ingestion/odds/store";
import { getBonusBooks, getCachedEvents, getHedgeBookKeys } from "@/db/queries";
import { runOddsRefresh } from "@/ingestion/odds/refresh";
import { refreshOdds } from "./refresh-odds";
import { findHedges } from "./find-hedges";

const mockListSports = vi.mocked(listSports);
const mockFetchSportOdds = vi.mocked(fetchSportOdds);
const mockGetLatestCreditUsage = vi.mocked(getLatestCreditUsage);
const mockReplaceSportOdds = vi.mocked(replaceSportOdds);
const mockPurgeStartedEvents = vi.mocked(purgeStartedEvents);
const mockPurgeUnrefreshedEvents = vi.mocked(purgeUnrefreshedEvents);
const mockRecordCreditUsage = vi.mocked(recordCreditUsage);
const mockTryAcquireRefreshLock = vi.mocked(tryAcquireRefreshLock);
const mockReleaseRefreshLock = vi.mocked(releaseRefreshLock);
const mockGetBonusBooks = vi.mocked(getBonusBooks);
const mockGetHedgeBookKeys = vi.mocked(getHedgeBookKeys);
const mockGetCachedEvents = vi.mocked(getCachedEvents);

beforeEach(() => {
  vi.clearAllMocks();
  mockPurgeStartedEvents.mockResolvedValue(undefined);
  mockPurgeUnrefreshedEvents.mockResolvedValue(undefined);
  mockReplaceSportOdds.mockResolvedValue(undefined);
  mockRecordCreditUsage.mockResolvedValue(undefined);
  mockTryAcquireRefreshLock.mockResolvedValue(true);
  mockReleaseRefreshLock.mockResolvedValue(undefined);
});

describe("runOddsRefresh", () => {
  it("fetches only in-season D-01 sports (skipping inactive and non-D-01), replaces their cache, and records credits (status ok)", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 300,
      requestsUsed: 200,
      refreshCost: 2,
      sportsFetched: 2,
      recordedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day ago -- outside confirm window
    });
    mockListSports.mockResolvedValue([
      { key: "basketball_nba", group: "Basketball", title: "NBA", active: true },
      { key: "baseball_mlb", group: "Baseball", title: "MLB", active: true },
      { key: "americanfootball_nfl", group: "Football", title: "NFL", active: false },
      { key: "icehockey_nhl", group: "Hockey", title: "NHL", active: true },
    ]);
    mockFetchSportOdds.mockImplementation(async (sportKey: string) => {
      if (sportKey === "basketball_nba") {
        return { events: [], quota: { remaining: 490, used: 10, last: 1 } };
      }
      return { events: [], quota: { remaining: 480, used: 20, last: 1 } };
    });

    const outcome = await runOddsRefresh({ confirmed: false, now });

    expect(mockFetchSportOdds).toHaveBeenCalledTimes(2);
    const calledSports = mockFetchSportOdds.mock.calls.map((c) => c[0]).sort();
    expect(calledSports).toEqual(["baseball_mlb", "basketball_nba"]);
    expect(mockReplaceSportOdds).toHaveBeenCalledTimes(2);
    expect(mockPurgeStartedEvents).toHaveBeenCalledWith(now);
    // WR-01: rows not rewritten by this run (e.g. out-of-season NFL) are purged.
    expect(mockPurgeUnrefreshedEvents).toHaveBeenCalledWith(now);
    expect(mockRecordCreditUsage).toHaveBeenCalledTimes(1);
    expect(mockRecordCreditUsage).toHaveBeenCalledWith({
      requestsRemaining: 480,
      requestsUsed: 20,
      refreshCost: 2,
      sportsFetched: 2,
      recordedAt: now,
    });
    expect(outcome.status).toBe("ok");
  });

  it("blocks the refresh (low_credits) when remaining is below the threshold, without calling fetchSportOdds", async () => {
    // The low-credit row is from the SAME billing month as now (CR-01).
    const now = new Date("2026-10-15T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 15,
      requestsUsed: 485,
      refreshCost: 2,
      sportsFetched: 1,
      recordedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });
    mockListSports.mockResolvedValue([{ key: "basketball_nba", group: "Basketball", title: "NBA", active: true }]);

    const outcome = await runOddsRefresh({ confirmed: false, now });

    expect(mockFetchSportOdds).not.toHaveBeenCalled();
    expect(mockRecordCreditUsage).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      status: "blocked",
      reason: "low_credits",
      remaining: 15,
      estimatedCredits: 1,
      resetsOn: "2026-11-01T00:00:00.000Z",
    });
  });

  it("does not block on a low-credit row from the previous billing month -- the quota reset on the 1st (CR-01)", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 15,
      requestsUsed: 485,
      refreshCost: 2,
      sportsFetched: 1,
      recordedAt: new Date("2026-09-30T12:00:00.000Z"), // before the Oct 1 reset
    });
    mockListSports.mockResolvedValue([{ key: "basketball_nba", group: "Basketball", title: "NBA", active: true }]);
    mockFetchSportOdds.mockResolvedValue({ events: [], quota: { remaining: 499, used: 1, last: 1 } });

    const outcome = await runOddsRefresh({ confirmed: false, now });

    expect(mockFetchSportOdds).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe("ok");
    expect(mockRecordCreditUsage).toHaveBeenCalledWith({
      requestsRemaining: 499,
      requestsUsed: 1,
      refreshCost: 1,
      sportsFetched: 1,
      recordedAt: now,
    });
  });

  it("never records a made-up 0 when x-requests-remaining is missing; carries the prior balance forward less the cost (CR-01)", async () => {
    const now = new Date("2026-10-15T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 300,
      requestsUsed: 200,
      refreshCost: 1,
      sportsFetched: 1,
      recordedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });
    mockListSports.mockResolvedValue([{ key: "basketball_nba", group: "Basketball", title: "NBA", active: true }]);
    mockFetchSportOdds.mockResolvedValue({ events: [], quota: { remaining: null, used: null, last: 1 } });

    const outcome = await runOddsRefresh({ confirmed: false, now });

    expect(outcome.status).toBe("ok");
    expect(mockRecordCreditUsage).toHaveBeenCalledWith({
      requestsRemaining: 299,
      requestsUsed: 201,
      refreshCost: 1,
      sportsFetched: 1,
      recordedAt: now,
    });
  });

  it("skips recording (instead of writing 0) when the header is missing and no same-month balance is known (CR-01)", async () => {
    const now = new Date("2026-10-15T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockListSports.mockResolvedValue([{ key: "basketball_nba", group: "Basketball", title: "NBA", active: true }]);
    mockFetchSportOdds.mockResolvedValue({ events: [], quota: { remaining: null, used: null, last: 1 } });

    const outcome = await runOddsRefresh({ confirmed: false, now });

    expect(outcome.status).toBe("ok");
    expect(mockRecordCreditUsage).not.toHaveBeenCalled();
  });

  it("keeps an earlier sport's reported balance when a later response lacks the header (CR-01)", async () => {
    const now = new Date("2026-10-15T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockListSports.mockResolvedValue([
      { key: "basketball_nba", group: "Basketball", title: "NBA", active: true },
      { key: "baseball_mlb", group: "Baseball", title: "MLB", active: true },
    ]);
    mockFetchSportOdds
      .mockResolvedValueOnce({ events: [], quota: { remaining: 250, used: 250, last: 1 } })
      .mockResolvedValueOnce({ events: [], quota: { remaining: null, used: null, last: 1 } });

    await runOddsRefresh({ confirmed: false, now });

    expect(mockRecordCreditUsage).toHaveBeenCalledWith(
      expect.objectContaining({ requestsRemaining: 250, requestsUsed: 250, refreshCost: 2 }),
    );
  });

  it("returns confirm_required within the 15-minute window when not confirmed, and proceeds when confirmed", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    const recordedAt = new Date(now.getTime() - 5 * 60_000);
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 300,
      requestsUsed: 200,
      refreshCost: 1,
      sportsFetched: 1,
      recordedAt,
    });
    mockListSports.mockResolvedValue([{ key: "basketball_nba", group: "Basketball", title: "NBA", active: true }]);

    const unconfirmed = await runOddsRefresh({ confirmed: false, now });
    expect(mockFetchSportOdds).not.toHaveBeenCalled();
    expect(unconfirmed).toEqual({ status: "confirm_required", minutesSinceLastRefresh: 5, estimatedCredits: 1 });

    mockFetchSportOdds.mockResolvedValue({ events: [], quota: { remaining: 299, used: 201, last: 1 } });
    const confirmed = await runOddsRefresh({ confirmed: true, now });
    expect(confirmed.status).toBe("ok");
    expect(mockFetchSportOdds).toHaveBeenCalledTimes(1);
  });

  it("records the credits actually spent and returns a key-free error message when a later fetch fails", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 300,
      requestsUsed: 200,
      refreshCost: 1,
      sportsFetched: 1,
      recordedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });
    mockListSports.mockResolvedValue([
      { key: "basketball_nba", group: "Basketball", title: "NBA", active: true },
      { key: "baseball_mlb", group: "Baseball", title: "MLB", active: true },
    ]);
    mockFetchSportOdds
      .mockResolvedValueOnce({ events: [], quota: { remaining: 299, used: 201, last: 1 } })
      .mockRejectedValueOnce(new Error("network down, key=super-secret-value"));

    const outcome = await runOddsRefresh({ confirmed: false, now });

    expect(mockReplaceSportOdds).toHaveBeenCalledTimes(1);
    // WR-01: a partial run must not purge -- the failed sport's old rows are
    // hidden by getCachedEvents' latest-batch filter instead.
    expect(mockPurgeUnrefreshedEvents).not.toHaveBeenCalled();
    expect(mockRecordCreditUsage).toHaveBeenCalledWith({
      requestsRemaining: 299,
      requestsUsed: 201,
      refreshCost: 1,
      sportsFetched: 1,
      recordedAt: now,
    });
    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.message).toBe("Couldn't refresh odds: the Odds API didn't respond.");
      expect(outcome.message).not.toContain("super-secret-value");
    }
  });
});

describe("runOddsRefresh credit capture (WR-02)", () => {
  it("records the credits spent when the first sport's cache write fails after a successful fetch", async () => {
    const now = new Date("2026-10-15T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 300,
      requestsUsed: 200,
      refreshCost: 1,
      sportsFetched: 1,
      recordedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });
    mockListSports.mockResolvedValue([{ key: "basketball_nba", group: "Basketball", title: "NBA", active: true }]);
    mockFetchSportOdds.mockResolvedValue({ events: [], quota: { remaining: 299, used: 201, last: 1 } });
    mockReplaceSportOdds.mockRejectedValueOnce(new Error("db write failed"));

    const outcome = await runOddsRefresh({ confirmed: false, now });

    expect(outcome.status).toBe("error");
    expect(mockRecordCreditUsage).toHaveBeenCalledWith({
      requestsRemaining: 299,
      requestsUsed: 201,
      refreshCost: 1,
      sportsFetched: 0,
      recordedAt: now,
    });
  });
});

describe("runOddsRefresh server-side lock (WR-03)", () => {
  it("returns busy without reading the gate or spending credits when another refresh holds the lock", async () => {
    mockTryAcquireRefreshLock.mockResolvedValue(false);

    const outcome = await runOddsRefresh({ confirmed: true, now: new Date("2026-10-15T12:00:00.000Z") });

    expect(outcome).toEqual({
      status: "busy",
      message: "Another odds refresh is already running. Try again in a minute.",
    });
    expect(mockGetLatestCreditUsage).not.toHaveBeenCalled();
    expect(mockListSports).not.toHaveBeenCalled();
    expect(mockFetchSportOdds).not.toHaveBeenCalled();
    expect(mockReleaseRefreshLock).not.toHaveBeenCalled();
  });

  it("acquires the lock before the gate and releases it with the same holder after the refresh", async () => {
    const now = new Date("2026-10-15T12:00:00.000Z");
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockListSports.mockResolvedValue([{ key: "basketball_nba", group: "Basketball", title: "NBA", active: true }]);
    mockFetchSportOdds.mockResolvedValue({ events: [], quota: { remaining: 499, used: 1, last: 1 } });

    const outcome = await runOddsRefresh({ confirmed: false, now });

    expect(outcome.status).toBe("ok");
    expect(mockTryAcquireRefreshLock).toHaveBeenCalledTimes(1);
    const holder = mockTryAcquireRefreshLock.mock.calls[0][0];
    expect(mockReleaseRefreshLock).toHaveBeenCalledWith(holder);
    expect(mockTryAcquireRefreshLock.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetLatestCreditUsage.mock.invocationCallOrder[0],
    );
    expect(mockReleaseRefreshLock.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockRecordCreditUsage.mock.invocationCallOrder[0],
    );
  });

  it("releases the lock when the refresh is blocked or errors", async () => {
    mockGetLatestCreditUsage.mockRejectedValue(new Error("db down"));

    const outcome = await runOddsRefresh({ confirmed: false, now: new Date("2026-10-15T12:00:00.000Z") });

    expect(outcome.status).toBe("error");
    expect(mockReleaseRefreshLock).toHaveBeenCalledTimes(1);
  });

  it("returns a key-free error when the lock itself can't be taken", async () => {
    mockTryAcquireRefreshLock.mockRejectedValue(new Error("db down"));

    const outcome = await runOddsRefresh({ confirmed: false });

    expect(outcome).toEqual({ status: "error", message: "Couldn't refresh odds: the Odds API didn't respond." });
    expect(mockGetLatestCreditUsage).not.toHaveBeenCalled();
  });
});

describe("refreshOdds server action", () => {
  it("rejects non-object input with a fixed message", async () => {
    const outcome = await refreshOdds(null);
    expect(outcome).toEqual({ status: "error", message: "Invalid refresh request" });
  });

  it("rejects a non-boolean confirmed field with a fixed message", async () => {
    const outcome = await refreshOdds({ confirmed: "yes" });
    expect(outcome).toEqual({ status: "error", message: "Invalid refresh request" });
  });
});

describe("ODDS-04: findHedges recomputes from the current cache", () => {
  it("returns different results once getCachedEvents reflects a refreshed cache", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-10-01T12:00:00.000Z");
    vi.setSystemTime(now);

    const bonusBooks = usableOddsBooks().map((b) => ({ key: b.key, displayName: b.displayName }));
    mockGetBonusBooks.mockResolvedValue(bonusBooks);
    mockGetHedgeBookKeys.mockResolvedValue(bonusBooks.map((b) => b.key));

    const oldEvents = buildFixtureEvents(now);
    mockGetCachedEvents.mockResolvedValueOnce({ events: oldEvents, fetchedAt: now });

    const before = await findHedges({ bookKey: "draftkings", bonusAmount: "100" });
    expect(before.status).toBe("ok");
    if (before.status !== "ok") throw new Error("expected status ok");
    expect(before.resultsBySport.all[0].guaranteedProfit).toBe("80.00");

    const refreshedEvent: OddsEvent = {
      id: "refreshed-event",
      sport_key: "basketball_nba",
      commence_time: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      home_team: "Refresh Home",
      away_team: "Refresh Away",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Refresh Away", price: 500 },
                { name: "Refresh Home", price: -150 },
              ],
            },
          ],
        },
      ],
    };
    mockGetCachedEvents.mockResolvedValueOnce({
      events: [refreshedEvent],
      fetchedAt: new Date(now.getTime() + 1000),
    });

    const after = await findHedges({ bookKey: "draftkings", bonusAmount: "100" });
    expect(after.status).toBe("ok");
    if (after.status !== "ok") throw new Error("expected status ok");
    expect(after.resultsBySport.all[0].guaranteedProfit).toBe("200.00");
    expect(after.resultsBySport.all[0].guaranteedProfit).not.toBe(
      before.resultsBySport.all[0].guaranteedProfit,
    );

    vi.useRealTimers();
  });
});
