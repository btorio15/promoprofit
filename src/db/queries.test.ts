import { describe, expect, it, vi } from "vitest";
import { usableOddsBooks } from "@/config/books";

// Any DB access in these tests is a failure: the book lists must come from config.
vi.mock("./client", () => ({
  getDb: vi.fn(() => {
    throw new Error("getBonusBooks/getHedgeBookKeys must not read the DB (WR-05)");
  }),
}));

import { getDb } from "./client";
import { collectCachedEventRows, toDateOrNull, getBonusBooks, getHedgeBookKeys, getUsableUserBooks, getUserBookKeys, saveUserBooks } from "./queries";

describe("book lists share one runtime source with runOddsRefresh (WR-05)", () => {
  it("getBonusBooks returns exactly usableOddsBooks(), in config sort order", async () => {
    expect(await getBonusBooks()).toEqual(
      usableOddsBooks().map((b) => ({ key: b.key, displayName: b.displayName })),
    );
  });

  it("getHedgeBookKeys returns exactly the keys runOddsRefresh fetches odds for", async () => {
    expect(await getHedgeBookKeys()).toEqual(usableOddsBooks().map((b) => b.key));
  });
});

describe("getBonusBooks/getHedgeBookKeys scoped to a user's allowed keys (D-13)", () => {
  it("getBonusBooks(allowedKeys) returns only usable books that are also allowed, in config order, ignoring unknown/unusable keys", async () => {
    expect(await getBonusBooks(new Set(["fanduel", "draftkings", "williamhill_us"]))).toEqual([
      { key: "draftkings", displayName: "DraftKings" },
      { key: "fanduel", displayName: "FanDuel" },
    ]);
  });

  it("getHedgeBookKeys(allowedKeys) returns only the allowed keys", async () => {
    expect(await getHedgeBookKeys(new Set(["betmgm"]))).toEqual(["betmgm"]);
  });

  it("getBonusBooks() and getHedgeBookKeys() with no argument still return all 7 usable books (unchanged)", async () => {
    expect(await getBonusBooks()).toEqual(
      usableOddsBooks().map((b) => ({ key: b.key, displayName: b.displayName })),
    );
    expect(await getHedgeBookKeys()).toEqual(usableOddsBooks().map((b) => b.key));
  });
});

describe("getUsableUserBooks (CR-02, WR-01)", () => {
  it("returns [] when the user's only saved book is stale (no longer usable)", async () => {
    const mockWhere = vi.fn(() => Promise.resolve([{ bookKey: "williamhill_us" }]));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));
    vi.mocked(getDb).mockReturnValueOnce({ select: mockSelect } as unknown as ReturnType<typeof getDb>);

    expect(await getUsableUserBooks(7)).toEqual([]);
  });

  it("returns usable saved books in config order, dropping stale keys", async () => {
    const mockWhere = vi.fn(() =>
      Promise.resolve([{ bookKey: "fanduel" }, { bookKey: "williamhill_us" }, { bookKey: "draftkings" }]),
    );
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));
    vi.mocked(getDb).mockReturnValueOnce({ select: mockSelect } as unknown as ReturnType<typeof getDb>);

    expect(await getUsableUserBooks(7)).toEqual([
      { key: "draftkings", displayName: "DraftKings" },
      { key: "fanduel", displayName: "FanDuel" },
    ]);
  });

  it("returns [] when the user has no saved books", async () => {
    const mockWhere = vi.fn(() => Promise.resolve([]));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));
    vi.mocked(getDb).mockReturnValueOnce({ select: mockSelect } as unknown as ReturnType<typeof getDb>);

    expect(await getUsableUserBooks(7)).toEqual([]);
  });

  it("passes the given userId through to the user_books query", async () => {
    const mockWhere = vi.fn(() => Promise.resolve([]));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));
    vi.mocked(getDb).mockReturnValueOnce({ select: mockSelect } as unknown as ReturnType<typeof getDb>);

    await getUsableUserBooks(42);

    expect(mockWhere).toHaveBeenCalledTimes(1);
  });
});

describe("getUserBookKeys / saveUserBooks (DASH-02)", () => {
  it("getUserBookKeys(userId) returns the user's saved book keys", async () => {
    const mockWhere = vi.fn(() =>
      Promise.resolve([{ bookKey: "draftkings" }, { bookKey: "betmgm" }]),
    );
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));
    vi.mocked(getDb).mockReturnValueOnce({ select: mockSelect } as unknown as ReturnType<typeof getDb>);

    const result = await getUserBookKeys(7);

    expect(result).toEqual(["draftkings", "betmgm"]);
  });

  it("saveUserBooks(userId, bookKeys) batches a delete followed by one insert of the given rows", async () => {
    const deleteStatement = { __tag: "delete-stmt" };
    const insertStatement = { __tag: "insert-stmt" };
    const mockDeleteWhere = vi.fn(() => deleteStatement);
    const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));
    const mockInsertValues = vi.fn(() => insertStatement);
    const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
    const mockBatch = vi.fn(() => Promise.resolve());
    vi.mocked(getDb).mockReturnValueOnce({
      delete: mockDelete,
      insert: mockInsert,
      batch: mockBatch,
    } as unknown as ReturnType<typeof getDb>);

    await saveUserBooks(7, ["fanduel", "draftkings"]);

    expect(mockInsertValues).toHaveBeenCalledWith([
      { userId: 7, bookKey: "fanduel" },
      { userId: 7, bookKey: "draftkings" },
    ]);
    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(mockBatch).toHaveBeenCalledWith([deleteStatement, insertStatement]);
  });
});

describe("collectCachedEventRows / toDateOrNull (quick-261001-jbc, D-06)", () => {
  const rawEvent = (id: string, sport: string) => ({
    id,
    sport_key: sport,
    sport_title: sport,
    commence_time: "2026-10-02T00:00:00Z",
    home_team: "H",
    away_team: "A",
    bookmakers: [],
  });

  it("returns both sports' events with each row's own fetchedAt (string normalized to Date)", () => {
    const nfl = new Date("2026-10-01T17:00:00.000Z");
    const { events, fetchedAtByEventId } = collectCachedEventRows(
      [
        { eventId: "a", rawResponse: rawEvent("a", "americanfootball_nfl"), fetchedAt: nfl },
        { eventId: "b", rawResponse: rawEvent("b", "icehockey_nhl"), fetchedAt: "2026-10-01T09:00:00.000Z" },
      ],
      "test",
    );
    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(fetchedAtByEventId.get("a")).toEqual(nfl);
    expect(fetchedAtByEventId.get("b")).toEqual(new Date("2026-10-01T09:00:00.000Z"));
  });

  it("drops an invalid row and leaves it out of the map", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { events, fetchedAtByEventId } = collectCachedEventRows(
      [{ eventId: "bad", rawResponse: { nope: true }, fetchedAt: new Date() }],
      "test",
    );
    expect(events).toEqual([]);
    expect(fetchedAtByEventId.has("bad")).toBe(false);
    warn.mockRestore();
  });

  it("toDateOrNull normalizes aggregate strings, passes Dates and nulls through", () => {
    expect(toDateOrNull(null)).toBeNull();
    expect(toDateOrNull(undefined)).toBeNull();
    const d = new Date("2026-10-01T09:00:00.000Z");
    expect(toDateOrNull(d)).toBe(d);
    expect(toDateOrNull("2026-10-01T09:00:00.000Z")).toEqual(d);
  });
});
