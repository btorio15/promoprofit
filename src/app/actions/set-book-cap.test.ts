import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireUser, mockGetBooks, mockUpsert, mockDelete, mockRevalidate } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetBooks: vi.fn(),
  mockUpsert: vi.fn(),
  mockDelete: vi.fn(),
  mockRevalidate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidate }));
vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/queries", () => ({ getUsableUserBooks: mockGetBooks }));
vi.mock("@/db/bookCaps", () => ({
  upsertMemberBookCap: mockUpsert,
  deleteMemberBookCap: mockDelete,
  isBookCapsTableMissing: (err: unknown) => (err as { cause?: { code?: string } } | null)?.cause?.code === "42P01",
}));

import { setBookCapAction } from "./set-book-cap";

function expectNoWrite() {
  expect(mockUpsert).not.toHaveBeenCalled();
  expect(mockDelete).not.toHaveBeenCalled();
}

describe("setBookCapAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ userId: 7, email: "a@b.c", displayName: "A" });
    mockGetBooks.mockResolvedValue([{ key: "fanduel", displayName: "FanDuel" }]);
    mockUpsert.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
  });

  it("rejects when there is no session, with no DB access", async () => {
    mockRequireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(setBookCapAction({ bookKey: "fanduel", maxStake: "40" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockGetBooks).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it.each([
    { bookKey: "fanduel", maxStake: "0" },
    { bookKey: "fanduel", maxStake: "-5" },
    { bookKey: "fanduel", maxStake: "10000.01" },
    { bookKey: "fanduel", maxStake: 40 },
    { bookKey: "fanduel", maxStake: "40", userId: 1 },
    { bookKey: "", maxStake: "40" },
    null,
  ])("returns invalid for %j without touching the DB", async (input) => {
    const result = await setBookCapAction(input);
    expect(result.status).toBe("invalid");
    expect(mockGetBooks).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it("returns not_found for a book that is not among the member's books, with no write", async () => {
    const result = await setBookCapAction({ bookKey: "draftkings", maxStake: "40" });
    expect(result).toEqual({ status: "not_found", message: "That book isn't in your books." });
    expectNoWrite();
  });

  it("saves a valid cap for the session member only, normalized to 2 decimals", async () => {
    const result = await setBookCapAction({ bookKey: "fanduel", maxStake: "40" });
    expect(result).toEqual({ status: "ok" });
    expect(mockGetBooks).toHaveBeenCalledWith(7);
    expect(mockUpsert).toHaveBeenCalledWith({ userId: 7, bookKey: "fanduel", maxStake: "40.00", now: expect.any(Date) });
    expect(mockRevalidate).toHaveBeenCalledWith("/");
    expect(mockRevalidate).toHaveBeenCalledWith("/settings");
  });

  it("clears the cap on null", async () => {
    const result = await setBookCapAction({ bookKey: "fanduel", maxStake: null });
    expect(result).toEqual({ status: "ok" });
    expect(mockDelete).toHaveBeenCalledWith({ userId: 7, bookKey: "fanduel" });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns unavailable when the table is missing", async () => {
    mockUpsert.mockRejectedValue(Object.assign(new Error("x"), { cause: { code: "42P01" } }));
    const result = await setBookCapAction({ bookKey: "fanduel", maxStake: "40" });
    expect(result).toEqual({
      status: "unavailable",
      message: "Your max bet can't be saved yet — the database update hasn't been applied.",
    });
  });

  it("rethrows any other DB error", async () => {
    mockUpsert.mockRejectedValue(new Error("fetch failed"));
    await expect(setBookCapAction({ bookKey: "fanduel", maxStake: "40" })).rejects.toThrow("fetch failed");
  });
});
