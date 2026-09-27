import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireUser, mockMarkPromoUsed, mockUnmarkPromoUsed } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockMarkPromoUsed: vi.fn(),
  mockUnmarkPromoUsed: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/promoTracking", () => ({
  markPromoUsed: mockMarkPromoUsed,
  unmarkPromoUsed: mockUnmarkPromoUsed,
}));

import { revalidatePath } from "next/cache";
import { markPromoUsedAction, unmarkPromoUsedAction } from "./mark-promo-used";

const mockRevalidatePath = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue({ userId: 7, email: "friend@example.com", displayName: "Friend" });
});

describe("markPromoUsedAction (T-n12-01, T-n12-02, T-n12-03)", () => {
  it("rejects when logged out, before any DB call", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(markPromoUsedAction({ promoId: 5 })).rejects.toThrow("NEXT_REDIRECT");

    expect(mockMarkPromoUsed).not.toHaveBeenCalled();
  });

  it("rejects an empty input without calling the DB", async () => {
    const result = await markPromoUsedAction({});

    expect(result).toEqual({ status: "invalid" });
    expect(mockMarkPromoUsed).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric promoId without calling the DB", async () => {
    const result = await markPromoUsedAction({ promoId: "1" });

    expect(result).toEqual({ status: "invalid" });
    expect(mockMarkPromoUsed).not.toHaveBeenCalled();
  });

  it("rejects an extra 'userId' field (strict schema, IDOR guard) without calling the DB", async () => {
    const result = await markPromoUsedAction({ promoId: 1, userId: 2 });

    expect(result).toEqual({ status: "invalid" });
    expect(mockMarkPromoUsed).not.toHaveBeenCalled();
  });

  it("marks used with the SESSION userId (never input) and revalidates '/'", async () => {
    mockMarkPromoUsed.mockResolvedValue(true);

    const result = await markPromoUsedAction({ promoId: 5 });

    expect(result).toEqual({ status: "ok" });
    expect(mockMarkPromoUsed).toHaveBeenCalledWith({ userId: 7, promoId: 5, now: expect.any(Date) });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("returns not_found for an unknown promo, without revalidating", async () => {
    mockMarkPromoUsed.mockResolvedValue(false);

    const result = await markPromoUsedAction({ promoId: 999 });

    expect(result).toEqual({ status: "not_found", message: "This promo no longer exists." });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("unmarkPromoUsedAction (T-n12-01, T-n12-02)", () => {
  it("rejects when logged out, before any DB call", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(unmarkPromoUsedAction({ promoId: 5 })).rejects.toThrow("NEXT_REDIRECT");

    expect(mockUnmarkPromoUsed).not.toHaveBeenCalled();
  });

  it("rejects an extra 'userId' field without calling the DB", async () => {
    const result = await unmarkPromoUsedAction({ promoId: 1, userId: 2 });

    expect(result).toEqual({ status: "invalid" });
    expect(mockUnmarkPromoUsed).not.toHaveBeenCalled();
  });

  it("unmarks with the SESSION userId and revalidates '/'", async () => {
    const result = await unmarkPromoUsedAction({ promoId: 5 });

    expect(result).toEqual({ status: "ok" });
    expect(mockUnmarkPromoUsed).toHaveBeenCalledWith({ userId: 7, promoId: 5 });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });
});
