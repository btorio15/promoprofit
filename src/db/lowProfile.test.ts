import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));
vi.mock("./client", () => ({ getDb: mockGetDb }));

import { DEFAULT_LOW_PROFILE } from "@/domain/promos/lowProfile";
import { getMemberLowProfile } from "./lowProfile";

function dbReturning(result: () => Promise<unknown[]>) {
  mockGetDb.mockReturnValue({
    select: () => ({ from: () => ({ where: result }) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("getMemberLowProfile", () => {
  it("returns defaults when no row exists", async () => {
    dbReturning(() => Promise.resolve([]));
    await expect(getMemberLowProfile(1)).resolves.toEqual(DEFAULT_LOW_PROFILE);
  });

  it("returns the saved row", async () => {
    const saved = { oddsCapEnabled: false, oddsCapAmerican: 500, mainLinesOnly: true, naturalStakes: true };
    dbReturning(() => Promise.resolve([saved]));
    await expect(getMemberLowProfile(1)).resolves.toEqual(saved);
  });

  it("returns defaults on an undefined-table error for the table", async () => {
    dbReturning(() => Promise.reject(new Error('relation "user_low_profile_settings" does not exist')));
    await expect(getMemberLowProfile(1)).resolves.toEqual(DEFAULT_LOW_PROFILE);
  });

  it("rethrows any other error", async () => {
    dbReturning(() => Promise.reject(new Error("boom")));
    await expect(getMemberLowProfile(1)).rejects.toThrow("boom");
  });
});
