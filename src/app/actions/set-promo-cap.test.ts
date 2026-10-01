import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireUser, mockGetCapEditablePromo, mockUpsert, mockDelete } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetCapEditablePromo: vi.fn(),
  mockUpsert: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/promoCaps", async () => {
  const actual = await vi.importActual<typeof import("@/db/promoCaps")>("@/db/promoCaps").catch(() => null);
  return {
    getCapEditablePromo: mockGetCapEditablePromo,
    upsertMemberPromoCap: mockUpsert,
    deleteMemberPromoCap: mockDelete,
    isUndefinedTableError: actual
      ? actual.isUndefinedTableError
      : (err: unknown) => (err as { code?: string } | null)?.code === "42P01",
  };
});

import { setPromoCapAction } from "./set-promo-cap";

function expectNoDb() {
  expect(mockGetCapEditablePromo).not.toHaveBeenCalled();
  expect(mockUpsert).not.toHaveBeenCalled();
  expect(mockDelete).not.toHaveBeenCalled();
}

describe("setPromoCapAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ userId: 7, email: "a@b.c", displayName: "A" });
    mockGetCapEditablePromo.mockResolvedValue({ id: 20, promoType: "profit_boost" });
    mockUpsert.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
  });

  it("rejects when there is no session, with no DB access", async () => {
    mockRequireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(setPromoCapAction({ promoId: 20, maxStake: "20" })).rejects.toThrow("NEXT_REDIRECT");
    expectNoDb();
  });

  it.each([
    { promoId: 20, maxStake: "0" },
    { promoId: 20, maxStake: "-5" },
    { promoId: 20, maxStake: "20.555" },
    { promoId: 20, maxStake: "abc" },
    { promoId: 20, maxStake: "10000.01" },
    { promoId: 20, maxStake: 20 },
    { promoId: 20, maxStake: "20", userId: 1 },
    { maxStake: "20" },
    null,
    "x",
  ])("returns invalid for %j without touching the DB", async (input) => {
    const result = await setPromoCapAction(input);
    expect(result.status).toBe("invalid");
    expectNoDb();
  });

  it("returns not_found for a promo the member cannot see, with no write", async () => {
    mockGetCapEditablePromo.mockResolvedValue(null);
    const result = await setPromoCapAction({ promoId: 20, maxStake: "20" });
    expect(result).toEqual({ status: "not_found", message: "This promo is no longer available." });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("rejects a non-boost promo with no write", async () => {
    mockGetCapEditablePromo.mockResolvedValue({ id: 20, promoType: "bonus_bet" });
    const result = await setPromoCapAction({ promoId: 20, maxStake: "20" });
    expect(result).toEqual({ status: "invalid", message: "Only profit boosts have a max stake." });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("saves a valid cap for the session member only, normalized to 2 decimals", async () => {
    const result = await setPromoCapAction({ promoId: 20, maxStake: "20" });
    expect(result).toEqual({ status: "ok" });
    expect(mockGetCapEditablePromo).toHaveBeenCalledWith(20, 7, expect.any(Date));
    expect(mockUpsert).toHaveBeenCalledWith({ userId: 7, promoId: 20, maxStake: "20.00", now: expect.any(Date) });
  });

  it("clears the cap on null", async () => {
    const result = await setPromoCapAction({ promoId: 20, maxStake: null });
    expect(result).toEqual({ status: "ok" });
    expect(mockDelete).toHaveBeenCalledWith({ userId: 7, promoId: 20 });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns unavailable when the table is missing", async () => {
    mockUpsert.mockRejectedValue(Object.assign(new Error("x"), { cause: { code: "42P01" } }));
    const result = await setPromoCapAction({ promoId: 20, maxStake: "20" });
    expect(result).toEqual({
      status: "unavailable",
      message: "Your cap can't be saved yet — the database update hasn't been applied.",
    });
  });

  it("rethrows any other DB error", async () => {
    mockUpsert.mockRejectedValue(new Error("fetch failed"));
    await expect(setPromoCapAction({ promoId: 20, maxStake: "20" })).rejects.toThrow("fetch failed");
  });
});
