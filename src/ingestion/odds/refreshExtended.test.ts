import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";

vi.mock("@/ingestion/odds/client", () => ({
  listSports: vi.fn(),
  fetchSportOdds: vi.fn(),
  fetchEventOdds: vi.fn(),
}));

vi.mock("@/ingestion/odds/store", () => ({
  getLatestCreditUsage: vi.fn(),
  commitOddsRefresh: vi.fn(),
  commitSpreadsTotalsRefresh: vi.fn(),
  commitPromoSportsRefresh: vi.fn(),
  recordCreditUsage: vi.fn(),
  tryAcquireRefreshLock: vi.fn(),
  releaseRefreshLock: vi.fn(),
}));

import { listSports, fetchSportOdds, fetchEventOdds } from "@/ingestion/odds/client";
import {
  commitOddsRefresh,
  commitPromoSportsRefresh,
  commitSpreadsTotalsRefresh,
  getLatestCreditUsage,
  recordCreditUsage,
  releaseRefreshLock,
  tryAcquireRefreshLock,
} from "@/ingestion/odds/store";
import { EXTENDED_MARKETS, runPromoSportsRefresh, type AltSpreadEventPicker, runSpreadsTotalsRefresh, toH2hOnlyEvents } from "./refreshExtended";
import { runOddsRefresh } from "./refresh";

