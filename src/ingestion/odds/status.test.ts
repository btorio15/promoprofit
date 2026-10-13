import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimateRefreshCredits } from "./quota";
import { usableOddsBooks } from "@/config/books";
import { SPORT_KEYS } from "@/config/sports";

vi.mock("@/db/queries", () => ({
  getOddsFreshness: vi.fn(),
  getExtendedOddsFreshness: vi.fn(),
}));

vi.mock("./store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store")>()),
  getLatestCreditUsage: vi.fn(),
  getLatestCreditUsageByKey: vi.fn(),
  getSpendAttribution: vi.fn(),
}));

import { getExtendedOddsFreshness, getOddsFreshness } from "@/db/queries";
import { getLatestCreditUsage, getLatestCreditUsageByKey, getSpendAttribution, type CreditUsageRow } from "./store";
import { keyFingerprint } from "./oddsKeys";
import { getOddsStatus } from "./status";

const mockGetOddsFreshness = vi.mocked(getOddsFreshness);
const mockGetExtendedOddsFreshness = vi.mocked(getExtendedOddsFreshness);
const mockGetLatestCreditUsage = vi.mocked(getLatestCreditUsage);
const mockGetSpendAttribution = vi.mocked(getSpendAttribution);

const NOW = new Date("2026-10-01T12:00:00.000Z");
const EXTENDED_MARKET_COUNT = 3;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ODDS_API_KEY", "");
  vi.stubEnv("ODDS_API_KEYS", "");
  vi.mocked(getLatestCreditUsageByKey).mockResolvedValue({ keyColumn: false });
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

describe("getOddsStatus combined meter (several keys)", () => {
  const [A, B, C] = ["test-key-a", "test-key-b", "test-key-c"];
  const row = (
    remaining: number,
    used: number,
    recordedAt = NOW,
  ): CreditUsageRow => ({
    requestsRemaining: remaining,
    requestsUsed: used,
    refreshCost: 2,
    sportsFetched: 2,
    recordedAt,
  });
  function setup(
    rows: Record<string, CreditUsageRow>,
    legacy?: CreditUsageRow,
  ) {
    vi.stubEnv("ODDS_API_KEYS", `${A},${B},${C}`);
    const map = new Map<string | null, CreditUsageRow>(
      Object.entries(rows).map(([k, v]) => [keyFingerprint(k), v]),
    );
    if (legacy) map.set(null, legacy);
    vi.mocked(getLatestCreditUsageByKey).mockResolvedValue({
      keyColumn: true,
      byKeyId: map,
    });
    mockGetOddsFreshness.mockResolvedValue(null);
    mockGetLatestCreditUsage.mockResolvedValue(row(300, 200));
  }

  it("sums remaining and total across keys (a key with no rows counts as a fresh 500)", async () => {
    setup({ [A]: row(300, 200), [B]: row(450, 50) });
    const status = await getOddsStatus(NOW);
    expect(status.remaining).toBe(1250);
    expect(status.total).toBe(1500);
    expect(status.level).toBe("normal");
  });

  it("is blocked only when every key is below the block threshold", async () => {
    setup({ [A]: row(10, 490), [B]: row(15, 485), [C]: row(5, 495) });
    const status = await getOddsStatus(NOW);
    expect(status.remaining).toBe(30);
    expect(status.level).toBe("blocked");
  });

  it("warns when even the best key is below the warning threshold", async () => {
    setup({ [A]: row(90, 410), [B]: row(10, 490), [C]: row(10, 490) });
    expect((await getOddsStatus(NOW)).level).toBe("warning");
  });

  it("counts a last-month row as a fresh 500, ignores unknown fingerprints and credits legacy rows to ODDS_API_KEY", async () => {
    const lastMonth = row(5, 495, new Date("2026-09-20T12:00:00.000Z"));
    setup({ [A]: lastMonth, "test-key-removed": row(1, 499) }, row(100, 400));
    vi.stubEnv("ODDS_API_KEY", B);
    const status = await getOddsStatus(NOW);
    // A: 500 (stale), B: legacy 100, C: 500 (no rows)
    expect(status.remaining).toBe(1100);
    expect(status.total).toBe(1500);
  });

  it("keeps single-key behavior with 3 keys configured when the key_id column is missing", async () => {
    setup({});
    vi.mocked(getLatestCreditUsageByKey).mockResolvedValue({
      keyColumn: false,
    });
    const status = await getOddsStatus(NOW);
    expect(status.remaining).toBe(300);
    expect(status.total).toBe(500);
  });

  it("keeps lastRefreshAt and estimates on the global latest row", async () => {
    setup({ [A]: row(300, 200) });
    const status = await getOddsStatus(NOW);
    expect(status.lastRefreshAt).toBe(NOW.toISOString());
  });

  it("WR-02: one configured key with the key_id column uses that key's own row, not the newest row of a removed key", async () => {
    setup({ [A]: row(100, 400), "test-key-removed": row(450, 50) });
    vi.stubEnv("ODDS_API_KEYS", A);
    mockGetLatestCreditUsage.mockResolvedValue(row(450, 50)); // newest overall = removed key
    const status = await getOddsStatus(NOW);
    expect(status.remaining).toBe(100);
    expect(status.total).toBe(500);
    expect(status.bestKeyRemaining).toBe(100);
  });

  it("WR-02: one configured key with no rows of its own stays unknown", async () => {
    setup({ "test-key-removed": row(450, 50) });
    vi.stubEnv("ODDS_API_KEYS", A);
    const status = await getOddsStatus(NOW);
    expect(status.remaining).toBeNull();
    expect(status.level).toBe("unknown");
  });

  it("WR-03: 60 + 60 shows 120 combined, but the best single key (60) drives level and bestKeyRemaining", async () => {
    setup({ [A]: row(60, 440), [B]: row(60, 440), [C]: row(0, 500) });
    vi.stubEnv("ODDS_API_KEYS", `${A},${B}`);
    const status = await getOddsStatus(NOW);
    expect(status.remaining).toBe(120);
    expect(status.bestKeyRemaining).toBe(60);
    expect(status.level).toBe("warning");
    // A 70-credit refresh does not fit on any single key.
    expect(status.bestKeyRemaining!).toBeLessThan(70);
  });

  it("WR-04: ODDS_API_KEY not in ODDS_API_KEYS -> legacy rows are credited to the first listed key", async () => {
    setup({}, row(100, 400));
    vi.stubEnv("ODDS_API_KEYS", `${A},${B}`);
    vi.stubEnv("ODDS_API_KEY", "test-key-not-listed");
    const status = await getOddsStatus(NOW);
    // A: legacy 100, B: fresh 500
    expect(status.remaining).toBe(600);
    expect(status.bestKeyRemaining).toBe(500);
  });
});
