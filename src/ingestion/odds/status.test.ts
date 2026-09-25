import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimateRefreshCredits } from "./quota";
import { usableOddsBooks } from "@/config/books";
import { SPORT_KEYS } from "@/config/sports";

vi.mock("@/db/queries", () => ({
  getOddsFreshness: vi.fn(),
}));

vi.mock("./store", () => ({
  getLatestCreditUsage: vi.fn(),
}));

import { getOddsFreshness } from "@/db/queries";
import { getLatestCreditUsage } from "./store";
import { getOddsStatus } from "./status";

const mockGetOddsFreshness = vi.mocked(getOddsFreshness);
const mockGetLatestCreditUsage = vi.mocked(getLatestCreditUsage);

const NOW = new Date("2026-10-01T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOddsStatus", () => {
  it("derives total/level/estimate from the latest credit row", async () => {
    mockGetOddsFreshness.mockResolvedValue(new Date(NOW.getTime() - 42 * 60_000));
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 412,
      requestsUsed: 88,
      refreshCost: 3,
      sportsFetched: 4,
      recordedAt: new Date(NOW.getTime() - 10 * 60_000),
    });

    const status = await getOddsStatus(NOW);

    expect(status.remaining).toBe(412);
    expect(status.total).toBe(500); // remaining + used
    expect(status.level).toBe("normal");
    expect(status.estimatedRefreshCredits).toBe(3);
    expect(status.oddsFetchedAt).toBe(new Date(NOW.getTime() - 42 * 60_000).toISOString());
    expect(status.lastRefreshAt).toBe(new Date(NOW.getTime() - 10 * 60_000).toISOString());
    expect(status.resetsOn).toBe("2026-11-01T00:00:00.000Z");
  });

  it("falls back to the upper-bound estimate and unknown level when no credit row exists yet", async () => {
    mockGetOddsFreshness.mockResolvedValue(null);
    mockGetLatestCreditUsage.mockResolvedValue(null);

    const status = await getOddsStatus(NOW);

    expect(status.remaining).toBeNull();
    expect(status.level).toBe("unknown");
    expect(status.total).toBe(500); // FREE_TIER_MONTHLY_CREDITS
    expect(status.oddsFetchedAt).toBeNull();
    expect(status.lastRefreshAt).toBeNull();
    expect(status.estimatedRefreshCredits).toBe(
      estimateRefreshCredits(SPORT_KEYS.length, usableOddsBooks().length),
    );
  });

  it("falls back to the upper-bound estimate when the last real refresh spent 0 credits", async () => {
    mockGetOddsFreshness.mockResolvedValue(NOW);
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 490,
      requestsUsed: 10,
      refreshCost: 0,
      sportsFetched: 0,
      recordedAt: NOW,
    });

    const status = await getOddsStatus(NOW);

    expect(status.estimatedRefreshCredits).toBe(
      estimateRefreshCredits(SPORT_KEYS.length, usableOddsBooks().length),
    );
  });

  it("reports unknown (not blocked) when the latest row is from before the monthly reset (CR-01)", async () => {
    mockGetOddsFreshness.mockResolvedValue(null);
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 5,
      requestsUsed: 495,
      refreshCost: 3,
      sportsFetched: 3,
      recordedAt: new Date("2026-09-30T20:00:00.000Z"),
    });

    const status = await getOddsStatus(NOW);

    expect(status.remaining).toBeNull();
    expect(status.level).toBe("unknown");
    expect(status.total).toBe(500);
  });
});
