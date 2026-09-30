import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";

const {
  mockRequireUser,
  mockGetUsableUserBooks,
  mockGetCachedEvents,
  mockGetCachedExtendedEvents,
  mockInsertAddedPromo,
  mockCountOwnActiveAddedPromos,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetUsableUserBooks: vi.fn(),
  mockGetCachedEvents: vi.fn(),
  mockGetCachedExtendedEvents: vi.fn(),
  mockInsertAddedPromo: vi.fn(),
  mockCountOwnActiveAddedPromos: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/queries", () => ({
  getUsableUserBooks: mockGetUsableUserBooks,
  getCachedEvents: mockGetCachedEvents,
  getCachedExtendedEvents: mockGetCachedExtendedEvents,
}));
vi.mock("@/db/addedPromos", () => ({
  insertAddedPromo: mockInsertAddedPromo,
  countOwnActiveAddedPromos: mockCountOwnActiveAddedPromos,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

import { addPromo } from "./add-promo";

const NOW = new Date("2026-10-01T16:00:00.000Z");

const event: OddsEvent = {
  id: "evt-1",
  sport_key: "americanfootball_nfl",
  sport_title: "NFL",
  commence_time: "2026-10-03T17:00:00.000Z",
  home_team: "DEN Broncos",
  away_team: "LA Rams",
  bookmakers: [],
};

const validInput = {
  promoType: "bonus_bet",
  bookKey: "fanduel",
  bonusAmount: "50",
  expires: { etDate: "2026-10-04", etTime: "23:59" },
  scope: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mockRequireUser.mockReset().mockResolvedValue({ userId: 7 });
  mockGetUsableUserBooks.mockReset().mockResolvedValue([{ key: "fanduel", displayName: "FanDuel" }]);
  mockGetCachedEvents.mockReset().mockResolvedValue({ events: [event], fetchedAt: NOW });
  mockGetCachedExtendedEvents.mockReset().mockResolvedValue({ events: [], fetchedAt: NOW });
  mockInsertAddedPromo.mockReset().mockResolvedValue(42);
  mockCountOwnActiveAddedPromos.mockReset().mockResolvedValue(0);
  mockRevalidatePath.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("addPromo", () => {
  it("rejects before any db work when requireUser rejects", async () => {
    mockRequireUser.mockRejectedValue(new Error("redirect"));
    await expect(addPromo(validInput)).rejects.toThrow("redirect");
    expect(mockGetUsableUserBooks).not.toHaveBeenCalled();
    expect(mockGetCachedEvents).not.toHaveBeenCalled();
    expect(mockCountOwnActiveAddedPromos).not.toHaveBeenCalled();
    expect(mockInsertAddedPromo).not.toHaveBeenCalled();
  });

  it("rejects an input carrying a userId key", async () => {
    const result = await addPromo({ ...validInput, userId: 99 });
    expect(result.status).toBe("invalid");
    expect(mockInsertAddedPromo).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a book the member does not have", async () => {
    const result = await addPromo({ ...validInput, bookKey: "betmgm" });
    expect(result).toEqual({ status: "invalid", fieldErrors: { bookKey: ["Pick a sportsbook."] } });
    expect(mockInsertAddedPromo).not.toHaveBeenCalled();
  });

  it("rejects an expiry that has already passed", async () => {
    const result = await addPromo({ ...validInput, expires: { etDate: "2026-09-30", etTime: "23:59" } });
    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { expires: ["Pick an expiry that hasn't passed."] },
    });
    expect(mockInsertAddedPromo).not.toHaveBeenCalled();
  });

  it("counts the cap as of the request time so lapsed promos do not count (CR-01)", async () => {
    await addPromo(validInput);
    expect(mockCountOwnActiveAddedPromos).toHaveBeenCalledWith(7, NOW);
  });

  it("rejects when the member already has 100 active added promos", async () => {
    mockCountOwnActiveAddedPromos.mockResolvedValue(100);
    const result = await addPromo(validInput);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.fieldErrors.form).toEqual([
        "You have 100 active promos you added. Delete some before adding more.",
      ]);
    }
    expect(mockInsertAddedPromo).not.toHaveBeenCalled();
  });

  it("stores a no-scope bonus bet as scope any, owned by the session user, active immediately", async () => {
    const result = await addPromo(validInput);
    expect(result).toEqual({ status: "ok", promoId: 42 });
    expect(mockInsertAddedPromo).toHaveBeenCalledTimes(1);
    const values = mockInsertAddedPromo.mock.calls[0][0];
    expect(values).toMatchObject({
      addedByUserId: 7,
      status: "active",
      autoMatched: false,
      scopeKind: "any",
      bonusAmount: "50.00",
      bookKey: "fanduel",
      promoType: "bonus_bet",
      sourceUrl: "user-added",
      rawText: "",
    });
    expect(values.dedupeKey).toMatch(/^added:/);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("stores an event scope re-resolved from cached odds", async () => {
    const result = await addPromo({ ...validInput, scope: { kind: "event", eventId: "evt-1" } });
    expect(result.status).toBe("ok");
    expect(mockInsertAddedPromo.mock.calls[0][0]).toMatchObject({
      scopeKind: "event",
      eventId: "evt-1",
      sportKey: "americanfootball_nfl",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
    });
  });

  it("returns stale when the chosen game is not in cached odds", async () => {
    const result = await addPromo({ ...validInput, scope: { kind: "event", eventId: "nope" } });
    expect(result).toEqual({
      status: "stale",
      message: "That game isn't available any more. Pick another game.",
    });
    expect(mockInsertAddedPromo).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("addPromo (profit boost)", () => {
  const boostInput = {
    promoType: "profit_boost",
    bookKey: "fanduel",
    boost: { mode: "percent", boostPercent: "50" },
    scope: { kind: "sport_day", sportKey: "americanfootball_nfl", etDate: "2026-10-03" },
    maxStake: "25",
  };

  const pricedEvent: OddsEvent = {
    ...event,
    bookmakers: [
      {
        key: "draftkings",
        title: "DraftKings",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "DEN Broncos", price: -150 },
              { name: "LA Rams", price: 130 },
            ],
          },
        ],
      },
    ],
  };

  it("boost % on a sport day inserts a sport_window boost owned by the session user", async () => {
    const result = await addPromo(boostInput);
    expect(result).toEqual({ status: "ok", promoId: 42 });
    expect(mockInsertAddedPromo.mock.calls[0][0]).toMatchObject({
      promoType: "profit_boost",
      scopeKind: "sport_window",
      boostPercent: "50.00",
      maxStake: "25.00",
      expiresAt: null,
      addedByUserId: 7,
    });
  });

  it("rejects a boost with no max stake", async () => {
    const { maxStake: omitted, ...rest } = boostInput;
    void omitted;
    const result = await addPromo(rest);
    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { maxStake: ["Enter the max stake. Boosts can't be used without one."] },
    });
    expect(mockInsertAddedPromo).not.toHaveBeenCalled();
  });

  it("boosted odds with a pin present in cached odds stores the pin columns and the price", async () => {
    mockGetCachedEvents.mockResolvedValue({ events: [pricedEvent], fetchedAt: NOW });
    const result = await addPromo({
      ...boostInput,
      boost: { mode: "odds", boostedOddsAmerican: 250 },
      scope: {
        kind: "event",
        eventId: "evt-1",
        pinned: { marketType: "moneyline", line: null, side: "home" },
      },
    });
    expect(result.status).toBe("ok");
    expect(mockInsertAddedPromo.mock.calls[0][0]).toMatchObject({
      marketType: "moneyline",
      side: "home",
      boostedOddsAmerican: 250,
      boostPercent: null,
    });
    const parsed = mockInsertAddedPromo.mock.calls[0][0].parsed as { pinned: { selectionText: string } };
    expect(parsed.pinned.selectionText).toBe("DEN Broncos");
  });

  it("a pin that is not in cached odds is rejected without inserting", async () => {
    const result = await addPromo({
      ...boostInput,
      scope: {
        kind: "event",
        eventId: "evt-1",
        pinned: { marketType: "spread", line: -3.5, side: "home" },
      },
    });
    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { pinned: ["That bet isn't in the current odds. Pick another."] },
    });
    expect(mockInsertAddedPromo).not.toHaveBeenCalled();
  });

  it("rejects a boost expiry in the past and stores a future expiry", async () => {
    const past = await addPromo({ ...boostInput, expires: { etDate: "2026-09-30", etTime: "23:59" } });
    expect(past).toEqual({ status: "invalid", fieldErrors: { expires: ["Pick an expiry that hasn't passed."] } });
    expect(mockInsertAddedPromo).not.toHaveBeenCalled();

    const future = await addPromo({ ...boostInput, expires: { etDate: "2026-10-04", etTime: "23:59" } });
    expect(future.status).toBe("ok");
    expect(mockInsertAddedPromo.mock.calls[0][0].expiresAt).toEqual(new Date("2026-10-05T03:59:00.000Z"));
  });
});
