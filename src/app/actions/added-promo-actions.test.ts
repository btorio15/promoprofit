import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireUser, mockExpire, mockDelete, mockRevalidatePath } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockExpire: vi.fn(),
  mockDelete: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/addedPromos", () => ({
  expireOwnAddedPromo: mockExpire,
  softDeleteOwnAddedPromo: mockDelete,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

import { expirePromo } from "./expire-promo";
import { deletePromo } from "./delete-promo";

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
