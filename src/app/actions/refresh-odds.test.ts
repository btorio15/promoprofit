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
  recordCreditUsage: vi.fn(),
}));

vi.mock("@/db/queries", () => ({
  getBonusBooks: vi.fn(),
  getHedgeBookKeys: vi.fn(),
  getCachedEvents: vi.fn(),
}));

import { listSports, fetchSportOdds } from "@/ingestion/odds/client";
import { getLatestCreditUsage, purgeStartedEvents, recordCreditUsage, replaceSportOdds } from "@/ingestion/odds/store";
import { getBonusBooks, getCachedEvents, getHedgeBookKeys } from "@/db/queries";
import { runOddsRefresh } from "@/ingestion/odds/refresh";
import { refreshOdds } from "./refresh-odds";
import { findHedges } from "./find-hedges";

const mockListSports = vi.mocked(listSports);
const mockFetchSportOdds = vi.mocked(fetchSportOdds);
const mockGetLatestCreditUsage = vi.mocked(getLatestCreditUsage);
const mockReplaceSportOdds = vi.mocked(replaceSportOdds);
const mockPurgeStartedEvents = vi.mocked(purgeStartedEvents);
const mockRecordCreditUsage = vi.mocked(recordCreditUsage);
const mockGetBonusBooks = vi.mocked(getBonusBooks);
const mockGetHedgeBookKeys = vi.mocked(getHedgeBookKeys);
const mockGetCachedEvents = vi.mocked(getCachedEvents);

beforeEach(() => {
  vi.clearAllMocks();
  mockPurgeStartedEvents.mockResolvedValue(undefined);
  mockReplaceSportOdds.mockResolvedValue(undefined);
  mockRecordCreditUsage.mockResolvedValue(undefined);
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
    const now = new Date("2026-10-01T12:00:00.000Z");
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

    const before = await findHedges({ bookKey: "draftkings", bonusAmount: "100", sportKey: "all" });
    expect(before.status).toBe("ok");
    if (before.status !== "ok") throw new Error("expected status ok");
    expect(before.results[0].guaranteedProfit).toBe("80.00");

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

    const after = await findHedges({ bookKey: "draftkings", bonusAmount: "100", sportKey: "all" });
    expect(after.status).toBe("ok");
    if (after.status !== "ok") throw new Error("expected status ok");
    expect(after.results[0].guaranteedProfit).toBe("200.00");
    expect(after.results[0].guaranteedProfit).not.toBe(before.results[0].guaranteedProfit);

    vi.useRealTimers();
  });
});
