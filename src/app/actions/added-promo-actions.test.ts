import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireUser, mockExpire, mockDelete, mockRevalidatePath, mockGetOwn, mockUpdateOwn, mockPrepare } =
  vi.hoisted(() => ({
  mockGetOwn: vi.fn(),
  mockUpdateOwn: vi.fn(),
  mockPrepare: vi.fn(),
  mockRequireUser: vi.fn(),
  mockExpire: vi.fn(),
  mockDelete: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/addedPromos", () => ({
  expireOwnAddedPromo: mockExpire,
  softDeleteOwnAddedPromo: mockDelete,
  getOwnActiveAddedPromo: mockGetOwn,
  updateOwnAddedPromo: mockUpdateOwn,
}));
vi.mock("@/db/addedPromoPipeline", () => ({ prepareAddedPromoValues: mockPrepare }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

import { expirePromo } from "./expire-promo";
import { deletePromo } from "./delete-promo";
import { editPromo } from "./edit-promo";

const cases = [
  ["expirePromo", expirePromo, mockExpire],
  ["deletePromo", deletePromo, mockDelete],
] as const;

describe.each(cases)("%s", (_name, action, dbFn) => {
  beforeEach(() => {
    mockRequireUser.mockReset().mockResolvedValue({ userId: 7 });
    mockExpire.mockReset().mockResolvedValue(true);
    mockDelete.mockReset().mockResolvedValue(true);
    mockRevalidatePath.mockReset();
  });

  it("rejects before any db work when requireUser rejects", async () => {
    mockRequireUser.mockRejectedValue(new Error("redirect"));
    await expect(action({ promoId: 5 })).rejects.toThrow("redirect");
    expect(dbFn).not.toHaveBeenCalled();
  });

  it("rejects input carrying a userId", async () => {
    const r = await action({ promoId: 5, userId: 99 });
    expect(r.status).toBe("invalid");
    expect(dbFn).not.toHaveBeenCalled();
  });

  it("uses the session user id and revalidates on success", async () => {
    const r = await action({ promoId: 5 });
    expect(dbFn).toHaveBeenCalledWith({ promoId: 5, userId: 7 });
    expect(r).toEqual({ status: "ok", promoId: 5 });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("returns a generic not_found and does not revalidate", async () => {
    dbFn.mockResolvedValue(false);
    const r = await action({ promoId: 5 });
    expect(r).toEqual({ status: "not_found", message: "That promo isn't available any more." });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("editPromo", () => {
  const promo = {
    promoType: "bonus_bet",
    bookKey: "fanduel",
    bonusAmount: "75",
    expires: { etDate: "2026-10-04", etTime: "23:59" },
    scope: null,
  };
  const values = { bookKey: "fanduel", promoType: "bonus_bet", bonusAmount: "75.00" };

  beforeEach(() => {
    mockRequireUser.mockReset().mockResolvedValue({ userId: 7 });
    mockGetOwn.mockReset().mockResolvedValue({ promoId: 5, bookKey: "fanduel", promoType: "bonus_bet" });
    mockUpdateOwn.mockReset().mockResolvedValue(true);
    mockPrepare.mockReset().mockResolvedValue({ ok: true, values });
    mockRevalidatePath.mockReset();
  });

  it("rejects before any db work when requireUser rejects", async () => {
    mockRequireUser.mockRejectedValue(new Error("redirect"));
    await expect(editPromo({ promoId: 5, promo })).rejects.toThrow("redirect");
    expect(mockGetOwn).not.toHaveBeenCalled();
  });

  it("rejects input carrying a userId", async () => {
    const r = await editPromo({ promoId: 5, promo, userId: 99 });
    expect(r.status).toBe("invalid");
    expect(mockGetOwn).not.toHaveBeenCalled();
  });

  it("returns not_found for a promo that is not the member's active one", async () => {
    mockGetOwn.mockResolvedValue(null);
    const r = await editPromo({ promoId: 5, promo });
    expect(r).toEqual({ status: "not_found", message: "That promo isn't available any more." });
    expect(mockGetOwn).toHaveBeenCalledWith(5, 7);
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });

  it("refuses to change the book or type", async () => {
    const r = await editPromo({ promoId: 5, promo: { ...promo, bookKey: "betmgm" } });
    expect(r).toEqual({
      status: "invalid",
      fieldErrors: { form: ["Book and type can't be changed. Delete this promo and add a new one instead."] },
    });
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });

  it("updates in place with the session user and revalidates", async () => {
    const r = await editPromo({ promoId: 5, promo });
    expect(mockUpdateOwn).toHaveBeenCalledWith({ promoId: 5, userId: 7, values });
    expect(r).toEqual({ status: "ok", promoId: 5 });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("returns not_found when the row changed meanwhile", async () => {
    mockUpdateOwn.mockResolvedValue(false);
    const r = await editPromo({ promoId: 5, promo });
    expect(r.status).toBe("not_found");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("passes through a stale scope from the shared pipeline", async () => {
    mockPrepare.mockResolvedValue({ ok: false, response: { status: "stale", message: "gone" } });
    const r = await editPromo({ promoId: 5, promo });
    expect(r).toEqual({ status: "stale", message: "gone" });
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });
});
