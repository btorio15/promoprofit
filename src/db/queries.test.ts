import { describe, expect, it, vi } from "vitest";
import { usableOddsBooks } from "@/config/books";

// Any DB access in these tests is a failure: the book lists must come from config.
vi.mock("./client", () => ({
  getDb: vi.fn(() => {
    throw new Error("getBonusBooks/getHedgeBookKeys must not read the DB (WR-05)");
  }),
}));

import { getDb } from "./client";
import { getBonusBooks, getHedgeBookKeys, getUserBookKeys, saveUserBooks } from "./queries";

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
