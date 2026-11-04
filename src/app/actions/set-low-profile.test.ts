import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireUser, mockUpsert, mockRevalidate } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockUpsert: vi.fn(),
  mockRevalidate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidate }));
vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/lowProfile", () => ({
  upsertMemberLowProfile: mockUpsert,
  isLowProfileTableMissing: (err: unknown) => (err as { cause?: { code?: string } } | null)?.cause?.code === "42P01",
}));

import { setLowProfileAction } from "./set-low-profile";

const valid = { oddsCapEnabled: true, oddsCapAmerican: 300, mainLinesOnly: false, naturalStakes: true };

describe("setLowProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ userId: 7, email: "a@b.c", displayName: "A" });
    mockUpsert.mockResolvedValue(undefined);
  });

  it("upserts with the session userId and revalidates / and /settings", async () => {
    expect(await setLowProfileAction(valid)).toEqual({ status: "ok" });
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({ userId: 7, settings: valid });
    expect(mockRevalidate).toHaveBeenCalledWith("/");
    expect(mockRevalidate).toHaveBeenCalledWith("/settings");
  });

  it("rejects odds under +100 and extra keys without writing", async () => {
    expect(await setLowProfileAction({ ...valid, oddsCapAmerican: 99 })).toEqual({
      status: "invalid",
      message: "Enter odds of +100 or longer, like 300.",
    });
    expect((await setLowProfileAction({ ...valid, userId: 1 })).status).toBe("invalid");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("reports unavailable when the table is missing", async () => {
    mockUpsert.mockRejectedValue({ cause: { code: "42P01" } });
    expect(await setLowProfileAction(valid)).toEqual({
      status: "unavailable",
      message: "Couldn't save your Low-profile settings. Try again.",
    });
  });

  it("propagates other errors and rejects without a session", async () => {
    mockUpsert.mockRejectedValue(new Error("boom"));
    await expect(setLowProfileAction(valid)).rejects.toThrow("boom");
    mockRequireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(setLowProfileAction(valid)).rejects.toThrow("NEXT_REDIRECT");
  });
});
