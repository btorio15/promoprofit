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
