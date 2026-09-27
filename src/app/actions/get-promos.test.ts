import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireUser, mockGetScrapeStatus, mockCountLivePromos } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetScrapeStatus: vi.fn(),
  mockCountLivePromos: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/promos", () => ({
  getScrapeStatus: mockGetScrapeStatus,
  countLivePromos: mockCountLivePromos,
}));

import { getPromos } from "./get-promos";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue({ userId: 1, email: "friend@example.com", displayName: "Friend" });
  mockGetScrapeStatus.mockResolvedValue(new Map());
  mockCountLivePromos.mockResolvedValue(0);
});

describe("getPromos server action (D-08, T-03-03-01, T-03-03-02)", () => {
  it("rejects when logged out, before any DB read (requireUser is the first statement)", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(getPromos({ precision: "whole" })).rejects.toThrow("NEXT_REDIRECT");

    expect(mockGetScrapeStatus).not.toHaveBeenCalled();
    expect(mockCountLivePromos).not.toHaveBeenCalled();
  });

  it("returns invalid for a bogus precision, without reading the DB", async () => {
    const result = await getPromos({ precision: "bogus" });

    expect(result).toEqual({ status: "invalid" });
    expect(mockGetScrapeStatus).not.toHaveBeenCalled();
    expect(mockCountLivePromos).not.toHaveBeenCalled();
  });

  it("returns emptyVariant 'none-scraped' when no target book has an ok run and there are no live promos", async () => {
    mockGetScrapeStatus.mockResolvedValue(new Map());
    mockCountLivePromos.mockResolvedValue(0);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("none-scraped");
    expect(result.scrapeStatus).toEqual([
      { bookKey: "ballybet", bookName: "Bally Bet", lastOkAt: null, lastRunFailed: false },
    ]);
  });

  it("returns emptyVariant 'no-active' when an ok run exists but there are no live promos", async () => {
    const okAt = new Date("2026-09-27T00:00:00.000Z");
    mockGetScrapeStatus.mockResolvedValue(
      new Map([["ballybet", { lastOkAt: okAt, lastStatus: "ok" as const }]]),
    );
    mockCountLivePromos.mockResolvedValue(0);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBe("no-active");
    expect(result.scrapeStatus).toEqual([
      { bookKey: "ballybet", bookName: "Bally Bet", lastOkAt: okAt.toISOString(), lastRunFailed: false },
    ]);
  });

  it("returns emptyVariant null when there are live promos", async () => {
    mockGetScrapeStatus.mockResolvedValue(
      new Map([["ballybet", { lastOkAt: new Date(), lastStatus: "ok" as const }]]),
    );
    mockCountLivePromos.mockResolvedValue(3);

    const result = await getPromos({ precision: "cents" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.emptyVariant).toBeNull();
  });

  it("marks lastRunFailed true when the latest run's status is 'failed'", async () => {
    mockGetScrapeStatus.mockResolvedValue(
      new Map([["ballybet", { lastOkAt: null, lastStatus: "failed" as const }]]),
    );
    mockCountLivePromos.mockResolvedValue(0);

    const result = await getPromos({ precision: "whole" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.scrapeStatus[0]).toEqual({
      bookKey: "ballybet",
      bookName: "Bally Bet",
      lastOkAt: null,
      lastRunFailed: true,
    });
  });
});