const mockListSports = vi.mocked(listSports);
const mockFetchSportOdds = vi.mocked(fetchSportOdds);
const mockFetchEventOdds = vi.mocked(fetchEventOdds);
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
  vi.mocked(commitPromoSportsRefresh).mockResolvedValue(undefined);
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
      altLines: { fetched: 0, skippedOverLimit: 0, skippedForCredits: false, failed: 0, unmatchedOutcomes: 0 },
    });
    expect(mockFetchEventOdds).not.toHaveBeenCalled();

    expect(mockReleaseRefreshLock).toHaveBeenCalledTimes(1);
  });

  describe("alternate spread lines for promo games (260930-gam, 260930-gyl)", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");

    function nflEvent(id: string, commenceHours: number): OddsEvent {
      return {
        id,
        sport_key: "americanfootball_nfl",
        commence_time: new Date(now.getTime() + commenceHours * 3600_000).toISOString(),
        home_team: "Home",
        away_team: "Away",
        bookmakers: [
          {
            key: "draftkings",
            title: "DraftKings",
            markets: [
              {
                key: "spreads",
                outcomes: [
                  { name: "Home", price: -110, point: -7.5 },
                  { name: "Away", price: -110, point: 7.5 },
                ],
              },
            ],
          },
        ],
      };
    }

    function altFor(event: OddsEvent, homeName = "Home"): OddsEvent {
      return {
        ...event,
        bookmakers: [
          {
            key: "draftkings",
            title: "DraftKings",
            markets: [
              {
                key: "alternate_spreads",
                outcomes: [
                  { name: homeName, price: 110, point: -6.5 },
                  { name: "Away", price: -130, point: 6.5 },
                ],
              },
            ],
          },
        ],
      };
    }

    function setup(events: OddsEvent[], remaining = 300) {
      mockGetLatestCreditUsage.mockResolvedValue({
        requestsRemaining: remaining,
        requestsUsed: 500 - remaining,
        refreshCost: 3,
        sportsFetched: 1,
        recordedAt: new Date(now.getTime() - 24 * 60 * 60_000),
      });
      mockListSports.mockResolvedValue([sport("americanfootball_nfl")]);
      mockFetchSportOdds.mockResolvedValue({ events, quota: { remaining, used: 500 - remaining, last: 3 } });
    }

    const pinsFor = (events: OddsEvent[]) => ({
      pins: events.map((e) => ({ eventId: e.id, line: -6.5, side: "home" as const })),
      scopedEventIds: [] as string[],
    });

    it("never calls fetchEventOdds with no pins, or on an unconfirmed press", async () => {
      const events = [nflEvent("e1", 5)];
      setup(events);
      await runSpreadsTotalsRefresh({ confirmed: true, now, altSpreads: { pins: [], scopedEventIds: [] } });
      await runSpreadsTotalsRefresh({ confirmed: false, now, altSpreads: pinsFor(events) });
      expect(mockFetchEventOdds).not.toHaveBeenCalled();
    });

    it("fetches only the 5 soonest of 7 qualifying events, merges alt markets, reports the skipped 2", async () => {
      const events = Array.from({ length: 7 }, (_, i) => nflEvent(`e${i}`, 10 + i));
      setup(events);
      mockFetchEventOdds.mockImplementation(async (_s, eventId) => {
        const e = events.find((x) => x.id === eventId)!;
        return { event: altFor(e), quota: { remaining: 290, used: 210, last: 1 } };
      });

      const outcome = await runSpreadsTotalsRefresh({
        confirmed: true,
        now,
        triggeredByUserId: 7,
        altSpreads: pinsFor(events),
      });

      expect(mockFetchEventOdds).toHaveBeenCalledTimes(5);
      expect(mockFetchEventOdds.mock.calls.map((c) => c[1])).toEqual(["e0", "e1", "e2", "e3", "e4"]);
      expect(outcome).toMatchObject({
        status: "ok",
        creditsSpent: 3 + 5,
        altLines: { fetched: 5, skippedOverLimit: 2, skippedForCredits: false, failed: 0, unmatchedOutcomes: 0 },
      });

      const committed = mockCommitSpreadsTotalsRefresh.mock.calls[0][0][0].extendedEvents;
      const hasAlt = (e: OddsEvent) =>
        e.bookmakers.some((b) => b.markets.some((m) => m.key === "alternate_spreads"));
      expect(committed.filter(hasAlt).map((e) => e.id)).toEqual(["e0", "e1", "e2", "e3", "e4"]);
      // h2h cache projection never holds alt markets
      const h2h = mockCommitSpreadsTotalsRefresh.mock.calls[0][0][0].h2hEvents;
      expect(h2h.some(hasAlt)).toBe(false);

      expect(mockRecordCreditUsage).toHaveBeenCalledTimes(1);
      expect(mockRecordCreditUsage).toHaveBeenCalledWith(
        expect.objectContaining({ refreshCost: 8, sportsFetched: 1, triggeredByUserId: 7 }),
      );
    });

    it("skips alt fetches when the balance would cross the credit block threshold; main refresh still lands", async () => {
      const events = [nflEvent("e1", 5), nflEvent("e2", 6)];
      setup(events, 100);
      // balance after the main fetch is 22; 2 alt credits -> 20 is fine, so drop to 21
      mockFetchSportOdds.mockResolvedValue({ events, quota: { remaining: 21, used: 479, last: 3 } });

      const outcome = await runSpreadsTotalsRefresh({ confirmed: true, now, altSpreads: pinsFor(events) });

      expect(mockFetchEventOdds).not.toHaveBeenCalled();
      expect(mockCommitSpreadsTotalsRefresh).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({ status: "ok", altLines: { fetched: 0, skippedForCredits: true } });
    });

    it("scoped event ids alone (no pins) trigger the alt fetch and merge", async () => {
      const events = [nflEvent("e1", 5)];
      setup(events);
      mockFetchEventOdds.mockResolvedValue({ event: altFor(events[0]), quota: { remaining: 290, used: 210, last: 1 } });

      const outcome = await runSpreadsTotalsRefresh({
        confirmed: true,
        now,
        altSpreads: { pins: [], scopedEventIds: ["e1"] },
      });

      expect(mockFetchEventOdds).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({ status: "ok", altLines: { fetched: 1, failed: 0 } });
    });

    it("260930-hor: a league-wide pick alone triggers the fetch; hook gets fresh main events once", async () => {
      const events = [nflEvent("e1", 5), nflEvent("e2", 6)];
      setup(events);
      mockFetchEventOdds.mockResolvedValue({ event: altFor(events[1]), quota: { remaining: 290, used: 210, last: 1 } });
      const pick = vi.fn().mockReturnValue(["e2"]);

      const outcome = await runSpreadsTotalsRefresh({
        confirmed: true,
        now,
        altSpreads: { pins: [], scopedEventIds: [] },
        pickAltSpreadEventIds: pick,
      });

      expect(pick).toHaveBeenCalledTimes(1);
      const arg = pick.mock.calls[0][0];
      expect(arg.now).toBe(now);
      expect(arg.extendedEvents.map((e: OddsEvent) => e.id)).toEqual(["e1", "e2"]);
      expect(arg.moneylineEvents.map((e: OddsEvent) => e.id)).toEqual(["e1", "e2"]);
      expect(mockFetchEventOdds).toHaveBeenCalledTimes(1);
      expect(mockFetchEventOdds.mock.calls[0][1]).toBe("e2");
      expect(outcome).toMatchObject({ status: "ok", altLines: { fetched: 1, failed: 0 } });
    });

    it("260930-hor: single-game and league-wide targets share the 5-game cap, soonest first, duplicates once", async () => {
      const events = Array.from({ length: 6 }, (_, i) => nflEvent(`e${i}`, 10 + i));
      setup(events);
      mockFetchEventOdds.mockImplementation(async (_s, eventId) => {
        const e = events.find((x) => x.id === eventId)!;
        return { event: altFor(e), quota: { remaining: 290, used: 210, last: 1 } };
      });

      const outcome = await runSpreadsTotalsRefresh({
        confirmed: true,
        now,
        altSpreads: { pins: [], scopedEventIds: ["e5", "e4", "e3", "e2"] },
        pickAltSpreadEventIds: () => ["e2", "e1", "e0"],
      });

      expect(mockFetchEventOdds.mock.calls.map((c) => c[1])).toEqual(["e0", "e1", "e2", "e3", "e4"]);
      expect(outcome).toMatchObject({ status: "ok", altLines: { fetched: 5, skippedOverLimit: 1 } });
    });

    it("260930-hor: a throwing picker never fails the main refresh; single-game ids still fetched", async () => {
      const events = [nflEvent("e1", 5)];
      setup(events);
      mockFetchEventOdds.mockResolvedValue({ event: altFor(events[0]), quota: { remaining: 290, used: 210, last: 1 } });

      const outcome = await runSpreadsTotalsRefresh({
        confirmed: true,
        now,
        altSpreads: { pins: [], scopedEventIds: ["e1"] },
        pickAltSpreadEventIds: () => {
          throw new Error("boom");
        },
      });

      expect(outcome).toMatchObject({ status: "ok", altLines: { fetched: 1, failed: 0 } });
      expect(mockCommitSpreadsTotalsRefresh).toHaveBeenCalledTimes(1);
      expect(mockRecordCreditUsage).toHaveBeenCalledTimes(1);
    });

    it("260930-hor: picker ids respect the credit gate (alt fetch skipped, main commit lands)", async () => {
      const events = [nflEvent("e1", 5), nflEvent("e2", 6)];
      setup(events, 100);
      mockFetchSportOdds.mockResolvedValue({ events, quota: { remaining: 21, used: 479, last: 3 } });

      const outcome = await runSpreadsTotalsRefresh({
        confirmed: true,
        now,
        pickAltSpreadEventIds: () => ["e1", "e2"],
      });

      expect(mockFetchEventOdds).not.toHaveBeenCalled();
      expect(mockCommitSpreadsTotalsRefresh).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({ status: "ok", altLines: { fetched: 0, skippedForCredits: true } });
    });

    it("260930-hor: an unconfirmed press never calls the picker or fetchEventOdds", async () => {
      const events = [nflEvent("e1", 5)];
      setup(events);
      const pick = vi.fn().mockReturnValue(["e1"]);

      const outcome = await runSpreadsTotalsRefresh({ confirmed: false, now, pickAltSpreadEventIds: pick });

      expect(outcome.status).toBe("confirm_required");
      expect(pick).not.toHaveBeenCalled();
      expect(mockFetchEventOdds).not.toHaveBeenCalled();
    });

    it("an alt fetch failure never fails the main refresh; other targets still merge", async () => {
      const events = [nflEvent("e1", 5), nflEvent("e2", 6)];
      setup(events);
      mockFetchEventOdds
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce({ event: altFor(events[1]), quota: { remaining: 290, used: 210, last: 1 } });

      const outcome = await runSpreadsTotalsRefresh({ confirmed: true, now, altSpreads: pinsFor(events) });

      expect(mockCommitSpreadsTotalsRefresh).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({ status: "ok", altLines: { fetched: 1, failed: 1 } });
    });

    it("counts alt outcomes whose team names don't match the event (assumption A2) instead of dropping silently", async () => {
      const events = [nflEvent("e1", 5)];
      setup(events);
      mockFetchEventOdds.mockResolvedValue({
        event: altFor(events[0], "Home Team FC"),
        quota: { remaining: 290, used: 210, last: 1 },
      });

      const outcome = await runSpreadsTotalsRefresh({ confirmed: true, now, altSpreads: pinsFor(events) });

      expect(outcome).toMatchObject({ status: "ok", altLines: { fetched: 1, unmatchedOutcomes: 1 } });
    });
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

describe("runPromoSportsRefresh (quick-261001-jbc)", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");
  const mockCommitPromo = vi.mocked(commitPromoSportsRefresh);

  function nflEvent(id: string, commence: string): OddsEvent {
    return {
      ...eventWith(id, [{ key: "h2h", outcomes: [{ name: "Home", price: -150 }, { name: "Away", price: 130 }] }]),
      sport_key: "americanfootball_nfl",
      commence_time: commence,
    };
  }

  beforeEach(() => {
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 300,
      requestsUsed: 200,
      refreshCost: 9,
      sportsFetched: 3,
      recordedAt: new Date(now.getTime() - 60 * 60_000),
    });
    mockListSports.mockResolvedValue([
      sport("americanfootball_nfl"),
      sport("basketball_nba"),
      sport("icehockey_nhl"),
    ]);
  });

  it("unconfirmed: quotes requested ∩ in-season with the alt estimate and spends nothing", async () => {
    const outcome = await runPromoSportsRefresh({
      confirmed: false,
      now,
      sportKeys: ["americanfootball_nfl", "baseball_mlb"], // MLB is out of season
      altGameEstimate: 2,
    });

    expect(outcome).toEqual({
      status: "confirm_required",
      estimatedCredits: 3 + 2, // 1 sport * 3 markets + 2 alt games * 1 region group
      remaining: 300,
      minutesSinceLastRefresh: null,
      sportKeys: ["americanfootball_nfl"],
    });
    expect(mockFetchSportOdds).not.toHaveBeenCalled();
    expect(mockRecordCreditUsage).not.toHaveBeenCalled();
    expect(mockCommitPromo).not.toHaveBeenCalled();
  });

  it("no requested sport in season -> no_promos, no fetch, no credit row", async () => {
    const outcome = await runPromoSportsRefresh({
      confirmed: true,
      now,
      sportKeys: ["baseball_mlb"],
      altGameEstimate: 0,
    });
    expect(outcome).toEqual({ status: "no_promos", message: "No active promos to refresh." });
    expect(mockFetchSportOdds).not.toHaveBeenCalled();
    expect(mockRecordCreditUsage).not.toHaveBeenCalled();
  });

  it("confirmed: fetches only the promo sport, commits via commitPromoSportsRefresh, one honest credit row", async () => {
    const events = [0, 1, 2, 3, 4, 5, 6].map((i) => nflEvent(`e${i}`, `2026-10-0${2 + (i % 5)}T00:00:00Z`));
    mockFetchSportOdds.mockResolvedValue({ events, quota: { remaining: 297, used: 203, last: 3 } });
    mockFetchEventOdds.mockImplementation(async () => ({ event: null, quota: { remaining: 290, used: 210, last: 1 } }));
    const picker = vi.fn<AltSpreadEventPicker>(() => events.map((e) => e.id)); // 7 picks -> cap 5

    const outcome = await runPromoSportsRefresh({
      confirmed: true,
      now,
      triggeredByUserId: 42,
      sportKeys: ["americanfootball_nfl"],
      altGameEstimate: 7,
      altSpreads: { pins: [], scopedEventIds: [] },
      pickAltSpreadEventIds: picker,
    });

    expect(mockFetchSportOdds).toHaveBeenCalledTimes(1);
    expect(mockFetchSportOdds.mock.calls[0][0]).toBe("americanfootball_nfl");
    expect(mockFetchSportOdds.mock.calls[0][1].markets).toEqual(EXTENDED_MARKETS);
    expect(mockCommitPromo).toHaveBeenCalledTimes(1);
    expect(mockCommitPromo.mock.calls[0][0].map((w) => w.sportKey)).toEqual(["americanfootball_nfl"]);
    expect(mockCommitSpreadsTotalsRefresh).not.toHaveBeenCalled();

    // The picker only sees the fresh nfl events.
    expect(picker.mock.calls[0][0].extendedEvents.map((e) => e.id)).toEqual(events.map((e) => e.id));
    expect(mockFetchEventOdds).toHaveBeenCalledTimes(5);

    // 3 (main) + 5 alt calls * 1 = 8 real credits; sportsFetched is the
    // full in-season count (3), not the promo-sport count (1).
    expect(mockRecordCreditUsage).toHaveBeenCalledTimes(1);
    expect(mockRecordCreditUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshCost: 8,
        sportsFetched: 3,
        triggeredByUserId: 42,
        requestsRemaining: 290,
      }),
    );
    expect(outcome).toMatchObject({ status: "ok", sportsFetched: ["americanfootball_nfl"], creditsSpent: 8 });
    if (outcome.status === "ok") {
      expect(outcome.altLines.skippedOverLimit).toBe(2);
    }
  });

  it("low-credit gate returns blocked and never fetches", async () => {
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 19,
      requestsUsed: 481,
      refreshCost: 3,
      sportsFetched: 1,
      recordedAt: new Date(now.getTime() - 60 * 60_000),
    });
    const outcome = await runPromoSportsRefresh({
      confirmed: true,
      now,
      sportKeys: ["americanfootball_nfl"],
      altGameEstimate: 0,
    });
    expect(outcome.status).toBe("blocked");
    expect(mockFetchSportOdds).not.toHaveBeenCalled();
  });

  it("busy when the refresh lock is held", async () => {
    mockTryAcquireRefreshLock.mockResolvedValue(false);
    const outcome = await runPromoSportsRefresh({
      confirmed: true,
      now,
      sportKeys: ["americanfootball_nfl"],
      altGameEstimate: 0,
    });
    expect(outcome.status).toBe("busy");
    expect(mockListSports).not.toHaveBeenCalled();
  });
});
