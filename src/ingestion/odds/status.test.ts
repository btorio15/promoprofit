import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimateRefreshCredits } from "./quota";
import { usableOddsBooks } from "@/config/books";
import { SPORT_KEYS } from "@/config/sports";

vi.mock("@/db/queries", () => ({
  getOddsFreshness: vi.fn(),
  getExtendedOddsFreshness: vi.fn(),
}));

vi.mock("./store", () => ({
  getLatestCreditUsage: vi.fn(),
  getSpendAttribution: vi.fn(),
}));

import { getExtendedOddsFreshness, getOddsFreshness } from "@/db/queries";
import { getLatestCreditUsage, getSpendAttribution } from "./store";
import { getOddsStatus } from "./status";

const mockGetOddsFreshness = vi.mocked(getOddsFreshness);
const mockGetExtendedOddsFreshness = vi.mocked(getExtendedOddsFreshness);
const mockGetLatestCreditUsage = vi.mocked(getLatestCreditUsage);
const mockGetSpendAttribution = vi.mocked(getSpendAttribution);

const NOW = new Date("2026-10-01T12:00:00.000Z");
const EXTENDED_MARKET_COUNT = 3;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetExtendedOddsFreshness.mockResolvedValue(null);
  mockGetSpendAttribution.mockResolvedValue(null);
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
    // WR-03 (01.1 review): the formula over the row's in-season sport count,
    // never the row's refreshCost verbatim.
    expect(status.estimatedRefreshCredits).toBe(estimateRefreshCredits(4, usableOddsBooks().length));
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

  it("extendedOddsFetchedAt is null when spreads/totals have never been fetched", async () => {
    mockGetOddsFreshness.mockResolvedValue(null);
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockGetExtendedOddsFreshness.mockResolvedValue(null);

    const status = await getOddsStatus(NOW);

    expect(status.extendedOddsFetchedAt).toBeNull();
  });

  it("extendedOddsFetchedAt is an ISO string when spreads/totals have a freshness timestamp", async () => {
    mockGetOddsFreshness.mockResolvedValue(null);
    mockGetLatestCreditUsage.mockResolvedValue(null);
    const extendedAt = new Date(NOW.getTime() - 42 * 60_000);
    mockGetExtendedOddsFreshness.mockResolvedValue(extendedAt);

    const status = await getOddsStatus(NOW);

    expect(status.extendedOddsFetchedAt).toBe(extendedAt.toISOString());
  });

  it("estimatedExtendedRefreshCredits uses the latest row's sportsFetched count with marketCount 3 when sportsFetched > 0", async () => {
    mockGetOddsFreshness.mockResolvedValue(null);
    mockGetExtendedOddsFreshness.mockResolvedValue(null);
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 400,
      requestsUsed: 100,
      refreshCost: 12,
      sportsFetched: 4,
      recordedAt: NOW,
    });

    const status = await getOddsStatus(NOW);

    expect(status.estimatedExtendedRefreshCredits).toBe(
      estimateRefreshCredits(4, usableOddsBooks().length, EXTENDED_MARKET_COUNT),
    );
  });

  it("after a spreads/totals search, the normal-refresh estimate is not the 3x extended cost (WR-03)", async () => {
    mockGetOddsFreshness.mockResolvedValue(NOW);
    mockGetExtendedOddsFreshness.mockResolvedValue(NOW);
    const books = usableOddsBooks().length;
    // Latest row is an extended run over 4 sports: refreshCost is 3x.
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 400,
      requestsUsed: 100,
      refreshCost: estimateRefreshCredits(4, books, EXTENDED_MARKET_COUNT),
      sportsFetched: 4,
      recordedAt: NOW,
    });

    const status = await getOddsStatus(NOW);

    expect(status.estimatedRefreshCredits).toBe(estimateRefreshCredits(4, books));
    expect(status.estimatedExtendedRefreshCredits).toBe(
      estimateRefreshCredits(4, books, EXTENDED_MARKET_COUNT),
    );
  });

  it("estimatedExtendedRefreshCredits falls back to the SPORT_KEYS upper bound when no credit row has sportsFetched > 0", async () => {
    mockGetOddsFreshness.mockResolvedValue(null);
    mockGetExtendedOddsFreshness.mockResolvedValue(null);
    mockGetLatestCreditUsage.mockResolvedValue(null);

    const status = await getOddsStatus(NOW);

    expect(status.estimatedExtendedRefreshCredits).toBe(
      estimateRefreshCredits(SPORT_KEYS.length, usableOddsBooks().length, EXTENDED_MARKET_COUNT),
    );
  });

  it("oddsRefreshedBy/extendedSearchedBy resolve from getSpendAttribution keyed by each cache's own fetched_at (D-21)", async () => {
    const oddsFetchedAt = new Date(NOW.getTime() - 10 * 60_000);
    const extendedFetchedAt = new Date(NOW.getTime() - 20 * 60_000);
    mockGetOddsFreshness.mockResolvedValue(oddsFetchedAt);
    mockGetExtendedOddsFreshness.mockResolvedValue(extendedFetchedAt);
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockGetSpendAttribution.mockImplementation(async (recordedAt: Date) => {
      if (recordedAt.getTime() === oddsFetchedAt.getTime()) return "Mike";
      if (recordedAt.getTime() === extendedFetchedAt.getTime()) return "Sue";
      return null;
    });

    const status = await getOddsStatus(NOW);

    expect(status.oddsRefreshedBy).toBe("Mike");
    expect(status.extendedSearchedBy).toBe("Sue");
  });

  it("oddsRefreshedBy/extendedSearchedBy are null and getSpendAttribution isn't called when a cache has never been fetched", async () => {
    mockGetOddsFreshness.mockResolvedValue(null);
    mockGetExtendedOddsFreshness.mockResolvedValue(null);
    mockGetLatestCreditUsage.mockResolvedValue(null);

    const status = await getOddsStatus(NOW);

    expect(status.oddsRefreshedBy).toBeNull();
    expect(status.extendedSearchedBy).toBeNull();
    expect(mockGetSpendAttribution).not.toHaveBeenCalled();
  });

  it("oddsRefreshedBy is null when getSpendAttribution resolves null (legacy/CLI row)", async () => {
    const oddsFetchedAt = new Date(NOW.getTime() - 10 * 60_000);
    mockGetOddsFreshness.mockResolvedValue(oddsFetchedAt);
    mockGetExtendedOddsFreshness.mockResolvedValue(null);
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockGetSpendAttribution.mockResolvedValue(null);

    const status = await getOddsStatus(NOW);

    expect(status.oddsRefreshedBy).toBeNull();
  });
});
